# deletewe

An open-source **personal data removal agent**. It finds your records on data
brokers and people-search sites, asks you whether each one is really you,
requests removal as your authorized agent, keeps the evidence, and checks again
later — because brokers re-list people.

It is the open counterpart to services like [DeleteMe](https://joindeleteme.com).
The research behind that comparison, drawn entirely from public sources, is in
[docs/research/](docs/research/).

AGPL-3.0-only. Self-hosting is a first-class mode, not an afterthought.

---

## Why this exists

Three things are true about this product category:

1. **The procedures are public knowledge.** Every removal service
   independently maintains the same ~100 opt-out procedures in private, and
   every one of them silently breaks when a broker changes a page.
2. **The central claim is unverifiable.** "Your data was removed" is exactly
   the kind of promise a customer cannot check without redoing the work.
   When Consumer Reports [measured it in 2024](https://innovation.consumerreports.org/Data-Defense_-Evaluating-People-Search-Site-Removal-Services-.pdf),
   the best paid service removed 68% of listings in four months and the worst
   removed 4%. A person doing it by hand managed 70%.
3. **You have to hand your whole identity to a third party to use one.** Every
   name you have used, every address you have lived at, your phone numbers,
   emails, and date of birth — a dossier more complete than most of the brokers
   hold.

`deletewe` answers all three: the procedures are a shared, executable,
testable commons; every claim is backed by portable evidence you own; and you
can run the whole thing on your own hardware.

## Principles

These are binding. Code that violates one is a bug.

1. **One subject.** The system holds and acts on data about the authenticated
   member and nobody else. There is no code path that profiles a third party —
   that is what separates a removal agent from a people-search engine.
2. **Consent before action.** Nothing leaves the system without a recorded,
   timestamped mandate. Revocation halts outbound work immediately.
3. **Evidence or it didn't happen.** Every state transition is backed by stored
   evidence you can export. "Removed" means a later scan found nothing — never
   that a broker's success page said so.
4. **Honest automation boundary.** CAPTCHAs, ID uploads and phone calls become
   guided tasks for you. We never solve a CAPTCHA or bypass an access control.
5. **Minimum necessary disclosure.** Each broker receives only the fields its
   own opt-out procedure declares. Nothing else is even in scope for it.
6. **Measured, not claimed.** Per-broker outcomes are recorded and published.

## Run it locally

### Docker, the short version

```bash
git clone https://github.com/tfhumanity-org/deletewe
cd deletewe
docker compose up --build
# open http://localhost:8787
```

An encryption key is generated into `./data/keys.json` on first boot.
**Back it up.** Losing it makes every stored record permanently unreadable —
that is what encryption means, and it is the point.

### From source

Requires **Node 22 or newer** (24+ recommended: `node:sqlite` needs no native
build step, which is why self-hosting has no compile dependencies).

```bash
npm ci
npm run verify        # lint, typecheck, 210 tests — all must pass
```

Then start the app. **`npm run dev` runs in the foreground**, so give it its own
terminal — the commands below it are separate sessions, not a sequence to paste:

```bash
npm run dev           # terminal 1: the app, http://localhost:8787
```

```bash
npm run mock-broker   # terminal 2 (optional): a stand-in broker on :8788
```

```bash
# terminal 3: the CLI, against the same ./data directory
npm run cli -- admin create ops 'a-sufficiently-long-password'
npm run cli -- catalog report
```

On first boot an encryption key is written to `./data/keys.json` (gitignored).
Back it up before you put anything real in.

### Try the whole loop without touching a real broker

Start the mock broker above, then sign up at `http://localhost:8787`, fill in a
profile, and run a scan from the profile page.

The full loop — scan, match, confirm, submit, email verification, re-check —
is covered by [`tests/src/e2e.test.ts`](tests/src/e2e.test.ts), which drives
the engine against that server over real HTTP.

### The CLI

```bash
npm run cli -- help
npm run cli -- catalog report          # honest coverage breakdown
npm run cli -- scan you@example.com    # queue and run a scan
npm run cli -- status you@example.com  # per-broker status
npm run cli -- tasks you@example.com   # the steps only you can do
npm run cli -- report you@example.com
npm run cli -- export you@example.com > my-data.json
npm run cli -- delete you@example.com --yes
```

## How it works

```
 profile ──> SCAN ──> MATCH ──> CONFIRM ──> SUBMIT ──> VERIFY ──> EVIDENCE ──> RECHECK
                       │           │           │          │           │           │
                   confidence   consent    form/email/  inbound    screenshot   schedule
                     score       gate        letter     mailbox     + hash      per broker
                                   │           │          │
                                   └───────────┴──────────┴──> GUIDED TASK (you)
```

Full design in [docs/architecture.md](docs/architecture.md). The short version:

- **California DROP is promoted, not buried.** One state request reaches every
  registered broker. We cannot submit it — the portal verifies residency
  through a government identity check and the regulations let an agent *aid* a
  request, not make one — so we give the member the exact steps, our agent
  disclosure details, and then hold the statutory clock (45 days for brokers to
  retrieve, 90 for status). See [docs/architecture.md](docs/architecture.md#11-california-drop).
- **Brokers are data, not code.** One schema-validated YAML file per broker
  ([docs/broker-catalog.md](docs/broker-catalog.md)). A definition can only
  reach hosts it declares and read profile fields it declares, so a malicious
  pull request has a bounded blast radius.
- **The consent gate sits between match and submit.** Nothing is sent until
  you confirm, with the match explained field by field.
- **Breakage is distinguished from refusal.** When a step's expectation fails,
  that is recorded against the *definition* and the broker is paused — not
  recorded as the broker refusing you. This is the failure mode that quietly
  degrades every service in this category.
- **Long waits are rows, not timers.** Verification windows and quarterly
  re-checks live in the database with a `run_after`, swept by a cron tick, so a
  quarterly product survives a deploy.

## Repository layout

```
packages/
  schema/          Broker-definition schema (Zod) + the cross-field validator
  catalog/         29 broker YAML files, loader, validator CLI, coverage report
  engine/          Domain core: ports, pipeline, matcher, crypto, store
  browser/         fetch-based and fixture browser drivers (portable)
  adapters-node/   SQLite, filesystem blobs, in-process queue, mail, keys
  adapters-cf/     D1, R2, Queues, Browser Rendering, Email Routing
  web/             Server-rendered Hono + JSX app and admin console
  cli/             Self-hoster CLI
apps/
  selfhost/        Node entrypoint (the Docker image)
  worker/          Cloudflare Worker entrypoint
  mock-broker/     Stand-in broker for end-to-end tests
tests/             Integration, security, web and end-to-end suites
docs/              Research, specs, ADRs, and the agent playbook
```

## Deploying to Cloudflare

`apps/worker` targets Workers, D1, R2, Queues, Browser Rendering and Email
Routing. [`apps/worker/wrangler.toml`](apps/worker/wrangler.toml) has the
bindings; nothing is deployed by the build. Before `wrangler deploy` you need
D1 and R2 resources, a queue, a domain with Email Routing, and three secrets
(`MASTER_KEY`, `INDEX_KEY`, `MAIL_API_KEY`). See
[docs/playbook/working-in-this-repo.md](docs/playbook/working-in-this-repo.md).

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/research/](docs/research/) | Public-source research on the incumbent, every claim labelled sourced or inferred |
| [docs/product-spec.md](docs/product-spec.md) | What this is, who for, what it will not do |
| [docs/architecture.md](docs/architecture.md) | System and pipeline design, with diagrams |
| [docs/data-model.md](docs/data-model.md) | Schema, encryption scheme, retention |
| [docs/threat-model.md](docs/threat-model.md) | Assets, adversaries, STRIDE, and harms to non-users |
| [docs/broker-catalog.md](docs/broker-catalog.md) | The broker definition format and its safety rules |
| [docs/roadmap.md](docs/roadmap.md) | MVP, v1, later — and what would make us stop |
| [docs/adr/](docs/adr/) | Seven decisions and why |
| [AGENTS.md](AGENTS.md) | For an agent studying this app or building its own |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to add a broker |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability, and our commitments |

## What is honest to say about coverage

```
definitions   29
enabled       28
verified live  0   <- the only number that means coverage
```

The 29 definitions were authored from public opt-out documentation and **have
not been executed against live broker sites** — that was outside the authorised
scope of this build. Every definition carries a `verified_at` field, the
validator warns when it is absent, and the admin console shows "never".

This matters because a broker count without an automation breakdown is a
marketing number. Run `npm run cli -- catalog report` for the real split.

## What still needs a human

Stated plainly rather than buried:

| Item | Why it cannot be done in code alone |
| --- | --- |
| **Legal review** | The consent, mandate and limited-power-of-attorney documents in `packages/engine/src/documents.ts` are engineering artefacts, not reviewed instruments. A lawyer must review them before this operates for anyone other than its own author. Open questions are listed in [docs/research/05-legal-basis.md](docs/research/05-legal-basis.md#57-open-legal-questions-for-human-review). |
| **Verifying the broker definitions** | Someone has to run each procedure against the real site, with their own data and their own consent, and set `verified_at`. Until then coverage is theoretical. |
| **A postal/fax provider** | Letter PDFs are generated and downloadable; dispatching them needs a vendor, and that vendor sees name and address in plaintext. `LetterDispatch` is the seam. |
| **A domain and inbound mail** | Most opt-outs complete only when an emailed link is clicked, often within 24 hours. That needs a domain you control with per-job addressing routed back in. |
| **An outbound mail provider** | Until `DELETEWE_MAIL_ENDPOINT` is set, outbound mail is written to `data/outbox` as files instead of being sent. |
| **A penetration test** | Before any hosted launch. |

## Licence

AGPL-3.0-only. If you run a modified version as a network service, you owe your
users the source. For a privacy tool, that is a feature: the only way to know
what a service does with your dossier is to be able to read it.
