import {
  dropInstructions,
  dropSteps,
  isDropEligible,
  type DropAgentIdentity,
} from './drop.ts';
import type { DropChannel, DropRequest, DropSubmission, DropStatus, LetterDispatch, LetterRequest } from './ports.ts';

/**
 * The shipped DROP implementation.
 *
 * It is "available" in the sense that matters: it produces an accurate,
 * ordered set of steps with our agent disclosure worked out. It cannot submit,
 * because under §§ 7620-7621 no agent can — see packages/engine/src/drop.ts
 * for the citations. Returning `member_action_required` is the honest answer,
 * not a stub.
 */
export class GuidedDropChannel implements DropChannel {
  readonly available = true;

  constructor(readonly agent: DropAgentIdentity | undefined) {}

  async submit(request: DropRequest): Promise<DropSubmission> {
    if (!isDropEligible(request.jurisdiction)) {
      return { kind: 'ineligible', reason: 'DROP covers California residents only' };
    }
    return {
      kind: 'member_action_required',
      steps: dropSteps(this.agent),
      instructions: dropInstructions(this.agent),
    };
  }

  /**
   * CalPrivacy exposes no status API to consumers or their agents; the member
   * reads their own status at the portal. We track the statutory clock
   * instead, which is the part software is actually good at.
   */
  async pollStatus(_reference: string): Promise<undefined> {
    return undefined;
  }
}

/**
 * The seam for a future agent submission API, if CalPrivacy ever publishes
 * one. Deliberately not implemented against a guessed endpoint: the DROP API
 * that exists today is the data-broker side (§§ 7610-7613), a role a removal
 * agent must not occupy.
 */
export class ApiDropChannel implements DropChannel {
  readonly available = false;
  readonly agent = undefined;

  async submit(_request: DropRequest): Promise<DropSubmission> {
    return { kind: 'unavailable', reason: 'no agent submission API exists for DROP' };
  }

  async pollStatus(_reference: string): Promise<DropStatus | undefined> {
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
