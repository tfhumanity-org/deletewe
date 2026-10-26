import type { DropChannel, DropRequest, DropSubmission, LetterDispatch, LetterRequest } from './ports.ts';

/**
 * The shipped DROP implementation. Submitting to a state platform requires
 * operator registration, credentials, and legal review, so the default records
 * the request as unavailable and the engine raises a guided task pointing the
 * member at the official portal. See docs/architecture.md section 11.
 */
export class NullDropChannel implements DropChannel {
  readonly available = false;

  async submit(_request: DropRequest): Promise<DropSubmission> {
    return {
      accepted: false,
      reason: 'channel_unavailable',
    };
  }

  async pollStatus(_reference: string): Promise<undefined> {
    return undefined;
  }
}

/**
 * The shipped postal/fax implementation. PDF generation is real; dispatch
 * needs a vendor, and that vendor sees name and address in plaintext, so
 * choosing one is a human decision. See docs/roadmap.md.
 */
export class NullLetterDispatch implements LetterDispatch {
  readonly available = false;

  async send(_request: LetterRequest): Promise<{ accepted: boolean; reason: string }> {
    return { accepted: false, reason: 'channel_unavailable' };
  }
}
