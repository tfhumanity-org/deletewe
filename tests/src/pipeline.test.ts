import { afterEach, describe, expect, it } from 'vitest';
import {
  decideListing,
  deleteAccount,
  enqueueFullScan,
  exportMemberData,
  generateReport,
  handleInboundMessage,
  pendingReviews,
  revokeAuthority,
  runRecheck,
  runScan,
  runSubmit,
  tick,
} from '@deletewe/engine';
import { createHarness, enrolTestMember, type Harness } from './harness.ts';
import {
  CONFIRM_URL,
  captchaBroker,
  emailBroker,
  formBroker,
  letterBroker,
  OPTOUT_FORM_CHANGED,
  routes,
  searchPage,
} from './fixtures.ts';

const ALL = [formBroker, captchaBroker, emailBroker, letterBroker];

let h: Harness;
afterEach(() => { h?.dispose(); });

async function setup(overrides: Partial<Record<string, string>> = {}) {
  h = await createHarness({ definitions: ALL, routes: routes(overrides) });
  const { member, dek } = await enrolTestMember(h);
  return { member, dek };
}

describe('scan and match', () => {
  it('finds the member and ignores same-name strangers', async () => {
    const { member, dek } = await setup();
    const outcome = await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    expect(outcome.candidates).toBe(3);
    expect(outcome.autoConfirmed + outcome.queuedForReview).toBe(1);
    expect(outcome.discarded).toBe(2);
  });

  // Default behaviour: a human confirms before anything is sent.
  it('queues the match for the member rather than auto-confirming', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const reviews = await pendingReviews(h.ctx, { memberId: member.id, dek });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.score).toBeGreaterThan(0.9);
  });

  it('explains the match field by field', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    expect(review?.comparisons.map((c) => c.field).sort()).toEqual(['age', 'locality', 'name', 'region']);
  });

  it('does not persist listings it judged are not the member', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const listings = await h.store.listListings(member.id, dek);
    expect(listings).toHaveLength(1);
    expect(JSON.stringify(listings)).not.toContain('Hannah');
    expect(JSON.stringify(listings)).not.toContain('Tulsa');
  });

  it('is idempotent across repeated scans', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    h.clock.advanceDays(1);
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const listings = await h.store.listListings(member.id, dek);
    expect(listings).toHaveLength(1);
    expect(listings[0]?.reviewCount).toBe(2);
  });

  it('refuses to scan without consent to process personal data', async () => {
    const { member, dek } = await setup();
    await h.store.revokeConsent(member.id, 'process_pii');
    await expect(runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' })).rejects.toThrow(/consent/i);
  });

  it('respects the per-broker rate limit', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const second = await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    expect(second.skipped).toBe('rate_limited');
  });
});

describe('the consent gate', () => {
  it('will not submit a listing the member has not confirmed', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    expect(result).toEqual({ kind: 'blocked', reason: 'match_not_confirmed' });
    expect(h.browser.submissions).toHaveLength(0);
  });

  it('will not submit once the mandate is revoked', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);

    await revokeAuthority(h.ctx, member.id);

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    expect(result.kind).toBe('blocked');
    expect(h.browser.submissions).toHaveLength(0);
  });

  it('closes the case and sends nothing when the member says "not me"', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });

    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: false });

    const caseFile = await h.store.getCase(member.id, review!.caseId);
    expect(caseFile?.state).toBe('rejected');
    expect(h.browser.submissions).toHaveLength(0);
  });
});

