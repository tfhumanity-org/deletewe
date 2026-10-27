import type { CryptoService } from '../crypto.ts';
import { EngineError } from '../errors.ts';
import { newId } from '../ids.ts';
import type { Clock, Database, SqlParam } from '../ports.ts';
import type {
  Address,
  BrokerRow,
  BrokerStatus,
  CaseFile,
  CaseOutcome,
  CaseState,
  ConsentPurpose,
  EvidenceRecord,
  HealthFailure,
  Identifier,
  IdentifierValue,
  JobKind,
  JobRecord,
  JobState,
  Listing,
  ListingSnapshot,
  MandateKind,
  MatchDecision,
  MatchResult,
  Member,
  MemberEvent,
  PersonName,
  Profile,
  Task,
  TaskAudience,
  TaskKind,
  TaskState,
} from '../types.ts';

interface MemberRow {
  id: string;
  email_enc: Uint8Array;
  email_bidx: string;
  password_hash: string;
  dek_wrapped: Uint8Array;
  dek_key_version: number;
  jurisdiction: string;
  status: string;
  auto_confirm_threshold: number;
  created_at: number;
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new EngineError('internal', 'expected binary column');
}

/**
 * Data access.
 *
 * Every member-scoped read and write takes `memberId` as an explicit argument
 * and includes it in the WHERE clause. There is no method that reads a listing,
 * identifier, case, task, or piece of evidence without one. See
 * docs/data-model.md, "Queries that must never exist".
 */
export class Store {
  constructor(
    readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly clock: Clock,
  ) {}

  /** Evidence blobs are encrypted with the member DEK before they reach storage. */
  async encryptBlob(dek: Uint8Array, memberId: string, bytes: Uint8Array): Promise<Uint8Array> {
    return this.crypto.encryptBytes(dek, memberId, bytes);
  }

  async decryptBlob(dek: Uint8Array, memberId: string, bytes: Uint8Array): Promise<Uint8Array> {
    return this.crypto.decryptBytes(dek, memberId, bytes);
  }

  /** Stable per-broker dedup key. Keyed, so it leaks nothing about the URL. */
  async dedupHash(brokerId: string, externalKeyOrUrl: string): Promise<string> {
    return this.crypto.blindIndex(`listing:${brokerId}`, externalKeyOrUrl);
  }

  // --- Members -------------------------------------------------------------

  async createMember(params: {
    email: string;
    passwordHash: string;
    jurisdiction: string;
  }): Promise<{ member: Member; dek: Uint8Array }> {
    const now = this.clock.now();
    const id = newId(now);
    const dek = this.crypto.generateDek();
    const wrapped = await this.crypto.wrapDek(dek);
    const emailEnc = await this.crypto.encryptField(dek, id, params.email);
    const emailBidx = await this.crypto.blindIndex('member_email', params.email);

    try {
      await this.db.run(
        `INSERT INTO member (id, email_enc, email_bidx, password_hash, dek_wrapped, dek_key_version,
          jurisdiction, status, auto_confirm_threshold, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1.1, ?, ?)`,
        [id, emailEnc, emailBidx, params.passwordHash, wrapped, this.crypto.keyVersion, params.jurisdiction, now, now],
      );
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new EngineError('invalid_input', 'an account with that email already exists');
      throw e;
    }

    return {
      member: {
        id,
        email: params.email,
        jurisdiction: params.jurisdiction,
        status: 'active',
        autoConfirmThreshold: 1.1,
        createdAt: now,
      },
      dek,
    };
  }

  /** Login lookup via blind index: no decryption, no scan. */
  async findMemberByEmail(email: string): Promise<{ row: MemberRow } | undefined> {
    const bidx = await this.crypto.blindIndex('member_email', email);
    const row = await this.db.get<MemberRow>('SELECT * FROM member WHERE email_bidx = ?', [bidx]);
    return row ? { row } : undefined;
  }

  async getMemberRow(memberId: string): Promise<MemberRow | undefined> {
    return this.db.get<MemberRow>('SELECT * FROM member WHERE id = ?', [memberId]);
  }

  async unwrapDekFor(row: MemberRow): Promise<Uint8Array> {
    return this.crypto.unwrapDek(asBytes(row.dek_wrapped));
  }

  async toMember(row: MemberRow, dek: Uint8Array): Promise<Member> {
    return {
      id: row.id,
      email: await this.crypto.decryptField(dek, row.id, asBytes(row.email_enc)),
      jurisdiction: row.jurisdiction,
      status: row.status as Member['status'],
      autoConfirmThreshold: row.auto_confirm_threshold,
      createdAt: row.created_at,
    };
  }

