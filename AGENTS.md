# AGENTS.md

Instructions for an agent working in this repository, and for an agent that
wants to study an app like this one and build its own version.

Two audiences, two halves. Read the half you need.

---

# Part 1 — Working in this repository

## The five rules

Violating any of these is a bug, not a trade-off. They are enforced by tests
and lint rules, not just by convention, so you will find out quickly.

1. **One subject.** The system holds and acts on data about the authenticated
   member and nobody else. Do not add a search endpoint, a "lookup by name"
   parameter, or any path that profiles a third party. There is no safe version
   of this feature; it would turn a removal agent into a people-search engine.
2. **No CAPTCHA solving, no access-control bypass.** No solver integration, no
   port for one, no login-wall scraping, no bot-detection evasion. The answer
   is always a guided task for the member.
3. **No PII in logs.** The logger's type signature accepts only ids, enum
   codes, counts and booleans. A profile value is not representable in it.
   Keep it that way. `tests/src/pipeline.test.ts` seeds sentinel values and
   asserts none reach the sink.
4. **No live broker traffic in tests or CI.** Fixtures or the mock broker.
5. **Every gate passes before every commit.** `npm run verify`. No exceptions.

## Commands

```bash
npm ci                 # install
npm run build          # tsc -b across the project graph
npm run verify         # lint + typecheck + 264 tests — THE gate
npm run test:watch

npm run dev            # self-hosted app on :8787
npm run mock-broker    # stand-in broker on :8788
npm run cli -- help

npm run catalog:validate   # schema + cross-field rules on all definitions
npm run catalog:report     # the honest coverage breakdown
npm run broker:new -- <id> # scaffold a definition + fixture directory
```

`npm run build` is incremental; most scripts run it first, so a stale `dist/`
is rarely the problem. If something is weirdly wrong, `npm run clean`.

## Layout, and where to make a change

| You want to… | Go to |
| --- | --- |
| Change how listings are scored | `packages/engine/src/matcher.ts` (pure, no I/O — test it directly) |
| Change what a broker is allowed to express | `packages/schema/src/broker.ts` + `validate.ts` |
| Add or fix a broker | `packages/catalog/brokers/<id>.yaml` + `fixtures/<id>/` |
| Change the pipeline | `packages/engine/src/pipeline/` |
| Add a capability the engine needs | **Define a port first** in `ports.ts`, then implement it in *both* adapter sets |
| Change the UI | `packages/web/src/views/` (server-rendered JSX, no client framework) |
| Change the schema | `packages/engine/src/db/migrations.ts` — forward-only, SQLite dialect |

## Architectural boundaries the tooling enforces

- **`packages/engine` cannot import `node:*`, `@cloudflare/*`, or any adapter.**
  An ESLint rule fails the build. This is what makes the hosted and self-hosted
  builds share 100% of the domain logic. See
  [docs/adr/0001-ports-and-adapters.md](docs/adr/0001-ports-and-adapters.md).
- **Every member-scoped query takes `member_id` explicitly.** No helper that
  infers it from ambient state, ever.
- **Evidence is write-once.** There is no update path in the repository layer.
  Do not add one.
- **Long waits are rows with a `run_after`, swept by a cron tick** — never
  in-memory timers or queue delays. A quarterly product has to survive a deploy.

## Conventions

- TypeScript, `strict` plus `noUncheckedIndexedAccess`. Relative imports carry
  the `.ts` extension (`rewriteRelativeImportExtensions` rewrites them on emit),
  so the same file runs under `node` and compiles under `tsc`.
- Comments explain *why*, never *what*. If a comment restates the code, delete
  it. The comments worth writing here record a decision someone would otherwise
  undo: why a threshold is where it is, why a check exists, why a shortcut is
  refused.
- Tests assert behaviour and security properties, not implementation. The most
  valuable assertion in this repository is **"we did not send anything"**.
- British-English prose in docs. Code identifiers follow their ecosystem.

## When you are about to do something that contacts a real broker

Stop and ask the human first. Scanning, submitting, and verification against a
live broker site are real actions with real consequences for a real person's
records. The mock broker exists so you never need to.

---

# Part 2 — Studying an app like this and building your own

What follows is the method actually used to produce this repository, including
the parts that went wrong.

## 2.1 Research from public sources

### What gave the most signal, ranked

