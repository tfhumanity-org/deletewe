import type { EngineContext } from '../context.ts';
import { hashPassword, sha256Text } from '../crypto.ts';
import {
  CONSENT_DOCUMENT,
  CONSENT_VERSION,
  fillMandate,
  MANDATE_SCOPE,
  mandateDocument,
} from '../documents.ts';
import { EngineError } from '../errors.ts';
import type { ConsentPurpose, IdentifierValue, MandateKind, Member } from '../types.ts';

export interface EnrolInput {
  readonly email: string;
  readonly password: string;
  readonly jurisdiction: string;
  /** Every purpose the member ticked. Nothing is pre-ticked in the UI. */
  readonly consents: readonly ConsentPurpose[];
  readonly ipHash?: string;
  readonly userAgentHash?: string;
}

const REQUIRED_CONSENTS: readonly ConsentPurpose[] = ['process_pii', 'contact_brokers', 'store_evidence'];

export async function enrol(ctx: EngineContext, input: EnrolInput): Promise<{ member: Member; dek: Uint8Array }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new EngineError('invalid_input', 'enter a valid email address');
  }
  if (input.password.length < 12) {
    throw new EngineError('invalid_input', 'password must be at least 12 characters');
  }
  for (const purpose of REQUIRED_CONSENTS) {
    if (!input.consents.includes(purpose)) {
      throw new EngineError('consent_missing', `the service cannot run without consent to ${purpose}`);
    }
  }

  const { member, dek } = await ctx.store.createMember({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    jurisdiction: input.jurisdiction,
  });

  const documentSha256 = await sha256Text(CONSENT_DOCUMENT);
  for (const purpose of ['process_pii', 'contact_brokers', 'store_evidence', 'email_updates'] as const) {
    await ctx.store.recordConsent({
      memberId: member.id,
      purpose,
      granted: input.consents.includes(purpose),
      documentVersion: CONSENT_VERSION,
      documentSha256,
      ipHash: input.ipHash,
      userAgentHash: input.userAgentHash,
    });
  }

  await ctx.store.recordEvent({ memberId: member.id, type: 'account_created', actor: 'member' });
  ctx.log.info('member_enrolled', { jurisdiction: input.jurisdiction });
  return { member, dek };
}

/**
 * Records the authorized-agent appointment. The document hash is what proves,
 * later, exactly which wording the member signed.
 */
export async function signMandate(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; kind: MandateKind; signatureName: string },
): Promise<{ mandateId: string; documentSha256: string; text: string }> {
  if (params.signatureName.trim().length < 2) {
    throw new EngineError('invalid_input', 'type your full legal name to sign');
  }

  const document = mandateDocument(params.kind);
  const date = new Date(ctx.ports.clock.now()).toISOString().slice(0, 10);
  const text = fillMandate(document.text, params.signatureName.trim(), date);
  const documentSha256 = await sha256Text(text);

  const mandateId = await ctx.store.recordMandate({
    memberId: params.memberId,
    dek: params.dek,
    kind: params.kind,
    scope: [...MANDATE_SCOPE],
    documentVersion: document.version,
    documentSha256,
    signatureName: params.signatureName.trim(),
  });

  await ctx.store.recordEvent({ memberId: params.memberId, type: `mandate_signed:${params.kind}`, actor: 'member' });
  ctx.log.info('mandate_signed', { kind: params.kind });
  return { mandateId, documentSha256, text };
}

/** The kill switch. Revocation halts outbound work on the next gate check. */
export async function revokeAuthority(ctx: EngineContext, memberId: string): Promise<void> {
  await ctx.store.revokeMandates(memberId);
  await ctx.store.revokeConsent(memberId, 'contact_brokers');
  await ctx.store.setMemberStatus(memberId, 'paused');
  await ctx.store.recordEvent({ memberId, type: 'authority_revoked', actor: 'member' });
  ctx.log.info('authority_revoked');
}

export async function addProfileEntry(
  ctx: EngineContext,
  params: { memberId: string; dek: Uint8Array; data: IdentifierValue; isCurrent?: boolean },
): Promise<string> {
  const id = await ctx.store.addIdentifier(params);
  await ctx.store.recordEvent({
    memberId: params.memberId,
    type: `profile_entry_added:${params.data.kind}`,
    actor: 'member',
  });
  return id;
}

export async function removeProfileEntry(
  ctx: EngineContext,
  params: { memberId: string; identifierId: string },
): Promise<void> {
  await ctx.store.deleteIdentifier(params.memberId, params.identifierId);
  await ctx.store.recordEvent({ memberId: params.memberId, type: 'profile_entry_removed', actor: 'member' });
}
