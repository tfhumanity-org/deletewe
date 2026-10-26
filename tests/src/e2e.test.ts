import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import {
  decideListing,
  generateReport,
  handleInboundMessage,
  pendingReviews,
  runRecheck,
  runScan,
  runSubmit,
} from '@deletewe/engine';
import type { BrokerDefinition } from '@deletewe/schema';
import { FetchBrowserDriver } from '@deletewe/browser';
import { parseEmail } from '@deletewe/adapters-node';
import { confirmationEmail, createMockBroker, createMockBrokerState, type MockBrokerState } from '@deletewe/mock-broker';
import { createHarness, definition, enrolTestMember, type Harness } from './harness.ts';

/**
 * The whole loop, end to end, against a stand-in broker served over real HTTP:
 * scan, match, member confirmation, form submission, emailed confirmation
 * link, re-check proving the removal, and a report.
 *
 * No request leaves the machine, and no real broker is touched.
 */

/**
 * Broker definitions must use https — the schema refuses anything else, and
 * that rule is worth more than the convenience of a plain-HTTP fixture. So the
 * definition names an https origin and the driver's fetch is mapped onto the
 * local server, with the response reporting the public URL back. The host
 * allowlist is therefore exercised for real rather than bypassed.
 */
const PUBLIC_ORIGIN = 'https://mock-broker.test';

let server: ReturnType<typeof serve>;
let origin: string;
let state: MockBrokerState;
let h: Harness;

function proxiedFetch(localOrigin: string): typeof fetch {
  return async (input, init) => {
    const requested =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const response = await fetch(requested.replace(PUBLIC_ORIGIN, localOrigin), init);
    Object.defineProperty(response, 'url', {
      value: (response.url || requested).replace(localOrigin, PUBLIC_ORIGIN),
      configurable: true,
    });
    return response;
  };
}

function brokerDefinition(base: string): BrokerDefinition {
  const host = new URL(base).hostname;
  return definition({
    id: 'mock-broker',
    name: 'Mock Broker',
    homepage: base,
    version: '1.0.0',
    category: 'people_search',
    jurisdictions: ['US'],
    hosts: [host],
    automation: { level: 'automated' },
    search: {
      method: 'url_template',
      url_template: `${base}/search/{name_slug}`,
      result_selector: '.result',
      fields: {
        name: { selector: '.name', attr: 'text' },
        locality: { selector: '.city', attr: 'text' },
        region: { selector: '.state', attr: 'text' },
        age: { selector: '.age', attr: 'text' },
        url: { selector: 'a.link', attr: 'href' },
      },
    },
    match: { fields: { name: 0.4, locality: 0.2, region: 0.15, age: 0.25 } },
    opt_out: {
      method: 'form',
      url: `${base}/optout`,
      required_fields: ['listing_url', 'email'],
      steps: [
        { id: 'open', action: 'goto', url: `${base}/optout`, expect: { selector_present: 'form' } },
        { id: 'listing', action: 'fill', selector: '#listing', value: '{{listing_url}}' },
        { id: 'email', action: 'fill', selector: '#email', value: '{{email}}' },
        { id: 'submit', action: 'click', selector: '#submit', expect: { selector_present: '#receipt' } },
      ],
    },
    verification: {
      method: 'email_link',
      expected_senders: ['@broker.test'],
      link_pattern: `${base.replace(/\./g, '\\.')}/confirm/[A-Za-z0-9-]+`,
      window_hours: 24,
    },
    relist: { interval_days: 90 },
    rate_limit: { max_concurrent: 1, min_interval_ms: 1000, daily_cap: 500 },
  });
}

beforeEach(async () => {
  const mock = createMockBroker(createMockBrokerState());
  state = mock.state;
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: mock.app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => { resolve(info.port); });
  });
  origin = `http://127.0.0.1:${String(port)}`;

  h = await createHarness({ definitions: [brokerDefinition(PUBLIC_ORIGIN)] });
  // Swap in a driver that makes real HTTP requests to the mock server.
  (h.ctx.ports as { browser: unknown }).browser = new FetchBrowserDriver(proxiedFetch(origin));
});

afterEach(async () => {
  h?.dispose();
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
});

/** The engine's host allowlist is enforced against the definition's own host. */
function allowlistedDefinition(): BrokerDefinition {
  return brokerDefinition(PUBLIC_ORIGIN);
}

