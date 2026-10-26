# 0001 — Ports and adapters, with two adapter sets

**Status:** Accepted · **Date:** 2026-10-27

## Context

Two deployment targets are required: a hosted service on Cloudflare, and a
self-hostable Docker image. The brief makes self-hosting a requirement, not a
nice-to-have, and [research/06](../research/06-weaknesses-and-edge.md)
identifies "you must hand your entire identity to a third party" as the
category's central trust problem — so self-host must be at genuine feature
parity, not a degraded mode.

The platforms differ in almost every primitive: D1 vs SQLite, R2 vs filesystem,
Cloudflare Queues/Workflows vs an in-process scheduler, Browser Rendering vs
Playwright, Email Routing vs IMAP.

## Decision

The domain core (`@deletewe/engine`) depends only on **port interfaces** it
defines itself. It imports no platform SDK, no `node:` builtin, and no
`@cloudflare/*` package.

Ports: `Database`, `BlobStore`, `JobQueue`, `Scheduler`, `BrowserDriver`,
`Mailer`, `InboundMail`, `Crypto`, `KeyStore`, `Clock`, `Logger`,
`DropChannel`, `LetterDispatch`.

Two adapter packages implement them: `@deletewe/adapters-cf` and
`@deletewe/adapters-node`. Composition happens in `apps/worker` and
`apps/selfhost`.

## Consequences

**Good**
- The pipeline, matcher, consent gate, and evidence logic are tested with
  in-memory adapters — fast, deterministic, no cloud account, no network.
- A third adapter set (plain Postgres, another edge platform) is additive.
- `BrowserDriver` as a port is what makes fixture-based broker tests possible:
  the fixture runner is just another adapter serving recorded HTML. This is the
  mechanism that keeps live broker traffic out of CI.

**Costs**
- Indirection. Every new capability needs a port before it needs an
  implementation.
- The ports must be the intersection of what both platforms can do. Notably,
  Workflows' durable `sleep` is not available in Node, so **long waits are
  modelled as scheduler rows swept by a cron tick on both platforms** rather
  than as a platform primitive. Slightly worse on Cloudflare; identical
  behaviour everywhere, which is worth more.

**Enforced by**
- An ESLint `no-restricted-imports` rule banning platform packages inside
  `packages/engine`.
- A test that constructs the whole pipeline from in-memory adapters alone.

## Alternatives rejected

- **Cloudflare-only, self-host via `workerd`.** Ties self-hosters to a specific
  runtime and makes the "run it on your laptop" story worse.
- **Node-only, deploy to a container host.** Loses the edge platform's durable
  queues and managed browser, and the brief defaults to Cloudflare.
- **An abstraction library (e.g. an ORM) instead of hand-written ports.** Covers
  the database and nothing else; the interesting ports are browser, mail, and
  blobs.
