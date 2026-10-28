# Roadmap

Three horizons. MVP is what this repository contains; v1 is the next
coherent release; "later" is direction, not commitment.

## MVP — in this repository

The goal of the MVP is **a complete, honest pipeline end to end**, not breadth
of broker coverage. A working loop over 29 brokers is worth more than 900
untested definitions.

| Area | Status |
| --- | --- |
| Broker definition schema + validator | ✅ |
| 29 seeded broker definitions covering every automation level and all but one opt-out method | ✅ (selectors unverified against live sites — see [broker-catalog.md](broker-catalog.md) §6) |
| Fixture-based broker tests, no live traffic in CI | ✅ |
| Scan → match (explained confidence) → consent gate → submit | ✅ |
| Submit via form, email, letter (PDF) | ✅ |
| Guided tasks for CAPTCHA / ID / phone | ✅ |
| Inbound-mail verification with per-job addressing | ✅ |
| Evidence capture with SHA-256 and write-once storage | ✅ |
| Durable re-check scheduling, per-broker intervals | ✅ |
| Envelope encryption of all PII, blind indexes | ✅ |
| Redacting logger + no-PII-in-logs test | ✅ |
| Web app: consent, agent agreement, profile, dashboard, tasks, reports, export, deletion | ✅ |
| Admin: job monitoring, broker health, review queue | ✅ |
| CLI for self-hosters | ✅ |
| Docker self-host at parity | ✅ |
| Cloudflare Workers deployment config | ✅ (not deployed) |
| Mock broker server + e2e tests | ✅ |
| CI: lint, typecheck, test | ✅ |
| California DROP: guided submission, agent disclosure, statutory timeline | ✅ |
| Postal/fax dispatch | ✅ PDF generation, ❌ provider |

### Explicitly not in MVP

Payments and billing; multi-member households; passkeys/TOTP; a public
effectiveness dashboard; browser extension; any non-English UI.

## v1 — the first release someone else should run

Ordered by value per unit of risk.

1. **Verify the seeded definitions against live sites.** The single highest
   -value piece of work in the project, and the one that needs explicit
   authorisation. Until it is done, coverage is theoretical.
2. **DROP outcome measurement.** The channel and the clock are built; what is
   missing is evidence of effect. Compare per-broker listings before and after
   a member's DROP request lands, which would be the first public measurement
   of whether the statutory channel actually works.
3. **Postal/fax provider adapter.** A `LetterDispatch` port with a real vendor
   behind it. Needs a vendor threat model — they see name and address in
   plaintext.
4. **Authentication hardening.** Passkeys, TOTP, session management review,
   external penetration test.
5. **Published per-broker effectiveness.** Removal rate at 30/90/180 days,
   re-list rate, health history. The thing no incumbent publishes.
6. **Broker coverage to ~100 verified definitions**, seeded from the California
   registry CSV, prioritised by how often each broker actually appears in
   members' scans.
7. **Households.** Several members under one operator account, each with their
   own independent consent and mandate — never a shared profile.
8. **Billing**, if operated commercially. Deliberately last: it is the easiest
   part and the least interesting.

### v1 exit criteria

- Measured removal rate published, from real runs, with the methodology
  described.
- Legal review of consent, mandate, and LPOA instruments complete.
- Penetration test complete, highs remediated.
- Self-host quick start works from a clean machine in under ten minutes.

## Later

**Deeper coverage**
- GDPR Article 15 discovery flow: subject access request first, erasure second.
- Non-US jurisdictions with their own registries and templates.
- Search-engine result removal, as a clearly-labelled separate capability — it
  is suppression, not deletion, and should never be reported as a removal.

**Better automation**
- Self-healing selectors: when a step's `expect` fails, propose a candidate
  selector from the DOM and open a PR for human review. Never auto-merge.
- Change detection on broker opt-out pages, so a definition breaks loudly
  before a member's request fails quietly.
- A community registry of signed definitions, so a self-hoster can pull updates
  without pulling the whole repo.

**Better product**
- Browser extension: complete a guided task in place, on the broker's page,
  with the values pre-filled.
- Exposure scoring over time, so "am I better off than in January?" has an
  answer.
- Portable evidence bundles signed by the instance, verifiable offline.

**Generalisation**
The same engine — catalogue of procedures, consent gate, job pipeline, evidence,
re-check — generalises to other "privacy agent" products: subject access
requests across companies the member deals with, marketing-list suppression,
breach-exposure follow-up. The extension path is written up in
[playbook/extending-to-new-products.md](playbook/extending-to-new-products.md).

## What would make us stop

Worth stating. The project should be abandoned or radically rethought if:

- statutory channels like DROP become comprehensive enough that per-broker
  automation is pure waste — in which case the right product is a thin,
  free DROP client and we should ship that instead;
- the catalogue cannot be maintained faster than brokers break it, making
  published coverage dishonest;
- the project is used, despite the structural controls, to look people up.
