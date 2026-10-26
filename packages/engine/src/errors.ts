/**
 * Error codes are the only error detail that may be logged or stored without
 * redaction. Messages may contain broker content; they are scrubbed before
 * persistence. See docs/threat-model.md section 6.
 */
export type ErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'invalid_input'
  | 'consent_missing'
  | 'mandate_missing'
  | 'mandate_revoked'
  | 'broker_disabled'
  | 'broker_broken'
  | 'rate_limited'
  | 'host_not_allowlisted'
  | 'selector_missing'
  | 'unexpected_page'
  | 'timeout'
  | 'blocked'
  | 'handoff_required'
  | 'verification_expired'
  | 'verification_unparseable'
  | 'channel_unavailable'
  | 'template_field_missing'
  | 'storage_conflict'
  | 'internal';

export class EngineError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly detail?: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function isEngineError(e: unknown): e is EngineError {
  return e instanceof EngineError;
}

export function codeOf(e: unknown): ErrorCode {
  return isEngineError(e) ? e.code : 'internal';
}