describe('submit', () => {
  async function confirmFirst(brokerId = 'broker-test') {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    return { member, dek, caseId: review!.caseId, listingId: review!.listing.id };
  }

  it('completes a form flow and sends only the declared fields', async () => {
    const { member, dek, caseId } = await confirmFirst();
    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId });

    expect(result).toEqual({ kind: 'submitted', awaitingVerification: true });
    expect(h.browser.submissions).toHaveLength(1);

    const sent = h.browser.submissions[0]!.fields;
    expect(sent['email']).toBe('ada@member.test');
    expect(sent['url']).toContain('/p/ada-lovelace-94704');
    // Minimum necessary disclosure: nothing beyond required_fields went out.
    const payload = JSON.stringify(sent);
    expect(payload).not.toContain('1979');
    expect(payload).not.toContain('510');
    expect(payload).not.toContain('St James');
  });

  it('preserves the form’s hidden fields', async () => {
    const { member, dek, caseId } = await confirmFirst();
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId });
    expect(h.browser.submissions[0]!.fields['csrf']).toBe('fixture-csrf');
  });

  it('captures evidence for the submission', async () => {
    const { member, dek, caseId } = await confirmFirst();
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId });

    const evidence = await h.store.listEvidence(member.id, caseId);
    expect(evidence.map((e) => e.kind).sort()).toEqual(['dom', 'screenshot', 'transcript']);
    for (const record of evidence) expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hands a CAPTCHA to the member instead of solving it', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'captcha-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(result.kind).toBe('handed_off');
    expect(h.browser.submissions).toHaveLength(0);

    const tasks = await h.store.listTasks(member.id, dek, 'member', 'open');
    const captcha = tasks.find((t) => t.kind === 'captcha');
    expect(captcha).toBeDefined();
    expect(captcha?.prefill?.['email']).toBe('ada@member.test');
    expect((await h.store.getCase(member.id, review!.caseId))?.state).toBe('task_pending');
  });

  it('sends a templated email for an email-method broker', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'email-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(h.mailer.sent).toHaveLength(1);
    const sent = h.mailer.sent[0]!;
    expect(sent.to).toBe('privacy@broker.test');
    expect(sent.subject).toBe('Deletion request for Ada Byron Lovelace');
    expect(sent.text).toContain('12 St James Square');
    // A per-job reply address, so a reply routes back to exactly this case.
    expect(sent.replyTo).toMatch(/^optout\+[a-z0-9]+@agent\.test$/);
  });

  it('produces a printable letter when no postal provider is configured', async () => {
    const { member, dek } = await setup();
    const caseId = await h.store.openCase({
      memberId: member.id, brokerId: 'letter-test',
      listingId: (await h.store.upsertListing({
        memberId: member.id, dek, brokerId: 'letter-test', url: 'https://broker.test/p/x',
        externalKey: null, snapshot: { name: 'Ada Lovelace' },
        dedupHash: await h.store.dedupHash('letter-test', 'x'),
      })).id,
      state: 'queued',
    });
    const caseFile = await h.store.getCase(member.id, caseId);
    await h.store.recordMatch({
      memberId: member.id, dek, listingId: caseFile!.listingId,
      result: { score: 1, comparisons: [], matcherVersion: '1.0.0', requiresManualConfirmation: false },
      decision: 'confirmed', decidedBy: 'member',
    });

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId });
    expect(result.kind).toBe('handed_off');

    const evidence = await h.store.listEvidence(member.id, caseId);
    const letter = evidence.find((e) => e.kind === 'letter_pdf');
    expect(letter).toBeDefined();
    const bytes = await h.blobs.get(letter!.blobKey);
    const pdf = await h.store.decryptBlob(dek, member.id, bytes!);
    expect(Buffer.from(pdf).toString('latin1')).toContain('%PDF-1.4');
  });
});

describe('broker health', () => {
  it('blames the definition, not the broker, when a selector disappears', async () => {
    const { member, dek } = await setup({ optout: OPTOUT_FORM_CHANGED });
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(result).toEqual({ kind: 'blocked', reason: 'broker_broken' });
    const operatorTasks = await h.store.listOperatorTaskSummaries('open');
    expect(operatorTasks.some((t) => t.kind === 'broker_broken')).toBe(true);
    // Crucially, the case is not recorded as a refusal by the broker.
    expect((await h.store.getCase(member.id, review!.caseId))?.outcome).toBeNull();
  });

  it('marks a broker broken after repeated expectation failures and pauses it', async () => {
    const { member, dek } = await setup({ optout: OPTOUT_FORM_CHANGED });
    for (let i = 0; i < 4; i++) {
      await h.store.recordHealth({ brokerId: 'broker-test', ok: false, failureKind: 'selector_missing', definitionSha256: 'sha' });
    }
    const { reevaluate } = await import('@deletewe/engine');
    expect(await reevaluate(h.ctx, 'broker-test')).toBe('broken');

    const outcome = await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    expect(outcome.skipped).toBe('broker_unavailable');
  });
});

