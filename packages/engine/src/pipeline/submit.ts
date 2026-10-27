import type { BrokerDefinition, BrokerStep, Expectation } from '@deletewe/schema';
import type { EngineContext } from '../context.ts';
import { EngineError } from '../errors.ts';
import { newToken } from '../ids.ts';
import { redact } from '../logger.ts';
import { missingFields, project, render, type FieldProjection } from '../projection.ts';
import type { PageHandle } from '../ports.ts';
import type { CaseFile, Listing } from '../types.ts';
import { renderLetterPdf } from '../letter.ts';
import { capture, captureText, Transcript, type CaptureParams } from './evidence.ts';
import { dispatchAllowed, recordFailure, recordSuccess } from './health.ts';
import { createGuidedTask, createOperatorTask, taskKindForHandoff } from './tasks.ts';

export type SubmitResult =
  | { readonly kind: 'submitted'; readonly awaitingVerification: boolean }
  | { readonly kind: 'handed_off'; readonly reason: string; readonly taskId: string }
  | { readonly kind: 'blocked'; readonly reason: string };

export interface SubmitParams {
  readonly memberId: string;
  readonly dek: Uint8Array;
  readonly caseId: string;
  readonly jobId?: string;
}

/**
 * Sends one opt-out request for one case.
 *
 * Every precondition is checked here rather than trusted from the caller: an
 * outbound request is the only irreversible thing this system does.
 */
export async function runSubmit(ctx: EngineContext, params: SubmitParams): Promise<SubmitResult> {
  const { memberId, dek, caseId } = params;

  const caseFile = await ctx.store.getCase(memberId, caseId);
  if (!caseFile) throw new EngineError('not_found', 'case not found');

  const gate = await checkGate(ctx, memberId, caseFile);
  if (gate) return gate;

  const definition = ctx.catalog.get(caseFile.brokerId);
  if (!definition) throw new EngineError('not_found', `no definition for broker ${caseFile.brokerId}`);

  const brokerRow = await ctx.store.getBroker(caseFile.brokerId);
  if (brokerRow && (!brokerRow.enabled || !dispatchAllowed(brokerRow.status))) {
    return { kind: 'blocked', reason: 'broker_unavailable' };
  }

  const listing = await ctx.store.getListing(memberId, dek, caseFile.listingId);
  if (!listing) throw new EngineError('not_found', 'listing not found');

  const profile = await ctx.store.loadProfile(memberId, dek);
  const projection = project(definition.opt_out.required_fields, {
    profile,
    listing,
    now: ctx.ports.clock.now(),
  });

  const missing = missingFields(definition.opt_out.required_fields, projection);
  if (missing.length > 0) {
    await ctx.store.updateCase(memberId, caseId, { state: 'needs_review' });
    await createGuidedTask(ctx, {
      memberId,
      dek,
      caseId,
      kind: 'manual_optout',
      brokerName: definition.name,
      instructions: `This broker needs details your profile does not have yet: ${missing.join(', ')}. Add them and we will try again.`,
      deepLink: `${ctx.config.baseUrl}/profile`,
    });
    return { kind: 'blocked', reason: 'missing_profile_fields' };
  }

  await ctx.store.updateCase(memberId, caseId, { incrementAttempt: true });

  const evidence: CaptureParams = {
    memberId,
    dek,
    caseId,
    jobId: params.jobId ?? null,
    brokerId: caseFile.brokerId,
    definitionSha256: ctx.catalog.sha256(caseFile.brokerId) ?? null,
  };

  switch (definition.opt_out.method) {
    case 'form':
      return submitForm(ctx, params, caseFile, definition, projection, evidence);
    case 'email':
      return submitEmail(ctx, params, caseFile, definition, projection, evidence);
    case 'letter':
      return submitLetter(ctx, params, caseFile, definition, projection, evidence);
    case 'drop':
      return submitDrop(ctx, params, caseFile, definition, profile);
    case 'account':
    case 'phone':
      return handOffEntirely(ctx, params, caseFile, definition, listing, projection);
  }
}

