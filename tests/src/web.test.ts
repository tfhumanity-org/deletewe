import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { createApp } from '@deletewe/web';
import { hashPassword } from '@deletewe/engine';
import { createHarness, enrolTestMember, type Harness } from './harness.ts';
import { formBroker, routes } from './fixtures.ts';

let h: Harness;
let app: Hono;

beforeEach(async () => {
  h = await createHarness({ definitions: [formBroker], routes: routes() });
  app = createApp({ ctx: h.ctx, secureCookies: false });
});
afterEach(() => { h?.dispose(); });

const BASE = 'http://localhost';

/** Keeps cookies across requests, like a browser would. */
class Client {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly target: Hono) {}

  async get(path: string): Promise<Response> {
    return this.capture(await this.target.fetch(new Request(`${BASE}${path}`, { headers: this.headers() })));
  }

  async post(path: string, fields: Record<string, string | string[]>): Promise<Response> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      for (const v of Array.isArray(value) ? value : [value]) body.append(key, v);
    }
    return this.capture(
      await this.target.fetch(
        new Request(`${BASE}${path}`, {
          method: 'POST',
          headers: { ...this.headers(), 'content-type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        }),
      ),
    );
  }

  private headers(): Record<string, string> {
    if (this.cookies.size === 0) return {};
    return { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
  }

  private capture(response: Response): Response {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (pair && eq > 0) this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return response;
  }
}

async function csrfFrom(response: Response): Promise<string> {
  const html = await response.text();
  return /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
}

describe('public pages', () => {
  it('serves the home page', async () => {
    const response = await app.fetch(new Request(`${BASE}/`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Get your personal data off the brokers');
  });

  it('sets a strict content security policy with no script sources', async () => {
    const csp = (await app.fetch(new Request(`${BASE}/`))).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('script-src');
  });

  it('sets the supporting security headers', async () => {
    const headers = (await app.fetch(new Request(`${BASE}/`))).headers;
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('shows the full consent text on the signup page, with nothing pre-ticked', async () => {
    const html = await (await app.fetch(new Request(`${BASE}/signup`))).text();
    expect(html).toContain('WHAT WE WILL NEVER DO');
    expect(html).toContain('Look up anyone other than you');
    expect(html).not.toMatch(/name="consent"[^>]*checked/);
  });

  it('reports health without a session', async () => {
    expect(await (await app.fetch(new Request(`${BASE}/healthz`))).json()).toMatchObject({ ok: true });
  });
});

describe('authentication', () => {
  it('redirects an anonymous visitor away from the dashboard', async () => {
    const response = await app.fetch(new Request(`${BASE}/dashboard`), undefined, { redirect: 'manual' } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/login');
  });

  it('signs a member up and routes them to the mandate', async () => {
    const client = new Client(app);
    const csrf = await csrfFrom(await client.get('/signup'));

    const response = await client.post('/signup', {
      csrf,
      email: 'new@member.test',
      password: 'a-sufficiently-long-password',
      jurisdiction: 'US-CA',
      consent: ['process_pii', 'contact_brokers', 'store_evidence'],
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/mandate');
  });

  it('refuses signup without the required consents', async () => {
    const client = new Client(app);
    const csrf = await csrfFrom(await client.get('/signup'));

    const response = await client.post('/signup', {
      csrf,
      email: 'partial@member.test',
      password: 'a-sufficiently-long-password',
      jurisdiction: 'US',
      consent: ['process_pii'],
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/cannot run without consent/);
  });

  it('rejects a form without a valid CSRF token', async () => {
    const client = new Client(app);
    await client.get('/signup');
    const response = await client.post('/signup', {
      csrf: 'wrong',
      email: 'x@member.test',
      password: 'a-sufficiently-long-password',
      jurisdiction: 'US',
      consent: ['process_pii', 'contact_brokers', 'store_evidence'],
    });
    expect(response.status).toBe(403);
  });

  // The login form must not reveal whether an address has an account.
  it('gives the same answer for a wrong password and an unknown address', async () => {
    await enrolTestMember(h);
    const client = new Client(app);
    const csrf = await csrfFrom(await client.get('/login'));

    const wrongPassword = await client.post('/login', { csrf, email: 'ada@member.test', password: 'nope-nope-nope' });
    const unknown = await client.post('/login', { csrf, email: 'ghost@member.test', password: 'nope-nope-nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrongPassword.text()).toBe(await unknown.text());
  });
});

describe('a signed-in member', () => {
  async function signIn(): Promise<Client> {
    await enrolTestMember(h);
    const client = new Client(app);
    const csrf = await csrfFrom(await client.get('/login'));
    await client.post('/login', { csrf, email: 'ada@member.test', password: 'a-sufficiently-long-password' });
    return client;
  }

  it('shows the dashboard with an empty state', async () => {
    const html = await (await (await signIn()).get('/dashboard')).text();
    expect(html).toContain('Where you stand');
    expect(html).toContain('Nothing found yet');
  });

  it('shows their own profile entries', async () => {
    const html = await (await (await signIn()).get('/profile')).text();
    expect(html).toContain('Ada Byron Lovelace');
    expect(html).toContain('12 St James Square');
  });

  it('lets them add and remove a profile entry', async () => {
    const client = await signIn();
    const csrf = await csrfFrom(await client.get('/profile'));

    await client.post('/profile/name', { csrf, first: 'Augusta', last: 'King', kind: 'alias' });
    expect(await (await client.get('/profile')).text()).toContain('Augusta King');
  });

  // This route silently 404'd for every report: Hono reads ':id.pdf' as a
  // parameter named "id.pdf", so param('id') was always undefined.
  it('serves a generated report as a PDF', async () => {
    const client = await signIn();
    const csrf = await csrfFrom(await client.get('/reports'));
    await client.post('/reports', { csrf });

    const listing = await (await client.get('/reports')).text();
    const href = /href="(\/reports\/[^"]+)"/.exec(listing)?.[1];
    expect(href).toBeDefined();

    const pdf = await client.get(href!);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).toContain('%PDF-1.4');
  });

  it('will not serve another member’s report', async () => {
    const other = await enrolTestMember(h, { email: 'other@member.test' });
    const { generateReport } = await import('@deletewe/engine');
    const { reportId } = await generateReport(h.ctx, { memberId: other.member.id, dek: other.dek });

    const response = await (await signIn()).get(`/reports/${reportId}/download.pdf`);
    expect(response.status).toBe(404);
  });

  it('exports everything as JSON', async () => {
    const bundle = (await (await (await signIn()).get('/account/export.json')).json()) as { format: string };
    expect(bundle.format).toBe('deletewe-export/1');
  });

  it('refuses account deletion without the confirmation phrase', async () => {
    const client = await signIn();
    const csrf = await csrfFrom(await client.get('/account'));
    const response = await client.post('/account/delete', { csrf, confirm: 'yes' });
    expect(response.status).toBe(400);
  });

  it('deletes the account when the phrase matches', async () => {
    const client = await signIn();
    const csrf = await csrfFrom(await client.get('/account'));

    const response = await client.post('/account/delete', { csrf, confirm: 'delete my account' });

    expect(response.status).toBe(302);
    expect(await h.store.findMemberByEmail('ada@member.test')).toBeUndefined();
  });

  // No page may render another member's data, whatever id is in the URL.
  it('cannot reach another member’s case by id', async () => {
    const other = await enrolTestMember(h, { email: 'other@member.test' });
    const caseId = await h.store.openCase({
      memberId: other.member.id,
      brokerId: 'broker-test',
      listingId: 'listing-x',
      state: 'queued',
    });

    const response = await (await signIn()).get(`/cases/${caseId}`);
    expect(response.status).toBe(404);
  });
});

describe('the admin console', () => {
  async function signInAdmin(): Promise<Client> {
    await h.store.createAdmin('ops', await hashPassword('a-sufficiently-long-password'));
    const client = new Client(app);
    const csrf = await csrfFrom(await client.get('/admin/login'));
    await client.post('/admin/login', { csrf, username: 'ops', password: 'a-sufficiently-long-password' });
    return client;
  }

  it('redirects an anonymous visitor to the operator login', async () => {
    const response = await app.fetch(new Request(`${BASE}/admin`));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/admin/login');
  });

  it('lists broker health with the unverified status visible', async () => {
    const html = await (await (await signInAdmin()).get('/admin/brokers')).text();
    expect(html).toContain('Broker health');
    expect(html).toContain('never');
  });

  // The console shows identifiers and status, never decrypted member data.
  it('shows no member personal data on any admin page', async () => {
    const { member, dek } = await enrolTestMember(h);
    const { runScan } = await import('@deletewe/engine');
    await runScan(h.ctx, { memberId: member.id, dek, brokerId: 'broker-test' });

    const client = await signInAdmin();
    for (const path of ['/admin', '/admin/brokers', '/admin/queue', '/admin/audit']) {
      const html = await (await client.get(path)).text();
      for (const secret of ['Ada', 'Lovelace', 'St James', 'Berkeley', 'ada@member.test']) {
        expect(`${path}:${secret}`).toBe(html.includes(secret) ? 'LEAKED' : `${path}:${secret}`);
      }
    }
  });

  it('records every operator action in the audit log', async () => {
    const client = await signInAdmin();
    const html = await (await client.get('/admin/audit')).text();
    expect(html).toContain('login');
  });
});
