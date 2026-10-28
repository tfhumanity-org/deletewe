import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { explainScan } from '@deletewe/engine';
import { HttpApiMailer, ImapInboundSource, MaildropSource, OutboxMailer, verifyOutboundMail } from '@deletewe/adapters-node';
import { createHarness, enrolTestMember, type Harness } from './harness.ts';
import { formBroker, routes, searchPage } from './fixtures.ts';

let h: Harness;
const dirs: string[] = [];
afterEach(() => {
  h?.dispose();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'dw-infra-'));
  dirs.push(d);
  return d;
};

const eml = (subject: string) =>
  ['From: no-reply@broker.test', 'To: optout+abc@agent.test', `Subject: ${subject}`, '', 'body'].join('\n');

describe('the maildrop source', () => {
  it('returns messages and archives the files it took', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.eml'), eml('one'));
    writeFileSync(join(dir, 'b.eml'), eml('two'));

    const messages = await new MaildropSource(dir).collect();

    expect(messages.map((m) => m.subject).sort()).toEqual(['one', 'two']);
    expect(readdirSync(dir).filter((n) => n.endsWith('.eml'))).toEqual([]);
    expect(readdirSync(join(dir, 'processed')).sort()).toEqual(['a.eml', 'b.eml']);
  });

  // The bug this replaced: re-reading the directory afterwards swept up mail
  // that arrived mid-run and archived it unprocessed.
  it('never archives a message it did not return', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.eml'), eml('first'));

    const source = new MaildropSource(dir);
    const first = await source.collect();
    expect(first.map((m) => m.subject)).toEqual(['first']);

    // Mail that arrives after a pass must still be waiting for the next one,
    // not sitting unprocessed in the archive. This is the bug the earlier
    // implementation had: it re-read the directory and swept up everything.
    writeFileSync(join(dir, 'b.eml'), eml('arrived later'));
    const second = await source.collect();

    expect(second.map((m) => m.subject)).toEqual(['arrived later']);
    expect(readdirSync(join(dir, 'processed')).sort()).toEqual(['a.eml', 'b.eml']);
  });

  it('respects the limit', async () => {
    const dir = tempDir();
    for (let i = 0; i < 5; i++) writeFileSync(join(dir, `${String(i)}.eml`), eml(`m${String(i)}`));
    expect(await new MaildropSource(dir).collect(2)).toHaveLength(2);
  });

  it('archives something unparseable instead of retrying it forever', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'junk.eml'), '');
    await new MaildropSource(dir).collect();
    expect(readdirSync(dir).filter((n) => n.endsWith('.eml'))).toEqual([]);
  });

  it('reports reachability', async () => {
    const check = await new MaildropSource(tempDir()).check();
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/maildrop at/);
  });
});

describe('the IMAP source', () => {
  function fakeClient(messages: { uid: number; raw: string }[]) {
    const flagged: number[] = [];
    return {
      flagged,
      factory: () => ({
        async connect() {},
        async logout() {},
        async getMailboxLock() { return { release() {} }; },
        async mailboxOpen() { return { exists: messages.length }; },
        async *fetch() {
          for (const m of messages) yield { uid: m.uid, source: Buffer.from(m.raw, 'utf8') };
        },
        async messageFlagsAdd(range: { uid: string }) {
          flagged.push(Number(range.uid));
          return true;
        },
      }),
    };
  }

  it('collects unseen messages and marks each taken', async () => {
    const fake = fakeClient([
      { uid: 11, raw: eml('confirm one') },
      { uid: 12, raw: eml('confirm two') },
    ]);
    const source = new ImapInboundSource({
      host: 'imap.test', user: 'u', pass: 'p',
      clientFactory: fake.factory as never,
    });

    const messages = await source.collect();

    expect(messages.map((m) => m.subject)).toEqual(['confirm one', 'confirm two']);
    // Marked \Seen, so an overlapping tick cannot act on them twice.
    expect(fake.flagged).toEqual([11, 12]);
  });

  it('reports a connection failure rather than throwing', async () => {
    const source = new ImapInboundSource({
      host: 'imap.test', user: 'u', pass: 'p',
      clientFactory: (() => ({
        async connect() { throw new Error('authentication failed'); },
      })) as never,
    });

    expect(await source.check()).toEqual({ ok: false, detail: 'authentication failed' });
  });

  it('reports success with the mailbox depth', async () => {
    const fake = fakeClient([{ uid: 1, raw: eml('x') }]);
    const source = new ImapInboundSource({
      host: 'imap.test', user: 'u', pass: 'p',
      clientFactory: fake.factory as never,
    });
    const check = await source.check();
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/INBOX holds 1 message/);
  });
});

