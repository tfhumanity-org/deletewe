import { afterEach, describe, expect, it } from 'vitest';
import {
  cancelDropRequest,
  decideListing,
  dropInstructions,
  dropOverview,
  dropSteps,
  dropTimeline,
  DROP_BROKER_ACCESS_DAYS,
  DROP_CONSUMER_PORTAL,
  GuidedDropChannel,
  isDropEligible,
  normaliseDropReference,
  pendingReviews,
  recordDropSubmission,
  runScan,
  runSubmit,
} from '@deletewe/engine';
import { createHarness, definition, enrolTestMember, type Harness } from './harness.ts';

/**
 * California's DROP. The property under test throughout is that we never claim
 * to have submitted something only the member can submit, and that the
 * statutory clock we hold is the one the regulations actually set.
 */

let h: Harness;
afterEach(() => { h?.dispose(); });

const dropBroker = definition({
  id: 'california-drop',
  name: 'California DROP',
  homepage: 'https://privacy.ca.gov',
  version: '2.0.0',
  category: 'other',
  jurisdictions: ['US-CA'],
  hosts: ['privacy.ca.gov'],
  automation: { level: 'manual', reason: 'Consumers must submit through DROP themselves' },
  search: { method: 'none' },
  match: { fields: { name: 1 }, require_manual_confirmation: true },
  opt_out: {
    method: 'drop',
    url: 'https://privacy.ca.gov/drop/',
    required_fields: ['full_name', 'email', 'jurisdiction'],
    steps: [],
    instructions: 'Submit at the portal for {{full_name}} ({{email}}, {{jurisdiction}}).',
  },
  verification: { method: 'none' },
  relist: { interval_days: 45 },
});

async function setup(jurisdiction = 'US-CA') {
  h = await createHarness({ definitions: [dropBroker] });
  const { member, dek } = await enrolTestMember(h, { jurisdiction });
  return { member, dek };
}

describe('eligibility', () => {
  it('covers California residents only', () => {
    expect(isDropEligible('US-CA')).toBe(true);
    expect(isDropEligible('US-TX')).toBe(false);
    expect(isDropEligible('US')).toBe(false);
    expect(isDropEligible('GB')).toBe(false);
  });

  it('reports a non-Californian as ineligible without offering steps to take', async () => {
    const { member, dek } = await setup('US-TX');
    const view = await dropOverview(h.ctx, { memberId: member.id, dek });
    expect(view.eligible).toBe(false);
    expect(view.state).toBe('not_started');
  });
});

describe('the guided channel', () => {
  // The whole point: we do not pretend to submit something we cannot submit.
  it('never reports a submission it did not make', async () => {
    const channel = new GuidedDropChannel({ fullName: 'A Agent', email: 'a@agent.test' });
    const result = await channel.submit({
      memberId: 'm1',
      jurisdiction: 'US-CA',
      fullName: 'Ada Lovelace',
      email: 'ada@member.test',
    });
    expect(result.kind).toBe('member_action_required');
    expect(result.kind === 'member_action_required' ? result.steps.length : 0).toBeGreaterThan(3);
  });

  it('refuses a non-Californian rather than producing useless steps', async () => {
    const channel = new GuidedDropChannel(undefined);
    const result = await channel.submit({
      memberId: 'm1',
      jurisdiction: 'GB',
      fullName: 'Ada Lovelace',
      email: 'ada@member.test',
    });
    expect(result).toEqual({ kind: 'ineligible', reason: 'DROP covers California residents only' });
  });

  it('has no status API to poll, and says so by returning nothing', async () => {
    expect(await new GuidedDropChannel(undefined).pollStatus('ref')).toBeUndefined();
  });
});