describe('end to end against a mock broker', () => {
  it('removes a listing and proves it with a later scan', async () => {
    const { member, dek } = await enrolTestMember(h);
    const brokerId = allowlistedDefinition().id;

    // 1. Scan: finds the member and rejects the two same-name decoys.
    const scan = await runScan(h.ctx, { memberId: member.id, dek, brokerId });
    expect(scan.candidates).toBe(2);
    expect(scan.discarded).toBe(1);
    expect(scan.queuedForReview).toBe(1);

    // 2. The member confirms. Nothing has been sent yet.
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    expect(review?.score).toBeGreaterThan(0.9);
    expect(state.submissions).toHaveLength(0);

    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(5_000);

    // 3. Submit: a real HTTP form post to the mock broker.
    const submitted = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    expect(submitted).toEqual({ kind: 'submitted', awaitingVerification: true });
    expect(state.submissions).toEqual([{ personId: 'ada-94704', email: 'ada@member.test' }]);

    // The broker still lists them: a submission is not a removal.
    expect(state.removed.has('ada-94704')).toBe(false);

    // 4. The broker's confirmation email arrives at the per-job address.
    const token = await h.ctx.ports.db.get<{ token: string }>(
      'SELECT token FROM verification_token WHERE case_id = ?',
      [review!.caseId],
    );
    const raw = confirmationEmail({
      to: h.inbound.addressFor(token!.token),
      personId: 'ada-94704',
      origin: PUBLIC_ORIGIN,
    });
    const verified = await handleInboundMessage(h.ctx, parseEmail(raw, h.clock.now()));

    expect(verified).toEqual({ kind: 'verified' });
    expect(state.removed.has('ada-94704')).toBe(true);

    // 5. The re-check is what actually proves the removal.
    h.clock.advanceDays(10);
    const rechecked = await runRecheck(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    expect(rechecked).toEqual({ kind: 'removed' });

    const closed = await h.store.getCase(member.id, review!.caseId);
    expect(closed?.state).toBe('removed');
    expect(closed?.outcome).toBe('removed');

    // 6. The report reflects it, with evidence behind the claim.
    const { summary } = await generateReport(h.ctx, { memberId: member.id, dek });
    expect(summary.totals.removed).toBe(1);
    expect((await h.store.listEvidence(member.id, review!.caseId)).length).toBeGreaterThan(0);
  });

  it('catches a re-list on a later cycle and reopens the case', async () => {
    const { member, dek } = await enrolTestMember(h);
    const brokerId = allowlistedDefinition().id;

    await runScan(h.ctx, { memberId: member.id, dek, brokerId });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(5_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    const token = await h.ctx.ports.db.get<{ token: string }>(
      'SELECT token FROM verification_token WHERE case_id = ?',
      [review!.caseId],
    );
    await handleInboundMessage(
      h.ctx,
      parseEmail(confirmationEmail({ to: h.inbound.addressFor(token!.token), personId: 'ada-94704', origin: PUBLIC_ORIGIN }), h.clock.now()),
    );

    h.clock.advanceDays(10);
    expect(await runRecheck(h.ctx, { memberId: member.id, dek, caseId: review!.caseId })).toEqual({ kind: 'removed' });

    // The broker puts the record back, as brokers do.
    state.removed.delete('ada-94704');
    h.clock.advanceDays(95);

    const result = await runRecheck(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    expect(result).toEqual({ kind: 'still_listed', reopened: true });
    expect((await h.store.getCase(member.id, review!.caseId))?.state).toBe('queued');
  });

  it('reports a broken definition instead of a broker refusal when the page changes', async () => {
    const { member, dek } = await enrolTestMember(h);
    const brokerId = allowlistedDefinition().id;

    await runScan(h.ctx, { memberId: member.id, dek, brokerId });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });

    state.redesigned = true;
    h.clock.advance(5_000);

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(result).toEqual({ kind: 'blocked', reason: 'broker_broken' });
    expect(state.submissions).toHaveLength(0);
    expect((await h.store.getCase(member.id, review!.caseId))?.outcome).toBeNull();
    expect((await h.store.listOperatorTaskSummaries('open')).some((t) => t.kind === 'broker_broken')).toBe(true);
  });

  it('never contacts the broker for a listing the member rejected', async () => {
    const { member, dek } = await enrolTestMember(h);
    const brokerId = allowlistedDefinition().id;

    await runScan(h.ctx, { memberId: member.id, dek, brokerId });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: false });
    h.clock.advance(5_000);

    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(state.submissions).toHaveLength(0);
    expect(state.removed.size).toBe(0);
  });
});
