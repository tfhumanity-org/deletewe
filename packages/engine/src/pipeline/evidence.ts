import { sha256Hex } from '../crypto.ts';
import type { EngineContext } from '../context.ts';
import type { EvidenceRecord } from '../types.ts';

const encoder = new TextEncoder();

export interface CaptureParams {
  readonly memberId: string;
  readonly dek: Uint8Array;
  readonly caseId: string | null;
  readonly jobId: string | null;
  readonly brokerId: string;
  readonly definitionSha256: string | null;
}

/**
 * Evidence is write-once and member-encrypted.
 *
 * The blob key includes the job id, and the store refuses to overwrite an
 * existing key, so a capture cannot be silently replaced after the fact.
 * The returned sha256 is of the plaintext, so an exported bundle can be
 * checked for tampering offline. See docs/architecture.md section 7.
 */
export async function capture(
  ctx: EngineContext,
  params: CaptureParams,
  kind: EvidenceRecord['kind'],
  bytes: Uint8Array,
  extension: string,
): Promise<EvidenceRecord | undefined> {
  const hash = await sha256Hex(bytes);
  const key = [
    'evidence',
    params.memberId,
    params.caseId ?? 'nocase',
    params.jobId ?? 'nojob',
    `${kind}.${extension}`,
  ].join('/');

  const sealed = await ctx.store.encryptBlob(params.dek, params.memberId, bytes);

  try {
    await ctx.ports.blobs.put(key, sealed, 'application/octet-stream');
  } catch {
    // A duplicate key means this step already produced evidence; keep the first.
    ctx.log.debug('evidence_already_present', { kind, brokerId: params.brokerId });
    return undefined;
  }

  const record: Omit<EvidenceRecord, 'id'> = {
    memberId: params.memberId,
    caseId: params.caseId,
    jobId: params.jobId,
    kind,
    blobKey: key,
    sha256: hash,
    bytes: bytes.length,
    capturedAt: ctx.ports.clock.now(),
    engineVersion: ctx.config.engineVersion,
    definitionSha256: params.definitionSha256,
  };
  const id = await ctx.store.recordEvidence(record);
  return { id, ...record };
}

export async function captureText(
  ctx: EngineContext,
  params: CaptureParams,
  kind: EvidenceRecord['kind'],
  text: string,
  extension: string,
): Promise<EvidenceRecord | undefined> {
  return capture(ctx, params, kind, encoder.encode(text), extension);
}

export interface TranscriptEntry {
  readonly at: number;
  readonly step: string;
  readonly action: string;
  readonly url?: string;
  readonly status?: number;
  readonly ok: boolean;
  readonly note?: string;
}

/** Accumulates a step-by-step record of what the engine did, for evidence. */
export class Transcript {
  private readonly entries: TranscriptEntry[] = [];

  constructor(private readonly now: () => number) {}

  add(entry: Omit<TranscriptEntry, 'at'>): void {
    this.entries.push({ ...entry, at: this.now() });
  }

  toJson(meta: Record<string, string | number | boolean>): string {
    return JSON.stringify({ meta, entries: this.entries }, null, 2);
  }

  get length(): number {
    return this.entries.length;
  }
}
