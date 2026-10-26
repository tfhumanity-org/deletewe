import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixturesDir, loadCatalog } from '@deletewe/catalog';
import { decideListing, pendingReviews, runScan, runSubmit } from '@deletewe/engine';
import { createHarness, enrolTestMember, type Harness } from './harness.ts';

/**
 * Runs a real shipped broker definition through the real scan, match and
 * submit code paths against recorded fixture pages.
 *
 * This is what keeps live broker traffic out of CI while still exercising the
 * definition: the fixture driver serves recorded HTML, and everything above it
 * is production code. See docs/broker-catalog.md section 5.
 */

const { brokers } = await loadCatalog();
const spokeo = brokers.find((b) => b.definition.id === 'spokeo')?.definition;

const fixture = (broker: string, file: string) => readFileSync(join(fixturesDir(), broker, file), 'utf8');

let h: Harness;
afterEach(() => { h?.dispose(); });

describe('the spokeo definition against its fixtures', () => {
  it('is present in the catalogue', () => {
    expect(spokeo).toBeDefined();
  });

  async function setup(): Promise<{ memberId: string; dek: Uint8Array }> {
    h = await createHarness({
      definitions: [spokeo!],
      routes: [
        { url: 'https://www.spokeo.com/ada-lovelace', html: fixture('spokeo', 'search.html') },
        {
          url: 'https://www.spokeo.com/optout',
          html: fixture('spokeo', 'optout.html'),
          submitsTo: 'https://www.spokeo.com/optout',
        },
        { url: 'https://www.spokeo.com/ada-lovelace/*', html: '<html><body>listing</body></html>' },
        { url: 'https://www.spokeo.com/hannah-lindqvist/*', html: '<html><body>listing</body></html>' },
      ],
    });
    const { member, dek } = await enrolTestMember(h);
    return { memberId: member.id, dek };
  }

  it('extracts every result using the definition’s own selectors', async () => {
    const { memberId, dek } = await setup();
    const outcome = await runScan(h.ctx, { memberId, dek, brokerId: 'spokeo' });
    expect(outcome.candidates).toBe(3);
  });

  // The matcher's hardest job is refusing a stranger with the same name.
  it('matches the member and discards both decoys', async () => {
    const { memberId, dek } = await setup();
    const outcome = await runScan(h.ctx, { memberId, dek, brokerId: 'spokeo' });

    expect(outcome.discarded).toBe(2);
    expect(outcome.queuedForReview + outcome.autoConfirmed).toBe(1);

    const listings = await h.store.listListings(memberId, dek);
    expect(listings).toHaveLength(1);
    expect(listings[0]?.snapshot['locality']).toBe('Berkeley');
    expect(JSON.stringify(listings)).not.toContain('Miami');
    expect(JSON.stringify(listings)).not.toContain('Hannah');
  });

  it('resolves the listing URL against the broker’s own host', async () => {
    const { memberId, dek } = await setup();
    await runScan(h.ctx, { memberId, dek, brokerId: 'spokeo' });
    const [listing] = await h.store.listListings(memberId, dek);
    expect(listing?.url).toBe('https://www.spokeo.com/ada-lovelace/california/berkeley/a1b2c3');
  });

  // The definition declares `assisted` because of the CAPTCHA. That claim is
  // only true if the run actually stops there without submitting.
  it('stops at the CAPTCHA and sends nothing', async () => {
    const { memberId, dek } = await setup();
    await runScan(h.ctx, { memberId, dek, brokerId: 'spokeo' });
    const [review] = await pendingReviews(h.ctx, { memberId, dek });
    await decideListing(h.ctx, { memberId, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);

    const result = await runSubmit(h.ctx, { memberId, dek, caseId: review!.caseId });

    expect(result.kind).toBe('handed_off');
    expect(result.kind === 'handed_off' ? result.reason : '').toBe('captcha');
    expect(h.browser.submissions).toHaveLength(0);

    const tasks = await h.store.listTasks(memberId, dek, 'member', 'open');
    const captcha = tasks.find((t) => t.kind === 'captcha');
    expect(captcha?.prefill?.['listing_url']).toContain('spokeo.com');
    expect(captcha?.prefill?.['email']).toBe('ada@member.test');
  });

  it('hands the member only the fields the definition declares', async () => {
    const { memberId, dek } = await setup();
    await runScan(h.ctx, { memberId, dek, brokerId: 'spokeo' });
    const [review] = await pendingReviews(h.ctx, { memberId, dek });
    await decideListing(h.ctx, { memberId, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId, dek, caseId: review!.caseId });

    const [task] = await h.store.listTasks(memberId, dek, 'member', 'open');
    expect(Object.keys(task?.prefill ?? {}).sort()).toEqual(['email', 'listing_url']);
  });
});

describe('fixture hygiene', () => {
  it('keeps real-looking identities out of the committed fixtures', () => {
    // A blunt check, but it catches the obvious mistake: committing a
    // recording without redacting it. See packages/catalog/fixtures/README.md.
    const files = ['spokeo/search.html', 'spokeo/optout.html', 'mylife/verification-email.eml'];
    const banned = [/\b\d{3}-\d{2}-\d{4}\b/, /@gmail\.com/i, /@yahoo\.com/i, /@outlook\.com/i, /@hotmail\.com/i];

    for (const file of files) {
      const [broker, name] = file.split('/');
      const content = fixture(broker!, name!);
      for (const pattern of banned) {
        expect(`${file}:${String(pattern)}`).toBe(
          pattern.test(content) ? 'REAL DATA IN FIXTURE' : `${file}:${String(pattern)}`,
        );
      }
    }
  });
});
