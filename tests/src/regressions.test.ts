import { afterEach, describe, expect, it } from 'vitest';
import {
  decideListing,
  fromHex,
  pendingReviews,
  runRecheck,
  runJob,
  runScan,
  runSubmit,
  tick,
} from '@deletewe/engine';
import { parseEmail, PlusAddressInbound } from '@deletewe/adapters-node';
import { createHarness, enrolTestMember, type Harness } from './harness.ts';
import { emailBroker, formBroker, routes } from './fixtures.ts';

/**
 * Regressions found by code review after the first build. Each test failed
 * before its fix; together they cover the ways the recurring loop, the
 * politeness contract, and the inbound-mail checks could silently stop working.
 */

let h: Harness;
afterEach(() => { h?.dispose(); });

async function submitted() {
  h = await createHarness({ definitions: [formBroker, emailBroker], routes: routes() });
  const { member, dek } = await enrolTestMember(h);
  await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });
  const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
  await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });
  h.clock.advance(10_000);
  await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });
  return { member, dek, caseId: review!.caseId };
}

describe('the re-check timer', () => {
  // The loop the product exists for. If a case loses its timer it is never
  // looked at again, and nothing surfaces that it stopped.
  it('survives a re-check that could not run', async () => {
    const { member, dek, caseId } = await submitted();

    h.clock.advanceDays(8);
    expect((await tick(h.ctx)).rechecks).toBe(1);

    // The broker was marked broken between the timer being set and the
    // re-check running, so the scan inside it refuses to go out.
    await h.store.setBrokerStatus('broker-test', 'broken');
    const result = await runRecheck(h.ctx, { memberId: member.id, dek, caseId });
    expect(result.kind).toBe('skipped');

    const caseFile = await h.store.getCase(member.id, caseId);
    expect(caseFile?.nextCheckAt).not.toBeNull();
  });

  it('comes round again on a later tick after a skipped re-check', async () => {
    const { member, dek, caseId } = await submitted();

    h.clock.advanceDays(8);
    await tick(h.ctx);
    await h.store.setBrokerStatus('broker-test', 'broken');
    await runRecheck(h.ctx, { memberId: member.id, dek, caseId });

    await h.store.setBrokerStatus('broker-test', 'healthy');
    h.clock.advanceDays(8);
    expect((await tick(h.ctx)).rechecks).toBe(1);
  });
});

describe('job dispatch', () => {
  // Cloudflare Queues do not deduplicate, so a job delivered twice must be
  // refused by the engine. Otherwise two workers run the same submit and the
  // broker receives the opt-out twice — the one irreversible action here.
  it('refuses a second delivery of a job that is already running', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const { member } = await enrolTestMember(h);

    const { id } = await h.store.createJob({
      memberId: member.id,
      caseId: null,
      kind: 'scan',
      idempotencyKey: 'scan:test:1',
    });
    await h.store.markJobRunning(id);

    await runJob(h.ctx, { jobId: id, kind: 'scan', memberId: member.id });

    // Still running, untouched: the duplicate delivery did no work.
    const job = await h.store.getJob(id);
    expect(job?.state).toBe('running');
    expect(job?.attempt).toBe(1);
  });

  it('reclaims a job whose lease has expired', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const { member } = await enrolTestMember(h);

    const { id } = await h.store.createJob({
      memberId: member.id,
      caseId: 'broker-test',
      kind: 'scan',
      idempotencyKey: 'scan:stale:1',
    });
    await h.store.markJobRunning(id);
    h.clock.advance(2 * 60 * 60 * 1000);

    await runJob(h.ctx, { jobId: id, kind: 'scan', memberId: member.id });

    expect((await h.store.getJob(id))?.attempt).toBe(2);
  });

  // The cron sweep is a safety net for queue messages that never arrived,
  // not the primary dispatch path.
  it('rescues a pending job the queue evidently lost', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    const { member } = await enrolTestMember(h);

    await h.store.createJob({ memberId: member.id, caseId: null, kind: 'scan', idempotencyKey: 'scan:orphan:1' });
    expect((await tick(h.ctx)).jobs).toBe(0);

    h.clock.advance(20 * 60 * 1000);
    expect((await tick(h.ctx)).jobs).toBe(1);
  });
});

describe('per-broker politeness', () => {
  // The definitions declare a rate limit. It has to mean something for every
  // method, not just the one that happens to go through a browser.
  it('applies to the email method too', async () => {
    h = await createHarness({ definitions: [emailBroker], routes: routes() });
    const { member, dek } = await enrolTestMember(h);

    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'email-test' });
    const [review] = await pendingReviews(h.ctx, { memberId: member.id, dek });
    await decideListing(h.ctx, { memberId: member.id, dek, listingId: review!.listing.id, confirm: true });

    // No clock advance: the scan just consumed this broker's budget.
    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId: review!.caseId });

    expect(result).toEqual({ kind: 'blocked', reason: 'rate_limited' });
    expect(h.mailer.sent).toHaveLength(0);
  });
});

