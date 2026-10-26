/**
 * Closed enumerations for broker definitions.
 *
 * These are deliberately closed sets. A broker definition is declarative data
 * contributed by third parties (see docs/adr/0003-brokers-as-declarative-data.md);
 * the blast radius of a malicious contribution is bounded by what these enums
 * permit, not by reviewer attention.
 */

export const BROKER_CATEGORIES = [
  'people_search',
  'background_check',
  'public_records',
  'marketing',
  'identity_graph',
  'risk_fraud',
  'other',
] as const;

export const AUTOMATION_LEVELS = [
  /** Engine completes the opt-out with no human step. */
  'automated',
  /** Engine gets partway and hands off to the member (CAPTCHA, ID, login). */
  'assisted',
  /** No automation; the member receives instructions. */
  'manual',
  /** Broker is known, no working procedure exists. */
  'unsupported',
] as const;

export const OPT_OUT_METHODS = [
  'form',
  'email',
  'letter',
  /** California statutory channel. See docs/research/05-legal-basis.md. */
  'drop',
  'account',
  'phone',
] as const;

export const VERIFICATION_METHODS = [
  'none',
  'email_link',
  'phone_code',
  'account_login',
] as const;

/**
 * Fields a definition may request from a member profile. The submitter is handed
 * a projection containing only the declared fields and cannot reach the rest.
 *
 * Note the absence of anything describing a third party: relatives are never a
 * profile field. See docs/threat-model.md section 5.2.
 */
export const PROFILE_FIELDS = [
  'full_name',
  'first_name',
  'middle_name',
  'last_name',
  'aliases',
  'email',
  'phone',
  'address',
  'city',
  'region',
  'postal_code',
  'country',
  'dob',
  'age',
  'listing_url',
  'jurisdiction',
] as const;

/**
 * Closed action set for opt-out steps. There is no file upload, no script
 * execution, no download, and no arbitrary request builder.
 */
export const STEP_ACTIONS = [
  'goto',
  'fill',
  'select',
  'click',
  'wait_for',
  'expect',
  'extract',
  'screenshot',
  /** The only way a definition can ask for a human. Ends the automated run. */
  'handoff',
] as const;

export const HANDOFF_REASONS = [
  'captcha',
  'id_upload',
  'phone_call',
  'payment_wall',
  'account_creation',
  'unexpected',
] as const;

export const EVIDENCE_KINDS = ['screenshot', 'dom', 'transcript'] as const;

export const EXTRACT_ATTRS = ['text', 'href', 'src', 'value', 'html'] as const;

/** Fields the matcher can weight. Must be derivable from a listing snapshot. */
export const MATCH_FIELDS = [
  'name',
  'alias',
  'locality',
  'region',
  'postal_code',
  'age',
  'phone',
  'email',
  'street',
] as const;

export type BrokerCategory = (typeof BROKER_CATEGORIES)[number];
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];
export type OptOutMethod = (typeof OPT_OUT_METHODS)[number];
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type StepAction = (typeof STEP_ACTIONS)[number];
export type HandoffReason = (typeof HANDOFF_REASONS)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type ExtractAttr = (typeof EXTRACT_ATTRS)[number];
export type MatchField = (typeof MATCH_FIELDS)[number];
