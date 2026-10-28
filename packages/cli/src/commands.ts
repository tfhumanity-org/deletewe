import { coverage, loadCatalog } from '@deletewe/catalog';
import {
  cancelDropRequest,
  deleteAccount,
  dropOverview,
  explainScan,
  enqueueFullScan,
  exportMemberData,
  generateReport,
  hashPassword,
  recordDropSubmission,
  tick,
  type EngineContext,
} from '@deletewe/engine';
import { verifyOutboundMail } from '@deletewe/adapters-node';
import { compose, type Composed } from '@deletewe/selfhost';

export interface CommandResult {
  readonly text: string;
  readonly exitCode?: number;
}

const pad = (value: string | number, width: number) => String(value).padEnd(width);

/** Resolves a member by email without decrypting anything else. */
async function memberIdFor(ctx: EngineContext, email: string): Promise<string | undefined> {
  return (await ctx.store.findMemberByEmail(email))?.row.id;
}

export async function dbMigrate(): Promise<CommandResult> {
  const composed = await compose();
  composed.close();
  return { text: 'Database is up to date.' };
}

export async function catalogValidate(): Promise<CommandResult> {
  const { brokers, issues, ok } = await loadCatalog();
  const errors = issues.filter((i) => i.severity === 'error');
  const lines = issues.map(
    (i) => `${i.severity === 'error' ? 'ERROR' : 'warn '} ${pad(i.brokerId, 26)} [${i.code}] ${i.message}`,
  );
  lines.push('', `${String(brokers.length)} definition(s), ${String(errors.length)} error(s)`);
  return { text: lines.join('\n'), exitCode: ok ? 0 : 1 };
}

export async function catalogReport(): Promise<CommandResult> {
  const { brokers } = await loadCatalog();
  const report = coverage(brokers);
  const section = (title: string, data: Record<string, number>) =>
    [`\n${title}`, ...Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${pad(k, 20)}${String(v)}`)].join('\n');

  return {
    text: [
      `definitions   ${String(report.total)}`,
      `enabled       ${String(report.enabled)}`,
      `verified live ${String(report.verified)}   <- the only number that means coverage`,
      section('By automation level', report.byAutomation),
      section('By opt-out method', report.byMethod),
    ].join('\n'),
  };
}

export async function brokersList(composed: Composed): Promise<CommandResult> {
  const brokers = await composed.ctx.store.listBrokers();
  const lines = [
    `${pad('ID', 28)}${pad('STATUS', 10)}${pad('AUTOMATION', 14)}${pad('METHOD', 10)}VERIFIED`,
    ...brokers.map(
      (b) => `${pad(b.id, 28)}${pad(b.status, 10)}${pad(b.automationLevel, 14)}${pad(b.optOutMethod, 10)}${b.verifiedAt ?? 'never'}`,
    ),
  ];
  return { text: lines.join('\n') };
}

export async function scan(composed: Composed, email: string): Promise<CommandResult> {
  const memberId = await memberIdFor(composed.ctx, email);
  if (!memberId) return { text: `No account for ${email}.`, exitCode: 1 };

  const queued = await enqueueFullScan(composed.ctx, memberId);
  const handled = await composed.queue.drain();
  return { text: `Queued ${String(queued)} scan(s); ran ${String(handled)} job(s).` };
}

export async function runQueue(composed: Composed): Promise<CommandResult> {
  const swept = await tick(composed.ctx);
  const handled = await composed.queue.drain();
  return {
    text: `Swept ${String(swept.rechecks)} due re-check(s) and ${String(swept.jobs)} pending job(s); ran ${String(handled)}.`,
  };
}

export async function status(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const cases = await composed.ctx.store.listCases(found.row.id);
  const brokers = new Map((await composed.ctx.store.listBrokers()).map((b) => [b.id, b.name]));
  const tasks = await composed.ctx.store.listTasks(found.row.id, dek, 'member', 'open');

  const lines = [
    `${pad('BROKER', 30)}${pad('STATE', 26)}ATTEMPTS`,
    ...cases.map((c) => `${pad(brokers.get(c.brokerId) ?? c.brokerId, 30)}${pad(c.state, 26)}${String(c.attemptCount)}`),
    '',
    `${String(cases.filter((c) => c.state === 'removed').length)} removed, ${String(cases.length)} listing(s) tracked`,
    `${String(tasks.length)} task(s) waiting on you`,
  ];
  return { text: lines.join('\n') };
}

export async function tasks(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const open = await composed.ctx.store.listTasks(found.row.id, dek, 'member', 'open');
  if (open.length === 0) return { text: 'Nothing waiting on you.' };

  return {
    text: open
      .map((task) =>
        [
          `- ${task.title}`,
          `  ${task.instructions.replace(/\n/g, '\n  ')}`,
          task.deepLink ? `  open: ${task.deepLink}` : '',
          task.prefill ? `  values: ${Object.entries(task.prefill).map(([k, v]) => `${k}=${v}`).join(', ')}` : '',
          `  done:  deletewe task done ${task.id}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n'),
  };
}

