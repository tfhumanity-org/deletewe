import type { AutomationLevel, OptOutMethod } from '@deletewe/schema';

export type MemberStatus = 'active' | 'paused' | 'deleting';

export type IdentifierKind = 'name' | 'alias' | 'address' | 'phone' | 'email' | 'dob';

export type ConsentPurpose = 'process_pii' | 'contact_brokers' | 'store_evidence' | 'email_updates';

export type MandateKind = 'authorized_agent' | 'limited_power_of_attorney';

/** Pipeline states. See the state diagram in docs/architecture.md. */
export type CaseState =
  | 'discovered'
  | 'matched'
  | 'awaiting_consent'
  | 'rejected'
  | 'queued'
  | 'task_pending'
  | 'submitted'
  | 'awaiting_verification'
  | 'acknowledged'
  | 'removed'
  | 'relisted'
  | 'needs_review';

export type CaseOutcome = 'removed' | 'refused' | 'unreachable' | 'abandoned';

export type JobKind = 'scan' | 'submit' | 'verify' | 'recheck' | 'report';
export type JobState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type MatchDecision = 'pending' | 'confirmed' | 'rejected' | 'auto_confirmed';

export type TaskAudience = 'member' | 'operator';
export type TaskKind =
  | 'captcha'
  | 'id_upload'
  | 'phone_call'
  | 'confirm_match'
  | 'broker_broken'
  | 'verify_ambiguous'
  | 'manual_optout'
  | 'drop_unavailable';
export type TaskState = 'open' | 'done' | 'skipped' | 'expired';

export type BrokerStatus = 'healthy' | 'degraded' | 'broken' | 'disabled';

export type HealthFailure =
  | 'selector_missing'
  | 'blocked'
  | 'timeout'
  | 'unexpected_page'
  | 'rate_limited'
  | 'host_not_allowlisted';

export interface Member {
  readonly id: string;
  readonly email: string;
  readonly jurisdiction: string;
  readonly status: MemberStatus;
  readonly autoConfirmThreshold: number;
  readonly createdAt: number;
}

export interface Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface PersonName {
  readonly first: string;
  readonly middle?: string;
  readonly last: string;
}

export type IdentifierValue =
  | { readonly kind: 'name'; readonly value: PersonName }
  | { readonly kind: 'alias'; readonly value: PersonName }
  | { readonly kind: 'address'; readonly value: Address }
  | { readonly kind: 'phone'; readonly value: string }
  | { readonly kind: 'email'; readonly value: string }
  | { readonly kind: 'dob'; readonly value: string };

export interface Identifier {
  readonly id: string;
  readonly memberId: string;
  readonly isCurrent: boolean;
  readonly weight: number;
  readonly createdAt: number;
  readonly data: IdentifierValue;
}

/** Everything the engine knows about one person. Always exactly one subject. */
export interface Profile {
  readonly memberId: string;
  readonly jurisdiction: string;
  readonly names: readonly PersonName[];
  readonly aliases: readonly PersonName[];
  readonly addresses: readonly { address: Address; isCurrent: boolean }[];
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly dob?: string;
}

/** A record found at a broker that may be about the member. */
export interface Listing {
  readonly id: string;
  readonly memberId: string;
  readonly brokerId: string;
  readonly url: string;
  readonly externalKey: string | null;
  readonly snapshot: ListingSnapshot;
  readonly dedupHash: string;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly reviewCount: number;
  readonly status: CaseState;
}

/** Fields extracted from a broker's search results, per its definition. */
export interface ListingSnapshot {
  readonly name?: string;
  readonly alias?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly postal_code?: string;
  readonly age?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly street?: string;
  readonly url?: string;
  readonly [key: string]: string | undefined;
}

export interface FieldComparison {
  readonly field: string;
  readonly profileValue: string;
  readonly listingValue: string;
  readonly similarity: number;
  readonly weight: number;
}

export interface MatchResult {
  readonly score: number;
  readonly comparisons: readonly FieldComparison[];
  readonly matcherVersion: string;
  readonly requiresManualConfirmation: boolean;
}

export interface CaseFile {
  readonly id: string;
  readonly memberId: string;
  readonly brokerId: string;
  readonly listingId: string;
  readonly state: CaseState;
  readonly attemptCount: number;
  readonly openedAt: number;
  readonly closedAt: number | null;
  readonly nextCheckAt: number | null;
  readonly outcome: CaseOutcome | null;
}

export interface Task {
  readonly id: string;
  readonly memberId: string;
  readonly caseId: string | null;
  readonly audience: TaskAudience;
  readonly kind: TaskKind;
  readonly title: string;
  readonly instructions: string;
  readonly prefill: Record<string, string> | null;
  readonly deepLink: string | null;
  readonly state: TaskState;
  readonly dueAt: number | null;
  readonly createdAt: number;
  readonly completedAt: number | null;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly memberId: string;
  readonly caseId: string | null;
  readonly jobId: string | null;
  readonly kind: 'screenshot' | 'dom' | 'transcript' | 'email' | 'letter_pdf';
  readonly blobKey: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly capturedAt: number;
  readonly engineVersion: string;
  readonly definitionSha256: string | null;
}

export interface BrokerRow {
  readonly id: string;
  readonly name: string;
  readonly homepage: string;
  readonly category: string;
  readonly definitionVersion: string;
  readonly definitionSha256: string;
  readonly automationLevel: AutomationLevel;
  readonly optOutMethod: OptOutMethod;
  readonly relistIntervalDays: number;
  readonly jurisdictions: readonly string[];
  readonly status: BrokerStatus;
  readonly enabled: boolean;
  readonly verifiedAt: string | null;
}

export interface JobRecord {
  readonly id: string;
  readonly memberId: string;
  readonly caseId: string | null;
  readonly kind: JobKind;
  readonly idempotencyKey: string;
  readonly state: JobState;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly runAfter: number;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

export interface MemberEvent {
  readonly id: string;
  readonly memberId: string;
  readonly caseId: string | null;
  readonly type: string;
  readonly detail: string | null;
  readonly at: number;
  readonly actor: 'system' | 'member' | 'operator';
}
