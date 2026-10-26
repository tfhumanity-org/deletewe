# 0003 — Broker procedures as declarative data, not code

**Status:** Accepted · **Date:** 2026-10-27

## Context

Each broker needs a search procedure, a match configuration, an opt-out
procedure, and a verification procedure. There are ~100 to maintain for a
credible product and ~600 registered in California alone.

The obvious implementation is one TypeScript module per broker, exporting
functions. It is flexible and familiar.

It is also unsafe for an open project. A broker "plugin" that is code can do
anything: read the whole profile, make arbitrary requests, exfiltrate. Our
highest-leverage attack surface is a malicious pull request to the catalogue
([threat-model](../threat-model.md) TB8).

## Decision

Broker procedures are **declarative YAML**, validated against a closed schema.
There is no scripting hook, no expression language beyond `{{field}}`
substitution, and no escape to code.

Three structural constraints:

1. **Closed action enum** — `goto`, `fill`, `select`, `click`, `wait_for`,
   `expect`, `extract`, `screenshot`, `handoff`. No file upload, no eval, no
   arbitrary fetch.
2. **Host allowlist** — every URL must be on the definition's own `hosts` list;
   the validator rejects violations and the browser adapter enforces it at
   runtime as well.
3. **Declared field projection** — `required_fields` is a closed enum, and the
   submitter is handed only those fields. A definition cannot reach for a
   member's date of birth without saying so in a reviewable diff.

## Consequences

**Good**
- A malicious definition's blast radius is bounded by the schema, not by
  reviewer attention.
- Definitions are diffable, reviewable by non-programmers, and testable against
  fixtures without executing project code.
- `definition_sha256` on every job and evidence record makes retroactive
  tampering visible.
- The catalogue can be published and consumed independently of the engine.

**Costs**
- Expressiveness. Some brokers will have flows the schema cannot express.
  **This is handled, not worked around:** such a broker is marked
  `automation.level: manual` with instructions, or `assisted` with a `handoff`.
  Representing it honestly is better than adding an escape hatch that
  reintroduces the whole threat.
- Schema evolution pressure. Mitigated by `version` on every definition and a
  versioned schema.

## Alternatives rejected

- **TypeScript plugins.** Maximum power, unacceptable supply-chain risk for a
  product whose entire value proposition is handling PII safely.
- **A sandboxed DSL (QuickJS/WASM).** Genuinely expressive and genuinely
  sandboxable, but it is a large amount of machinery, and the sandbox still has
  to be given network access to be useful — at which point the host allowlist is
  doing the real work anyway. If the schema proves too restrictive in practice,
  this is the escalation path.
- **Recorded browser traces.** Brittle, unreviewable, and impossible to reason
  about in a diff.
