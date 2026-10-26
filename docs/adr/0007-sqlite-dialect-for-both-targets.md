# 0007 — One SQLite-dialect schema for D1 and self-host

**Status:** Accepted · **Date:** 2026-10-27

## Context

Hosted runs on D1; self-host runs on SQLite. D1 *is* SQLite, but the client
APIs differ and the temptation is to use a cross-dialect ORM so a Postgres
option stays open.

## Decision

A single hand-written migration set in **SQLite dialect**, applied by both
targets through the `Database` port. No ORM. Queries are written as SQL in
repository modules, with typed row mappers.

Compatibility rules the schema obeys:

- `TEXT` ULIDs for ids; no `AUTOINCREMENT`.
- `INTEGER` epoch-millisecond timestamps; no date/time types.
- `BLOB` for ciphertext.
- No stored procedures, triggers, views, or `RETURNING` beyond a single row.
- No `ALTER TABLE` beyond `ADD COLUMN`; structural changes are
  create-copy-drop-rename.
- Migrations are forward-only, numbered, and idempotent to re-apply.

## Consequences

**Good**
- The same migration file is the source of truth for both targets, so a schema
  change cannot be tested on one and broken on the other.
- Hand-written SQL makes the **member-scoping rule auditable**: a reviewer (or
  a grep in CI) can check that every query over a member-scoped table has a
  `member_id` predicate ([data-model](../data-model.md) §"Queries that must
  never exist"). An ORM's generated SQL would hide that.
- No ORM in the dependency tree of the package that touches PII.

**Costs**
- Moving to Postgres later means a dialect pass. Accepted: it is a bounded,
  mechanical job behind one port, and SQLite is sufficient for a member-scoped
  workload of this size.
- Hand-written row mappers are boilerplate. Contained in the repository layer.

## Alternatives rejected

- **Drizzle/Kysely.** Both support D1 and SQLite well and would be a reasonable
  choice. Rejected for the auditability point above and to keep the PII path
  dependency-light — but this is the least-strong decision in the set and the
  easiest to revisit.
- **Prisma.** Heavy, awkward on Workers.
- **Postgres everywhere.** Makes self-hosting require a database server,
  undermining "run it on your laptop".
