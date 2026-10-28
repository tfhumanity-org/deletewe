import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import { probeScan, type ScanCandidate } from '../pipeline/scan.ts';
import type { FieldComparison } from '../types.ts';

export interface ExplainedCandidate {
  readonly index: number;
  readonly score: number;
  readonly bucket: ScanCandidate['bucket'];
  readonly url: string | undefined;
  readonly extracted: Readonly<Record<string, string | undefined>>;
  readonly comparisons: readonly FieldComparison[];
  /** Why this one would not proceed, when it would not. */
  readonly rejectedBecause: string | undefined;
}

export interface DefinitionReport {
  readonly brokerId: string;
  readonly brokerName: string;
  readonly searchUrl: string | undefined;
  readonly status: number | undefined;
  readonly driver: string;
  readonly screenshotBytes: number | undefined;
  readonly resultCount: number;
  readonly candidates: readonly ExplainedCandidate[];
  readonly skipped: string | undefined;
  readonly wouldSubmit: number;
  readonly wouldAsk: number;
  readonly discarded: number;
  /** Fields the definition weights but the page never yielded. */
  readonly unextractedMatchFields: readonly string[];
}

/**
 * Run one broker definition against its live site and report what it saw,
 * without writing anything down or sending anything.
 *
 * This is the loop for verifying a definition. The scan half of the pipeline
 * is read-only by construction, so pointing it at a real broker risks nothing
 * beyond one polite HTTP request — and it answers the question that actually
 * matters, which is whether the selectors still match reality.
 *
 * See docs/playbook/adding-a-broker.md.
 */
export async function explainScan(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; brokerId: string },
): Promise<DefinitionReport> {
  const definition = ctx.catalog.get(params.brokerId);
  if (!definition) throw new EngineError('not_found', `no definition for broker "${params.brokerId}"`);

  const probe = await probeScan(ctx, params, { captureEvidence: false });

  const candidates: ExplainedCandidate[] = probe.candidates.map((candidate, index) => ({
    index: index + 1,
    score: candidate.match.score,
    bucket: candidate.bucket,
    url: candidate.url,
    extracted: candidate.snapshot,
    comparisons: candidate.match.comparisons,
    rejectedBecause: rejectionReason(candidate),
  }));

  const weighted = Object.keys(definition.match.fields);
  const everExtracted = new Set(probe.candidates.flatMap((c) => Object.keys(c.snapshot)));

  return {
    brokerId: probe.brokerId,
    brokerName: definition.name,
    searchUrl: probe.searchUrl,
    status: probe.status,
    driver: probe.driver,
    screenshotBytes: probe.screenshot?.length,
    resultCount: probe.resultCount,
    candidates,
    skipped: probe.skipped,
    wouldSubmit: candidates.filter((c) => c.bucket === 'auto_confirm').length,
    wouldAsk: candidates.filter((c) => c.bucket === 'review').length,
    discarded: candidates.filter((c) => c.bucket === 'discard' || !c.url).length,
    unextractedMatchFields: weighted.filter((field) => !everExtracted.has(field)),
  };
}

function rejectionReason(candidate: ScanCandidate): string | undefined {
  if (!candidate.url) return 'no listing URL could be extracted, or it pointed off the host allowlist';
  if (candidate.bucket === 'discard') return 'scored below the review threshold';
  return undefined;
}
