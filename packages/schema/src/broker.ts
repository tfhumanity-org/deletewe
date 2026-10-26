import { z } from 'zod';
import {
  AUTOMATION_LEVELS,
  BROKER_CATEGORIES,
  EVIDENCE_KINDS,
  EXTRACT_ATTRS,
  HANDOFF_REASONS,
  MATCH_FIELDS,
  OPT_OUT_METHODS,
  PROFILE_FIELDS,
  VERIFICATION_METHODS,
} from './enums.ts';

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'must be a lowercase slug')
  .max(64);

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'must be semver, e.g. 1.0.0');

const httpsUrl = z.url().startsWith('https://', 'must be https');

/** Hostname only: no scheme, no path, no port. */
const host = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'must be a bare hostname');

/** ISO-3166 alpha-2, optionally with a subdivision: `US`, `US-CA`, `GB`. */
const jurisdiction = z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/);

const selector = z.string().min(1).max(500);

const extractor = z.object({
  selector,
  attr: z.enum(EXTRACT_ATTRS).default('text'),
  /** Optional regex applied to the extracted value; capture group 1 wins. */
  pattern: z.string().optional(),
});
export type Extractor = z.infer<typeof extractor>;

const expectation = z
  .object({
    selector_present: selector.optional(),
    selector_absent: selector.optional(),
    text_contains: z.string().min(1).optional(),
    status_in: z.array(z.number().int().min(100).max(599)).optional(),
  })
  .refine(
    (e) =>
      e.selector_present !== undefined ||
      e.selector_absent !== undefined ||
      e.text_contains !== undefined ||
      e.status_in !== undefined,
    { message: 'expect must assert at least one condition' },
  );
export type Expectation = z.infer<typeof expectation>;

const baseStep = { id: slug, optional: z.boolean().default(false) };

/**
 * Discriminated by `action`. Each variant carries only the fields that action
 * can use, so a definition cannot smuggle a URL into a `click`.
 */
const step = z.discriminatedUnion('action', [
  z.object({ ...baseStep, action: z.literal('goto'), url: httpsUrl, expect: expectation.optional() }),
  z.object({
    ...baseStep,
    action: z.literal('fill'),
    selector,
    /** May contain `{{field}}` placeholders; every field must be in required_fields. */
    value: z.string().max(2000),
    expect: expectation.optional(),
  }),
  z.object({ ...baseStep, action: z.literal('select'), selector, value: z.string().max(500), expect: expectation.optional() }),
  z.object({ ...baseStep, action: z.literal('click'), selector, expect: expectation.optional() }),
  z.object({ ...baseStep, action: z.literal('wait_for'), selector: selector.optional(), ms: z.number().int().min(0).max(60_000).optional(), expect: expectation.optional() }),
  z.object({ ...baseStep, action: z.literal('expect'), expect: expectation }),
  z.object({ ...baseStep, action: z.literal('extract'), name: slug, extractor }),
  z.object({ ...baseStep, action: z.literal('screenshot'), label: z.string().max(100).optional() }),
  z.object({
    ...baseStep,
    action: z.literal('handoff'),
    reason: z.enum(HANDOFF_REASONS),
    /** Shown to the member. Must not contain PII; values are referenced, not inlined. */
    instructions: z.string().min(10).max(2000),
    /** Where to send the member. Must be on the host allowlist. */
    url: httpsUrl.optional(),
  }),
]);
export type BrokerStep = z.infer<typeof step>;

const searchBlock = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('url_template'),
    /** Supports `{name_slug}`, `{first_name}`, `{last_name}`, `{city}`, `{region}`. */
    url_template: httpsUrl,
    result_selector: selector,
    fields: z.record(z.string(), extractor),
  }),
  z.object({ method: z.literal('none') }),
]);
export type SearchBlock = z.infer<typeof searchBlock>;

