import type { FC } from 'hono/jsx';
import type { BrokerRow, CaseFile, CaseState, FieldComparison, Identifier, Listing, Task } from '@deletewe/engine';
import { Layout, MEMBER_NAV } from './layout.tsx';

const Csrf: FC<{ token: string }> = ({ token }) => <input type="hidden" name="csrf" value={token} />;

const STATE_LABEL: Readonly<Record<CaseState, { text: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }>> = {
  discovered: { text: 'found', tone: 'idle' },
  matched: { text: 'found', tone: 'idle' },
  awaiting_consent: { text: 'needs your decision', tone: 'warn' },
  rejected: { text: 'not you', tone: 'idle' },
  queued: { text: 'queued to send', tone: 'idle' },
  task_pending: { text: 'waiting for you', tone: 'warn' },
  submitted: { text: 'sent', tone: 'idle' },
  awaiting_verification: { text: 'awaiting confirmation', tone: 'idle' },
  acknowledged: { text: 'acknowledged, verifying', tone: 'idle' },
  removed: { text: 'removed', tone: 'ok' },
  relisted: { text: 're-listed', tone: 'bad' },
  needs_review: { text: 'blocked', tone: 'bad' },
};

export const StatePill: FC<{ state: CaseState }> = ({ state }) => {
  const label = STATE_LABEL[state];
  return <span class={`pill ${label.tone}`}>{label.text}</span>;
};

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// --- Marketing / entry -----------------------------------------------------

export const HomePage: FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Layout title="Home" nav={signedIn ? MEMBER_NAV('') : [{ href: '/signup', label: 'Sign up' }, { href: '/login', label: 'Log in' }]}>
    <h1>Get your personal data off the brokers, and keep it off.</h1>
    <p class="lede">
      deletewe finds your records on data brokers and people-search sites, asks you whether each one is
      really you, requests its removal as your authorized agent, keeps the evidence, and checks again
      later because brokers re-list people.
    </p>

    <div class="card">
      <h2 style="margin-top:0">What it will not do</h2>
      <ul>
        <li>Look anybody up except you. There is no mechanism for it, by design.</li>
        <li>Solve a CAPTCHA, bypass a login, or evade a bot check. Those steps come to you instead.</li>
        <li>Promise erasure. Independent testing puts the realistic ceiling around 70–80%, with persistent re-checking.</li>
      </ul>
    </div>

    <p class="row">
      <a class="btn" href="/signup">Create an account</a>
      <a class="btn secondary" href="/login">Log in</a>
    </p>
  </Layout>
);

export const LoginPage: FC<{ error?: string; csrf: string }> = ({ error, csrf }) => (
  <Layout title="Log in" nav={[{ href: '/signup', label: 'Sign up' }]} flash={error ? { kind: 'bad', message: error } : undefined}>
    <h1>Log in</h1>
    <form method="post" action="/login" class="card">
      <Csrf token={csrf} />
      <label>
        Email
        <input type="email" name="email" required autocomplete="username" />
      </label>
      <label>
        Password
        <input type="password" name="password" required autocomplete="current-password" />
      </label>
      <p>
        <button type="submit">Log in</button>
      </p>
    </form>
  </Layout>
);

