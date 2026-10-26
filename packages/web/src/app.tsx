import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  addProfileEntry,
  CONSENT_DOCUMENT,
  decideListing,
  deleteAccount,
  completeGuidedTask,
  enqueueFullScan,
  enrol,
  exportMemberData,
  fillMandate,
  generateReport,
  isEngineError,
  mandateDocument,
  pendingReviews,
  removeProfileEntry,
  revokeAuthority,
  signMandate,
  verifyPassword,
  type Address,
  type ConsentPurpose,
  type EngineContext,
  type IdentifierValue,
  type MandateKind,
  type PersonName,
} from '@deletewe/engine';
import {
  AccountPage,
  CasePage,
  DashboardPage,
  ErrorPage,
  HomePage,
  LoginPage,
  MandatePage,
  ProfilePage,
  ReportsPage,
  ReviewPage,
  SignupPage,
  TasksPage,
  type DashboardRow,
} from './views/pages.tsx';
import { AdminAuditPage, AdminBrokersPage, AdminJobsPage, AdminLoginPage, AdminQueuePage } from './views/admin.tsx';
import { csrfValid, endSession, readSession, SECURITY_HEADERS, startSession } from './session.ts';

export interface AppOptions {
  readonly ctx: EngineContext;
  /** Secure cookies off for plain-HTTP local development only. */
  readonly secureCookies?: boolean;
}

interface MemberSession {
  readonly memberId: string;
  readonly dek: Uint8Array;
  readonly csrf: string;
}

const HEALTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function createApp(options: AppOptions): Hono {
  const { ctx } = options;
  const secure = options.secureCookies ?? true;
  const app = new Hono();

  app.use('*', async (c, next) => {
    await next();
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) c.header(key, value);
  });

  // --- helpers -------------------------------------------------------------

  /** Resolves the signed-in member and unwraps their data key for this request. */
  async function member(c: Context): Promise<MemberSession | undefined> {
    const session = await readSession(c, ctx.store);
    if (!session?.memberId) return undefined;
    const row = await ctx.store.getMemberRow(session.memberId);
    if (!row) return undefined;
    return { memberId: row.id, dek: await ctx.store.unwrapDekFor(row), csrf: session.csrfToken };
  }

  async function requireMember(c: Context): Promise<MemberSession | Response> {
    const session = await member(c);
    return session ?? c.redirect('/login');
  }

  async function guard(c: Context): Promise<{ session: MemberSession; form: FormData } | Response> {
    const session = await member(c);
    if (!session) return c.redirect('/login');
    const form = await c.req.formData();
    if (!csrfValid(session.csrf, form.get('csrf'))) {
      return c.html(<ErrorPage status={403} message="That form expired. Go back and try again." />, 403);
    }
    return { session, form };
  }

  async function adminGuard(c: Context): Promise<{ adminId: string; csrf: string; form: FormData } | Response> {
    const session = await readSession(c, ctx.store, true);
    if (!session?.adminId) return c.redirect('/admin/login');
    const form = await c.req.formData();
    if (!csrfValid(session.csrfToken, form.get('csrf'))) {
      return c.html(<ErrorPage status={403} message="That form expired. Go back and try again." />, 403);
    }
    return { adminId: session.adminId, csrf: session.csrfToken, form };
  }

  const text = (form: FormData, key: string): string => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };

  // --- public --------------------------------------------------------------

  app.get('/', async (c) => c.html(<HomePage signedIn={(await member(c)) !== undefined} />));

  app.get('/healthz', (c) => c.json({ ok: true, engine: ctx.config.engineVersion }));

  app.get('/signup', async (c) => {
    const session = await startSession(c, ctx.store, { secure });
    return c.html(<SignupPage csrf={session.csrfToken} consentDocument={CONSENT_DOCUMENT} />);
  });

  app.post('/signup', async (c) => {
    const session = await readSession(c, ctx.store);
    const form = await c.req.formData();
    if (!session || !csrfValid(session.csrfToken, form.get('csrf'))) {
      return c.html(<SignupPage csrf={session?.csrfToken ?? ''} consentDocument={CONSENT_DOCUMENT} error="That form expired. Try again." />, 403);
    }

    const consents = form.getAll('consent').filter((v): v is string => typeof v === 'string') as ConsentPurpose[];
    try {
      const { member: created } = await enrol(ctx, {
        email: text(form, 'email'),
        password: text(form, 'password'),
        jurisdiction: text(form, 'jurisdiction') || 'US',
        consents,
      });
      await startSession(c, ctx.store, { memberId: created.id, secure });
      return c.redirect('/mandate');
    } catch (error) {
      const message = isEngineError(error) ? error.message : 'Could not create the account.';
      return c.html(<SignupPage csrf={session.csrfToken} consentDocument={CONSENT_DOCUMENT} error={message} />, 400);
    }
  });

  app.get('/login', async (c) => {
    const session = await startSession(c, ctx.store, { secure });
    return c.html(<LoginPage csrf={session.csrfToken} />);
  });

  app.post('/login', async (c) => {
    const session = await readSession(c, ctx.store);
    const form = await c.req.formData();
    if (!session || !csrfValid(session.csrfToken, form.get('csrf'))) {
      return c.html(<LoginPage csrf={session?.csrfToken ?? ''} error="That form expired. Try again." />, 403);
    }

    const found = await ctx.store.findMemberByEmail(text(form, 'email'));
    // One message for both failures, so the form cannot enumerate accounts.
    const invalid = <LoginPage csrf={session.csrfToken} error="Those details did not match an account." />;
    if (!found) return c.html(invalid, 401);
    if (!(await verifyPassword(text(form, 'password'), found.row.password_hash))) return c.html(invalid, 401);

    await startSession(c, ctx.store, { memberId: found.row.id, secure });
    return c.redirect('/dashboard');
  });

  app.post('/logout', async (c) => {
    await endSession(c, ctx.store);
    return c.redirect('/');
  });

  // --- mandate -------------------------------------------------------------

  app.get('/mandate', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;
    const document = mandateDocument('authorized_agent');
    const date = new Date(ctx.ports.clock.now()).toISOString().slice(0, 10);
    return c.html(<MandatePage csrf={session.csrf} documentText={fillMandate(document.text, '__________', date)} />);
  });

  app.post('/mandate', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const { session, form } = result;

    try {
      await signMandate(ctx, {
        memberId: session.memberId,
        dek: session.dek,
        kind: (text(form, 'kind') || 'authorized_agent') as MandateKind,
        signatureName: text(form, 'signature'),
      });
      return c.redirect('/profile');
    } catch (error) {
      const document = mandateDocument('authorized_agent');
      const message = isEngineError(error) ? error.message : 'Could not record that signature.';
      return c.html(<MandatePage csrf={session.csrf} documentText={document.text} error={message} />, 400);
    }
  });

  // --- dashboard -----------------------------------------------------------

  app.get('/dashboard', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;

    const cases = await ctx.store.listCases(session.memberId);
    const brokers = new Map((await ctx.store.listBrokers()).map((b) => [b.id, b]));
    const evidence = await ctx.store.listEvidence(session.memberId);
    const counts = new Map<string, number>();
    for (const record of evidence) {
      if (record.caseId) counts.set(record.caseId, (counts.get(record.caseId) ?? 0) + 1);
    }

    const rows: DashboardRow[] = cases.map((caseFile) => ({
      caseFile,
      broker: brokers.get(caseFile.brokerId),
      evidenceCount: counts.get(caseFile.id) ?? 0,
    }));

    const tally = (...states: string[]) => rows.filter((r) => states.includes(r.caseFile.state)).length;

    return c.html(
      <DashboardPage
        rows={rows}
        pendingReviews={(await pendingReviews(ctx, session)).length}
        openTasks={(await ctx.store.listTasks(session.memberId, session.dek, 'member', 'open')).length}
        totals={{
          removed: tally('removed'),
          sent: tally('submitted', 'awaiting_verification', 'acknowledged'),
          waitingOnYou: tally('task_pending', 'awaiting_consent'),
          blocked: tally('needs_review', 'relisted'),
          found: rows.length,
        }}
        hasMandate={(await ctx.store.activeMandate(session.memberId)) !== undefined}
      />,
    );
  });

  app.get('/cases/:id', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;

    const caseFile = await ctx.store.getCase(session.memberId, c.req.param('id'));
    if (!caseFile) return c.html(<ErrorPage status={404} message="No such case." />, 404);

    const broker = await ctx.store.getBroker(caseFile.brokerId);
    const listing = await ctx.store.getListing(session.memberId, session.dek, caseFile.listingId);
    const evidence = await ctx.store.listEvidence(session.memberId, caseFile.id);
    const events = (await ctx.store.listEvents(session.memberId, session.dek)).filter((e) => e.caseId === caseFile.id);

    return c.html(
      <CasePage
        caseFile={caseFile}
        brokerName={broker?.name ?? caseFile.brokerId}
        listing={listing}
        evidence={evidence}
        events={events}
      />,
    );
  });

  // --- review --------------------------------------------------------------

  app.get('/review', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;
    const rows = await pendingReviews(ctx, session);
    return c.html(<ReviewPage csrf={session.csrf} rows={rows} />);
  });

  app.post('/review/:listingId', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const { session, form } = result;

    await decideListing(ctx, {
      memberId: session.memberId,
      dek: session.dek,
      listingId: c.req.param('listingId'),
      confirm: text(form, 'decision') === 'confirm',
    });
    return c.redirect('/review');
  });

  // --- tasks ---------------------------------------------------------------

  app.get('/tasks', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;
    const tasks = await ctx.store.listTasks(session.memberId, session.dek, 'member', 'open');
    return c.html(<TasksPage csrf={session.csrf} tasks={tasks.filter((t) => t.kind !== 'confirm_match')} />);
  });

  app.post('/tasks/:id', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const { session, form } = result;

    await completeGuidedTask(ctx, {
      memberId: session.memberId,
      dek: session.dek,
      taskId: c.req.param('id'),
      done: text(form, 'state') === 'done',
    });
    return c.redirect('/tasks');
  });

  // --- profile -------------------------------------------------------------

  app.get('/profile', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;
    const identifiers = await ctx.store.listIdentifiers(session.memberId, session.dek);
    const queued = c.req.query('scanned');
    return c.html(
      <ProfilePage csrf={session.csrf} identifiers={identifiers} scanQueued={queued ? Number(queued) : undefined} />,
    );
  });

  const addEntry = async (c: Context, build: (form: FormData) => IdentifierValue, current = true) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const { session, form } = result;
    await addProfileEntry(ctx, {
      memberId: session.memberId,
      dek: session.dek,
      data: build(form),
      isCurrent: current && form.get('isCurrent') !== null ? true : current,
    });
    return c.redirect('/profile');
  };

  app.post('/profile/name', async (c) =>
    addEntry(c, (form) => {
      const name: PersonName = {
        first: text(form, 'first'),
        middle: text(form, 'middle') || undefined,
        last: text(form, 'last'),
      };
      return text(form, 'kind') === 'alias' ? { kind: 'alias', value: name } : { kind: 'name', value: name };
    }),
  );

  app.post('/profile/address', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const { session, form } = result;
    const address: Address = {
      line1: text(form, 'line1'),
      city: text(form, 'city'),
      region: text(form, 'region'),
      postalCode: text(form, 'postalCode'),
      country: text(form, 'country') || 'US',
    };
    await addProfileEntry(ctx, {
      memberId: session.memberId,
      dek: session.dek,
      data: { kind: 'address', value: address },
      isCurrent: form.get('isCurrent') !== null,
    });
    return c.redirect('/profile');
  });

  app.post('/profile/contact', async (c) =>
    addEntry(c, (form) => {
      const kind = text(form, 'kind');
      const value = text(form, 'value');
      if (kind === 'phone') return { kind: 'phone', value };
      if (kind === 'dob') return { kind: 'dob', value };
      return { kind: 'email', value };
    }),
  );

  app.post('/profile/:id/delete', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    await removeProfileEntry(ctx, { memberId: result.session.memberId, identifierId: c.req.param('id') });
    return c.redirect('/profile');
  });

  app.post('/scan', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const queued = await enqueueFullScan(ctx, result.session.memberId);
    return c.redirect(`/profile?scanned=${String(queued)}`);
  });

  // --- reports and evidence ------------------------------------------------

  app.get('/reports', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;
    const reports = await ctx.store.listReports(session.memberId, session.dek);
    return c.html(<ReportsPage csrf={session.csrf} reports={reports} />);
  });

  app.post('/reports', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    await generateReport(ctx, { memberId: result.session.memberId, dek: result.session.dek });
    return c.redirect('/reports');
  });

  app.get('/reports/:id.pdf', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;

    const reports = await ctx.store.listReports(session.memberId, session.dek);
    const report = reports.find((r) => r.id === c.req.param('id'));
    if (!report?.blobKey) return c.html(<ErrorPage status={404} message="No such report." />, 404);

    const stored = await ctx.ports.blobs.get(report.blobKey);
    if (!stored) return c.html(<ErrorPage status={404} message="That report file is missing." />, 404);

    const pdf = await ctx.store.decryptBlob(session.dek, session.memberId, stored);
    c.header('content-type', 'application/pdf');
    c.header('content-disposition', `attachment; filename="deletewe-report-${report.id}.pdf"`);
    return c.body(toArrayBuffer(pdf));
  });

  app.get('/evidence/:id', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;

    const records = await ctx.store.listEvidence(session.memberId);
    const record = records.find((r) => r.id === c.req.param('id'));
    if (!record) return c.html(<ErrorPage status={404} message="No such evidence." />, 404);

    const stored = await ctx.ports.blobs.get(record.blobKey);
    if (!stored) return c.html(<ErrorPage status={404} message="That evidence file is missing." />, 404);

    const bytes = await ctx.store.decryptBlob(session.dek, session.memberId, stored);
    c.header('content-type', 'application/octet-stream');
    c.header('content-disposition', `attachment; filename="${record.kind}-${record.id}"`);
    return c.body(toArrayBuffer(bytes));
  });

  // --- account -------------------------------------------------------------

  app.get('/account', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;

    const row = await ctx.store.getMemberRow(session.memberId);
    if (!row) return c.redirect('/login');
    const detail = await ctx.store.toMember(row, session.dek);

    return c.html(
      <AccountPage
        csrf={session.csrf}
        email={detail.email}
        jurisdiction={detail.jurisdiction}
        consents={await ctx.store.listConsents(session.memberId)}
        mandate={await ctx.store.activeMandate(session.memberId)}
      />,
    );
  });

  app.get('/account/export.json', async (c) => {
    const session = await requireMember(c);
    if (session instanceof Response) return session;
    const bundle = await exportMemberData(ctx, session);
    c.header('content-disposition', 'attachment; filename="deletewe-export.json"');
    return c.json(bundle);
  });

  app.post('/account/revoke', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    await revokeAuthority(ctx, result.session.memberId);
    return c.redirect('/account');
  });

  app.post('/account/delete', async (c) => {
    const result = await guard(c);
    if (result instanceof Response) return result;
    const { session, form } = result;

    if (text(form, 'confirm').toLowerCase() !== 'delete my account') {
      return c.html(<ErrorPage status={400} message="Type the confirmation phrase exactly to delete the account." />, 400);
    }
    await deleteAccount(ctx, { memberId: session.memberId });
    await endSession(c, ctx.store);
    return c.redirect('/');
  });

  // --- admin ---------------------------------------------------------------

  app.get('/admin/login', async (c) => {
    const session = await startSession(c, ctx.store, { secure, admin: true });
    return c.html(<AdminLoginPage csrf={session.csrfToken} />);
  });

  app.post('/admin/login', async (c) => {
    const session = await readSession(c, ctx.store, true);
    const form = await c.req.formData();
    if (!session || !csrfValid(session.csrfToken, form.get('csrf'))) {
      return c.html(<AdminLoginPage csrf={session?.csrfToken ?? ''} error="That form expired. Try again." />, 403);
    }

    const admin = await ctx.store.findAdmin(text(form, 'username'));
    const invalid = <AdminLoginPage csrf={session.csrfToken} error="Those details did not match an operator." />;
    if (!admin) return c.html(invalid, 401);
    if (!(await verifyPassword(text(form, 'password'), admin.passwordHash))) return c.html(invalid, 401);

    await startSession(c, ctx.store, { adminId: admin.id, secure, admin: true });
    await ctx.store.recordAdminAction({ adminId: admin.id, action: 'login' });
    return c.redirect('/admin');
  });

  const requireAdmin = async (c: Context) => {
    const session = await readSession(c, ctx.store, true);
    return session?.adminId ? session : undefined;
  };

  app.get('/admin', async (c) => {
    const session = await requireAdmin(c);
    if (!session) return c.redirect('/admin/login');

    const jobs = await ctx.store.recentJobs(200);
    const counts: Record<string, number> = {};
    for (const job of jobs) counts[job.state] = (counts[job.state] ?? 0) + 1;
    return c.html(<AdminJobsPage jobs={jobs} counts={counts} />);
  });

  app.get('/admin/brokers', async (c) => {
    const session = await requireAdmin(c);
    if (!session) return c.redirect('/admin/login');

    const brokers = await ctx.store.listBrokers();
    const rows = [];
    for (const broker of brokers) {
      const health = await ctx.store.healthSummary(broker.id, HEALTH_WINDOW_MS);
      rows.push({ broker, ...health });
    }
    return c.html(<AdminBrokersPage rows={rows} csrf={session.csrfToken} />);
  });

  app.post('/admin/brokers/:id/status', async (c) => {
    const result = await adminGuard(c);
    if (result instanceof Response) return result;
    const status = text(result.form, 'status');
    if (['healthy', 'degraded', 'broken', 'disabled'].includes(status)) {
      await ctx.store.setBrokerStatus(c.req.param('id'), status as 'healthy');
      await ctx.store.recordAdminAction({
        adminId: result.adminId,
        action: `broker_status:${c.req.param('id')}:${status}`,
      });
    }
    return c.redirect('/admin/brokers');
  });

  app.get('/admin/queue', async (c) => {
    const session = await requireAdmin(c);
    if (!session) return c.redirect('/admin/login');
    return c.html(<AdminQueuePage items={await ctx.store.listOperatorTaskSummaries('open')} csrf={session.csrfToken} />);
  });

  app.post('/admin/queue/:id/resolve', async (c) => {
    const result = await adminGuard(c);
    if (result instanceof Response) return result;

    const items = await ctx.store.listOperatorTaskSummaries('open');
    const item = items.find((i) => i.id === c.req.param('id'));
    if (item) {
      await ctx.store.completeTask(item.memberId, item.id, 'done');
      await ctx.store.recordAdminAction({
        adminId: result.adminId,
        action: 'resolve_review_item',
        subjectMemberId: item.memberId,
      });
    }
    return c.redirect('/admin/queue');
  });

  app.get('/admin/audit', async (c) => {
    const session = await requireAdmin(c);
    if (!session) return c.redirect('/admin/login');
    return c.html(<AdminAuditPage entries={await ctx.store.listAdminAudit()} />);
  });

  // --- errors --------------------------------------------------------------

  app.notFound((c) => c.html(<ErrorPage status={404} message="No such page." />, 404));

  app.onError((error, c) => {
    const message = isEngineError(error) ? error.message : 'Something went wrong. The operators have been told.';
    ctx.log.error('request_failed', { path: c.req.path, errorCode: isEngineError(error) ? error.code : 'internal' });
    return c.html(<ErrorPage status={500} message={message} />, 500);
  });

  return app;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
