import { brokerDefinitionSchema, type BrokerDefinition } from './broker.ts';

export interface ValidationIssue {
  readonly brokerId: string;
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly definition?: BrokerDefinition;
  readonly issues: readonly ValidationIssue[];
}

const TEMPLATE_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Every `{{field}}` referenced anywhere in a template string. */
export function templateFields(...templates: readonly (string | undefined)[]): Set<string> {
  const found = new Set<string>();
  for (const t of templates) {
    if (!t) continue;
    for (const m of t.matchAll(TEMPLATE_RE)) {
      if (m[1]) found.add(m[1]);
    }
  }
  return found;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** True when `host` is the allowlisted host or a subdomain of it. */
function hostAllowed(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((a) => host === a || host.endsWith(`.${a}`));
}

/**
 * Cross-field rules that the Zod schema cannot express on its own.
 * These are the supply-chain controls described in docs/adr/0003 and
 * docs/threat-model.md TB8 — host containment, field containment, and honesty
 * about the automation level.
 */
export function checkDefinition(raw: unknown, filename?: string): ValidationResult {
  const parsed = brokerDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const id =
      typeof raw === 'object' && raw !== null && 'id' in raw && typeof raw.id === 'string'
        ? raw.id
        : (filename ?? '<unknown>');
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        brokerId: id,
        severity: 'error' as const,
        code: 'schema',
        path: i.path.join('.') || '<root>',
        message: i.message,
      })),
    };
  }

  const def = parsed.data;
  const issues: ValidationIssue[] = [];
  const err = (code: string, path: string, message: string) =>
    issues.push({ brokerId: def.id, severity: 'error', code, path, message });
  const warn = (code: string, path: string, message: string) =>
    issues.push({ brokerId: def.id, severity: 'warning', code, path, message });

  if (filename !== undefined && filename !== def.id) {
    err('id_filename_mismatch', 'id', `id "${def.id}" must match filename "${filename}"`);
  }

  // --- Host containment: no URL anywhere may leave the allowlist. -----------
  const checkUrl = (url: string | undefined, path: string) => {
    if (!url) return;
    const h = hostOf(url);
    if (!h) {
      err('bad_url', path, `cannot parse URL: ${url}`);
      return;
    }
    if (!hostAllowed(h, def.hosts)) {
      err('host_not_allowlisted', path, `host "${h}" is not in hosts: [${def.hosts.join(', ')}]`);
    }
  };

  checkUrl(def.homepage, 'homepage');
  if (def.search.method === 'url_template') checkUrl(def.search.url_template, 'search.url_template');
  checkUrl(def.opt_out.url, 'opt_out.url');
  def.opt_out.steps.forEach((s, i) => {
    if ('url' in s) checkUrl(s.url, `opt_out.steps[${i}].url`);
  });

  // --- Field containment: no undeclared profile field may be referenced. ----
  const declared = new Set<string>(def.opt_out.required_fields);
  const referenced = templateFields(
    ...def.opt_out.steps.map((s) => ('value' in s ? s.value : undefined)),
    def.opt_out.email?.subject_template,
    def.opt_out.email?.body_template,
    def.opt_out.letter?.body_template,
    def.opt_out.instructions,
  );
  for (const field of referenced) {
    if (!declared.has(field)) {
      err(
        'undeclared_field',
        'opt_out.required_fields',
        `template references "{{${field}}}" which is not in required_fields`,
      );
    }
  }
  for (const field of declared) {
    if (!referenced.has(field) && def.opt_out.method !== 'drop') {
      warn(
        'unused_field',
        'opt_out.required_fields',
        `"${field}" is requested but never used — collect only what you need`,
      );
    }
  }

  // --- Step ids must be unique: health incidents reference a step. ---------
  const seen = new Set<string>();
  def.opt_out.steps.forEach((s, i) => {
    if (seen.has(s.id)) err('duplicate_step_id', `opt_out.steps[${i}].id`, `duplicate step id "${s.id}"`);
    seen.add(s.id);
  });

  // --- Internal consistency of the chosen method. --------------------------
  const hasHandoff = def.opt_out.steps.some((s) => s.action === 'handoff');
  switch (def.opt_out.method) {
    case 'form':
      if (def.opt_out.steps.length === 0) err('missing_steps', 'opt_out.steps', 'method "form" requires at least one step');
      if (!def.opt_out.url) err('missing_url', 'opt_out.url', 'method "form" requires opt_out.url');
      break;
    case 'email':
      if (!def.opt_out.email) err('missing_email', 'opt_out.email', 'method "email" requires an email block');
      break;
    case 'letter':
      if (!def.opt_out.letter) err('missing_letter', 'opt_out.letter', 'method "letter" requires a letter block');
      break;
    case 'phone':
      if (!def.opt_out.phone) err('missing_phone', 'opt_out.phone', 'method "phone" requires a phone number');
      if (!def.opt_out.instructions) err('missing_instructions', 'opt_out.instructions', 'method "phone" requires member instructions');
      break;
    case 'account':
    case 'drop':
      if (!def.opt_out.instructions && !hasHandoff && def.opt_out.steps.length === 0) {
        err('missing_instructions', 'opt_out.instructions', `method "${def.opt_out.method}" requires instructions or steps`);
      }
      break;
  }

  // --- The automation level must be true. ----------------------------------
  if (def.automation.level === 'automated') {
    if (hasHandoff) {
      err('automation_overclaimed', 'automation.level', 'level "automated" cannot contain a handoff step');
    }
    if (def.opt_out.method === 'phone') {
      err('automation_overclaimed', 'automation.level', 'method "phone" can never be "automated"');
    }
  } else if (!def.automation.reason) {
    err('missing_reason', 'automation.reason', `level "${def.automation.level}" requires a reason explaining the gap`);
  }
  if (def.automation.level === 'assisted' && !hasHandoff && def.opt_out.method === 'form') {
    warn('assisted_without_handoff', 'opt_out.steps', 'level "assisted" on a form flow usually needs a handoff step');
  }
  if (def.automation.level === 'unsupported' && def.enabled) {
    warn('unsupported_enabled', 'enabled', 'level "unsupported" is normally shipped disabled');
  }

  // --- Verification: anti-forgery controls for inbound mail. ---------------
  if (def.verification.method === 'email_link') {
    if (!def.verification.link_pattern) {
      err('missing_link_pattern', 'verification.link_pattern', 'email_link verification requires link_pattern');
    } else {
      let compiled: RegExp | undefined;
      try {
        compiled = new RegExp(def.verification.link_pattern);
      } catch {
        err('bad_link_pattern', 'verification.link_pattern', 'link_pattern is not a valid regular expression');
      }
      if (compiled && !def.verification.link_pattern.includes('https://')) {
        err(
          'unanchored_link_pattern',
          'verification.link_pattern',
          'link_pattern must anchor to an https URL on an allowlisted host',
        );
      }
    }
    if (def.verification.expected_senders.length === 0) {
      err('missing_senders', 'verification.expected_senders', 'email_link verification requires expected_senders');
    }
  }

  // --- Search consistency. --------------------------------------------------
  const search = def.search;
  if (search.method === 'none' && def.automation.level === 'automated') {
    warn('no_search', 'search.method', 'an automated broker with no search cannot find listings by itself');
  }
  if (search.method === 'url_template') {
    const extracted = search.fields;
    if (!extracted['url'] && !extracted['name']) {
      warn('weak_extraction', 'search.fields', 'extract at least a name or a url from each result');
    }
    for (const field of Object.keys(def.match.fields)) {
      const extractable = field === 'name' ? ['name'] : [field, 'name'];
      if (!extractable.some((f) => extracted[f])) {
        warn(
          'unextractable_match_field',
          `match.fields.${field}`,
          `match weights "${field}" but search.fields never extracts it`,
        );
      }
    }
  }

  if (def.match.thresholds.auto_confirm < def.match.thresholds.review) {
    err('threshold_order', 'match.thresholds', 'auto_confirm must be >= review');
  }

  if (!def.verified_at) {
    warn(
      'unverified',
      'verified_at',
      'never run against the live site — treat this procedure as theoretical',
    );
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return hasError ? { ok: false, issues } : { ok: true, definition: def, issues };
}