| Source | Signal | Why |
| --- | --- | --- |
| **Job postings** | ★★★★★ | The highest-value source by a distance. DeleteMe's "Privacy Advisor" posting said staff "maintain detailed case documentation in **Jira**" and "investigate and troubleshoot adversarial **problem sites**". That single sentence establishes there is a per-listing human work queue, that hard brokers are handled by people, and that tooling gaps are a known named problem. No marketing page would ever say that. |
| **Independent measurement** | ★★★★★ | Consumer Reports' 2024 study measured removal rates across seven services. It gave a number the vendor would never publish (27% in four months vs 70% for manual), which reframed the whole competitive analysis: the gap is follow-through, not knowledge. |
| **The company's own free content** | ★★★★☆ | DeleteMe publishes per-broker opt-out guides as content marketing. They are the most detailed public description of the procedures the paid product automates — including a per-broker *difficulty rating*, which reveals they model brokers as a heterogeneous set with known cost. |
| **Government registries** | ★★★★☆ | California's data broker registry is a downloadable CSV of 603 registered brokers with contact details. The "secret" broker list turned out to be a public record. |
| **Footnote legends and small print** | ★★★★☆ | The tier markers (`*`, `**`, `***`, `ᵒ`, `^`) on the "sites we remove from" page decode a 969-broker headline into ~87 on the entry plan. The asterisks were more informative than the number. |
| **Reviews and comparisons** | ★★★☆☆ | Useful for dashboard and report screenshots, and for counting what the marketing page obscures. Heavily biased when written by a competitor — check the byline. |
| **ToS and privacy policy** | ★★★☆☆ | The limited-power-of-attorney clause explains a load-bearing product decision. Policies are vaguer than you hope. |
| **Marketing pages** | ★★☆☆☆ | Claims, not mechanisms. Useful mainly for what they carefully avoid saying. |

### How to infer architecture from what a user can see

Every visible behaviour constrains the system behind it. Work backwards:

| Observation | What it forces |
| --- | --- |
| "First report within a week" | Not real-time. A batch pipeline with days of slack, and probably human review in the loop |
| "Quarterly re-scan" | A durable per-member schedule surviving months — not a cron over a flat table |
| A **"Listings Reviewed"** counter | A persistent listing entity with a review count. Listings are rows, not transient scan output |
| "Flag a broker you don't recognise" | The matcher produces false positives, and the user is the final classifier |
| "We notify you before opting out from newly identified brokers" | An explicit consent gate between match and submit |
| Screenshots in the report | Headless browser capture plus blob storage, retained for at least a reporting period |
| Plan tiers gating broker access | Broker procedures are **data** with per-broker entitlement metadata |
| A "custom removal request" box | An intake that creates work items outside the catalogue — i.e. the catalogue does not cover everything, and they know it |

The discipline that makes this useful: **label every claim**. We used
`[SOURCED]` with a link, `[INFERRED]`, or `[UNKNOWN]`, and kept them separated
in [docs/research/](docs/research/). An inference you later mistake for a fact
is how a design acquires a requirement nobody can justify.

### Where to stop

We did not sign up, did not access anything behind a login, did not scrape, and
did not send a request to any broker. That is not only an ethical line — it is
a practical one. Everything load-bearing in the design above came from public
sources. The marginal value of the authenticated product tour would have been
small, and the cost of crossing that line is that your own project's
credibility is the thing you are trading.

## 2.2 The product ideas worth copying

Four, in order of how much they matter.

### Recurring re-scan is the business model

Brokers re-list. A one-time deletion is worth little; the subscription exists
because the loop never terminates. Three consequences for your design:

1. **The re-check loop is the product, not the submit action.** Services that
   underperform a diligent human are failing at follow-through, not at
   submission — the procedures are public.
2. **Re-check intervals belong per broker**, not as a global constant. An
   aggressive re-lister needs checking monthly; a stable one annually. Checking
   faster than a broker refreshes burns requests and looks like abuse.
3. **Removal is proved by a later scan finding nothing** — never by a success
   page. We enforce this: `acknowledged` and `removed` are different states,
   and only a re-check moves between them.

### Broker definitions as data

One schema-validated file per broker: search URL, extraction rules, match
weights, opt-out method, ordered steps, verification, re-list interval.

The obvious implementation is one code module per broker. **Do not.** If your
project accepts outside contributions, a code plugin can do anything: read the
whole profile, call any endpoint, exfiltrate. Declarative data with a closed
action enum, a host allowlist, and a declared field projection bounds the blast
radius by construction rather than by reviewer attention. See
[docs/adr/0003](docs/adr/0003-brokers-as-declarative-data.md).

The cost is expressiveness. Handle it honestly: a broker whose flow the schema
cannot express is marked `manual` or `assisted`, not given an escape hatch that
reintroduces the whole threat.

### Human-in-the-loop as a mechanism, not a tier

The incumbent sells access to human "Privacy Advisors" by plan tier. The idea
worth copying is the *mechanism*; the part worth changing is who the human is.

Make `handoff` a first-class pipeline state. Reaching one does not fail the
job: it captures evidence of exactly where automation stopped, creates a task
with the values pre-filled and a deep link, parks the case, and resumes when
the member says they are done. Every member gets it, and a self-hoster is their
own privacy advisor.

This also lets you publish an honest `automation.level` per broker instead of
hiding the boundary behind a coverage number.

### Evidence-backed reporting

A removal service makes a claim the customer cannot check. The screenshot-backed
report is how it becomes checkable, and it is the product's trust mechanism.

Go further than the incumbent in three ways: make evidence **write-once** with
a content hash so it cannot be revised; make it **exportable** so the member
owns the trail rather than renting it; and lead the dashboard with *outcomes*
(removed / still listed / blocked) rather than *effort* ("listings reviewed").
Effort metrics tell the user how busy you were, not whether their exposure
went down.