const matchBlock = z.object({
  // `partialRecord`, not `record`: a record keyed by an enum is exhaustive in
  // Zod 4, and a broker weights only the fields its listings actually expose.
  fields: z.partialRecord(z.enum(MATCH_FIELDS), z.number().min(0).max(1)).refine(
    (f) => Object.keys(f).length > 0,
    'at least one match field is required',
  ),
  thresholds: z
    .object({
      review: z.number().min(0).max(1).default(0.5),
      auto_confirm: z.number().min(0).max(1).default(0.9),
    })
    .default({ review: 0.5, auto_confirm: 0.9 }),
  /** Forces member review regardless of score. */
  require_manual_confirmation: z.boolean().default(false),
});
export type MatchBlock = z.infer<typeof matchBlock>;

const emailBlock = z.object({
  to: z.email(),
  cc: z.array(z.email()).optional(),
  subject_template: z.string().min(1).max(300),
  body_template: z.string().min(1).max(10_000),
});

const letterBlock = z.object({
  recipient: z.string().min(1).max(200),
  address_lines: z.array(z.string().min(1).max(200)).min(2).max(8),
  fax: z.string().max(40).optional(),
  body_template: z.string().min(1).max(10_000),
});

const optOutBlock = z.object({
  method: z.enum(OPT_OUT_METHODS),
  url: httpsUrl.optional(),
  /** Everything the submitter is allowed to see. Nothing else is projected. */
  required_fields: z.array(z.enum(PROFILE_FIELDS)).max(PROFILE_FIELDS.length),
  steps: z.array(step).max(60).default([]),
  email: emailBlock.optional(),
  letter: letterBlock.optional(),
  phone: z.string().max(40).optional(),
  /** Member-facing instructions for `manual` / `phone` / `account` methods. */
  instructions: z.string().max(4000).optional(),
});
export type OptOutBlock = z.infer<typeof optOutBlock>;

const verificationBlock = z.object({
  method: z.enum(VERIFICATION_METHODS).default('none'),
  /** Sender domains or addresses accepted as genuine, e.g. `@spokeo.com`. */
  expected_senders: z.array(z.string().min(3).max(200)).default([]),
  /** Anchored regex the confirmation link must match before it is followed. */
  link_pattern: z.string().max(500).optional(),
  window_hours: z.number().int().min(1).max(720).default(72),
});
export type VerificationBlock = z.infer<typeof verificationBlock>;

export const brokerDefinitionSchema = z
  .object({
    id: slug,
    name: z.string().min(1).max(200),
    homepage: httpsUrl,
    version: semver,
    category: z.enum(BROKER_CATEGORIES),
    jurisdictions: z.array(jurisdiction).min(1),
    /** Allowlist. No URL anywhere in this definition may leave these hosts. */
    hosts: z.array(host).min(1).max(20),
    automation: z.object({
      level: z.enum(AUTOMATION_LEVELS),
      /** Required unless level is `automated`: say why it is not. */
      reason: z.string().min(3).max(500).optional(),
    }),
    search: searchBlock,
    match: matchBlock,
    opt_out: optOutBlock,
    verification: verificationBlock.default({ method: 'none', expected_senders: [], window_hours: 72 }),
    relist: z.object({ interval_days: z.number().int().min(7).max(730) }),
    evidence: z
      .object({ capture: z.array(z.enum(EVIDENCE_KINDS)).default(['screenshot', 'dom', 'transcript']) })
      .default({ capture: ['screenshot', 'dom', 'transcript'] }),
    rate_limit: z
      .object({
        max_concurrent: z.number().int().min(1).max(8).default(1),
        min_interval_ms: z.number().int().min(1000).max(600_000).default(3000),
        daily_cap: z.number().int().min(1).max(100_000).default(500),
      })
      .default({ max_concurrent: 1, min_interval_ms: 3000, daily_cap: 500 }),
    /**
     * ISO date on which a human last ran this definition against the live site.
     * Absent means the procedure is theoretical. See docs/broker-catalog.md section 6.
     */
    verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date').optional(),
    references: z.array(z.url()).default([]),
    notes: z.string().max(5000).optional(),
    enabled: z.boolean().default(true),
  })
  .strict();

export type BrokerDefinition = z.infer<typeof brokerDefinitionSchema>;
export type BrokerDefinitionInput = z.input<typeof brokerDefinitionSchema>;