describe('outbound mail verification', () => {
  it('reports success through a provider', async () => {
    const mailer = new HttpApiMailer('https://mail.test/send', 'key', async () => new Response('{}', { status: 200 }));
    const result = await verifyOutboundMail(mailer, {
      from: 'privacy@agent.test', to: 'ops@agent.test', replyTo: 'optout+x@agent.test',
    });
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/http-api/);
  });

  // A silent send failure means an opt-out that never happened and a member
  // who is told it did.
  it('surfaces the provider’s own explanation of a rejection', async () => {
    const mailer = new HttpApiMailer(
      'https://mail.test/send',
      'key',
      async () => new Response('sender domain is not verified', { status: 403 }),
    );
    const result = await verifyOutboundMail(mailer, {
      from: 'privacy@agent.test', to: 'ops@agent.test', replyTo: 'optout+x@agent.test',
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('403');
    expect(result.detail).toContain('sender domain is not verified');
  });

  it('is honest that an outbox send did not actually send', async () => {
    const result = await verifyOutboundMail(new OutboxMailer(), {
      from: 'privacy@agent.test', to: 'ops@agent.test', replyTo: 'optout+x@agent.test',
    });
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/nothing was actually sent/);
  });
});

describe('explainScan', () => {
  async function setup(overrides: Partial<Record<string, string>> = {}) {
    h = await createHarness({ definitions: [formBroker], routes: routes(overrides) });
    const { member, dek } = await enrolTestMember(h);
    return { memberId: member.id, dek };
  }

  it('scores every candidate and explains each field', async () => {
    const { memberId, dek } = await setup();
    const report = await explainScan(h.ctx, { memberId, dek, brokerId: 'broker-test' });

    expect(report.resultCount).toBe(3);
    expect(report.candidates).toHaveLength(3);
    expect(report.candidates[0]?.comparisons.map((c) => c.field).sort()).toEqual([
      'age', 'locality', 'name', 'region',
    ]);
  });

  // The whole point of the command: safe to aim at a live broker.
  it('stores nothing and opens no case', async () => {
    const { memberId, dek } = await setup();
    await explainScan(h.ctx, { memberId, dek, brokerId: 'broker-test' });

    expect(await h.store.listListings(memberId, dek)).toHaveLength(0);
    expect(await h.store.listCases(memberId)).toHaveLength(0);
    expect(await h.store.listTasks(memberId, dek)).toHaveLength(0);
    expect(await h.store.listEvidence(memberId)).toHaveLength(0);
    expect(h.browser.submissions).toHaveLength(0);
    expect(h.mailer.sent).toHaveLength(0);
  });

  it('says what would happen to each candidate', async () => {
    const { memberId, dek } = await setup();
    const report = await explainScan(h.ctx, { memberId, dek, brokerId: 'broker-test' });

    expect(report.wouldAsk).toBe(1);
    expect(report.wouldSubmit).toBe(0);
    expect(report.discarded).toBe(2);
    expect(report.candidates.filter((c) => c.bucket === 'discard')[0]?.rejectedBecause).toMatch(/threshold/);
  });

  it('flags a weighted field the page never yields', async () => {
    const { memberId, dek } = await setup({
      search: searchPage().replace(/<span class="age">[^<]*<\/span>/g, ''),
    });
    const report = await explainScan(h.ctx, { memberId, dek, brokerId: 'broker-test' });
    expect(report.unextractedMatchFields).toContain('age');
  });

  // Zero results must read as "not listed", not as "broker broken" — most
  // result selectors are a single token, so a container guess cannot tell
  // them apart and used to call every empty page a breakage.
  it('reports no results as no results, not as breakage', async () => {
    const { memberId, dek } = await setup({ search: '<html><body><ul class="results"></ul></body></html>' });
    const report = await explainScan(h.ctx, { memberId, dek, brokerId: 'broker-test' });

    expect(report.resultCount).toBe(0);
    expect(report.candidates).toHaveLength(0);
    expect(report.skipped).toBeUndefined();
  });

  it('refuses an unknown broker id', async () => {
    const { memberId, dek } = await setup();
    await expect(explainScan(h.ctx, { memberId, dek, brokerId: 'nope' })).rejects.toThrow(/no definition/);
  });
});

describe('telling "not listed" apart from "page changed"', () => {
  const withMarker = {
    ...formBroker,
    id: 'marker-test',
    search: { ...formBroker.search, page_marker: '.results' },
  } as typeof formBroker;

  it('treats an empty but intact page as genuinely not listed', async () => {
    h = await createHarness({
      definitions: [withMarker],
      routes: [{ url: 'https://broker.test/search/ada-lovelace', html: '<html><body><ul class="results"></ul></body></html>' }],
    });
    const { member, dek } = await enrolTestMember(h);

    const report = await explainScan(h.ctx, { memberId: member.id, dek, brokerId: 'marker-test' });

    expect(report.skipped).toBeUndefined();
    expect(report.resultCount).toBe(0);
    expect((await h.store.getBroker('marker-test'))?.status).toBe('healthy');
  });

  it('calls a page without its marker broken, and blames the definition', async () => {
    h = await createHarness({
      definitions: [withMarker],
      routes: [{ url: 'https://broker.test/search/ada-lovelace', html: '<html><body><h1>Site redesigned</h1></body></html>' }],
    });
    const { member, dek } = await enrolTestMember(h);

    const report = await explainScan(h.ctx, { memberId: member.id, dek, brokerId: 'marker-test' });

    expect(report.skipped).toBe('broker_unavailable');
    const health = await h.store.healthSummary('marker-test', 7 * 86_400_000);
    expect(health.failures).toBe(1);
    expect(health.lastFailureKind).toBe('selector_missing');
  });
});
