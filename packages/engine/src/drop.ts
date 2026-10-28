/**
 * California's Delete Request and Opt-out Platform.
 *
 * One request through DROP reaches every registered data broker, and since
 * 1 August 2026 brokers must retrieve it at least every 45 days. For a
 * California resident that is both free and stronger than asking brokers one
 * at a time, so we surface it first rather than burying it among 29 scrapers.
 *
 * What this module deliberately does NOT do is submit on the member's behalf.
 * The regulations make that impossible for an agent, and pretending otherwise
 * would be worse than useless:
 *
 *   - § 7620(a): "Consumers must submit their deletion request through the
 *     DROP", and may be required to have California residency verified by the
 *     Agency first. Verification runs through the California Identity Gateway
 *     or Login.gov — a government identity check only the member can pass.
 *   - § 7621(a): "An authorized agent may aid in a consumer's deletion
 *     request" — aid, not submit.
 *   - § 7621(b): the agent's full name, email address, and trade name (if the
 *     agent is a business) must be disclosed through the consumer's DROP
 *     account *before* the request is submitted.
 *   - § 7621(c): an agent "may not cancel a consumer's deletion request unless
 *     expressly directed by the consumer".
 *
 * The DROP API that does exist (§§ 7610–7613) is the data-broker side: an
 * account with an EIN, an access fee, and retrieval of hashed consumer
 * deletion lists. We are not a data broker and must not register as one.
 *
 * So the integration is a guided statutory channel with a tracked timeline,
 * and `ApiDropChannel` remains an empty seam in case CalPrivacy ever publishes
 * an agent submission interface.
 */

export const DROP_CONSUMER_PORTAL = 'https://consumer.drop.privacy.ca.gov';
export const DROP_STATUS_PORTAL = 'https://consumer.drop.privacy.ca.gov/dropstatus';
export const DROP_ELIGIBLE_JURISDICTION = 'US-CA';

/**
 * § 7612(a): a data broker must retrieve its deletion lists at least once
 * every 45 calendar days. Checking before that has elapsed asks a broker to
 * have acted before it was obliged to.
 */
export const DROP_BROKER_ACCESS_DAYS = 45;

/**
 * § 7620(d): "A consumer may amend or cancel a deletion request made through
 * the DROP no sooner than 45 days after submission."
 */
export const DROP_AMEND_LOCKOUT_DAYS = 45;

/** CalPrivacy tells consumers status updates can take up to 90 days. */
export const DROP_STATUS_HORIZON_DAYS = 90;

/** § 7622(a): a residency classification may be challenged within 10 days. */
export const DROP_RESIDENCY_APPEAL_DAYS = 10;

/** The identity an agent must disclose under § 7621(b). */
export interface DropAgentIdentity {
  readonly fullName: string;
  readonly email: string;
  /** Required when the authorized agent is a business. */
  readonly tradeName?: string;
}

export type DropRequestState =
  | 'not_started'
  | 'awaiting_residency_verification'
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'cancelled';

export interface DropStep {
  readonly ordinal: number;
  readonly title: string;
  readonly detail: string;
  readonly url?: string;
}

/**
 * Identifiers § 7620(b) lets a consumer attach. Listed so the member can see
 * what DROP will match on and decide what to give it — the portal itself says
 * "You choose what information to provide".
 */
export const DROP_SUPPORTED_IDENTIFIERS = [
  'date of birth',
  'email address',
  'phone number',
  'name, date of birth and ZIP code in combination',
  'mobile advertising identifier (MAID)',
] as const;

export function isDropEligible(jurisdiction: string): boolean {
  return jurisdiction === DROP_ELIGIBLE_JURISDICTION;
}

/**
 * The steps the member must take, in order, with our agent disclosure already
 * worked out. Written from the regulations rather than from a screenshot, so
 * it stays accurate if the portal's wording moves around.
 */
