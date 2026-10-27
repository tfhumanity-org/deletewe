import type { EngineContext } from './context.ts';
import { codeOf } from './errors.ts';
import { renderPdf, wrapText } from './letter.ts';
import type { CaseOutcome, CaseState } from './types.ts';

export interface BrokerLine {
  readonly brokerId: string;
  readonly brokerName: string;
  readonly state: CaseState;
  readonly outcome: CaseOutcome | null;
  readonly openedAt: number;
  readonly attempts: number;
  readonly evidenceCount: number;
  readonly automationLevel: string;
}

export interface ReportSummary {
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly generatedAt: number;
  readonly totals: {
    readonly found: number;
    readonly removed: number;
    readonly awaitingBroker: number;
    readonly awaitingYou: number;
    readonly blocked: number;
    readonly relisted: number;
  };
  readonly lines: readonly BrokerLine[];
  readonly caveat: string;
}

const CAVEAT =
  'No removal service reaches every broker. Independent testing puts the realistic ceiling at 70-80%, and only with repeated re-checking. "Removed" here means a later scan of that broker found nothing, not that the broker promised anything.';

/**
 * The period report.
 *
 * It leads with outcomes — removed, still listed, waiting on you — rather than
 * with effort. A "listings reviewed" counter tells a member how busy we were,
 * not whether their exposure went down. See docs/research/01-user-journey.md.
 */
export async function generateReport(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; periodStart?: number; periodEnd?: number },
): Promise<{ reportId: string; summary: ReportSummary; blobKey: string | null }> {
  const now = ctx.ports.clock.now();
  const periodEnd = params.periodEnd ?? now;
  const periodStart = params.periodStart ?? periodEnd - 90 * 86_400_000;

  const cases = await ctx.store.listCases(params.memberId);
  const brokers = new Map((await ctx.store.listBrokers()).map((b) => [b.id, b]));
  const evidence = await ctx.store.listEvidence(params.memberId);
  const evidenceByCase = new Map<string, number>();
  for (const record of evidence) {
    if (!record.caseId) continue;
    evidenceByCase.set(record.caseId, (evidenceByCase.get(record.caseId) ?? 0) + 1);
  }

  const lines: BrokerLine[] = cases.map((c) => {
    const broker = brokers.get(c.brokerId);
    return {
      brokerId: c.brokerId,
      brokerName: broker?.name ?? c.brokerId,
      state: c.state,
      outcome: c.outcome,
      openedAt: c.openedAt,
      attempts: c.attemptCount,
      evidenceCount: evidenceByCase.get(c.id) ?? 0,
      automationLevel: broker?.automationLevel ?? 'unknown',
    };
  });

  const summary: ReportSummary = {
    periodStart,
    periodEnd,
    generatedAt: now,
    totals: {
      found: lines.length,
      removed: lines.filter((l) => l.state === 'removed').length,
      awaitingBroker: lines.filter((l) => l.state === 'submitted' || l.state === 'awaiting_verification' || l.state === 'acknowledged').length,
      awaitingYou: lines.filter((l) => l.state === 'task_pending' || l.state === 'awaiting_consent').length,
      blocked: lines.filter((l) => l.state === 'needs_review').length,
      relisted: lines.filter((l) => l.state === 'relisted').length,
    },
    lines,
    caveat: CAVEAT,
  };

  const pdf = renderReportPdf(summary);
  const blobKey = `reports/${params.memberId}/${periodEnd}.pdf`;

  // Reports are write-once like evidence. A conflict means a report for this
  // period already exists and the original stands — that is fine. Anything
  // else is a real storage failure, and recording a blobKey for a file that
  // was never written would render a download link that always 404s.
  let storedKey: string | null = blobKey;
  try {
    await ctx.ports.blobs.put(blobKey, await ctx.store.encryptBlob(params.dek, params.memberId, pdf), 'application/pdf');
  } catch (error) {
    if (codeOf(error) !== 'storage_conflict') {
      storedKey = null;
      ctx.log.error('report_blob_write_failed', { errorCode: codeOf(error) });
    }
  }

  const reportId = await ctx.store.createReport({
    memberId: params.memberId,
    dek: params.dek,
    periodStart,
    periodEnd,
    summary,
    blobKey: storedKey,
  });

  ctx.log.info('report_generated', {
    found: summary.totals.found,
    removed: summary.totals.removed,
    awaitingYou: summary.totals.awaitingYou,
  });

  return { reportId, summary, blobKey: storedKey };
}

const STATE_LABELS: Readonly<Record<CaseState, string>> = {
  discovered: 'found',
  matched: 'found',
  awaiting_consent: 'waiting for you to confirm',
  rejected: 'you said this is not you',
  queued: 'queued to send',
  task_pending: 'waiting for you',
  submitted: 'sent',
  awaiting_verification: 'sent, awaiting confirmation',
  acknowledged: 'acknowledged, verifying removal',
  removed: 'REMOVED',
  relisted: 'RE-LISTED',
  needs_review: 'blocked, needs review',
};

export function renderReportPdf(summary: ReportSummary): Uint8Array {
  const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const lines: string[] = [
    'deletewe privacy report',
    '',
    `Period: ${date(summary.periodStart)} to ${date(summary.periodEnd)}`,
    `Generated: ${date(summary.generatedAt)}`,
    '',
    'WHERE YOU STAND',
    `  Removed .................... ${summary.totals.removed}`,
    `  Re-listed since removal .... ${summary.totals.relisted}`,
    `  Sent, awaiting the broker .. ${summary.totals.awaitingBroker}`,
    `  Waiting on you ............. ${summary.totals.awaitingYou}`,
    `  Blocked, needs review ...... ${summary.totals.blocked}`,
    `  Listings found in total .... ${summary.totals.found}`,
    '',
    'PER BROKER',
    '',
  ];

  for (const line of [...summary.lines].sort((a, b) => a.brokerName.localeCompare(b.brokerName))) {
    lines.push(
      `  ${line.brokerName.padEnd(28).slice(0, 28)} ${STATE_LABELS[line.state].padEnd(34)} ` +
        `${String(line.attempts)} attempt(s), ${String(line.evidenceCount)} evidence item(s)`,
    );
  }

  lines.push('', 'WHAT THIS MEANS', '', ...wrapText(summary.caveat));
  return renderPdf(lines);
}