describe('broker status after a definition is repaired', () => {
  it('resets a broken broker to healthy when its definition changes', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });

    await h.store.setBrokerStatus('broker-test', 'broken');
    expect((await h.store.getBroker('broker-test'))?.status).toBe('broken');

    // What syncCatalog does on boot after someone fixes the YAML.
    await h.store.upsertBroker({
      id: formBroker.id,
      name: formBroker.name,
      homepage: formBroker.homepage,
      category: formBroker.category,
      definitionVersion: '1.0.1',
      definitionSha256: 'sha-repaired',
      automationLevel: formBroker.automation.level,
      optOutMethod: formBroker.opt_out.method,
      relistIntervalDays: formBroker.relist.interval_days,
      jurisdictions: formBroker.jurisdictions,
      enabled: true,
      verifiedAt: null,
    });

    expect((await h.store.getBroker('broker-test'))?.status).toBe('healthy');
  });

  it('leaves a healthy broker alone', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });
    await h.store.setBrokerStatus('broker-test', 'degraded');

    await h.store.upsertBroker({
      id: formBroker.id,
      name: formBroker.name,
      homepage: formBroker.homepage,
      category: formBroker.category,
      definitionVersion: '1.0.0',
      definitionSha256: 'sha-broker-test',
      automationLevel: formBroker.automation.level,
      optOutMethod: formBroker.opt_out.method,
      relistIntervalDays: formBroker.relist.interval_days,
      jurisdictions: formBroker.jurisdictions,
      enabled: true,
      verifiedAt: null,
    });

    expect((await h.store.getBroker('broker-test'))?.status).toBe('degraded');
  });
});

describe('inbound address parsing', () => {
  const inbound = new PlusAddressInbound('optout', 'agent.test');

  it('reads the token from a bare address', () => {
    expect(inbound.tokenFrom('optout+abc123@agent.test')).toBe('abc123');
  });

  // Mail clients and relays routinely write the recipient with a display name.
  it('reads the token from an address with a display name', () => {
    expect(inbound.tokenFrom('deletewe <optout+abc123@agent.test>')).toBe('abc123');
    expect(inbound.tokenFrom('"Privacy, Agent" <optout+abc123@agent.test>')).toBe('abc123');
  });

  it('ignores a foreign address', () => {
    expect(inbound.tokenFrom('someone@elsewhere.test')).toBeUndefined();
    expect(inbound.tokenFrom('other+abc123@agent.test')).toBeUndefined();
  });
});

describe('inbound message parsing', () => {
  // The platform's verdict is prepended. A sender who adds their own later in
  // the block must not be able to overwrite it.
  it('keeps the first Authentication-Results header, not the last', () => {
    const raw = [
      'Authentication-Results: mx.agent.test; spf=fail; dkim=fail',
      'From: attacker@evil.test',
      'To: optout+abc123@agent.test',
      'Subject: Confirm',
      'Authentication-Results: mx.agent.test; spf=pass; dkim=pass',
      '',
      'body',
    ].join('\n');

    expect(parseEmail(raw, 0).authenticated).toBe(false);
  });

  it('reports an unauthenticated verdict as false', () => {
    const raw = ['Authentication-Results: mx; spf=softfail', 'To: a@b.test', '', 'x'].join('\n');
    expect(parseEmail(raw, 0).authenticated).toBe(false);
  });

  it('leaves the verdict undefined when the platform did not supply one', () => {
    expect(parseEmail(['To: a@b.test', '', 'x'].join('\n'), 0).authenticated).toBeUndefined();
  });
});

describe('fromHex', () => {
  // A non-hex secret used to yield an all-zero key that passed every length
  // check, so the service would boot and silently encrypt nothing.
  it('rejects a non-hexadecimal string', () => {
    expect(() => fromHex('z'.repeat(64))).toThrow(/hex/i);
    expect(() => fromHex('not-a-key-but-exactly-sixty-four-characters-long-xxxxxxxxxxxxxxxx')).toThrow(/hex/i);
  });

  it('rejects an odd-length string', () => {
    expect(() => fromHex('abc')).toThrow(/even/i);
  });

  it('decodes valid hex', () => {
    expect([...fromHex('00ff10')]).toEqual([0, 255, 16]);
  });
});

describe('session hygiene', () => {
  // Every visit to a login page writes a session row to carry its CSRF token,
  // so unauthenticated traffic alone used to grow the table without bound.
  it('sweeps expired sessions on the cron tick', async () => {
    h = await createHarness({ definitions: [formBroker], routes: routes() });

    await h.store.createSession({ ttlMs: 1000, csrfToken: 'a' });
    await h.store.createSession({ ttlMs: 1000, csrfToken: 'b' });
    const live = await h.store.createSession({ ttlMs: 86_400_000, csrfToken: 'c' });

    h.clock.advance(60_000);
    await tick(h.ctx);

    const remaining = await h.ctx.ports.db.all<{ id: string }>('SELECT id FROM session');
    expect(remaining.map((r) => r.id)).toEqual([live]);
  });
});