export const SignupPage: FC<{ error?: string; csrf: string; consentDocument: string }> = ({
  error,
  csrf,
  consentDocument,
}) => (
  <Layout title="Sign up" nav={[{ href: '/login', label: 'Log in' }]} flash={error ? { kind: 'bad', message: error } : undefined}>
    <h1>Create your account</h1>
    <p class="lede">Read this before you agree to it. Nothing is ticked for you.</p>

    <form method="post" action="/signup" class="card">
      <Csrf token={csrf} />
      <label>
        Email
        <input type="email" name="email" required autocomplete="username" />
        <span class="hint">Used to sign in and to send you reports. Stored encrypted.</span>
      </label>
      <label>
        Password
        <input type="password" name="password" required minlength={12} autocomplete="new-password" />
        <span class="hint">At least 12 characters.</span>
      </label>
      <label>
        Where you live
        <select name="jurisdiction">
          <option value="US-CA">California, USA</option>
          <option value="US-TX">Texas, USA</option>
          <option value="US-OR">Oregon, USA</option>
          <option value="US">Elsewhere in the USA</option>
          <option value="GB">United Kingdom</option>
          <option value="EU">European Union</option>
        </select>
        <span class="hint">Decides which law we cite and which statutory channels you can use.</span>
      </label>

      <h2>What you are agreeing to</h2>
      <div class="doc">{consentDocument}</div>

      <div class="consent">
        <input type="checkbox" id="c1" name="consent" value="process_pii" required />
        <label for="c1" style="margin:0">
          Hold and process my personal data to find records about me.
          <span class="hint">Required. Without it there is nothing to search with.</span>
        </label>
      </div>
      <div class="consent">
        <input type="checkbox" id="c2" name="consent" value="contact_brokers" required />
        <label for="c2" style="margin:0">
          Contact data brokers on my behalf, for listings I have confirmed.
          <span class="hint">Required. Each broker receives only the fields its own form needs.</span>
        </label>
      </div>
      <div class="consent">
        <input type="checkbox" id="c3" name="consent" value="store_evidence" required />
        <label for="c3" style="margin:0">
          Store screenshots and transcripts as proof of what happened.
          <span class="hint">Required. Without evidence you have only our word for it.</span>
        </label>
      </div>
      <div class="consent">
        <input type="checkbox" id="c4" name="consent" value="email_updates" />
        <label for="c4" style="margin:0">
          Email me when something needs my attention.
          <span class="hint">Optional.</span>
        </label>
      </div>

      <p>
        <button type="submit">Create account</button>
      </p>
    </form>
  </Layout>
);

export const MandatePage: FC<{ csrf: string; documentText: string; error?: string }> = ({ csrf, documentText, error }) => (
  <Layout title="Authorize" nav={MEMBER_NAV('')} flash={error ? { kind: 'bad', message: error } : undefined}>
    <h1>Appoint us as your agent</h1>
    <p class="lede">
      We cannot ask a broker for anything until you have signed this. Brokers are entitled to proof that
      we act for you, and several of them ask for it.
    </p>

    <form method="post" action="/mandate" class="card">
      <Csrf token={csrf} />
      <div class="doc">{documentText}</div>

      <label>
        Type your full legal name to sign
        <input type="text" name="signature" required minlength={2} autocomplete="name" />
      </label>
      <label>
        Kind of authority
        <select name="kind">
          <option value="authorized_agent">Authorized agent (covers most brokers)</option>
          <option value="limited_power_of_attorney">
            Limited power of attorney (also covers brokers that demand one)
          </option>
        </select>
        <span class="hint">
          A limited power of attorney removes an extra verification step at some brokers. It is confined to
          data removal and nothing else. You can revoke either at any time.
        </span>
      </label>
      <p>
        <button type="submit">Sign and continue</button>
      </p>
    </form>
  </Layout>
);

// --- Dashboard -------------------------------------------------------------

export interface DashboardRow {
  readonly caseFile: CaseFile;
  readonly broker: BrokerRow | undefined;
  readonly evidenceCount: number;
}