export async function report(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const { summary } = await generateReport(composed.ctx, { memberId: found.row.id, dek });
  return {
    text: [
      `removed             ${String(summary.totals.removed)}`,
      `re-listed           ${String(summary.totals.relisted)}`,
      `sent, awaiting them ${String(summary.totals.awaitingBroker)}`,
      `waiting on you      ${String(summary.totals.awaitingYou)}`,
      `blocked             ${String(summary.totals.blocked)}`,
      `found in total      ${String(summary.totals.found)}`,
      '',
      summary.caveat,
    ].join('\n'),
  };
}

export async function exportData(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const bundle = await exportMemberData(composed.ctx, { memberId: found.row.id, dek });
  return { text: JSON.stringify(bundle, null, 2) };
}

export async function destroy(composed: Composed, email: string, confirmed: boolean): Promise<CommandResult> {
  if (!confirmed) {
    return { text: 'Refusing to delete without --yes. This is irreversible.', exitCode: 1 };
  }
  const memberId = await memberIdFor(composed.ctx, email);
  if (!memberId) return { text: `No account for ${email}.`, exitCode: 1 };

  const { blobsDeleted } = await deleteAccount(composed.ctx, { memberId });
  return { text: `Deleted the account and ${String(blobsDeleted)} evidence file(s). The encryption key was destroyed first.` };
}

export async function createAdmin(composed: Composed, username: string, password: string): Promise<CommandResult> {
  if (password.length < 12) return { text: 'Operator password must be at least 12 characters.', exitCode: 1 };
  const id = await composed.ctx.store.createAdmin(username, await hashPassword(password));
  return { text: `Created operator "${username}" (${id}).` };
}

// --- California DROP -------------------------------------------------------

const day = (ms: number | null) => (ms === null ? '—' : new Date(ms).toISOString().slice(0, 10));

export async function dropStatus(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const view = await dropOverview(composed.ctx, { memberId: found.row.id, dek });

  if (!view.eligible) {
    return { text: 'DROP covers California residents only; this account is set to another jurisdiction.' };
  }

  if (view.state === 'not_started') {
    const lines = [
      'No DROP request on record. One free state request reaches every registered broker at once.',
      '',
      'We cannot submit it for you — the portal verifies California residency through a',
      'government identity check, and the regulations let an agent aid a request, not make one.',
      '',
    ];
    for (const step of view.steps) {
      lines.push(`${String(step.ordinal)}. ${step.title}`);
      for (const wrapped of step.detail.match(/.{1,74}(\s|$)/g) ?? []) lines.push(`   ${wrapped.trim()}`);
      if (step.url) lines.push(`   ${step.url}`);
      lines.push('');
    }
    if (view.agentDisclosure) {
      lines.push(
        'Enter these as your authorized agent, before submitting:',
        `  name:       ${view.agentDisclosure.fullName}`,
        `  email:      ${view.agentDisclosure.email}`,
        ...(view.agentDisclosure.tradeName ? [`  trade name: ${view.agentDisclosure.tradeName}`] : []),
        '',
      );
    }
    lines.push(`Then: deletewe drop submitted ${email} [reference]`);
    return { text: lines.join('\n') };
  }

  return {
    text: [
      `state                         ${view.state}`,
      `reference                     ${view.reference ?? '(not recorded)'}`,
      `submitted                     ${day(view.submittedAt)}`,
      `brokers must retrieve by      ${day(view.brokersMustRetrieveBy)}   (reg. 7612(a), 45 days)`,
      `amendable or cancellable from ${day(view.amendableFrom)}   (reg. 7620(d), 45 days)`,
      `status meaningful by          ${day(view.statusMeaningfulFrom)}   (CalPrivacy guidance, 90 days)`,
      '',
      'Check status: https://consumer.drop.privacy.ca.gov/dropstatus',
      'A data broker must not email you to verify a DROP request (reg. 7616(c)).',
    ].join('\n'),
  };
}

export async function dropSubmitted(
  composed: Composed,
  email: string,
  reference?: string,
): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const { timeline } = await recordDropSubmission(composed.ctx, { memberId: found.row.id, dek, reference });

  return {
    text: [
      'Recorded. The statutory clock is running:',
      `  brokers must have retrieved it by ${day(timeline.brokersMustRetrieveBy)}`,
      `  you can amend or cancel from      ${day(timeline.amendableFrom)}`,
      `  status should be meaningful by    ${day(timeline.statusMeaningfulFrom)}`,
    ].join('\n'),
  };
}

export async function dropCancel(composed: Composed, email: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  await cancelDropRequest(composed.ctx, { memberId: found.row.id, dek });
  return { text: 'Marked cancelled here. Cancel it at the state portal too — we cannot do that for you.' };
}


// --- Verifying a broker definition -----------------------------------------

