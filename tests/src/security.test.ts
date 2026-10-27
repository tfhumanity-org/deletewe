import { afterEach, describe, expect, it } from 'vitest';
import { checkDefinition } from '@deletewe/schema';
import { decideListing, pendingReviews, runScan, runSubmit } from '@deletewe/engine';
import { FetchBrowserDriver } from '@deletewe/browser';
import { createHarness, enrolTestMember, type Harness } from './harness.ts';
import { formBroker, HOSTILE_DEFINITION, OPTOUT_URL, routes } from './fixtures.ts';

let h: Harness;
afterEach(() => { h?.dispose(); });

describe('supply-chain containment', () => {
  // The primary defence: a hostile definition never reaches the dispatcher,
  // because the validator refuses to load it. docs/threat-model.md TB8.
  it('rejects a definition that reaches a host it did not declare', () => {
    const result = checkDefinition(HOSTILE_DEFINITION, 'hostile-test');
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('host_not_allowlisted');
  });

  it('rejects a definition that adds an unknown top-level key', () => {
    expect(checkDefinition({ ...HOSTILE_DEFINITION, webhook: 'https://attacker.example' }, 'hostile-test').ok).toBe(false);
  });

  it('rejects an unknown step action', () => {
    const d = structuredClone(HOSTILE_DEFINITION) as Record<string, unknown>;
    (d['opt_out'] as Record<string, unknown>)['steps'] = [{ id: 'x', action: 'upload', path: '/etc/passwd' }];
    expect(checkDefinition(d, 'hostile-test').ok).toBe(false);
  });

  // Defence in depth: even if a definition somehow got through, the driver
  // refuses the navigation at runtime.
  it('blocks an off-allowlist navigation at the driver', async () => {
    const driver = new FetchBrowserDriver(async () => new Response('should never be fetched'));
    await expect(
      driver.open('https://attacker.example/collect', {
        allowedHosts: ['broker.test'],
        userAgent: 'test',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/allowlist/);
  });

  it('allows a subdomain of an allowlisted host', async () => {
    const driver = new FetchBrowserDriver(
      async () => new Response('<html><body>ok</body></html>', { headers: { 'content-type': 'text/html' } }),
    );
    const page = await driver.open('https://privacy.broker.test/optout', {
      allowedHosts: ['broker.test'],
      userAgent: 'test',
      timeoutMs: 1000,
    });
    expect(await page.text()).toContain('ok');
  });

  // Redirects are followed by hand so each hop is checked before it is
  // requested. Following them automatically would mean the internal host had
  // already been contacted by the time we noticed.
  it('refuses a redirect to an off-allowlist host without requesting it', async () => {
    const requested: string[] = [];
    const driver = new FetchBrowserDriver(async (input) => {
      requested.push(String(input));
      return new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } });
    });

    await expect(
      driver.open('https://broker.test/optout', { allowedHosts: ['broker.test'], userAgent: 'test', timeoutMs: 1000 }),
    ).rejects.toThrow(/allowlist/);

    expect(requested).toEqual(['https://broker.test/optout']);
  });

  // Same hostname, so a host check alone would wave this through — and the
  // submission carries the member's name, email and listing URL.
  it('refuses a redirect that downgrades to plain http', async () => {
    const driver = new FetchBrowserDriver(
      async () => new Response(null, { status: 302, headers: { location: 'http://broker.test/optout' } }),
    );

    await expect(
      driver.open('https://broker.test/optout', { allowedHosts: ['broker.test'], userAgent: 'test', timeoutMs: 1000 }),
    ).rejects.toThrow(/non-https/);
  });

  it('follows a redirect that stays on the allowlist', async () => {
    let hop = 0;
    const driver = new FetchBrowserDriver(async () => {
      hop++;
      return hop === 1
        ? new Response(null, { status: 302, headers: { location: 'https://privacy.broker.test/optout' } })
        : new Response('<html><body>arrived</body></html>');
    });

    const page = await driver.open('https://broker.test/optout', {
      allowedHosts: ['broker.test'],
      userAgent: 'test',
      timeoutMs: 1000,
    });

    expect(await page.text()).toContain('arrived');
    expect(page.url()).toBe('https://privacy.broker.test/optout');
  });

  it('gives up rather than following a redirect loop', async () => {
    const driver = new FetchBrowserDriver(
      async () => new Response(null, { status: 302, headers: { location: 'https://broker.test/loop' } }),
    );

    await expect(
      driver.open('https://broker.test/loop', { allowedHosts: ['broker.test'], userAgent: 'test', timeoutMs: 1000 }),
    ).rejects.toThrow(/too many redirects/);
  });
});

describe('one subject only', () => {
  // The structural property that separates a removal agent from a
  // people-search engine. docs/threat-model.md section 5.1.
  it('derives the scan subject from stored profile data, never from input', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const { member, dek } = await enrolTestMember(h);

    // There is no parameter through which another person could be named.
    const params = { memberId: member.id, dek, brokerId: 'broker-test' };
    expect(Object.keys(params).sort()).toEqual(['brokerId', 'dek', 'memberId']);

    await runScan(h.ctx, params);
    const listings = await h.store.listListings(member.id, dek);
    expect(listings.every((l) => l.memberId === member.id)).toBe(true);
  });

  it('keeps every member’s listings invisible to another member', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const a = await enrolTestMember(h, { email: 'a@member.test' });
    const b = await enrolTestMember(h, { email: 'b@member.test' });

    await runScan(h.ctx, { memberId: a.member.id, dek: a.dek, brokerId: 'broker-test' });

    expect(await h.store.listListings(a.member.id, a.dek)).toHaveLength(1);
    expect(await h.store.listListings(b.member.id, b.dek)).toHaveLength(0);
  });

  it('refuses to decrypt one member’s listing with another member’s key', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const a = await enrolTestMember(h, { email: 'a@member.test' });
    const b = await enrolTestMember(h, { email: 'b@member.test' });

    await runScan(h.ctx, { memberId: a.member.id, dek: a.dek, brokerId: 'broker-test' });
    const [listing] = await h.store.listListings(a.member.id, a.dek);

    // Even with the row id and another live key, the AAD binding refuses.
    await expect(h.store.getListing(a.member.id, b.dek, listing!.id)).rejects.toThrow();
  });
});

describe('minimum necessary disclosure', () => {
  it('sends a broker only the fields its definition declares', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const { member, dek } = await enrolTestMember(h);

    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    const fields = h.browser.submissions[0]!.fields;
    expect(Object.keys(fields).sort()).toEqual(['csrf', 'email', 'url']);
  });
});

describe('politeness', () => {
  it('identifies the project honestly in the user agent', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    expect(h.ctx.config.userAgent).toContain('deletewe');
    expect(h.ctx.config.userAgent).toContain('github.com/tfhumanity-org/deletewe');
    // Not pretending to be a browser we are not.
    expect(h.ctx.config.userAgent).not.toMatch(/Mozilla|Chrome|Safari/);
    expect(OPTOUT_URL).toBeTruthy();
  });
});