/**
 * Per-broker politeness, applied by every path that actually sends something.
 * A definition declaring `min_interval_ms` and `daily_cap` is making a promise
 * about our behaviour; enforcing it only for form submissions made that
 * promise true for one method out of six.
 */
async function withinRateLimit(ctx: EngineContext, brokerId: string, definition: BrokerDefinition): Promise<boolean> {
  return ctx.store.tryConsumeRate(brokerId, definition.rate_limit.min_interval_ms, definition.rate_limit.daily_cap);
}

/**
 * The consent gate. Nothing reaches a broker without a live mandate, live
 * consent, and a confirmed match. See docs/product-spec.md principle 2.
 */
async function checkGate(ctx: EngineContext, memberId: string, caseFile: CaseFile): Promise<SubmitResult | undefined> {
  if (!(await ctx.store.hasConsent(memberId, 'contact_brokers'))) {
    return { kind: 'blocked', reason: 'consent_missing' };
  }
  const mandate = await ctx.store.activeMandate(memberId);
  if (!mandate) return { kind: 'blocked', reason: 'mandate_missing' };

  const member = await ctx.store.getMemberRow(memberId);
  if (!member || member.status !== 'active') return { kind: 'blocked', reason: 'member_inactive' };

  const match = await ctx.store.db.get<{ decision: string }>(
    'SELECT decision FROM match_result WHERE member_id = ? AND listing_id = ? ORDER BY created_at DESC LIMIT 1',
    [memberId, caseFile.listingId],
  );
  if (!match || (match.decision !== 'confirmed' && match.decision !== 'auto_confirmed')) {
    return { kind: 'blocked', reason: 'match_not_confirmed' };
  }
  return undefined;
}

// --- Form ------------------------------------------------------------------

async function submitForm(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
  projection: FieldProjection,
  evidence: CaptureParams,
): Promise<SubmitResult> {
  const { memberId, dek, caseId } = params;
  const definitionSha = evidence.definitionSha256 ?? '';
  const log = ctx.log.child({ brokerId: caseFile.brokerId, caseId, jobKind: 'submit' });

  if (!(await withinRateLimit(ctx, caseFile.brokerId, definition))) {
    return { kind: 'blocked', reason: 'rate_limited' };
  }

  const transcript = new Transcript(() => ctx.ports.clock.now());
  const startUrl = definition.opt_out.url ?? definition.homepage;
  let page: PageHandle | undefined;

  try {
    page = await ctx.ports.browser.open(startUrl, {
      allowedHosts: definition.hosts,
      userAgent: ctx.config.userAgent,
      timeoutMs: ctx.config.browserTimeoutMs,
    });

    for (const step of definition.opt_out.steps) {
      if (step.action === 'handoff') {
        await captureEvidence(ctx, definition, evidence, page, transcript, 'handoff');
        const taskId = await handOffMidFlow(ctx, params, definition, step, projection, page.url());
        await ctx.store.updateCase(memberId, caseId, { state: 'task_pending' });
        await ctx.store.setListingStatus(memberId, caseFile.listingId, 'task_pending');
        log.info('submit_handoff', { reason: step.reason, stepId: step.id });
        return { kind: 'handed_off', reason: step.reason, taskId };
      }

      const result = await runStep(page, step, projection);
      transcript.add({ step: step.id, action: step.action, ok: result.ok, note: result.note, url: page.url(), status: page.status() });

      if (!result.ok && !step.optional) {
        // An unmet expectation means our procedure is wrong, not that the
        // broker refused. Record it against the definition and stop.
        await recordFailure(ctx, caseFile.brokerId, result.failure ?? 'unexpected_page', step.id, definitionSha);
        await captureEvidence(ctx, definition, evidence, page, transcript, 'failure');
        await ctx.store.updateCase(memberId, caseId, { state: 'needs_review' });
        await createOperatorTask(ctx, {
          memberId,
          dek,
          caseId,
          kind: 'broker_broken',
          title: `${definition.name}: step "${step.id}" did not behave as expected`,
          instructions: `Step "${step.id}" (${step.action}) failed its expectation. The definition likely needs updating.`,
        });
        log.warn('submit_step_failed', { stepId: step.id, failure: result.failure ?? 'unexpected_page' });
        return { kind: 'blocked', reason: 'broker_broken' };
      }
    }

    await captureEvidence(ctx, definition, evidence, page, transcript, 'submitted');
    await recordSuccess(ctx, caseFile.brokerId, definitionSha);
    return finishSubmission(ctx, params, caseFile, definition);
  } finally {
    await page?.close();
  }
}