## 2.3 Pitfalls hit during this build

Real ones, with how they were solved.

### The field extractor ignored its own selector

Extraction rules name a selector relative to the result container
(`name: { selector: '.person-name' }`). The first implementation passed the
*container's* snapshot to the extractor and read the attribute off it, so every
field came back as the container's full text, every listing failed to produce a
URL, and every candidate was silently discarded. The scan reported "3
candidates, 3 discarded" and looked almost plausible.

**Cause:** `ElementSnapshot` crossed the port boundary as plain data, so the
engine had no way to sub-select — and the code quietly did the wrong thing
instead of failing.
**Fix:** `ElementSnapshot` gained a `find(selector)` method. The driver holds
the DOM and supplies the lookup; the engine keeps the extraction logic.
**Lesson:** when a port's data type loses a capability the domain needs, the
calling code will silently approximate it. Put the capability in the type.

### A middle name made a correct match look wrong

A member whose profile said "Ada Byron Lovelace" scored 0.89 against a listing
reading "Ada Lovelace" — below the auto-confirm threshold — because the matcher
averaged over the member's given-name tokens and penalised "Byron" for having
no counterpart.

**Fix:** compare first given names directly, and count middle names only when
*both* sides supply one. A broker that omits a middle name is not weaker
evidence; it is less evidence.
**Lesson:** asymmetric data is the normal case in matching. Decide explicitly
whether a missing field on one side is a mismatch or merely an absence. It is
almost always an absence.

### `response.url` is empty on a synthetic Response

The fetch driver checked the post-redirect host against the allowlist using
`response.url`, which is `''` for a `Response` constructed in a test. The
allowlist check then compared against an empty string and threw, failing a test
that should have passed.

**Fix:** fall back to the requested URL. **Lesson:** this was a *test* catching
a real robustness bug in a security control. Treat a failing security test as
"the control is wrong" before "the test is wrong".

### The admin login page set the wrong cookie

`startSession` chose the cookie by whether an `adminId` was present. The admin
*login form* has no admin id yet, so its CSRF token landed in the member
cookie, and the POST handler — reading the admin cookie — could never match it.
Admin pages returned empty bodies.

Worse: a test asserting "no member PII appears on any admin page" **passed**,
because the pages were empty.
**Fix:** an explicit `admin: true` flag on session creation.
**Lesson:** a negative assertion ("X does not appear") passes trivially when
the page is broken. Pair every negative assertion with a positive one that
proves the page rendered at all.

### Test clocks and rate limiters disagree

Per-broker politeness (`min_interval_ms`) correctly blocked a submit that
followed a scan, because the test clock had not moved between them. Half the
pipeline suite failed with `{ kind: 'blocked', reason: 'rate_limited' }`.

**Fix:** advance the test clock between broker interactions, which is what
happens in reality anyway.
**Lesson:** a controllable clock is essential for testing a product with
multi-month waits — and it will expose every place the code assumes time
passes. That is a feature. Do not weaken the rate limiter to make tests pass.

### The validator caught the thing it was built to catch

On first run, `catalog:validate` rejected two of the 29 seeded definitions: one
whose email template referenced `{{address}}`, `{{city}}`, `{{region}}` and
`{{postal_code}}` without declaring them in `required_fields`, and one that
declared three fields it never used.

Both were mine, written minutes earlier, in a project whose stated principle is
minimum necessary disclosure.
**Lesson:** this is the strongest argument for making your safety properties
*mechanical*. A rule you enforce only by intention is a rule you will break
while writing the code that documents it.

### Schema strictness versus test convenience

Broker definitions must use `https`. The mock broker, being a local test
server, speaks `http`. The tempting fix is a loopback carve-out in the schema.

**Fix instead:** the test defines the broker at `https://mock-broker.test` and
maps the driver's `fetch` onto the local server, rewriting `response.url` back
to the public origin. The definition stays strict and the host allowlist is
genuinely exercised.
**Lesson:** when a security rule makes testing awkward, move the awkwardness
into the test harness, never into the rule.

## 2.4 Checklists

- [Adding a broker](docs/playbook/adding-a-broker.md)
- [Adding a jurisdiction](docs/playbook/adding-a-jurisdiction.md)
- [Extending to a new kind of privacy agent](docs/playbook/extending-to-new-products.md)
- [The research method, in full](docs/playbook/research-method.md)
- [Working in this repo](docs/playbook/working-in-this-repo.md)

## 2.5 If you take one thing

The incumbent's weakness is not its engineering. It is that **the central claim
is unverifiable, the coverage number is a marketing surface, and the user must
hand their whole identity to a third party to participate.**

An open-source project cannot win on headcount. It can win on being checkable:
procedures anyone can read, coverage anyone can diff against a public registry,
evidence the user owns and can verify offline, an automation boundary stated
rather than hidden, and the option to run the whole thing on your own hardware
so the privacy tool is not itself a privacy risk.

Build for that, and the parts you are worse at stop mattering as much.