export const DashboardPage: FC<{
  rows: readonly DashboardRow[];
  pendingReviews: number;
  openTasks: number;
  totals: { removed: number; sent: number; waitingOnYou: number; blocked: number; found: number };
  hasMandate: boolean;
  dropPrompt?: 'available' | 'submitted';
}> = ({ rows, pendingReviews, openTasks, totals, hasMandate, dropPrompt }) => (
  <Layout title="Dashboard" nav={MEMBER_NAV('/dashboard')}>
    <h1>Where you stand</h1>

    {!hasMandate ? (
      <div class="notice warn">
        You have not appointed us as your agent yet, so nothing will be sent.{' '}
        <a href="/mandate">Sign the authorization</a>.
      </div>
    ) : null}
    {dropPrompt === 'available' ? (
      <div class="notice">
        You are in California, so one free state request reaches every registered broker at once — more than
        this instance covers on its own. <a href="/drop">Start with that</a>.
      </div>
    ) : null}
    {pendingReviews > 0 ? (
      <div class="notice warn">
        {pendingReviews} listing{pendingReviews === 1 ? '' : 's'} need{pendingReviews === 1 ? 's' : ''} your
        decision before we contact anyone. <a href="/review">Review them</a>.
      </div>
    ) : null}
    {openTasks > 0 ? (
      <div class="notice warn">
        {openTasks} step{openTasks === 1 ? '' : 's'} only you can do. <a href="/tasks">See them</a>.
      </div>
    ) : null}

    <div class="grid">
      <div class="stat">
        <b>{totals.removed}</b>
        <span>removed</span>
      </div>
      <div class="stat">
        <b>{totals.sent}</b>
        <span>sent, awaiting the broker</span>
      </div>
      <div class="stat">
        <b>{totals.waitingOnYou}</b>
        <span>waiting on you</span>
      </div>
      <div class="stat">
        <b>{totals.blocked}</b>
        <span>blocked</span>
      </div>
      <div class="stat">
        <b>{totals.found}</b>
        <span>listings found</span>
      </div>
    </div>

    <h2>Per broker</h2>
    {rows.length === 0 ? (
      <div class="card">
        <p style="margin:0">
          Nothing found yet. Fill in your <a href="/profile">profile</a>, then start a scan from there.
        </p>
      </div>
    ) : (
      <div class="card scroll">
        <table>
          <thead>
            <tr>
              <th>Broker</th>
              <th>Status</th>
              <th>Automation</th>
              <th>Attempts</th>
              <th>Evidence</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr>
                <td>
                  <a href={`/cases/${row.caseFile.id}`}>{row.broker?.name ?? row.caseFile.brokerId}</a>
                </td>
                <td>
                  <StatePill state={row.caseFile.state} />
                </td>
                <td class="muted">{row.broker?.automationLevel ?? 'unknown'}</td>
                <td>{row.caseFile.attemptCount}</td>
                <td>{row.evidenceCount}</td>
                <td class="muted">{date(row.caseFile.openedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <p class="muted">
      “Removed” means a later scan of that broker found nothing — not that the broker promised anything.
    </p>
  </Layout>
);

// --- Review ----------------------------------------------------------------

export interface ReviewRow {
  readonly listing: Listing;
  readonly brokerName: string;
  readonly score: number;
  readonly comparisons: readonly FieldComparison[];
}

export const ReviewPage: FC<{ rows: readonly ReviewRow[]; csrf: string }> = ({ rows, csrf }) => (
  <Layout title="Review" nav={MEMBER_NAV('/review')}>
    <h1>Is this you?</h1>
    <p class="lede">
      We will not contact a broker about a listing until you say it is yours. Getting this wrong would
      mean sending a stranger’s record to a broker under your name, so the default is to ask.
    </p>

    {rows.length === 0 ? (
      <div class="card">
        <p style="margin:0">Nothing waiting on you right now.</p>
      </div>
    ) : (
      rows.map((row) => (
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <h2 style="margin:0">{row.brokerName}</h2>
            <span class="pill idle">confidence {Math.round(row.score * 100)}%</span>
          </div>
          <div class="bar">
            <i style={`width:${String(Math.round(row.score * 100))}%`} />
          </div>

          <table class="compare">
            <thead>
              <tr>
                <th>Field</th>
                <th>Your profile</th>
                <th>Their listing</th>
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {row.comparisons.map((c) => (
                <tr>
                  <td>{c.field}</td>
                  <td>{c.profileValue}</td>
                  <td>{c.listingValue}</td>
                  <td>{Math.round(c.similarity * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p class="muted" style="font-size:.85rem">
            Listing: <a href={row.listing.url} rel="noreferrer nofollow">{row.listing.url}</a>
          </p>

          <form method="post" action={`/review/${row.listing.id}`} class="row">
            <Csrf token={csrf} />
            <button type="submit" name="decision" value="confirm">
              Yes, remove it
            </button>
            <button type="submit" name="decision" value="reject" class="secondary">
              No, that is not me
            </button>
          </form>
        </div>
      ))
    )}
  </Layout>
);

// --- Tasks -----------------------------------------------------------------

export const TasksPage: FC<{ tasks: readonly Task[]; csrf: string }> = ({ tasks, csrf }) => (
  <Layout title="Your tasks" nav={MEMBER_NAV('/tasks')}>
    <h1>Steps only you can do</h1>
    <p class="lede">
      Some brokers put a CAPTCHA, an identity check, or a phone call in the way. We stop there on purpose
      and hand you the work with everything filled in. We never solve a CAPTCHA, and we never hold a copy
      of your ID.
    </p>

    {tasks.length === 0 ? (
      <div class="card">
        <p style="margin:0">Nothing waiting on you.</p>
      </div>
    ) : (
      tasks.map((task) => (
        <div class="card">
          <h2 style="margin-top:0">{task.title}</h2>
          <p>{task.instructions}</p>

          {task.prefill ? (
            <table class="compare">
              <tbody>
                {Object.entries(task.prefill).map(([key, value]) => (
                  <tr>
                    <td>{key.replace(/_/g, ' ')}</td>
                    <td>
                      <code>{value}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <form method="post" action={`/tasks/${task.id}`} class="row">
            <Csrf token={csrf} />
            {task.deepLink ? (
              <a class="btn secondary" href={task.deepLink} rel="noreferrer nofollow" target="_blank">
                Open the broker’s page
              </a>
            ) : null}
            <button type="submit" name="state" value="done">
              I have done this
            </button>
            <button type="submit" name="state" value="skipped" class="secondary">
              Skip for now
            </button>
          </form>
          {task.dueAt ? <p class="muted" style="font-size:.85rem">Best done before {date(task.dueAt)}.</p> : null}
        </div>
      ))
    )}
  </Layout>
);

// --- Profile ---------------------------------------------------------------

export const ProfilePage: FC<{ identifiers: readonly Identifier[]; csrf: string; scanQueued?: number }> = ({
  identifiers,
  csrf,
  scanQueued,
}) => (
  <Layout
    title="Profile"
    nav={MEMBER_NAV('/profile')}
    flash={scanQueued !== undefined ? { kind: 'info', message: `Queued scans at ${String(scanQueued)} brokers.` } : undefined}
  >
    <h1>Your profile</h1>
    <p class="lede">
      Only what is needed to find records about you. Every field beyond one name and one email is optional:
      more detail finds more listings and matches them more confidently, and also means more disclosure.
      Your call, field by field.
    </p>

    <div class="card">
      <h2 style="margin-top:0">What we hold</h2>
      {identifiers.length === 0 ? (
        <p class="muted">Nothing yet.</p>
      ) : (
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Value</th>
                <th>Current</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {identifiers.map((identifier) => (
                <tr>
                  <td>{identifier.data.kind}</td>
                  <td>{describe(identifier)}</td>
                  <td class="muted">{identifier.isCurrent ? 'yes' : 'past'}</td>
                  <td>
                    <form method="post" action={`/profile/${identifier.id}/delete`}>
                      <Csrf token={csrf} />
                      <button type="submit" class="secondary">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <div class="card">
      <h2 style="margin-top:0">Add a name</h2>
      <form method="post" action="/profile/name">
        <Csrf token={csrf} />
        <div class="row">
          <input type="text" name="first" placeholder="First" required style="flex:1" />
          <input type="text" name="middle" placeholder="Middle (optional)" style="flex:1" />
          <input type="text" name="last" placeholder="Last" required style="flex:1" />
        </div>
        <label>
          Kind
          <select name="kind">
            <option value="name">My name</option>
            <option value="alias">A former name or alias</option>
          </select>
          <span class="hint">Brokers index maiden and former names separately, so these are worth adding.</span>
        </label>
        <p><button type="submit">Add</button></p>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Add an address</h2>
      <form method="post" action="/profile/address">
        <Csrf token={csrf} />
        <input type="text" name="line1" placeholder="Street address" required />
        <div class="row" style="margin-top:.6rem">
          <input type="text" name="city" placeholder="City" required style="flex:2" />
          <input type="text" name="region" placeholder="State" required style="flex:1" />
          <input type="text" name="postalCode" placeholder="ZIP" required style="flex:1" />
        </div>
        <label>
          <input type="checkbox" name="isCurrent" value="1" checked /> I live here now
          <span class="hint">
            Past addresses matter: brokers key heavily on address history, and it is often what tells you
            apart from someone with the same name.
          </span>
        </label>
        <p><button type="submit">Add</button></p>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Add a contact detail</h2>
      <form method="post" action="/profile/contact">
        <Csrf token={csrf} />
        <div class="row">
          <select name="kind" style="flex:1">
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="dob">Date of birth (YYYY-MM-DD)</option>
          </select>
          <input type="text" name="value" required style="flex:2" />
        </div>
        <p><button type="submit">Add</button></p>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Scan now</h2>
      <p class="muted">
        Queues a search at every broker that applies to you. Anything found comes back to you for a
        decision before we contact anyone.
      </p>
      <form method="post" action="/scan">
        <Csrf token={csrf} />
        <button type="submit">Start a scan</button>
      </form>
    </div>
  </Layout>
);

function describe(identifier: Identifier): string {
  const d = identifier.data;
  switch (d.kind) {
    case 'name':
    case 'alias':
      return [d.value.first, d.value.middle, d.value.last].filter(Boolean).join(' ');
    case 'address':
      return `${d.value.line1}, ${d.value.city}, ${d.value.region} ${d.value.postalCode}`;
    default:
      return d.value;
  }
}

// --- Case detail -----------------------------------------------------------

export const CasePage: FC<{
  caseFile: CaseFile;
  brokerName: string;
  listing: Listing | undefined;
  evidence: readonly { id: string; kind: string; sha256: string; capturedAt: number; bytes: number }[];
  events: readonly { type: string; at: number; actor: string }[];
}> = ({ caseFile, brokerName, listing, evidence, events }) => (
  <Layout title={brokerName} nav={MEMBER_NAV('/dashboard')}>
    <h1>{brokerName}</h1>
    <p class="row">
      <StatePill state={caseFile.state} />
      <span class="muted">opened {date(caseFile.openedAt)}</span>
      {caseFile.nextCheckAt ? <span class="muted">next check {date(caseFile.nextCheckAt)}</span> : null}
    </p>

    {listing ? (
      <div class="card">
        <h2 style="margin-top:0">What they published</h2>
        <table class="compare">
          <tbody>
            {Object.entries(listing.snapshot).map(([key, value]) =>
              value ? (
                <tr>
                  <td>{key}</td>
                  <td>{value}</td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
        <p class="muted" style="font-size:.85rem">
          <a href={listing.url} rel="noreferrer nofollow">{listing.url}</a>
        </p>
      </div>
    ) : null}

    <div class="card">
      <h2 style="margin-top:0">Evidence</h2>
      {evidence.length === 0 ? (
        <p class="muted">Nothing captured yet.</p>
      ) : (
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Captured</th>
                <th>Size</th>
                <th>SHA-256</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {evidence.map((record) => (
                <tr>
                  <td>{record.kind}</td>
                  <td class="muted">{date(record.capturedAt)}</td>
                  <td class="muted">{record.bytes} B</td>
                  <td>
                    <code style="font-size:.72rem">{record.sha256.slice(0, 16)}…</code>
                  </td>
                  <td>
                    <a href={`/evidence/${record.id}`}>Download</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <div class="card">
      <h2 style="margin-top:0">History</h2>
      <table class="compare">
        <tbody>
          {events.map((event) => (
            <tr>
              <td>{date(event.at)}</td>
              <td>{event.type.replace(/_/g, ' ')}</td>
              <td class="muted">{event.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Layout>
);

// --- Reports ---------------------------------------------------------------

export const ReportsPage: FC<{
  reports: readonly { id: string; periodStart: number; periodEnd: number; generatedAt: number; blobKey: string | null }[];
  csrf: string;
}> = ({ reports, csrf }) => (
  <Layout title="Reports" nav={MEMBER_NAV('/reports')}>
    <h1>Reports</h1>
    <p class="lede">
      A period snapshot of where every broker stands, with the evidence behind each claim.
    </p>

    <form method="post" action="/reports" class="card">
      <input type="hidden" name="csrf" value={csrf} />
      <button type="submit">Generate one now</button>
    </form>

    {reports.length === 0 ? (
      <div class="card">
        <p style="margin:0" class="muted">No reports yet.</p>
      </div>
    ) : (
      <div class="card scroll">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Generated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr>
                <td>
                  {date(report.periodStart)} – {date(report.periodEnd)}
                </td>
                <td class="muted">{date(report.generatedAt)}</td>
                <td>
                  {report.blobKey ? (
                    <a href={`/reports/${report.id}/download.pdf`}>PDF</a>
                  ) : (
                    <span class="muted">file unavailable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Layout>
);

// --- Account ---------------------------------------------------------------

export const AccountPage: FC<{
  email: string;
  jurisdiction: string;
  consents: readonly { purpose: string; granted: boolean; grantedAt: number; revokedAt: number | null }[];
  mandate: { kind: string } | undefined;
  csrf: string;
}> = ({ email, jurisdiction, consents, mandate, csrf }) => (
  <Layout title="Account" nav={MEMBER_NAV('/account')}>
    <h1>Account</h1>

    <div class="card">
      <table class="compare">
        <tbody>
          <tr>
            <td>Email</td>
            <td>{email}</td>
          </tr>
          <tr>
            <td>Jurisdiction</td>
            <td>{jurisdiction}</td>
          </tr>
          <tr>
            <td>Authority</td>
            <td>{mandate ? mandate.kind.replace(/_/g, ' ') : <span class="muted">none — nothing will be sent</span>}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Consents</h2>
      <table class="compare">
        <tbody>
          {consents.map((consent) => (
            <tr>
              <td>{consent.purpose.replace(/_/g, ' ')}</td>
              <td>
                {consent.revokedAt ? (
                  <span class="pill idle">revoked</span>
                ) : consent.granted ? (
                  <span class="pill ok">granted</span>
                ) : (
                  <span class="pill idle">declined</span>
                )}
              </td>
              <td class="muted">{date(consent.grantedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Export everything</h2>
      <p class="muted">
        A JSON bundle of every record this instance holds about you, with the SHA-256 of each piece of
        evidence so you can verify it.
      </p>
      <p>
        <a class="btn secondary" href="/account/export.json">Download export</a>
      </p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Stop all activity</h2>
      <p class="muted">
        Revokes your authorization and pauses the account. Nothing further is sent to any broker. Your data
        stays until you delete it.
      </p>
      <form method="post" action="/account/revoke">
        <input type="hidden" name="csrf" value={csrf} />
        <button type="submit" class="secondary">Revoke authority and pause</button>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Delete the account</h2>
      <p class="muted">
        Immediate and irreversible. Your encryption key is destroyed first, which makes anything stored
        under it unreadable, and then the records and evidence files are deleted. There is no support
        ticket and no waiting period.
      </p>
      <form method="post" action="/account/delete">
        <input type="hidden" name="csrf" value={csrf} />
        <label>
          Type <code>delete my account</code> to confirm
          <input type="text" name="confirm" required />
        </label>
        <p>
          <button type="submit" class="danger">Delete everything</button>
        </p>
      </form>
    </div>
  </Layout>
);

export const ErrorPage: FC<{ status: number; message: string }> = ({ status, message }) => (
  <Layout title={`Error ${String(status)}`}>
    <h1>Something went wrong</h1>
    <div class="notice bad">{message}</div>
    <p>
      <a href="/dashboard">Back to your dashboard</a>
    </p>
  </Layout>
);

// --- California DROP -------------------------------------------------------

export interface DropView {
  readonly eligible: boolean;
  readonly state: string;
  readonly reference: string | null;
  readonly submittedAt: number | null;
  readonly brokersMustRetrieveBy: number | null;
  readonly amendableFrom: number | null;
  readonly statusMeaningfulFrom: number | null;
  readonly steps: readonly { ordinal: number; title: string; detail: string; url?: string }[];
  readonly agentDisclosure: { fullName: string; email: string; tradeName?: string } | undefined;
}

export const DropPage: FC<{ view: DropView; csrf: string; now: number; error?: string }> = ({
  view,
  csrf,
  now,
  error,
}) => (
  <Layout
    title="California DROP"
    nav={MEMBER_NAV('/drop')}
    flash={error ? { kind: 'bad', message: error } : undefined}
  >
    <h1>One request, every registered broker</h1>
    <p class="lede">
      California runs a single deletion request that reaches every data broker registered with the state —
      including ones this instance has no procedure for. It is free. If you do nothing else here, do this.
    </p>

    {!view.eligible ? (
      <div class="notice warn">
        DROP covers California residents only. Your account is set to a different jurisdiction, so this
        channel is not open to you. Everything else on your dashboard still applies.
      </div>
    ) : null}

    <div class="card">
      <h2 style="margin-top:0">Why you have to do this part</h2>
      <p>
        We submit opt-outs for you everywhere else. Not here, and not because we could not be bothered: the
        portal verifies your California residency through a government identity check, and the regulations
        let an authorized agent <em>aid</em> a request rather than make one. Nobody can pass that check for
        you.
      </p>
      <p class="muted" style="font-size:.85rem">
        Cal. Code Regs. tit. 11 §§ 7620(a), 7621(a). The DROP API that does exist is for data brokers
        retrieving deletion lists — a role we are not in and will not register for.
      </p>
    </div>

    {view.agentDisclosure ? (
      <div class="card">
        <h2 style="margin-top:0">Enter these as your authorized agent</h2>
        <p class="muted">
          § 7621(b) requires the agent's details to be in your DROP account <em>before</em> you submit.
          Copy them exactly. If you would rather not name an agent, skip it — the request works the same and
          we simply will not appear on it.
        </p>
        <table class="compare">
          <tbody>
            <tr>
              <td>Full name</td>
              <td><code>{view.agentDisclosure.fullName}</code></td>
            </tr>
            <tr>
              <td>Email</td>
              <td><code>{view.agentDisclosure.email}</code></td>
            </tr>
            {view.agentDisclosure.tradeName ? (
              <tr>
                <td>Trade name</td>
                <td><code>{view.agentDisclosure.tradeName}</code></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    ) : null}

    {view.state === 'submitted' || view.state === 'processing' ? (
      <div class="card">
        <h2 style="margin-top:0">Your request is in</h2>
        <table class="compare">
          <tbody>
            {view.reference ? (
              <tr>
                <td>Reference</td>
                <td><code>{view.reference}</code></td>
              </tr>
            ) : null}
            <tr>
              <td>Submitted</td>
              <td>{view.submittedAt ? date(view.submittedAt) : 'unknown'}</td>
            </tr>
            <tr>
              <td>Brokers must have retrieved it by</td>
              <td>
                {view.brokersMustRetrieveBy ? date(view.brokersMustRetrieveBy) : '—'}{' '}
                {view.brokersMustRetrieveBy && now > view.brokersMustRetrieveBy ? (
                  <span class="pill ok">elapsed</span>
                ) : (
                  <span class="pill idle">pending</span>
                )}
              </td>
            </tr>
            <tr>
              <td>You can amend or cancel from</td>
              <td>{view.amendableFrom ? date(view.amendableFrom) : '—'}</td>
            </tr>
            <tr>
              <td>Status should be meaningful by</td>
              <td>{view.statusMeaningfulFrom ? date(view.statusMeaningfulFrom) : '—'}</td>
            </tr>
          </tbody>
        </table>
        <p class="row">
          <a class="btn secondary" href="https://consumer.drop.privacy.ca.gov/dropstatus" rel="noreferrer">
            Check your status at the state portal
          </a>
        </p>
        <p class="muted" style="font-size:.85rem">
          A data broker is forbidden from contacting you to verify a DROP request (§ 7616(c)). Treat any
          email claiming to do so as suspect.
        </p>
      </div>
    ) : (
      <>
        <div class="card">
          <h2 style="margin-top:0">What to do</h2>
          <ol>
            {view.steps.map((step) => (
              <li style="margin-bottom:.75rem">
                <strong>{step.title}</strong>
                <br />
                {step.detail}
                {step.url ? (
                  <>
                    <br />
                    <a href={step.url} rel="noreferrer">{step.url}</a>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        {view.eligible ? (
          <form method="post" action="/drop" class="card">
            <Csrf token={csrf} />
            <h2 style="margin-top:0">Tell us once you have submitted it</h2>
            <p class="muted">
              We cannot see your DROP account, so this is you telling us. We take your word for the act, not
              the outcome — what we do with it is start the statutory clock and remind you to check.
            </p>
            <label>
              Reference number (optional)
              <input type="text" name="reference" placeholder="as shown by the portal" />
              <span class="hint">Stored encrypted, like everything else. Leave blank if you did not note it.</span>
            </label>
            <label>
              Date submitted
              <input type="date" name="submittedAt" />
              <span class="hint">Leave blank for today.</span>
            </label>
            <p>
              <button type="submit">I have submitted my DROP request</button>
            </p>
          </form>
        ) : null}
      </>
    )}
  </Layout>
);