interface StepResult {
  readonly ok: boolean;
  readonly note?: string;
  readonly failure?: 'selector_missing' | 'unexpected_page' | 'timeout';
}

async function runStep(page: PageHandle, step: BrokerStep, projection: FieldProjection): Promise<StepResult> {
  try {
    switch (step.action) {
      case 'goto':
        return await checkExpect(page, step.expect);
      case 'fill':
        await page.fill(step.selector, render(step.value, projection));
        return await checkExpect(page, step.expect);
      case 'select':
        await page.select(step.selector, step.value);
        return await checkExpect(page, step.expect);
      case 'click':
        await page.click(step.selector);
        return await checkExpect(page, step.expect);
      case 'wait_for':
        await page.waitFor(step.selector, step.ms);
        return await checkExpect(page, step.expect);
      case 'expect':
        return await checkExpect(page, step.expect);
      case 'extract':
      case 'screenshot':
      case 'handoff':
        return { ok: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/selector|not found|no element/i.test(message)) return { ok: false, failure: 'selector_missing', note: 'selector missing' };
    if (/timeout/i.test(message)) return { ok: false, failure: 'timeout', note: 'timed out' };
    return { ok: false, failure: 'unexpected_page', note: redact(message) };
  }
}

async function checkExpect(page: PageHandle, expectation: Expectation | undefined): Promise<StepResult> {
  if (!expectation) return { ok: true };

  if (expectation.status_in && !expectation.status_in.includes(page.status())) {
    return { ok: false, failure: 'unexpected_page', note: `status ${page.status()}` };
  }
  if (expectation.selector_present && !(await page.querySelector(expectation.selector_present))) {
    return { ok: false, failure: 'selector_missing', note: 'expected selector absent' };
  }
  if (expectation.selector_absent && (await page.querySelector(expectation.selector_absent))) {
    return { ok: false, failure: 'unexpected_page', note: 'forbidden selector present' };
  }
  if (expectation.text_contains && !(await page.text()).includes(expectation.text_contains)) {
    return { ok: false, failure: 'unexpected_page', note: 'expected text absent' };
  }
  return { ok: true };
}

async function captureEvidence(
  ctx: EngineContext,
  definition: BrokerDefinition,
  evidence: CaptureParams,
  page: PageHandle,
  transcript: Transcript,
  label: string,
): Promise<void> {
  if (definition.evidence.capture.includes('transcript')) {
    await captureText(ctx, evidence, 'transcript', transcript.toJson({ label, brokerId: definition.id }), 'json');
  }
  if (definition.evidence.capture.includes('dom')) {
    await captureText(ctx, evidence, 'dom', await page.content(), 'html');
  }
  if (definition.evidence.capture.includes('screenshot') && ctx.ports.browser.canScreenshot) {
    const shot = await page.screenshot();
    if (shot) await capture(ctx, evidence, 'screenshot', shot, 'png');
  }
}

// --- Email -----------------------------------------------------------------

async function submitEmail(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
  projection: FieldProjection,
  evidence: CaptureParams,
): Promise<SubmitResult> {
  const block = definition.opt_out.email;
  if (!block) throw new EngineError('invalid_input', 'email method without an email block');

  if (!(await withinRateLimit(ctx, caseFile.brokerId, definition))) {
    return { kind: 'blocked', reason: 'rate_limited' };
  }

  const token = await allocateVerificationToken(ctx, params, caseFile, definition);
  const replyTo = ctx.ports.inbound.addressFor(token);

  const message = {
    to: block.to,
    cc: block.cc,
    from: ctx.config.agentEmailFrom,
    replyTo,
    subject: render(block.subject_template, projection),
    text: render(block.body_template, projection),
  };

  await ctx.ports.mailer.send(message);
  await captureText(
    ctx,
    evidence,
    'email',
    [`To: ${message.to}`, `Reply-To: ${message.replyTo}`, `Subject: ${message.subject}`, '', message.text].join('\n'),
    'eml',
  );
  await recordSuccess(ctx, caseFile.brokerId, evidence.definitionSha256 ?? '');
  return finishSubmission(ctx, params, caseFile, definition);
}

// --- Letter ----------------------------------------------------------------

async function submitLetter(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
  projection: FieldProjection,
  evidence: CaptureParams,
): Promise<SubmitResult> {
  const block = definition.opt_out.letter;
  if (!block) throw new EngineError('invalid_input', 'letter method without a letter block');

  const body = render(block.body_template, projection);
  const pdf = renderLetterPdf({
    recipient: block.recipient,
    addressLines: block.address_lines,
    body,
    date: new Date(ctx.ports.clock.now()).toISOString().slice(0, 10),
  });

  await capture(ctx, evidence, 'letter_pdf', pdf, 'pdf');

  if (!ctx.ports.letters.available) {
    // No postal provider is configured. The letter is real and downloadable;
    // posting it is the member's step. See docs/roadmap.md.
    await ctx.store.updateCase(params.memberId, params.caseId, { state: 'task_pending' });
    const taskId = await createGuidedTask(ctx, {
      memberId: params.memberId,
      dek: params.dek,
      caseId: params.caseId,
      kind: 'manual_optout',
      brokerName: definition.name,
      instructions: `We have prepared a signed opt-out letter for ${definition.name}. Download it from this case, print it, and post it to the address shown. Mark this task done once sent.`,
      deepLink: `${ctx.config.baseUrl}/cases/${params.caseId}`,
    });
    return { kind: 'handed_off', reason: 'no_postal_provider', taskId };
  }

  if (!(await withinRateLimit(ctx, caseFile.brokerId, definition))) {
    return { kind: 'blocked', reason: 'rate_limited' };
  }

  const sent = await ctx.ports.letters.send({
    recipient: block.recipient,
    addressLines: block.address_lines,
    fax: block.fax,
    pdf,
  });
  if (!sent.accepted) return { kind: 'blocked', reason: sent.reason ?? 'letter_rejected' };
  return finishSubmission(ctx, params, caseFile, definition);
}

// --- DROP ------------------------------------------------------------------

async function submitDrop(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
  profile: { names: readonly { first: string; middle?: string; last: string }[]; emails: readonly string[]; jurisdiction: string },
): Promise<SubmitResult> {
  const name = profile.names[0];
  const email = profile.emails[0];
  if (!name || !email) return { kind: 'blocked', reason: 'missing_profile_fields' };

  if (!ctx.ports.drop.available) {
    await ctx.store.updateCase(params.memberId, params.caseId, { state: 'task_pending' });
    const taskId = await createGuidedTask(ctx, {
      memberId: params.memberId,
      dek: params.dek,
      caseId: params.caseId,
      kind: 'drop_unavailable',
      brokerName: definition.name,
      instructions:
        'California runs a single deletion request that reaches every registered data broker. This instance is not connected to it, so submit the request yourself at the state portal — it is free, and it is stronger than asking each broker individually.',
      deepLink: 'https://cppa.ca.gov/',
    });
    return { kind: 'handed_off', reason: 'channel_unavailable', taskId };
  }

  if (!(await withinRateLimit(ctx, caseFile.brokerId, definition))) {
    return { kind: 'blocked', reason: 'rate_limited' };
  }

  const result = await ctx.ports.drop.submit({
    memberId: params.memberId,
    jurisdiction: profile.jurisdiction,
    fullName: [name.first, name.middle, name.last].filter(Boolean).join(' '),
    email,
  });
  if (!result.accepted) return { kind: 'blocked', reason: result.reason ?? 'channel_unavailable' };
  return finishSubmission(ctx, params, caseFile, definition);
}

// --- Fully manual ----------------------------------------------------------

async function handOffEntirely(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
  listing: Listing,
  projection: FieldProjection,
): Promise<SubmitResult> {
  await ctx.store.updateCase(params.memberId, params.caseId, { state: 'task_pending' });
  await ctx.store.setListingStatus(params.memberId, caseFile.listingId, 'task_pending');

  const taskId = await createGuidedTask(ctx, {
    memberId: params.memberId,
    dek: params.dek,
    caseId: params.caseId,
    kind: definition.opt_out.method === 'phone' ? 'phone_call' : 'manual_optout',
    brokerName: definition.name,
    instructions:
      definition.opt_out.instructions ?? 'Follow this broker’s own opt-out procedure using the details below.',
    prefill: { ...projection, listing: listing.url, ...(definition.opt_out.phone ? { phone_to_call: definition.opt_out.phone } : {}) },
    deepLink: definition.opt_out.url ?? definition.homepage,
    dueInHours: 24 * 14,
  });
  return { kind: 'handed_off', reason: definition.opt_out.method, taskId };
}

async function handOffMidFlow(
  ctx: EngineContext,
  params: SubmitParams,
  definition: BrokerDefinition,
  step: Extract<BrokerStep, { action: 'handoff' }>,
  projection: FieldProjection,
  currentUrl: string,
): Promise<string> {
  return createGuidedTask(ctx, {
    memberId: params.memberId,
    dek: params.dek,
    caseId: params.caseId,
    kind: taskKindForHandoff(step.reason),
    brokerName: definition.name,
    instructions: step.instructions,
    prefill: { ...projection },
    deepLink: step.url ?? currentUrl,
    dueInHours: 24 * 7,
  });
}

// --- Shared tail -----------------------------------------------------------

async function allocateVerificationToken(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
): Promise<string> {
  const token = newToken();
  await ctx.store.createVerificationToken({
    token,
    memberId: params.memberId,
    caseId: params.caseId,
    brokerId: caseFile.brokerId,
    windowHours: definition.verification.window_hours,
  });
  return token;
}

async function finishSubmission(
  ctx: EngineContext,
  params: SubmitParams,
  caseFile: CaseFile,
  definition: BrokerDefinition,
): Promise<SubmitResult> {
  const now = ctx.ports.clock.now();
  const awaiting = definition.verification.method !== 'none';

  if (awaiting && definition.opt_out.method !== 'email') {
    await allocateVerificationToken(ctx, params, caseFile, definition);
  }

  const state = awaiting ? 'awaiting_verification' : 'acknowledged';
  await ctx.store.updateCase(params.memberId, params.caseId, {
    state,
    // Even an unverified submission gets a re-check: the only proof of removal
    // is a later scan finding nothing. docs/threat-model.md TB5.
    nextCheckAt: now + ctx.config.removalGraceDays * 86_400_000,
  });
  await ctx.store.setListingStatus(params.memberId, caseFile.listingId, state);
  await ctx.store.recordEvent({
    memberId: params.memberId,
    caseId: params.caseId,
    type: awaiting ? 'optout_submitted_awaiting_verification' : 'optout_submitted',
    actor: 'system',
  });

  await scheduleRecheck(ctx, params.memberId, params.caseId, now + ctx.config.removalGraceDays * 86_400_000);
  return { kind: 'submitted', awaitingVerification: awaiting };
}

export async function scheduleRecheck(
  ctx: EngineContext,
  memberId: string,
  caseId: string,
  runAfter: number,
): Promise<void> {
  await ctx.store.updateCase(memberId, caseId, { nextCheckAt: runAfter });
}