describe('the member-facing steps', () => {
  // § 7621(b): the agent's details must be in the DROP account *before* the
  // request is submitted, so they have to appear before the submit step.
  it('puts the agent disclosure before submission', () => {
    const steps = dropSteps({ fullName: 'Privacy Agent', email: 'agent@agent.test', tradeName: 'deletewe' });
    const disclosure = steps.findIndex((s) => s.title.toLowerCase().startsWith('declare us'));
    const submit = steps.findIndex((s) => s.title.toLowerCase().startsWith('submit'));

    expect(disclosure).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(-1);
    expect(disclosure).toBeLessThan(submit);
    // Ordinals are what the member actually follows, so check those too.
    expect(steps[disclosure]!.ordinal).toBeLessThan(steps[submit]!.ordinal);
  });

  it('quotes the exact values the member must type', () => {
    const text = dropInstructions({ fullName: 'Privacy Agent', email: 'agent@agent.test', tradeName: 'deletewe' });
    expect(text).toContain('Privacy Agent');
    expect(text).toContain('agent@agent.test');
    expect(text).toContain('deletewe');
  });

  it('tells a member with no configured agent to submit in their own name', () => {
    const text = dropInstructions(undefined);
    expect(text).toMatch(/own name/i);
    expect(text).not.toMatch(/undefined/);
  });

  it('points at the real state portal', () => {
    expect(dropSteps(undefined).some((s) => s.url === DROP_CONSUMER_PORTAL)).toBe(true);
    expect(DROP_CONSUMER_PORTAL).toBe('https://consumer.drop.privacy.ca.gov');
  });

  it('explains that residency verification is the member’s to pass', () => {
    const text = dropInstructions(undefined);
    expect(text).toMatch(/residen/i);
    expect(text).toMatch(/California Identity Gateway|Login\.gov/);
  });
});

describe('the statutory clock', () => {
  const submittedAt = Date.UTC(2026, 9, 1);

  it('sets the broker retrieval deadline at 45 days', () => {
    const t = dropTimeline(submittedAt);
    expect(t.brokersMustRetrieveBy - submittedAt).toBe(DROP_BROKER_ACCESS_DAYS * 86_400_000);
  });

  it('locks amendment for the first 45 days', () => {
    expect(dropTimeline(submittedAt).amendableFrom - submittedAt).toBe(45 * 86_400_000);
  });

  it('sets the status horizon at 90 days', () => {
    expect(dropTimeline(submittedAt).statusMeaningfulFrom - submittedAt).toBe(90 * 86_400_000);
  });
});

describe('recording a submission', () => {
  it('starts the clock and surfaces the deadlines', async () => {
    const { member, dek } = await setup();

    const { timeline } = await recordDropSubmission(h.ctx, {
      memberId: member.id,
      dek,
      reference: 'drop-2026-abc123',
    });

    expect(timeline.brokersMustRetrieveBy).toBe(h.clock.now() + 45 * 86_400_000);

    const view = await dropOverview(h.ctx, { memberId: member.id, dek });
    expect(view.state).toBe('submitted');
    expect(view.reference).toBe('DROP-2026-ABC123');
  });

  it('stores the reference encrypted, not in the clear', async () => {
    const { member, dek } = await setup();
    await recordDropSubmission(h.ctx, { memberId: member.id, dek, reference: 'drop-2026-abc123' });

    const raw = await h.ctx.ports.db.get<{ reference_enc: Uint8Array }>(
      'SELECT reference_enc FROM drop_request WHERE member_id = ?',
      [member.id],
    );
    expect(Buffer.from(raw!.reference_enc).toString('latin1')).not.toContain('ABC123');
  });

  it('accepts a submission with no reference number', async () => {
    const { member, dek } = await setup();
    await recordDropSubmission(h.ctx, { memberId: member.id, dek });
    expect((await dropOverview(h.ctx, { memberId: member.id, dek })).reference).toBeNull();
  });

  // A mistyped reference looks like a record and is not one.
  it('rejects something that is not a reference number', async () => {
    const { member, dek } = await setup();
    await expect(
      recordDropSubmission(h.ctx, { memberId: member.id, dek, reference: 'no!' }),
    ).rejects.toThrow(/reference/i);
  });

  it('rejects a submission date in the future', async () => {
    const { member, dek } = await setup();
    await expect(
      recordDropSubmission(h.ctx, { memberId: member.id, dek, submittedAt: h.clock.now() + 30 * 86_400_000 }),
    ).rejects.toThrow(/future/i);
  });

  it('refuses to record one for a non-Californian', async () => {
    const { member, dek } = await setup('US-TX');
    await expect(recordDropSubmission(h.ctx, { memberId: member.id, dek })).rejects.toThrow(/California/i);
  });

  it('does not duplicate when recorded twice', async () => {
    const { member, dek } = await setup();
    await recordDropSubmission(h.ctx, { memberId: member.id, dek, reference: 'drop-1' });
    await recordDropSubmission(h.ctx, { memberId: member.id, dek, reference: 'drop-1' });

    const rows = await h.ctx.ports.db.all('SELECT id FROM drop_request WHERE member_id = ?', [member.id]);
    expect(rows).toHaveLength(1);
  });
});

