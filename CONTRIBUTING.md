# Contributing to deletewe

The most valuable contribution is a **broker definition that has actually been
run against the real site**. Everything else is secondary.

## Ground rules

1. **One subject.** Nothing may make it possible to look up a person who has
   not consented. A pull request that adds a search endpoint, a "lookup by
   name" feature, or any way to run a profile for someone other than the
   authenticated member will be rejected on sight, however it is framed.
2. **No CAPTCHA solving.** No solver integrations, no proposals for one, no
   "optional" plugin. Same for login bypasses and bot-detection evasion. A
   CAPTCHA is a site saying it wants a human; the answer is a guided task.
3. **No PII in logs, tests, or fixtures.** Use the synthetic identities. The
   logger's type signature cannot express a profile value — keep it that way.
4. **No live broker traffic in CI.** Tests run against recorded fixtures or the
   local mock broker. Never against a real site.
5. **Minimum necessary disclosure.** A broker gets the fields its own procedure
   needs, declared in `required_fields`. If you find yourself wanting one more
   field "just in case", that is the feeling the rule exists for.

## Adding a broker

The full checklist with worked examples is in
[docs/playbook/adding-a-broker.md](docs/playbook/adding-a-broker.md). The short
version:

```bash
npm run broker:new -- acme-people-search
```

That scaffolds `packages/catalog/brokers/acme-people-search.yaml` and a fixture
directory. Then:

1. **Read the broker's published opt-out page.** Do not guess. Cite it in
   `references`.
2. **Fill in the definition.** Every URL must be on the `hosts` allowlist;
   every `{{field}}` must be in `required_fields`. The validator enforces both.
3. **Be honest about `automation.level`.**

   | Level | Means |
   | --- | --- |
   | `automated` | The engine finishes with no human step. Cannot contain a `handoff`. |
   | `assisted` | The engine gets partway and hands off (CAPTCHA, ID, login). |
   | `manual` | No automation; the member gets instructions. |
   | `unsupported` | We know it exists, no procedure we trust. Ship it disabled. |

   The validator rejects `automated` on a flow with a handoff, and requires a
   `reason` for anything that is not `automated`. Inflating this is how coverage
   numbers become marketing numbers.
4. **Record fixtures** into `packages/catalog/fixtures/<id>/`. Redact
   aggressively: replace every real name, address, phone and email with the
   synthetic identities in `fixtures/_identities.json`. A fixture containing a
   real person's data is a privacy incident in a repository that exists to
   prevent them.
5. **Set `verified_at`** to the date you ran it against the live site, using
   **your own data and your own consent**. Never test an opt-out with anyone
   else's details. If you have not run it, leave the field out — the validator
   will warn, which is correct.
6. **Run the gates.**

   ```bash
   npm run catalog:validate
   npm run verify
   ```

### What a good definition looks like

- Selectors scoped tightly enough to survive a layout tweak, loose enough not
  to break on a class-name change. Prefer `input[name="email"]` over
  `.form > div:nth-child(3) > input`.
- An `expect` on every step that changes the page, so breakage is detected as
  breakage rather than recorded as the broker refusing you.
- A `relist.interval_days` grounded in how often that broker actually re-lists,
  not copied from the default. Aggressive re-listers get a shorter interval.
- `notes` explaining anything surprising. Future you will be grateful.

## Working on the engine

```bash
npm ci
npm run verify        # the gate: lint, typecheck, full test suite
npm run test:watch
```

**Every gate must pass before a commit.** There is no "fix the types later".

### Boundaries the tooling enforces

- `packages/engine` may not import `node:*`, `@cloudflare/*`, or any adapter
  package. An ESLint rule fails the build if it does. If the engine needs a new
  capability, add a **port** and implement it in both adapter sets. See
  [docs/adr/0001-ports-and-adapters.md](docs/adr/0001-ports-and-adapters.md).
- Every member-scoped query takes `member_id` explicitly. No exceptions, no
  convenience helpers that infer it.
- Evidence is write-once. There is no update path in the repository layer, and
  there should never be one.

### Tests

| Suite | What it is for |
| --- | --- |
| `packages/*/src/*.test.ts` | Pure units: matcher, crypto, projection, validator, PDF, logger |
| `packages/catalog/src/catalog.test.ts` | Properties every shipped definition must hold |
| `tests/src/pipeline.test.ts` | The pipeline against fixture pages |
| `tests/src/security.test.ts` | Supply-chain containment, one-subject, disclosure limits |
| `tests/src/web.test.ts` | Routes, CSP, CSRF, cross-member isolation |
| `tests/src/e2e.test.ts` | The whole loop against the mock broker over real HTTP |

A test that asserts a *security property* is worth more than one that asserts a
happy path. The property worth most: "we did not send anything".

## Commit and review

- Small, focused commits with a message saying *why*, not *what*.
- A broker change should include a fixture change, or say why it does not.
- `packages/catalog/brokers/**` is CODEOWNERS-protected: changes there get a
  closer read than anything else in the repository, because a definition is the
  one place an outsider can influence what leaves the system.

## Reporting a security issue

Do not open a public issue. See [SECURITY.md](SECURITY.md).