describe('verification by inbound email', () => {
  async function submitted() {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    const token = await h.ctx.ports.db.get<{ token: string }>(
      'SELECT token FROM verification_token WHERE case_id = ?', [review!.caseId],
    );
    return { member, dek, caseId: review!.caseId, address: h.inbound.addressFor(token!.token) };
  }

  const message = (to: string, overrides: Partial<{ from: string; text: string; auth: string }> = {}) =>
    [
      `From: ${overrides.from ?? 'no-reply@broker.test'}`,
      `To: ${to}`,
      'Subject: Confirm your removal request',
      `Authentication-Results: mx.agent.test; spf=${overrides.auth ?? 'pass'}; dkim=pass`,
      '',
      overrides.text ?? `Click to confirm: ${CONFIRM_URL}`,
    ].join('\n');

  it('follows a genuine confirmation link and advances the case', async () => {
    const { member, dek, caseId, address } = await submitted();
    const { parseEmail } = await import('@deletewe/adapters-node');

    const result = await handleInboundMessage(h.ctx, parseEmail(message(address), h.clock.now()));

    expect(result).toEqual({ kind: 'verified' });
    expect((await h.store.getCase(member.id, caseId))?.state).toBe('acknowledged');
    expect(h.browser.visited).toContain(CONFIRM_URL);
    expect((await h.store.listEvidence(member.id, caseId)).some((e) => e.kind === 'email')).toBe(true);
    expect(dek).toBeDefined();
  });

  it('ignores a message from an unexpected sender', async () => {
    const { address } = await submitted();
    const { parseEmail } = await import('@deletewe/adapters-node');
    const result = await handleInboundMessage(
      h.ctx, parseEmail(message(address, { from: 'attacker@evil.test' }), h.clock.now()),
    );
    expect(result).toEqual({ kind: 'ignored', reason: 'sender_not_expected' });
  });

  it('ignores a message that failed sender authentication', async () => {
    const { address } = await submitted();
    const { parseEmail } = await import('@deletewe/adapters-node');
    const result = await handleInboundMessage(
      h.ctx, parseEmail(message(address, { auth: 'fail' }), h.clock.now()),
    );
    expect(result).toEqual({ kind: 'ignored', reason: 'sender_unauthenticated' });
  });

  // An attacker-controlled link in an otherwise genuine email must not be followed.
  it('refuses a link that resolves off the broker’s host allowlist', async () => {
    const { address } = await submitted();
    const { parseEmail } = await import('@deletewe/adapters-node');
    const result = await handleInboundMessage(
      h.ctx,
      parseEmail(message(address, { text: 'Confirm: https://attacker.example/confirm/abc123' }), h.clock.now()),
    );
    expect(result.kind).toBe('needs_review');
    expect(h.browser.visited).not.toContain('https://attacker.example/confirm/abc123');
  });

  it('ignores mail addressed to an unknown token', async () => {
    await submitted();
    const { parseEmail } = await import('@deletewe/adapters-node');
    const result = await handleInboundMessage(
      h.ctx, parseEmail(message('optout+nosuchtoken@agent.test'), h.clock.now()),
    );
    expect(result).toEqual({ kind: 'ignored', reason: 'unknown_token' });
  });

  it('refuses a token whose window has closed', async () => {
    const { address } = await submitted();
    h.clock.advance(25 * 3600_000);
    const { parseEmail } = await import('@deletewe/adapters-node');
    const result = await handleInboundMessage(h.ctx, parseEmail(message(address), h.clock.now()));
    expect(result).toEqual({ kind: 'needs_review', reason: 'verification_expired' });
  });

  it('will not replay a token that has already been used', async () => {
    const { address } = await submitted();
    const { parseEmail } = await import('@deletewe/adapters-node');
    await handleInboundMessage(h.ctx, parseEmail(message(address), h.clock.now()));
    const second = await handleInboundMessage(h.ctx, parseEmail(message(address), h.clock.now()));
    expect(second).toEqual({ kind: 'ignored', reason: 'already_consumed' });
  });
});

