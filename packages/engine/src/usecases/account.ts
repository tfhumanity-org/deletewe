import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import type { Member } from '../types.ts';

export interface ExportBundle {
  readonly format: 'deletewe-export/1';
  readonly exportedAt: number;
  readonly member: Member;
  readonly consents: unknown;
  readonly profile: unknown;
  readonly listings: unknown;
  readonly cases: unknown;
  readonly tasks: unknown;
  readonly evidence: unknown;
  readonly reports: unknown;
  readonly events: unknown;
  readonly note: string;
}

const EXPORT_NOTE =
  'Everything this instance holds about you. Evidence blobs are listed with their SHA-256 so you can verify them against the files in the accompanying archive. The listing URLs and snapshots are records a broker published about you; they are included because they are yours to have.';

/** Full, portable export. The member owns the evidence trail, not us. */
export async function exportMemberData(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array },
): Promise<ExportBundle> {
  const row = await ctx.store.getMemberRow(params.memberId);
  if (!row) throw new EngineError('not_found', 'member not found');

  const bundle: ExportBundle = {
    format: 'deletewe-export/1',
    exportedAt: ctx.ports.clock.now(),
    member: await ctx.store.toMember(row, params.dek),
    consents: await ctx.store.listConsents(params.memberId),
    profile: await ctx.store.loadProfile(params.memberId, params.dek),
    listings: await ctx.store.listListings(params.memberId, params.dek),
    cases: await ctx.store.listCases(params.memberId),
    tasks: await ctx.store.listTasks(params.memberId, params.dek),
    evidence: await ctx.store.listEvidence(params.memberId),
    reports: await ctx.store.listReports(params.memberId, params.dek),
    events: await ctx.store.listEvents(params.memberId, params.dek, 1000),
    note: EXPORT_NOTE,
  };

  await ctx.store.recordEvent({ memberId: params.memberId, type: 'data_exported', actor: 'member' });
  ctx.log.info('data_exported');
  return bundle;
}

/**
 * Irreversible account deletion, in one request rather than a support ticket.
 *
 * Order matters: revoke authority so nothing new is dispatched, destroy the
 * key so surviving ciphertext is unreadable, delete the rows, then delete the
 * blobs. See docs/adr/0004-envelope-encryption.md.
 */
export async function deleteAccount(
  ctx: EngineContext,
  params: { memberId: string },
): Promise<{ blobsDeleted: number }> {
  await ctx.store.revokeMandates(params.memberId);
  await ctx.store.setMemberStatus(params.memberId, 'deleting');
  await ctx.store.deleteSessionsFor(params.memberId);

  const { blobKeys } = await ctx.store.deleteMemberData(params.memberId);

  let deleted = 0;
  for (const key of blobKeys) {
    try {
      await ctx.ports.blobs.delete(key);
      deleted++;
    } catch {
      // The key is already cryptographically shredded; a failed blob delete is
      // reported but does not leave readable data behind.
      ctx.log.warn('blob_delete_failed');
    }
  }

  // Sweep anything the evidence table did not know about.
  for (const key of await ctx.ports.blobs.list(`evidence/${params.memberId}/`)) {
    await ctx.ports.blobs.delete(key).catch(() => undefined);
    deleted++;
  }

  ctx.log.info('account_deleted', { blobsDeleted: deleted });
  return { blobsDeleted: deleted };
}
