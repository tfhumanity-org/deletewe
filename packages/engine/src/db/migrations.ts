/**
 * Forward-only migrations in SQLite dialect, applied unchanged by D1 and by
 * self-hosted SQLite. See docs/adr/0007-sqlite-dialect-for-both-targets.md.
 *
 * Rules the schema obeys: TEXT ULIDs, INTEGER epoch-millisecond timestamps,
 * BLOB ciphertext, no triggers, no views, no AUTOINCREMENT.
 */
export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  email_enc BLOB NOT NULL,
  email_bidx TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  dek_wrapped BLOB NOT NULL,
  dek_key_version INTEGER NOT NULL,
  jurisdiction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  auto_confirm_threshold REAL NOT NULL DEFAULT 1.1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS consent (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  granted INTEGER NOT NULL,
  document_version TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  ip_hash TEXT,
  user_agent_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_member ON consent(member_id, purpose);

CREATE TABLE IF NOT EXISTS mandate (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_sha256 TEXT NOT NULL,
  signature_name_enc BLOB NOT NULL,
  signed_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mandate_member ON mandate(member_id, revoked_at);

CREATE TABLE IF NOT EXISTS identifier (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value_enc BLOB NOT NULL,
  value_bidx TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  confidence_weight REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identifier_member ON identifier(member_id, kind);

CREATE TABLE IF NOT EXISTS broker (
  id TEXT PRIMARY KEY,
  definition_version TEXT NOT NULL,
  definition_sha256 TEXT NOT NULL,
  name TEXT NOT NULL,
  homepage TEXT NOT NULL,
  category TEXT NOT NULL,
  automation_level TEXT NOT NULL,
  opt_out_method TEXT NOT NULL,
  relist_interval_days INTEGER NOT NULL,
  jurisdictions TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'healthy',
  enabled INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listing (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  broker_id TEXT NOT NULL,
  external_url_enc BLOB NOT NULL,
  external_key TEXT,
  snapshot_enc BLOB NOT NULL,
  dedup_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_dedup ON listing(member_id, broker_id, dedup_hash);
CREATE INDEX IF NOT EXISTS idx_listing_member ON listing(member_id, status);

CREATE TABLE IF NOT EXISTS match_result (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  score REAL NOT NULL,
  explanation_enc BLOB NOT NULL,
  matcher_version TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_listing ON match_result(listing_id);
CREATE INDEX IF NOT EXISTS idx_match_member ON match_result(member_id, decision);

CREATE TABLE IF NOT EXISTS case_file (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  broker_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  next_check_at INTEGER,
  outcome TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_listing ON case_file(listing_id);
CREATE INDEX IF NOT EXISTS idx_case_member ON case_file(member_id, state);
CREATE INDEX IF NOT EXISTS idx_case_next_check ON case_file(next_check_at);

CREATE TABLE IF NOT EXISTS job (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  case_id TEXT,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after INTEGER NOT NULL,
  error_code TEXT,
  error_detail TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_state ON job(state, run_after);
CREATE INDEX IF NOT EXISTS idx_job_member ON job(member_id, created_at);

CREATE TABLE IF NOT EXISTS scheduled_job (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  run_after INTEGER NOT NULL,
  claimed_at INTEGER,
  claimed_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_run ON scheduled_job(run_after, claimed_at);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  case_id TEXT,
  job_id TEXT,
  kind TEXT NOT NULL,
  blob_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  definition_sha256 TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_member ON evidence(member_id, captured_at);

CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  case_id TEXT,
  audience TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions_md TEXT NOT NULL,
  prefill_enc BLOB,
  deep_link_enc BLOB,
  state TEXT NOT NULL DEFAULT 'open',
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_task_member ON task(member_id, state);
CREATE INDEX IF NOT EXISTS idx_task_audience ON task(audience, state);

CREATE TABLE IF NOT EXISTS broker_health (
  id TEXT PRIMARY KEY,
  broker_id TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  failure_kind TEXT,
  step_id TEXT,
  definition_sha256 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_broker ON broker_health(broker_id, observed_at);

CREATE TABLE IF NOT EXISTS report (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  summary_enc BLOB NOT NULL,
  blob_key TEXT,
  generated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_member ON report(member_id, period_end);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  case_id TEXT,
  type TEXT NOT NULL,
  detail_enc BLOB,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_member ON event(member_id, at);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  admin_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  csrf_token TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expiry ON session(expires_at);

CREATE TABLE IF NOT EXISTS admin_user (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_member_id TEXT,
  reason TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit(at);

CREATE TABLE IF NOT EXISTS verification_token (
  token TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  broker_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_verification_case ON verification_token(case_id);

CREATE TABLE IF NOT EXISTS deleted_member (
  member_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS broker_rate (
  broker_id TEXT PRIMARY KEY,
  last_request_at INTEGER NOT NULL,
  day_bucket INTEGER NOT NULL,
  day_count INTEGER NOT NULL
);
`,
  },
  {
    id: 2,
    name: 'drop_requests',
    sql: `
CREATE TABLE IF NOT EXISTS drop_request (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  case_id TEXT,
  state TEXT NOT NULL,
  reference_enc BLOB,
  agent_name TEXT,
  agent_email TEXT,
  submitted_at INTEGER,
  brokers_must_retrieve_by INTEGER,
  amendable_from INTEGER,
  status_meaningful_from INTEGER,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drop_member ON drop_request(member_id, state);
`,
  },
];

const MIGRATION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migration (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);`;

export interface MigrationRunnerDeps {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly (string | number)[]): Promise<unknown>;
  all<T>(sql: string): Promise<T[]>;
  now(): number;
}

/** Idempotent: re-applying is a no-op. */
export async function migrate(deps: MigrationRunnerDeps): Promise<number[]> {
  await deps.exec(MIGRATION_TABLE);
  const applied = await deps.all<{ id: number }>('SELECT id FROM schema_migration');
  const seen = new Set(applied.map((r) => r.id));
  const run: number[] = [];

  for (const migration of MIGRATIONS) {
    if (seen.has(migration.id)) continue;
    await deps.exec(migration.sql);
    await deps.run('INSERT INTO schema_migration (id, name, applied_at) VALUES (?, ?, ?)', [
      migration.id,
      migration.name,
      deps.now(),
    ]);
    run.push(migration.id);
  }
  return run;
}