describe('cancellation', () => {
  // § 7620(d): no amendment or cancellation for the first 45 days.
  it('refuses within the first 45 days', async () => {
    const { member, dek } = await setup();
    await recordDropSubmission(h.ctx, { memberId: member.id, dek });

    h.clock.advanceDays(10);
    await expect(cancelDropRequest(h.ctx, { memberId: member.id, dek })).rejects.toThrow(/45 days/);
  });

  it('allows it afterwards', async () => {
    const { member, dek } = await setup();
    await recordDropSubmission(h.ctx, { memberId: member.id, dek });

    h.clock.advanceDays(46);
    await cancelDropRequest(h.ctx, { memberId: member.id, dek });

    expect((await dropOverview(h.ctx, { memberId: member.id, dek })).state).toBe('cancelled');
  });
});

describe('the pipeline', () => {
  async function confirmedCase() {
    const { member, dek } = await setup();
    const { id: listingId } = await h.store.upsertListing({
      memberId: member.id, dek, brokerId: 'california-drop',
      url: 'https://privacy.ca.gov/drop/', externalKey: null,
      snapshot: { name: 'Ada Lovelace' },
      dedupHash: await h.store.dedupHash('california-drop', 'drop'),
    });
    const caseId = await h.store.openCase({
      memberId: member.id, brokerId: 'california-drop', listingId, state: 'queued',
    });
    await h.store.recordMatch({
      memberId: member.id, dek, listingId,
      result: { score: 1, comparisons: [], matcherVersion: '1.0.0', requiresManualConfirmation: false },
      decision: 'confirmed', decidedBy: 'member',
    });
    return { member, dek, caseId };
  }

  it('hands the member a guided task rather than claiming a submission', async () => {
    const { member, dek, caseId } = await confirmedCase();

    const result = await runSubmit(h.ctx, { memberId: member.id, dek, caseId });

    expect(result.kind).toBe('handed_off');
    expect(result.kind === 'handed_off' ? result.reason : '').toBe('member_action_required');
    expect((await h.store.getCase(member.id, caseId))?.state).toBe('task_pending');

    const task = (await h.store.listTasks(member.id, dek, 'member', 'open'))[0];
    expect(task?.instructions).toMatch(/residen/i);
    expect(task?.deepLink).toBe(DROP_CONSUMER_PORTAL);
  });

  it('advances the case once the member reports submitting, and schedules the 45-day check', async () => {
    const { member, dek, caseId } = await confirmedCase();
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId });

    await recordDropSubmission(h.ctx, { memberId: member.id, dek, reference: 'drop-xyz' });

    const caseFile = await h.store.getCase(member.id, caseId);
    expect(caseFile?.state).toBe('acknowledged');
    expect(caseFile?.nextCheckAt).toBe(h.clock.now() + 45 * 86_400_000);
  });

  it('never fabricates a DROP reference of its own', async () => {
    const { member, dek, caseId } = await confirmedCase();
    await runSubmit(h.ctx, { memberId: member.id, dek, caseId });
    expect((await dropOverview(h.ctx, { memberId: member.id, dek })).reference).toBeNull();
    expect(pendingReviews).toBeDefined();
    expect(runScan).toBeDefined();
    expect(decideListing).toBeDefined();
  });
});

describe('normaliseDropReference', () => {
  it('upper-cases and strips whitespace', () => {
    expect(normaliseDropReference(' drop-2026 abc ')).toBe('DROP-2026ABC');
  });

  it('rejects obvious nonsense', () => {
    expect(normaliseDropReference('ab')).toBeUndefined();
    expect(normaliseDropReference('has spaces!')).toBeUndefined();
    expect(normaliseDropReference('-leading')).toBeUndefined();
  });
});