const bar = (value: number, width = 20) => '#'.repeat(Math.round(value * width)).padEnd(width, '.');

/**
 * Run one definition against its live site and show what it saw.
 *
 * Nothing is stored and nothing is sent: the scan half of the pipeline only
 * reads. This is the loop for turning `verified_at: never` into a date.
 */
export async function explain(composed: Composed, email: string, brokerId: string): Promise<CommandResult> {
  const found = await composed.ctx.store.findMemberByEmail(email);
  if (!found) return { text: `No account for ${email}.`, exitCode: 1 };

  const dek = await composed.ctx.store.unwrapDekFor(found.row);
  const report = await explainScan(composed.ctx, { memberId: found.row.id, dek, brokerId });

  const out: string[] = [
    `${report.brokerName}  (${report.brokerId})`,
    `  driver      ${report.driver}${report.screenshotBytes ? ` (screenshot ${String(report.screenshotBytes)} bytes)` : ' (no screenshot)'}`,
  ];

  if (report.skipped) {
    out.push(`  SKIPPED     ${report.skipped}`, '', skippedHint(report.skipped));
    return { text: out.join('\n') };
  }

  out.push(
    `  url         ${report.searchUrl ?? '(none)'}`,
    `  response    HTTP ${String(report.status ?? 0)}`,
    `  results     ${String(report.resultCount)} matched the result selector`,
    '',
  );

  if (report.resultCount === 0) {
    out.push(
      'No results. That is either a correct "not listed", or the result selector',
      'no longer matches the page. Open the URL above and check which.',
      '',
    );
  }

  for (const candidate of report.candidates) {
    const verdict =
      candidate.bucket === 'auto_confirm'
        ? 'would submit without asking'
        : candidate.bucket === 'review'
          ? 'would ask you to confirm'
          : 'discarded, not stored';
    out.push(`  [${String(candidate.index)}] score ${candidate.score.toFixed(2)}  ${bar(candidate.score)}  -> ${verdict}`);

    for (const c of candidate.comparisons) {
      out.push(
        `        ${c.field.padEnd(12)} ${truncate(c.listingValue, 22)} ~ ${truncate(c.profileValue, 22)}  ` +
          `${c.similarity.toFixed(2)} x${c.weight.toFixed(2)}`,
      );
    }
    if (candidate.rejectedBecause) out.push(`        reason: ${candidate.rejectedBecause}`);
    if (candidate.url) out.push(`        ${candidate.url}`);
    out.push('');
  }

  if (report.unextractedMatchFields.length > 0) {
    out.push(
      `  WARNING: the definition weights ${report.unextractedMatchFields.join(', ')} but the page`,
      '  never yielded those fields. Either fix the extraction selectors or drop',
      '  the weights — scoring against a field that is never present only',
      '  depresses every score.',
      '',
    );
  }

  out.push(
    `  would submit without asking  ${String(report.wouldSubmit)}`,
    `  would ask you to confirm     ${String(report.wouldAsk)}`,
    `  discarded                    ${String(report.discarded)}`,
    '',
    '  Stored: nothing. Sent: nothing.',
    '',
    `  If this looks right, set verified_at in packages/catalog/brokers/${report.brokerId}.yaml`,
    '  and run: npm run catalog:bundle && npm run verify',
  );
  return { text: out.join('\n') };
}

function truncate(value: string, width: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return (clean.length > width ? `${clean.slice(0, width - 1)}~` : clean).padEnd(width);
}

function skippedHint(skipped: string): string {
  switch (skipped) {
    case 'rate_limited':
      return 'The per-broker interval has not elapsed. Wait, or lower min_interval_ms while testing.';
    case 'no_search':
      return 'This definition declares search: none, so there is nothing to scan. That is deliberate\nfor brokers with no public index — the member gets instructions instead.';
    case 'broker_unavailable':
      return 'The broker is disabled or marked broken. Check: deletewe brokers';
    case 'no_profile':
      return 'The member has no name on file. Add one before scanning.';
    default:
      return '';
  }
}

export async function mailTest(composed: Composed, to: string): Promise<CommandResult> {
  const inbound = await composed.inbound.check();
  const outbound = await verifyOutboundMail(composed.ctx.ports.mailer, {
    from: composed.config.agentEmailFrom,
    to,
    replyTo: composed.ctx.ports.inbound.addressFor('mailtest'),
  });

  return {
    text: [
      `outbound  ${outbound.ok ? 'OK  ' : 'FAIL'}  ${outbound.detail}`,
      `inbound   ${inbound.ok ? 'OK  ' : 'FAIL'}  ${inbound.detail}  (${composed.inbound.kind})`,
      '',
      'Inbound is the one that matters: 20 of 29 shipped definitions complete',
      'only when an emailed confirmation link is followed, usually within about',
      '24 hours. Without it those opt-outs submit and then stall.',
    ].join('\n'),
    exitCode: outbound.ok && inbound.ok ? 0 : 1,
  };
}
