import type { FC } from 'hono/jsx';
import type { BrokerRow, JobRecord } from '@deletewe/engine';
import { Layout } from './layout.tsx';

const ADMIN_NAV = (current: string) =>
  [
    { href: '/admin', label: 'Jobs' },
    { href: '/admin/brokers', label: 'Broker health' },
    { href: '/admin/queue', label: 'Review queue' },
    { href: '/admin/audit', label: 'Audit log' },
  ].map((item) => ({ ...item, current: item.href === current }));

const time = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

const PRIVACY_NOTE = (
  <p class="muted" style="font-size:.85rem">
    This console shows identifiers and status only. It never displays a member’s decrypted personal data;
    reading that requires an explicit break-glass action, which is written to the audit log and shown to
    the member in their own history.
  </p>
);

export const AdminLoginPage: FC<{ csrf: string; error?: string }> = ({ csrf, error }) => (
  <Layout title="Admin" flash={error ? { kind: 'bad', message: error } : undefined}>
    <h1>Operator login</h1>
    <form method="post" action="/admin/login" class="card">
      <input type="hidden" name="csrf" value={csrf} />
      <label>
        Username
        <input type="text" name="username" required autocomplete="username" />
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

export const AdminJobsPage: FC<{ jobs: readonly JobRecord[]; counts: Record<string, number> }> = ({ jobs, counts }) => (
  <Layout title="Jobs" nav={ADMIN_NAV('/admin')}>
    <h1>Jobs</h1>
    <div class="grid">
      {Object.entries(counts).map(([state, count]) => (
        <div class="stat">
          <b>{count}</b>
          <span>{state}</span>
        </div>
      ))}
    </div>

    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Kind</th>
            <th>State</th>
            <th>Attempt</th>
            <th>Error</th>
            <th>Member</th>
            <th>Run after</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr>
              <td><code style="font-size:.72rem">{job.id.slice(-8)}</code></td>
              <td>{job.kind}</td>
              <td>
                <span class={`pill ${job.state === 'failed' ? 'bad' : job.state === 'succeeded' ? 'ok' : 'idle'}`}>
                  {job.state}
                </span>
              </td>
              <td>{job.attempt}/{job.maxAttempts}</td>
              <td class="muted">{job.errorCode ?? ''}</td>
              <td><code style="font-size:.72rem">{job.memberId.slice(-8)}</code></td>
              <td class="muted">{time(job.runAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {PRIVACY_NOTE}
  </Layout>
);

export interface BrokerHealthRow {
  readonly broker: BrokerRow;
  readonly total: number;
  readonly failures: number;
  readonly lastFailureKind: string | null;
}

export const AdminBrokersPage: FC<{ rows: readonly BrokerHealthRow[]; csrf: string }> = ({ rows, csrf }) => (
  <Layout title="Broker health" nav={ADMIN_NAV('/admin/brokers')}>
    <h1>Broker health</h1>
    <p class="lede">
      A broker changing its page layout looks, from outside, exactly like a broker ignoring the request.
      Failures here are counted against the <em>definition</em>, never recorded as a refusal, and a broken
      broker is paused rather than retried into the ground.
    </p>

    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th>Broker</th>
            <th>Status</th>
            <th>Automation</th>
            <th>Method</th>
            <th>Runs (7d)</th>
            <th>Failures</th>
            <th>Last failure</th>
            <th>Verified live</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              <td>{row.broker.name}</td>
              <td>
                <span
                  class={`pill ${
                    row.broker.status === 'healthy' ? 'ok' : row.broker.status === 'broken' ? 'bad' : 'warn'
                  }`}
                >
                  {row.broker.status}
                </span>
              </td>
              <td class="muted">{row.broker.automationLevel}</td>
              <td class="muted">{row.broker.optOutMethod}</td>
              <td>{row.total}</td>
              <td>{row.failures}</td>
              <td class="muted">{row.lastFailureKind ?? ''}</td>
              <td>
                {row.broker.verifiedAt ? (
                  <span class="pill ok">{row.broker.verifiedAt}</span>
                ) : (
                  <span class="pill warn">never</span>
                )}
              </td>
              <td>
                <form method="post" action={`/admin/brokers/${row.broker.id}/status`}>
                  <input type="hidden" name="csrf" value={csrf} />
                  <select name="status">
                    <option value="healthy">healthy</option>
                    <option value="degraded">degraded</option>
                    <option value="broken">broken</option>
                    <option value="disabled">disabled</option>
                  </select>
                  <button type="submit" class="secondary">Set</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <p class="muted">
      “Verified live: never” means the procedure was written from public documentation and has not been run
      against the real site. Until that changes, treat its coverage as theoretical.
    </p>
  </Layout>
);

export const AdminQueuePage: FC<{
  items: readonly { id: string; memberId: string; caseId: string | null; kind: string; title: string; createdAt: number }[];
  csrf: string;
}> = ({ items, csrf }) => (
  <Layout title="Review queue" nav={ADMIN_NAV('/admin/queue')}>
    <h1>Review queue</h1>
    <p class="lede">
      Work the engine could not finish and the member cannot do either: ambiguous confirmation mail,
      definitions that have stopped matching their site, brokers refusing repeated requests.
    </p>

    {items.length === 0 ? (
      <div class="card">
        <p style="margin:0">Queue is empty.</p>
      </div>
    ) : (
      <div class="card scroll">
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Summary</th>
              <th>Member</th>
              <th>Case</th>
              <th>Raised</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr>
                <td><span class="pill warn">{item.kind}</span></td>
                <td>{item.title}</td>
                <td><code style="font-size:.72rem">{item.memberId.slice(-8)}</code></td>
                <td><code style="font-size:.72rem">{item.caseId?.slice(-8) ?? ''}</code></td>
                <td class="muted">{time(item.createdAt)}</td>
                <td>
                  <form method="post" action={`/admin/queue/${item.id}/resolve`}>
                    <input type="hidden" name="csrf" value={csrf} />
                    <button type="submit" class="secondary">Resolve</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {PRIVACY_NOTE}
  </Layout>
);

export const AdminAuditPage: FC<{
  entries: readonly { adminId: string; action: string; subjectMemberId: string | null; reason: string | null; at: number }[];
}> = ({ entries }) => (
  <Layout title="Audit log" nav={ADMIN_NAV('/admin/audit')}>
    <h1>Operator audit log</h1>
    <p class="lede">Append-only. Every operator action is recorded here, including any break-glass access.</p>

    <div class="card scroll">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Operator</th>
            <th>Action</th>
            <th>Subject</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr>
              <td class="muted">{time(entry.at)}</td>
              <td><code style="font-size:.72rem">{entry.adminId.slice(-8)}</code></td>
              <td>{entry.action}</td>
              <td><code style="font-size:.72rem">{entry.subjectMemberId?.slice(-8) ?? ''}</code></td>
              <td class="muted">{entry.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Layout>
);