describe('re-check', () => {
  async function acknowledged() {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    return { member, dek, caseId: review!.caseId };
  }

  // Removal is proved by a later scan finding nothing, never by a success page.
  it('records a removal only once a later scan no longer finds the listing', async () => {
    const { member, dek, caseId } = await acknowledged();
    expect((await h.store.getCase(member.id, caseId))?.state).toBe('awaiting_verification');

    h.browser.setRoutes(routes({ search: searchPage({ includeMember: false }) }));
    h.clock.advanceDays(10);

    const result = await runRecheck(h.ctx, { memberId: member.id, dek, caseId });

    expect(result).toEqual({ kind: 'removed' });
    const closed = await h.store.getCase(member.id, caseId);
    expect(closed?.state).toBe('removed');
    expect(closed?.outcome).toBe('removed');
    expect(closed?.nextCheckAt).toBeGreaterThan(h.clock.now());
  });

  it('treats a listing that comes back as a re-list and reopens the case', async () => {
    const { member, dek, caseId } = await acknowledged();
    h.browser.setRoutes(routes({ search: searchPage({ includeMember: false }) }));
    h.clock.advanceDays(10);
    await runRecheck(h.ctx, { memberId: member.id, dek, caseId });

    h.browser.setRoutes(routes());
    h.clock.advanceDays(95);
    const result = await runRecheck(h.ctx, { memberId: member.id, dek, caseId });

    expect(result).toEqual({ kind: 'still_listed', reopened: true });
    expect((await h.store.getCase(member.id, caseId))?.state).toBe('queued');
  });

  it('reopens the case when the listing is still there', async () => {
    const { member, dek, caseId } = await acknowledged();
    h.clock.advanceDays(10);

    const result = await runRecheck(h.ctx, { memberId: member.id, dek, caseId });

    expect(result.kind).toBe('still_listed');
    expect((await h.store.getCase(member.id, caseId))?.state).toBe('queued');
  });

  // A broker that keeps ignoring us is a human problem, not a retry loop.
  it('escalates to an operator after repeated opt-out attempts fail', async () => {
    const { member, dek, caseId } = await acknowledged();

    for (let round = 0; round < 4; round++) {
      h.clock.advanceDays(10);
      const result = await runRecheck(h.ctx, { memberId: member.id, dek, caseId });
      if (!result || result.kind !== 'still_listed' || !result.reopened) break;
      h.clock.advance(10_000);
      await runSubmit(h.ctx, { memberId: member.id, dek, caseId });
    }

    expect((await h.store.getCase(member.id, caseId))?.state).toBe('needs_review');
    const tasks = await h.store.listOperatorTaskSummaries('open');
    expect(tasks.some((t) => t.kind === 'broker_broken')).toBe(true);
  });
});

describe('scheduling', () => {
  it('enqueues a scan per searchable broker, once per cycle', async () => {
    const { member } = await setup();
    const first = await enqueueFullScan(h.ctx, member.id);
    const second = await enqueueFullScan(h.ctx, member.id);

    // letter-test declares `search: none`, so there is nothing to scan there.
    const searchable = ALL.filter((d) => d.search.method !== 'none');
    expect(first).toBe(searchable.length);
    expect(second).toBe(0);
  });

  it('wakes a case whose re-check timer has elapsed', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect((await tick(h.ctx)).rechecks).toBe(0);
    h.clock.advanceDays(8);
    expect((await tick(h.ctx)).rechecks).toBe(1);
  });
});

describe('reporting', () => {
  it('leads with outcomes and states the honest caveat', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const { summary } = await generateReport(h.ctx, { memberId: member.id, dek });

    expect(summary.totals.found).toBe(1);
    expect(summary.totals.awaitingYou).toBe(1);
    expect(summary.totals.removed).toBe(0);
    expect(summary.caveat).toMatch(/70-80%/);
  });
});

describe('export and deletion', () => {
  it('exports everything the instance holds', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const bundle = await exportMemberData(h.ctx, { memberId: member.id, dek });

    expect(bundle.format).toBe('deletewe-export/1');
    expect(JSON.stringify(bundle.profile)).toContain('St James Square');
    expect(bundle.listings).toHaveLength(1);
  });

  it('shreds the key, deletes the rows, and removes the evidence blobs', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(await h.blobs.list(`evidence/${member.id}/`)).not.toHaveLength(0);

    await deleteAccount(h.ctx, { memberId: member.id });

    expect(await h.store.getMemberRow(member.id)).toBeUndefined();
    expect(await h.store.listCases(member.id)).toHaveLength(0);
    expect(await h.blobs.list(`evidence/${member.id}/`)).toHaveLength(0);
    const tombstone = await h.ctx.ports.db.get('SELECT * FROM deleted_member WHERE member_id = ?', [member.id]);
    expect(tombstone).toBeDefined();
  });
});

describe('logging', () => {
  it('never writes member personal data to the log sink', async () => {
    const { member, dek } = await setup();
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
    h.clock.advance(10_000);
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
    await generateReport(h.ctx, { memberId: member.id, dek });

    const logged = h.logs.text();
    expect(logged.length).toBeGreaterThan(0);
    for (const secret of ['Ada', 'Lovelace', 'St James Square', 'Berkeley', '94704', '1979-12-10', 'ada@member.test', '555 0101']) {
      expect(logged).not.toContain(secret);
    }
  });
});