export function dropSteps(agent: DropAgentIdentity | undefined): DropStep[] {
  const steps: DropStep[] = [
    {
      ordinal: 1,
      title: 'Open the state portal',
      detail:
        'DROP is run by CalPrivacy, not by us. It is free. You do not need an account first — you go straight to verification.',
      url: DROP_CONSUMER_PORTAL,
    },
    {
      ordinal: 2,
      title: 'Verify you are a California resident',
      detail:
        'The portal checks residency through the California Identity Gateway, or Login.gov if you already have an account there. Only you can complete this: it is a government identity check, and no agent can do it for you. If the Agency cannot verify your residency you cannot submit, though you can challenge the classification within 10 days.',
    },
  ];

  if (agent) {
    steps.push({
      ordinal: 3,
      title: 'Declare us as your authorized agent — before you submit',
      detail:
        `The regulations require the agent's details to be recorded in your DROP account before the request goes in. Enter them exactly as shown on this page: name "${agent.fullName}", email "${agent.email}"` +
        (agent.tradeName ? `, trade name "${agent.tradeName}"` : '') +
        '. If you would rather not name an agent at all, skip this step — the request still works, and we simply will not appear on it.',
    });
  } else {
    steps.push({
      ordinal: 3,
      title: 'Skip the authorized agent section',
      detail:
        'This instance has not been configured with agent details to disclose, so submit the request in your own name. It works exactly the same.',
    });
  }

  steps.push(
    {
      ordinal: steps.length + 1,
      title: 'Choose what to submit',
      detail:
        `You decide what to give it. DROP can match on: ${DROP_SUPPORTED_IDENTIFIERS.join('; ')}. More identifiers means more brokers match you, and also more disclosure — the same trade-off as your profile here.`,
    },
    {
      ordinal: steps.length + 2,
      title: 'Submit, then tell us the date',
      detail:
        'Come back and mark this task done. We will start the clock: brokers have to retrieve your request within 45 days, and CalPrivacy says status can take up to 90. We will remind you to check rather than letting it drift.',
      url: DROP_STATUS_PORTAL,
    },
  );

  return steps;
}

/** Renders the steps as the markdown body of a guided task. */
export function dropInstructions(agent: DropAgentIdentity | undefined): string {
  const lines = [
    'California runs a single deletion request that reaches **every registered data broker** at once, including ones this instance has no procedure for. It is free, and it is stronger than asking brokers one at a time.',
    '',
    'We cannot submit it for you. The law lets an authorized agent *aid* a request, not make one: the portal verifies your California residency through a government identity check, and that is yours alone to pass.',
    '',
  ];
  for (const step of dropSteps(agent)) {
    lines.push(`**${String(step.ordinal)}. ${step.title}**`, step.detail, '');
  }
  lines.push(
    'Two things worth knowing afterwards: a data broker is forbidden from contacting you to verify a DROP request, so treat any such email as suspect; and you cannot amend or cancel the request for the first 45 days.',
  );
  return lines.join('\n');
}

export interface DropTimeline {
  readonly submittedAt: number;
  /** Earliest point a broker must have retrieved the request. § 7612(a). */
  readonly brokersMustRetrieveBy: number;
  /** Earliest a consumer may amend or cancel. § 7620(d). */
  readonly amendableFrom: number;
  /** When CalPrivacy suggests status should be meaningful. */
  readonly statusMeaningfulFrom: number;
}

export function dropTimeline(submittedAt: number): DropTimeline {
  const days = (n: number) => n * 86_400_000;
  return {
    submittedAt,
    brokersMustRetrieveBy: submittedAt + days(DROP_BROKER_ACCESS_DAYS),
    amendableFrom: submittedAt + days(DROP_AMEND_LOCKOUT_DAYS),
    statusMeaningfulFrom: submittedAt + days(DROP_STATUS_HORIZON_DAYS),
  };
}

/**
 * Reference numbers are shown to the member and stored encrypted; keep the
 * shape permissive but reject anything that is obviously not one, so a
 * mis-paste does not become a silently useless record.
 */
export function normaliseDropReference(raw: string): string | undefined {
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (trimmed.length < 4 || trimmed.length > 64) return undefined;
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(trimmed)) return undefined;
  return trimmed;
}
