# 0006 — Server-rendered UI with Hono + JSX, no SPA

**Status:** Accepted · **Date:** 2026-10-27

## Context

The product needs a real web app: consent flows, profile editing, a per-broker
dashboard, a task queue, reports, export, deletion, and an admin area. It also
needs to run identically on Workers and in a Node container, and it handles the
most sensitive category of data the project will ever touch.

## Decision

Hono as the HTTP framework on both targets, with Hono's JSX for
**server-side rendering**. Progressive enhancement only: small, explicit
`<script>` modules for the few genuinely interactive pieces. No client-side
router, no hydration, no SPA framework.

## Rationale

- **Smallest PII exposure surface.** Rendered HTML carries only what the page
  needs. There is no JSON API returning full profile objects to a client, and
  therefore no accidental over-fetching in a payload someone later caches,
  logs, or sends to an error reporter.
- **A strict CSP with no inline scripts is achievable**, which closes the XSS
  path to session theft ([threat-model](../threat-model.md) TB1).
- **Hono runs on Workers and Node unmodified**, satisfying ADR-0001 at the
  edges as well as in the core.
- Fast on Workers: no large JS bundle on a product whose pages are mostly
  tables and forms.
- Fewer dependencies in the package that handles PII.

## Consequences

**Good**
- The whole UI is testable with `fetch` against the app and an HTML assertion —
  no browser needed for UI tests.
- No build step for the UI beyond TypeScript compilation.

**Costs**
- Richer interactions (live job progress, drag-and-drop) need deliberate work
  rather than coming free. Accepted — the dashboard is a status table.
- JSX-on-the-server is less familiar to contributors expecting React.
  Mitigated in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Alternatives rejected

- **React/Next SPA.** Heavier, needs a JSON API surface over PII, harder to lock
  down with CSP, and a second runtime story for self-host.
- **HTMX.** A good fit, and close to what the progressive-enhancement scripts
  do by hand. Rejected only to avoid a client dependency in the PII path; worth
  revisiting.
- **A separate API + separate frontend.** Two deploys, two auth stories, and a
  JSON API that returns dossiers.