  async listMemberIds(): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>("SELECT id FROM member WHERE status = 'active'");
    return rows.map((r) => r.id);
  }

  async setAutoConfirmThreshold(memberId: string, threshold: number): Promise<void> {
    await this.db.run('UPDATE member SET auto_confirm_threshold = ?, updated_at = ? WHERE id = ?', [
      threshold,
      this.clock.now(),
      memberId,
    ]);
  }

  async setMemberStatus(memberId: string, status: Member['status']): Promise<void> {
    await this.db.run('UPDATE member SET status = ?, updated_at = ? WHERE id = ?', [status, this.clock.now(), memberId]);
  }

  // --- Consent and mandate -------------------------------------------------

  async recordConsent(params: {
    memberId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    documentVersion: string;
    documentSha256: string;
    ipHash?: string;
    userAgentHash?: string;
  }): Promise<void> {
    const now = this.clock.now();
    await this.db.run(
      `INSERT INTO consent (id, member_id, purpose, granted, document_version, document_sha256, granted_at, ip_hash, user_agent_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(now),
        params.memberId,
        params.purpose,
        params.granted ? 1 : 0,
        params.documentVersion,
        params.documentSha256,
        now,
        params.ipHash ?? null,
        params.userAgentHash ?? null,
      ],
    );
  }

  /** The live grant for a purpose, or undefined if never granted or revoked. */
  async hasConsent(memberId: string, purpose: ConsentPurpose): Promise<boolean> {
    const row = await this.db.get<{ granted: number; revoked_at: number | null }>(
      `SELECT granted, revoked_at FROM consent
        WHERE member_id = ? AND purpose = ?
        ORDER BY granted_at DESC LIMIT 1`,
      [memberId, purpose],
    );
    return row !== undefined && row.granted === 1 && row.revoked_at === null;
  }

  async revokeConsent(memberId: string, purpose: ConsentPurpose): Promise<void> {
    await this.db.run(
      'UPDATE consent SET revoked_at = ? WHERE member_id = ? AND purpose = ? AND revoked_at IS NULL',
      [this.clock.now(), memberId, purpose],
    );
  }

  async listConsents(memberId: string): Promise<
    { purpose: string; granted: boolean; documentVersion: string; grantedAt: number; revokedAt: number | null }[]
  > {
    const rows = await this.db.all<{
      purpose: string;
      granted: number;
      document_version: string;
      granted_at: number;
      revoked_at: number | null;
    }>('SELECT * FROM consent WHERE member_id = ? ORDER BY granted_at DESC', [memberId]);
    return rows.map((r) => ({
      purpose: r.purpose,
      granted: r.granted === 1,
      documentVersion: r.document_version,
      grantedAt: r.granted_at,
      revokedAt: r.revoked_at,
    }));
  }

  async recordMandate(params: {
    memberId: string;
    dek: Uint8Array;
    kind: MandateKind;
    scope: string[];
    documentVersion: string;
    documentSha256: string;
    signatureName: string;
  }): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      `INSERT INTO mandate (id, member_id, kind, scope, document_version, document_sha256, signature_name_enc, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.memberId,
        params.kind,
        JSON.stringify(params.scope),
        params.documentVersion,
        params.documentSha256,
        await this.crypto.encryptField(params.dek, params.memberId, params.signatureName),
        now,
      ],
    );
    return id;
  }

  /** The kill switch: a revoked mandate halts every outbound action. */
  async activeMandate(memberId: string): Promise<{ id: string; kind: MandateKind; scope: string[] } | undefined> {
    const now = this.clock.now();
    const row = await this.db.get<{ id: string; kind: string; scope: string }>(
      `SELECT id, kind, scope FROM mandate
        WHERE member_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY signed_at DESC LIMIT 1`,
      [memberId, now],
    );
    return row ? { id: row.id, kind: row.kind as MandateKind, scope: JSON.parse(row.scope) as string[] } : undefined;
  }

  async revokeMandates(memberId: string): Promise<void> {
    await this.db.run('UPDATE mandate SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL', [
      this.clock.now(),
      memberId,
    ]);
  }

  // --- Profile -------------------------------------------------------------

  async addIdentifier(params: {
    memberId: string;
    dek: Uint8Array;
    data: IdentifierValue;
    isCurrent?: boolean;
    weight?: number;
  }): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    const json = JSON.stringify(params.data.value);
    await this.db.run(
      `INSERT INTO identifier (id, member_id, kind, value_enc, value_bidx, is_current, confidence_weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.memberId,
        params.data.kind,
        await this.crypto.encryptField(params.dek, params.memberId, json),
        await this.crypto.blindIndex(`identifier:${params.data.kind}`, json),
        params.isCurrent === false ? 0 : 1,
        params.weight ?? 1,
        now,
      ],
    );
    return id;
  }

  async deleteIdentifier(memberId: string, identifierId: string): Promise<void> {
    await this.db.run('DELETE FROM identifier WHERE id = ? AND member_id = ?', [identifierId, memberId]);
  }

  async listIdentifiers(memberId: string, dek: Uint8Array): Promise<Identifier[]> {
    const rows = await this.db.all<{
      id: string;
      kind: string;
      value_enc: Uint8Array;
      is_current: number;
      confidence_weight: number;
      created_at: number;
    }>('SELECT id, kind, value_enc, is_current, confidence_weight, created_at FROM identifier WHERE member_id = ? ORDER BY created_at', [
      memberId,
    ]);

    const out: Identifier[] = [];
    for (const row of rows) {
      const json = await this.crypto.decryptField(dek, memberId, asBytes(row.value_enc));
      out.push({
        id: row.id,
        memberId,
        isCurrent: row.is_current === 1,
        weight: row.confidence_weight,
        createdAt: row.created_at,
        data: { kind: row.kind, value: JSON.parse(json) } as IdentifierValue,
      });
    }
    return out;
  }

  /** Assembles the one-subject profile the engine operates on. */
  async loadProfile(memberId: string, dek: Uint8Array): Promise<Profile> {
    const row = await this.getMemberRow(memberId);
    if (!row) throw new EngineError('not_found', 'member not found');
    const identifiers = await this.listIdentifiers(memberId, dek);

    const names: PersonName[] = [];
    const aliases: PersonName[] = [];
    const addresses: { address: Address; isCurrent: boolean }[] = [];
    const phones: string[] = [];
    const emails: string[] = [];
    let dob: string | undefined;

    for (const identifier of identifiers) {
      switch (identifier.data.kind) {
        case 'name': names.push(identifier.data.value); break;
        case 'alias': aliases.push(identifier.data.value); break;
        case 'address': addresses.push({ address: identifier.data.value, isCurrent: identifier.isCurrent }); break;
        case 'phone': phones.push(identifier.data.value); break;
        case 'email': emails.push(identifier.data.value); break;
        case 'dob': dob = identifier.data.value; break;
      }
    }

    return { memberId, jurisdiction: row.jurisdiction, names, aliases, addresses, phones, emails, dob };
  }

  // --- Brokers -------------------------------------------------------------

  async upsertBroker(row: Omit<BrokerRow, 'status'> & { status?: BrokerStatus }): Promise<void> {
    const now = this.clock.now();
    const existing = await this.db.get<{ status: string; definition_sha256: string }>(
      'SELECT status, definition_sha256 FROM broker WHERE id = ?',
      [row.id],
    );

    const nextStatus = (current: string | undefined, incomingSha: string): BrokerStatus => {
      if (current === undefined) return 'healthy';
      if (current === 'broken' && existing?.definition_sha256 !== incomingSha) return 'healthy';
      return current as BrokerStatus;
    };
    await this.db.run(
      `INSERT INTO broker (id, definition_version, definition_sha256, name, homepage, category,
         automation_level, opt_out_method, relist_interval_days, jurisdictions, status, enabled, verified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         definition_version = excluded.definition_version,
         definition_sha256 = excluded.definition_sha256,
         name = excluded.name, homepage = excluded.homepage, category = excluded.category,
         automation_level = excluded.automation_level, opt_out_method = excluded.opt_out_method,
         relist_interval_days = excluded.relist_interval_days, jurisdictions = excluded.jurisdictions,
         enabled = excluded.enabled, verified_at = excluded.verified_at, updated_at = excluded.updated_at,
         status = excluded.status`,
      [
        row.id, row.definitionVersion, row.definitionSha256, row.name, row.homepage, row.category,
        row.automationLevel, row.optOutMethod, row.relistIntervalDays, JSON.stringify(row.jurisdictions),
        // A changed definition resets a broken broker to healthy — repairing it
        // is the whole point of the change. Any other status is left alone, so
        // an operator's manual `disabled` survives a redeploy.
        nextStatus(existing?.status, row.definitionSha256),
        row.enabled ? 1 : 0, row.verifiedAt, now,
      ],
    );
  }

  async listBrokers(): Promise<BrokerRow[]> {
    const rows = await this.db.all<Record<string, SqlParam>>('SELECT * FROM broker ORDER BY name');
    return rows.map((r) => this.toBrokerRow(r));
  }

  async getBroker(id: string): Promise<BrokerRow | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>('SELECT * FROM broker WHERE id = ?', [id]);
    return row ? this.toBrokerRow(row) : undefined;
  }

  private toBrokerRow(r: Record<string, SqlParam>): BrokerRow {
    return {
      id: String(r['id']),
      name: String(r['name']),
      homepage: String(r['homepage']),
      category: String(r['category']),
      definitionVersion: String(r['definition_version']),
      definitionSha256: String(r['definition_sha256']),
      automationLevel: String(r['automation_level']) as BrokerRow['automationLevel'],
      optOutMethod: String(r['opt_out_method']) as BrokerRow['optOutMethod'],
      relistIntervalDays: Number(r['relist_interval_days']),
      jurisdictions: JSON.parse(String(r['jurisdictions'])) as string[],
      status: String(r['status']) as BrokerStatus,
      enabled: Number(r['enabled']) === 1,
      verifiedAt: r['verified_at'] === null ? null : String(r['verified_at']),
    };
  }

  async setBrokerStatus(brokerId: string, status: BrokerStatus): Promise<void> {
    await this.db.run('UPDATE broker SET status = ?, updated_at = ? WHERE id = ?', [status, this.clock.now(), brokerId]);
  }

  // --- Listings ------------------------------------------------------------

  /** Upsert on (member, broker, dedupHash): a re-scan updates, never duplicates. */
  async upsertListing(params: {
    memberId: string;
    dek: Uint8Array;
    brokerId: string;
    url: string;
    externalKey: string | null;
    snapshot: ListingSnapshot;
    dedupHash: string;
  }): Promise<{ id: string; created: boolean }> {
    const now = this.clock.now();
    const existing = await this.db.get<{ id: string }>(
      'SELECT id FROM listing WHERE member_id = ? AND broker_id = ? AND dedup_hash = ?',
      [params.memberId, params.brokerId, params.dedupHash],
    );

    const snapshotEnc = await this.crypto.encryptField(params.dek, params.memberId, JSON.stringify(params.snapshot));

    if (existing) {
      await this.db.run(
        'UPDATE listing SET last_seen_at = ?, review_count = review_count + 1, snapshot_enc = ? WHERE id = ? AND member_id = ?',
        [now, snapshotEnc, existing.id, params.memberId],
      );
      return { id: existing.id, created: false };
    }

    const id = newId(now);
    await this.db.run(
      `INSERT INTO listing (id, member_id, broker_id, external_url_enc, external_key, snapshot_enc,
         dedup_hash, first_seen_at, last_seen_at, review_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'discovered')`,
      [
        id, params.memberId, params.brokerId,
        await this.crypto.encryptField(params.dek, params.memberId, params.url),
        params.externalKey, snapshotEnc, params.dedupHash, now, now,
      ],
    );
    return { id, created: true };
  }

  async getListing(memberId: string, dek: Uint8Array, listingId: string): Promise<Listing | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>('SELECT * FROM listing WHERE id = ? AND member_id = ?', [
      listingId,
      memberId,
    ]);
    return row ? this.toListing(row, memberId, dek) : undefined;
  }

  async listListings(memberId: string, dek: Uint8Array): Promise<Listing[]> {
    const rows = await this.db.all<Record<string, SqlParam>>(
      'SELECT * FROM listing WHERE member_id = ? ORDER BY first_seen_at DESC',
      [memberId],
    );
    return Promise.all(rows.map((r) => this.toListing(r, memberId, dek)));
  }

  private async toListing(r: Record<string, SqlParam>, memberId: string, dek: Uint8Array): Promise<Listing> {
    return {
      id: String(r['id']),
      memberId,
      brokerId: String(r['broker_id']),
      url: await this.crypto.decryptField(dek, memberId, asBytes(r['external_url_enc'])),
      externalKey: r['external_key'] === null ? null : String(r['external_key']),
      snapshot: JSON.parse(await this.crypto.decryptField(dek, memberId, asBytes(r['snapshot_enc']))) as ListingSnapshot,
      dedupHash: String(r['dedup_hash']),
      firstSeenAt: Number(r['first_seen_at']),
      lastSeenAt: Number(r['last_seen_at']),
      reviewCount: Number(r['review_count']),
      status: String(r['status']) as CaseState,
    };
  }

  async setListingStatus(memberId: string, listingId: string, status: CaseState): Promise<void> {
    await this.db.run('UPDATE listing SET status = ? WHERE id = ? AND member_id = ?', [status, listingId, memberId]);
  }

  // --- Match results -------------------------------------------------------

  async recordMatch(params: {
    memberId: string;
    dek: Uint8Array;
    listingId: string;
    result: MatchResult;
    decision: MatchDecision;
    decidedBy?: 'member' | 'auto' | 'operator';
  }): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      `INSERT INTO match_result (id, member_id, listing_id, score, explanation_enc, matcher_version, decision, decided_at, decided_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, params.memberId, params.listingId, params.result.score,
        await this.crypto.encryptField(params.dek, params.memberId, JSON.stringify(params.result.comparisons)),
        params.result.matcherVersion, params.decision,
        params.decision === 'pending' ? null : now,
        params.decidedBy ?? null, now,
      ],
    );
    return id;
  }

  async latestMatch(
    memberId: string,
    dek: Uint8Array,
    listingId: string,
  ): Promise<{ id: string; score: number; decision: MatchDecision; comparisons: MatchResult['comparisons'] } | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>(
      'SELECT * FROM match_result WHERE member_id = ? AND listing_id = ? ORDER BY created_at DESC LIMIT 1',
      [memberId, listingId],
    );
    if (!row) return undefined;
    return {
      id: String(row['id']),
      score: Number(row['score']),
      decision: String(row['decision']) as MatchDecision,
      comparisons: JSON.parse(
        await this.crypto.decryptField(dek, memberId, asBytes(row['explanation_enc'])),
      ) as MatchResult['comparisons'],
    };
  }

  async decideMatch(
    memberId: string,
    matchId: string,
    decision: MatchDecision,
    decidedBy: 'member' | 'auto' | 'operator',
  ): Promise<void> {
    await this.db.run(
      'UPDATE match_result SET decision = ?, decided_at = ?, decided_by = ? WHERE id = ? AND member_id = ?',
      [decision, this.clock.now(), decidedBy, matchId, memberId],
    );
  }

  // --- Cases ---------------------------------------------------------------

  async openCase(params: { memberId: string; brokerId: string; listingId: string; state: CaseState }): Promise<string> {
    const existing = await this.db.get<{ id: string }>('SELECT id FROM case_file WHERE listing_id = ? AND member_id = ?', [
      params.listingId,
      params.memberId,
    ]);
    if (existing) return existing.id;

    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      'INSERT INTO case_file (id, member_id, broker_id, listing_id, state, attempt_count, opened_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [id, params.memberId, params.brokerId, params.listingId, params.state, now],
    );
    return id;
  }

  async getCase(memberId: string, caseId: string): Promise<CaseFile | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>('SELECT * FROM case_file WHERE id = ? AND member_id = ?', [
      caseId,
      memberId,
    ]);
    return row ? this.toCase(row) : undefined;
  }

  async getCaseByListing(memberId: string, listingId: string): Promise<CaseFile | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>(
      'SELECT * FROM case_file WHERE listing_id = ? AND member_id = ?',
      [listingId, memberId],
    );
    return row ? this.toCase(row) : undefined;
  }

  async listCases(memberId: string): Promise<CaseFile[]> {
    const rows = await this.db.all<Record<string, SqlParam>>(
      'SELECT * FROM case_file WHERE member_id = ? ORDER BY opened_at DESC',
      [memberId],
    );
    return rows.map((r) => this.toCase(r));
  }

  private toCase(r: Record<string, SqlParam>): CaseFile {
    return {
      id: String(r['id']),
      memberId: String(r['member_id']),
      brokerId: String(r['broker_id']),
      listingId: String(r['listing_id']),
      state: String(r['state']) as CaseState,
      attemptCount: Number(r['attempt_count']),
      openedAt: Number(r['opened_at']),
      closedAt: r['closed_at'] === null ? null : Number(r['closed_at']),
      nextCheckAt: r['next_check_at'] === null ? null : Number(r['next_check_at']),
      outcome: r['outcome'] === null ? null : (String(r['outcome']) as CaseOutcome),
    };
  }

  async updateCase(
    memberId: string,
    caseId: string,
    patch: {
      state?: CaseState;
      nextCheckAt?: number | null;
      outcome?: CaseOutcome | null;
      closedAt?: number | null;
      incrementAttempt?: boolean;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: SqlParam[] = [];
    if (patch.state !== undefined) { sets.push('state = ?'); params.push(patch.state); }
    if (patch.nextCheckAt !== undefined) { sets.push('next_check_at = ?'); params.push(patch.nextCheckAt); }
    if (patch.outcome !== undefined) { sets.push('outcome = ?'); params.push(patch.outcome); }
    if (patch.closedAt !== undefined) { sets.push('closed_at = ?'); params.push(patch.closedAt); }
    if (patch.incrementAttempt) sets.push('attempt_count = attempt_count + 1');
    if (sets.length === 0) return;
    params.push(caseId, memberId);
    await this.db.run(`UPDATE case_file SET ${sets.join(', ')} WHERE id = ? AND member_id = ?`, params);
  }

  /** Cases whose re-check timer has elapsed. Drives the recurring loop. */
  async dueCases(now: number, limit = 100): Promise<CaseFile[]> {
    const rows = await this.db.all<Record<string, SqlParam>>(
      'SELECT * FROM case_file WHERE next_check_at IS NOT NULL AND next_check_at <= ? ORDER BY next_check_at LIMIT ?',
      [now, limit],
    );
    return rows.map((r) => this.toCase(r));
  }

  // --- Jobs ----------------------------------------------------------------

  async createJob(params: {
    memberId: string;
    caseId?: string | null;
    kind: JobKind;
    idempotencyKey: string;
    runAfter?: number;
    maxAttempts?: number;
  }): Promise<{ id: string; created: boolean }> {
    const existing = await this.db.get<{ id: string }>('SELECT id FROM job WHERE idempotency_key = ?', [
      params.idempotencyKey,
    ]);
    if (existing) return { id: existing.id, created: false };

    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      `INSERT INTO job (id, member_id, case_id, kind, idempotency_key, state, attempt, max_attempts, run_after, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      [id, params.memberId, params.caseId ?? null, params.kind, params.idempotencyKey, params.maxAttempts ?? 5, params.runAfter ?? now, now],
    );
    return { id, created: true };
  }

  async getJob(jobId: string): Promise<JobRecord | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>('SELECT * FROM job WHERE id = ?', [jobId]);
    if (!row) return undefined;
    return {
      id: String(row['id']),
      memberId: String(row['member_id']),
      caseId: row['case_id'] === null ? null : String(row['case_id']),
      kind: String(row['kind']) as JobKind,
      idempotencyKey: String(row['idempotency_key']),
      state: String(row['state']) as JobState,
      attempt: Number(row['attempt']),
      maxAttempts: Number(row['max_attempts']),
      runAfter: Number(row['run_after']),
      errorCode: row['error_code'] === null ? null : String(row['error_code']),
      errorDetail: row['error_detail'] === null ? null : String(row['error_detail']),
      startedAt: row['started_at'] === null ? null : Number(row['started_at']),
      finishedAt: row['finished_at'] === null ? null : Number(row['finished_at']),
    };
  }

  async markJobRunning(jobId: string): Promise<void> {
    await this.db.run("UPDATE job SET state = 'running', attempt = attempt + 1, started_at = ? WHERE id = ?", [
      this.clock.now(),
      jobId,
    ]);
  }

  async finishJob(jobId: string, state: JobState, errorCode?: string, errorDetail?: string): Promise<void> {
    await this.db.run('UPDATE job SET state = ?, error_code = ?, error_detail = ?, finished_at = ? WHERE id = ?', [
      state,
      errorCode ?? null,
      errorDetail ?? null,
      this.clock.now(),
      jobId,
    ]);
  }

  async rescheduleJob(jobId: string, runAfter: number, errorCode: string, errorDetail: string): Promise<void> {
    await this.db.run("UPDATE job SET state = 'pending', run_after = ?, error_code = ?, error_detail = ? WHERE id = ?", [
      runAfter,
      errorCode,
      errorDetail,
      jobId,
    ]);
  }

  async pendingJobs(now: number, limit = 50): Promise<JobRecord[]> {
    const rows = await this.db.all<{ id: string }>(
      "SELECT id FROM job WHERE state = 'pending' AND run_after <= ? ORDER BY run_after LIMIT ?",
      [now, limit],
    );
    const out: JobRecord[] = [];
    for (const r of rows) {
      const job = await this.getJob(r.id);
      if (job) out.push(job);
    }
    return out;
  }

  async recentJobs(limit = 100): Promise<JobRecord[]> {
    const rows = await this.db.all<{ id: string }>('SELECT id FROM job ORDER BY created_at DESC LIMIT ?', [limit]);
    const out: JobRecord[] = [];
    for (const r of rows) {
      const job = await this.getJob(r.id);
      if (job) out.push(job);
    }
    return out;
  }

  // --- Evidence (write-once) ----------------------------------------------

  async recordEvidence(params: Omit<EvidenceRecord, 'id'>): Promise<string> {
    const id = newId(params.capturedAt);
    await this.db.run(
      `INSERT INTO evidence (id, member_id, case_id, job_id, kind, blob_key, sha256, bytes, captured_at, engine_version, definition_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, params.memberId, params.caseId, params.jobId, params.kind, params.blobKey,
        params.sha256, params.bytes, params.capturedAt, params.engineVersion, params.definitionSha256,
      ],
    );
    return id;
  }

  async listEvidence(memberId: string, caseId?: string): Promise<EvidenceRecord[]> {
    const rows = caseId
      ? await this.db.all<Record<string, SqlParam>>(
          'SELECT * FROM evidence WHERE member_id = ? AND case_id = ? ORDER BY captured_at',
          [memberId, caseId],
        )
      : await this.db.all<Record<string, SqlParam>>('SELECT * FROM evidence WHERE member_id = ? ORDER BY captured_at', [
          memberId,
        ]);
    return rows.map((r) => ({
      id: String(r['id']),
      memberId,
      caseId: r['case_id'] === null ? null : String(r['case_id']),
      jobId: r['job_id'] === null ? null : String(r['job_id']),
      kind: String(r['kind']) as EvidenceRecord['kind'],
      blobKey: String(r['blob_key']),
      sha256: String(r['sha256']),
      bytes: Number(r['bytes']),
      capturedAt: Number(r['captured_at']),
      engineVersion: String(r['engine_version']),
      definitionSha256: r['definition_sha256'] === null ? null : String(r['definition_sha256']),
    }));
  }

  // --- Tasks ---------------------------------------------------------------

  async createTask(params: {
    memberId: string;
    dek: Uint8Array;
    caseId: string | null;
    audience: TaskAudience;
    kind: TaskKind;
    title: string;
    instructions: string;
    prefill?: Record<string, string> | null;
    deepLink?: string | null;
    dueAt?: number | null;
  }): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      `INSERT INTO task (id, member_id, case_id, audience, kind, title, instructions_md, prefill_enc, deep_link_enc, state, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [
        id, params.memberId, params.caseId, params.audience, params.kind, params.title, params.instructions,
        params.prefill ? await this.crypto.encryptField(params.dek, params.memberId, JSON.stringify(params.prefill)) : null,
        params.deepLink ? await this.crypto.encryptField(params.dek, params.memberId, params.deepLink) : null,
        params.dueAt ?? null, now,
      ],
    );
    return id;
  }

  async listTasks(memberId: string, dek: Uint8Array, audience?: TaskAudience, state?: TaskState): Promise<Task[]> {
    const clauses = ['member_id = ?'];
    const params: SqlParam[] = [memberId];
    if (audience) { clauses.push('audience = ?'); params.push(audience); }
    if (state) { clauses.push('state = ?'); params.push(state); }
    const rows = await this.db.all<Record<string, SqlParam>>(
      `SELECT * FROM task WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );
    return Promise.all(rows.map((r) => this.toTask(r, memberId, dek)));
  }

  /** Operator queue: ids only, so the admin UI shows no decrypted member data. */
  async listOperatorTaskSummaries(state: TaskState = 'open'): Promise<
    { id: string; memberId: string; caseId: string | null; kind: string; title: string; createdAt: number }[]
  > {
    const rows = await this.db.all<Record<string, SqlParam>>(
      "SELECT id, member_id, case_id, kind, title, created_at FROM task WHERE audience = 'operator' AND state = ? ORDER BY created_at",
      [state],
    );
    return rows.map((r) => ({
      id: String(r['id']),
      memberId: String(r['member_id']),
      caseId: r['case_id'] === null ? null : String(r['case_id']),
      kind: String(r['kind']),
      title: String(r['title']),
      createdAt: Number(r['created_at']),
    }));
  }

  async getTask(memberId: string, dek: Uint8Array, taskId: string): Promise<Task | undefined> {
    const row = await this.db.get<Record<string, SqlParam>>('SELECT * FROM task WHERE id = ? AND member_id = ?', [
      taskId,
      memberId,
    ]);
    return row ? this.toTask(row, memberId, dek) : undefined;
  }

  private async toTask(r: Record<string, SqlParam>, memberId: string, dek: Uint8Array): Promise<Task> {
    return {
      id: String(r['id']),
      memberId,
      caseId: r['case_id'] === null ? null : String(r['case_id']),
      audience: String(r['audience']) as TaskAudience,
      kind: String(r['kind']) as TaskKind,
      title: String(r['title']),
      instructions: String(r['instructions_md']),
      prefill: r['prefill_enc']
        ? (JSON.parse(await this.crypto.decryptField(dek, memberId, asBytes(r['prefill_enc']))) as Record<string, string>)
        : null,
      deepLink: r['deep_link_enc'] ? await this.crypto.decryptField(dek, memberId, asBytes(r['deep_link_enc'])) : null,
      state: String(r['state']) as TaskState,
      dueAt: r['due_at'] === null ? null : Number(r['due_at']),
      createdAt: Number(r['created_at']),
      completedAt: r['completed_at'] === null ? null : Number(r['completed_at']),
    };
  }

  async completeTask(memberId: string, taskId: string, state: TaskState): Promise<void> {
    await this.db.run('UPDATE task SET state = ?, completed_at = ? WHERE id = ? AND member_id = ?', [
      state,
      this.clock.now(),
      taskId,
      memberId,
    ]);
  }

  // --- Broker health -------------------------------------------------------

  async recordHealth(params: {
    brokerId: string;
    ok: boolean;
    failureKind?: HealthFailure;
    stepId?: string;
    definitionSha256: string;
  }): Promise<void> {
    const now = this.clock.now();
    await this.db.run(
      'INSERT INTO broker_health (id, broker_id, observed_at, ok, failure_kind, step_id, definition_sha256) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId(now), params.brokerId, now, params.ok ? 1 : 0, params.failureKind ?? null, params.stepId ?? null, params.definitionSha256],
    );
  }

  async healthSummary(brokerId: string, windowMs: number): Promise<{ total: number; failures: number; lastFailureKind: string | null }> {
    const since = this.clock.now() - windowMs;
    const row = await this.db.get<{ total: number; failures: number }>(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures FROM broker_health WHERE broker_id = ? AND observed_at >= ?',
      [brokerId, since],
    );
    const last = await this.db.get<{ failure_kind: string | null }>(
      'SELECT failure_kind FROM broker_health WHERE broker_id = ? AND ok = 0 ORDER BY observed_at DESC LIMIT 1',
      [brokerId],
    );
    return { total: row?.total ?? 0, failures: Number(row?.failures ?? 0), lastFailureKind: last?.failure_kind ?? null };
  }

  // --- Events --------------------------------------------------------------

  async recordEvent(params: {
    memberId: string;
    dek?: Uint8Array;
    caseId?: string | null;
    type: string;
    detail?: string;
    actor: MemberEvent['actor'];
  }): Promise<void> {
    const now = this.clock.now();
    await this.db.run('INSERT INTO event (id, member_id, case_id, type, detail_enc, at, actor) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      newId(now),
      params.memberId,
      params.caseId ?? null,
      params.type,
      params.detail && params.dek ? await this.crypto.encryptField(params.dek, params.memberId, params.detail) : null,
      now,
      params.actor,
    ]);
  }

  async listEvents(memberId: string, dek: Uint8Array, limit = 200): Promise<MemberEvent[]> {
    const rows = await this.db.all<Record<string, SqlParam>>(
      'SELECT * FROM event WHERE member_id = ? ORDER BY at DESC LIMIT ?',
      [memberId, limit],
    );
    const out: MemberEvent[] = [];
    for (const r of rows) {
      out.push({
        id: String(r['id']),
        memberId,
        caseId: r['case_id'] === null ? null : String(r['case_id']),
        type: String(r['type']),
        detail: r['detail_enc'] ? await this.crypto.decryptField(dek, memberId, asBytes(r['detail_enc'])) : null,
        at: Number(r['at']),
        actor: String(r['actor']) as MemberEvent['actor'],
      });
    }
    return out;
  }

  // --- Verification tokens -------------------------------------------------

  async createVerificationToken(params: {
    token: string;
    memberId: string;
    caseId: string;
    brokerId: string;
    windowHours: number;
  }): Promise<void> {
    const now = this.clock.now();
    await this.db.run(
      'INSERT INTO verification_token (token, member_id, case_id, broker_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [params.token, params.memberId, params.caseId, params.brokerId, now, now + params.windowHours * 3600_000],
    );
  }

  async resolveVerificationToken(
    token: string,
  ): Promise<{ memberId: string; caseId: string; brokerId: string; expiresAt: number; consumedAt: number | null } | undefined> {
    const row = await this.db.get<{
      member_id: string;
      case_id: string;
      broker_id: string;
      expires_at: number;
      consumed_at: number | null;
    }>('SELECT * FROM verification_token WHERE token = ?', [token]);
    if (!row) return undefined;
    return {
      memberId: row.member_id,
      caseId: row.case_id,
      brokerId: row.broker_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async consumeVerificationToken(token: string): Promise<void> {
    await this.db.run('UPDATE verification_token SET consumed_at = ? WHERE token = ?', [this.clock.now(), token]);
  }

  // --- Rate limiting -------------------------------------------------------

  /** Per-broker politeness. Returns false when the caller must wait. */
  async tryConsumeRate(brokerId: string, minIntervalMs: number, dailyCap: number): Promise<boolean> {
    const now = this.clock.now();
    const dayBucket = Math.floor(now / 86_400_000);
    const row = await this.db.get<{ last_request_at: number; day_bucket: number; day_count: number }>(
      'SELECT * FROM broker_rate WHERE broker_id = ?',
      [brokerId],
    );

    if (!row) {
      await this.db.run('INSERT INTO broker_rate (broker_id, last_request_at, day_bucket, day_count) VALUES (?, ?, ?, 1)', [
        brokerId, now, dayBucket,
      ]);
      return true;
    }
    if (now - row.last_request_at < minIntervalMs) return false;
    const count = row.day_bucket === dayBucket ? row.day_count : 0;
    if (count >= dailyCap) return false;

    await this.db.run('UPDATE broker_rate SET last_request_at = ?, day_bucket = ?, day_count = ? WHERE broker_id = ?', [
      now, dayBucket, count + 1, brokerId,
    ]);
    return true;
  }

  // --- Reports -------------------------------------------------------------

  async createReport(params: {
    memberId: string;
    dek: Uint8Array;
    periodStart: number;
    periodEnd: number;
    summary: unknown;
    blobKey?: string | null;
  }): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      'INSERT INTO report (id, member_id, period_start, period_end, summary_enc, blob_key, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id, params.memberId, params.periodStart, params.periodEnd,
        await this.crypto.encryptField(params.dek, params.memberId, JSON.stringify(params.summary)),
        params.blobKey ?? null, now,
      ],
    );
    return id;
  }

  async listReports(
    memberId: string,
    dek: Uint8Array,
  ): Promise<{ id: string; periodStart: number; periodEnd: number; generatedAt: number; summary: unknown; blobKey: string | null }[]> {
    const rows = await this.db.all<Record<string, SqlParam>>(
      'SELECT * FROM report WHERE member_id = ? ORDER BY period_end DESC',
      [memberId],
    );
    const out = [];
    for (const r of rows) {
      out.push({
        id: String(r['id']),
        periodStart: Number(r['period_start']),
        periodEnd: Number(r['period_end']),
        generatedAt: Number(r['generated_at']),
        summary: JSON.parse(await this.crypto.decryptField(dek, memberId, asBytes(r['summary_enc']))) as unknown,
        blobKey: r['blob_key'] === null ? null : String(r['blob_key']),
      });
    }
    return out;
  }

  // --- Sessions ------------------------------------------------------------

  async createSession(params: { memberId?: string; adminId?: string; ttlMs: number; csrfToken: string }): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    await this.db.run(
      'INSERT INTO session (id, member_id, admin_id, created_at, expires_at, csrf_token) VALUES (?, ?, ?, ?, ?, ?)',
      [id, params.memberId ?? null, params.adminId ?? null, now, now + params.ttlMs, params.csrfToken],
    );
    return id;
  }

  async getSession(id: string): Promise<{ memberId: string | null; adminId: string | null; csrfToken: string } | undefined> {
    const row = await this.db.get<{ member_id: string | null; admin_id: string | null; csrf_token: string; expires_at: number }>(
      'SELECT * FROM session WHERE id = ?',
      [id],
    );
    if (!row || row.expires_at < this.clock.now()) return undefined;
    return { memberId: row.member_id, adminId: row.admin_id, csrfToken: row.csrf_token };
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.run('DELETE FROM session WHERE id = ?', [id]);
  }

  /**
   * Every visit to a login page creates a session row to carry its CSRF token,
   * so unauthenticated traffic alone would grow the table without bound.
   * Swept by the cron tick.
   */
  async deleteExpiredSessions(now: number): Promise<number> {
    const { changes } = await this.db.run('DELETE FROM session WHERE expires_at < ?', [now]);
    return changes;
  }

  async deleteSessionsFor(memberId: string): Promise<void> {
    await this.db.run('DELETE FROM session WHERE member_id = ?', [memberId]);
  }

  // --- Admin ---------------------------------------------------------------

  async createAdmin(username: string, passwordHash: string): Promise<string> {
    const now = this.clock.now();
    const id = newId(now);
    await this.db.run('INSERT INTO admin_user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)', [
      id, username, passwordHash, now,
    ]);
    return id;
  }

  async findAdmin(username: string): Promise<{ id: string; passwordHash: string } | undefined> {
    const row = await this.db.get<{ id: string; password_hash: string }>('SELECT * FROM admin_user WHERE username = ?', [
      username,
    ]);
    return row ? { id: row.id, passwordHash: row.password_hash } : undefined;
  }

  async recordAdminAction(params: { adminId: string; action: string; subjectMemberId?: string; reason?: string }): Promise<void> {
    const now = this.clock.now();
    await this.db.run(
      'INSERT INTO admin_audit (id, admin_id, action, subject_member_id, reason, at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId(now), params.adminId, params.action, params.subjectMemberId ?? null, params.reason ?? null, now],
    );
  }

  async listAdminAudit(limit = 200): Promise<{ adminId: string; action: string; subjectMemberId: string | null; reason: string | null; at: number }[]> {
    const rows = await this.db.all<Record<string, SqlParam>>('SELECT * FROM admin_audit ORDER BY at DESC LIMIT ?', [limit]);
    return rows.map((r) => ({
      adminId: String(r['admin_id']),
      action: String(r['action']),
      subjectMemberId: r['subject_member_id'] === null ? null : String(r['subject_member_id']),
      reason: r['reason'] === null ? null : String(r['reason']),
      at: Number(r['at']),
    }));
  }

  // --- Deletion ------------------------------------------------------------

  /**
   * Cryptographic shredding first, row deletion second. Destroying the DEK
   * makes every remaining ciphertext unreadable even if a row survives.
   * See docs/adr/0004-envelope-encryption.md.
   */
  async deleteMemberData(memberId: string): Promise<{ blobKeys: string[] }> {
    const evidence = await this.db.all<{ blob_key: string }>('SELECT blob_key FROM evidence WHERE member_id = ?', [memberId]);
    const reports = await this.db.all<{ blob_key: string | null }>('SELECT blob_key FROM report WHERE member_id = ?', [memberId]);

    // Shred the key before deleting anything else.
    await this.db.run("UPDATE member SET dek_wrapped = ?, status = 'deleting' WHERE id = ?", [new Uint8Array(0), memberId]);

    const tables = [
      'identifier', 'listing', 'match_result', 'case_file', 'job', 'scheduled_job',
      'evidence', 'task', 'report', 'event', 'session', 'consent', 'mandate', 'verification_token',
    ];
    for (const table of tables) {
      await this.db.run(`DELETE FROM ${table} WHERE member_id = ?`, [memberId]);
    }
    await this.db.run('DELETE FROM member WHERE id = ?', [memberId]);
    await this.db.run('INSERT OR REPLACE INTO deleted_member (member_id, deleted_at) VALUES (?, ?)', [
      memberId,
      this.clock.now(),
    ]);

    const blobKeys = [
      ...evidence.map((r) => r.blob_key),
      ...reports.map((r) => r.blob_key).filter((k): k is string => k !== null),
    ];
    return { blobKeys };
  }
}
