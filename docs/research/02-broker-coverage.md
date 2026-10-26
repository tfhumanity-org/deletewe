# 2. Broker coverage

## 2.1 The headline number, decoded

DeleteMe's public list page is titled "Remove Private Information from **969
Data Brokers**", with a stated update date of 09/17/26.
[SOURCED — [Sites We Remove From](https://joindeleteme.com/sites-we-remove-from/)]

Other figures circulate — 850+, 976, 986 — depending on the page and date.
[SOURCED — review coverage]

The number is **not** a per-plan coverage promise. The same page defines a
footnote legend that gates each site by tier:

| Marker | Tier gate |
| --- | --- |
| `*` | Standard plan and above |
| `**` | Business Gold, Diamond, Platinum, VIP |
| `***` | Diamond, Platinum, VIP |
| `****` | Platinum and VIP only |
| `ᵒ` | VIP exclusive |
| `~` | International plans |
| `^` | Custom requests only |

[SOURCED — [Sites We Remove From](https://joindeleteme.com/sites-we-remove-from/)]

Independent reviewers who counted the `*` entries report that **standard plans
cover roughly 87 brokers**, with premium tiers adding around 15 more; the
~969–986 headline includes custom-request-only sites and sites exclusive to
higher tiers not otherwise listed.
[SOURCED — [OneRep comparison](https://onerep.com/blog/deleteme-vs-optery),
[Aura comparison](https://www.aura.com/learn/aura-vs-deleteme)]

DeleteMe itself hedges on the page: *"Is list size the best measure of a
removal service? Not always."* [SOURCED]

**[INFERRED] what this tells us about the architecture.** A `^`
(custom-request-only) site is one for which no reusable automated procedure
exists — it is handled ad hoc by a human on request. The tier markers are
effectively a *maturity ladder for broker automation*, exposed as a pricing
surface. Sites move up the ladder as tooling is built for them.

## 2.2 How the sites group

Observed composition of the list [SOURCED — page structure] spans:

- **People-search / background-check sites** — Spokeo, BeenVerified,
  TruthFinder, Whitepages, Radaris, and the long tail of clones.
- **Public-record and court-record aggregators.**
- **Marketing and identity-graph brokers** — the firms that appear on state
  data-broker registries.
- **Large platforms** — Google, Facebook, Amazon appear in the list, which is a
  category stretch: these are not data brokers in the registry sense, and what
  is "removed" there is a search result or a profile field, not a broker record.
  [SOURCED that they appear; INFERRED that this inflates the count]

For `deletewe` we will use a stricter taxonomy. See
[broker-catalog.md](../broker-catalog.md).

## 2.3 The authoritative public broker lists

A major finding: **you do not need to reverse-engineer a broker list at all.**
Four US states run public registries, and California's is downloadable.

| State | Registrar | Notes |
| --- | --- | --- |
| California | CalPrivacy (formerly CPPA) | **603 registered brokers** in the 2026 registry; CSV at `cppa.ca.gov/data_broker_registry/registry.csv`; annual registration 1–31 January |
| Texas | Secretary of State | $300 annual fee, 31 January deadline |
| Oregon | Division of Financial Regulation | Registration required before brokering Oregonian data |
| Vermont | Secretary of State | Act 171 of 2018 §2446; overhauled by Act 138 (H.211, 2026) effective 1 January 2027 |

[SOURCED — [CA Data Broker Registry](https://cppa.ca.gov/data_broker_registry/),
[CA Lawyers Association comparative analysis](https://calawyers.org/privacy-law/data-broker-regulation-framework-a-comparative-analysis-of-california-texas-vermont-and-oregon/),
[Captain Compliance](https://captaincompliance.com/education/state-data-broker-laws-compared-ct-ca-tx-vt-mt/)]

The California registry carries the broker's legal name, contact details, and
disclosure columns — i.e. the exact metadata an opt-out needs.
[SOURCED — [registry](https://cppa.ca.gov/data_broker_registry/)]

**This is our structural advantage.** An open catalogue seeded from a public
government registry, with community-contributed opt-out procedures layered on
top, can be both larger and more honest than a proprietary list. It also means
our coverage number is *auditable*: anyone can diff our catalogue against the
registry.

## 2.4 Re-scan cadence

| Cadence | Evidence |
| --- | --- |
| Initial scan, first report within ~1 week | [SOURCED — reviews] |
| Full re-scan + re-opt-out every 3 months (quarterly) | [SOURCED — reviews and help center] |
| Continuous "24/7 data broker monitoring" claimed in marketing | [SOURCED — [joindeleteme.com](https://joindeleteme.com/)] |
| Ad-hoc custom removals between quarters, member-initiated | [SOURCED — help center] |
| Proactive Google-result scanning for Platinum/VIP | [SOURCED — Sites We Remove From] |

The "24/7 monitoring" marketing line and the "quarterly report" operational
reality are in tension. [INFERRED] The most likely reconciliation is that
monitoring and reporting run on different clocks: some checks run continuously
or per-broker, but the member-facing reporting artefact is produced quarterly.

**Why quarterly is the right default anyway.** [INFERRED] Re-listing is driven
by the broker's own data-refresh cycle, which is typically monthly to quarterly.
Re-checking much faster than the broker refreshes burns requests without
changing the outcome, and risks looking like abuse. Re-checking much slower
leaves the member exposed for months. Our catalogue therefore makes
`relist_interval_days` a **per-broker** field rather than a global constant, so
an aggressive re-lister can be checked monthly and a stable one annually.

## 2.5 What we will do differently

1. **Publish the catalogue as data, in the repo, under AGPL.** Every broker is a
   reviewable file with a schema. Coverage claims become diffable.
2. **Distinguish "we have an automated procedure" from "we know this broker
   exists".** Our catalogue carries an explicit `automation.level` field
   (`automated` / `assisted` / `manual` / `unsupported`) so a coverage number can
   never be inflated by counting sites nobody has written a procedure for.
3. **Seed from the California registry**, not from a competitor's list.
4. **Per-broker re-check intervals**, grounded in observed re-listing.

## Sources

- https://joindeleteme.com/sites-we-remove-from/
- https://joindeleteme.com/
- https://cppa.ca.gov/data_broker_registry/
- https://cppa.ca.gov/data_brokers/
- https://calawyers.org/privacy-law/data-broker-regulation-framework-a-comparative-analysis-of-california-texas-vermont-and-oregon/
- https://captaincompliance.com/education/state-data-broker-laws-compared-ct-ca-tx-vt-mt/
- https://onerep.com/blog/deleteme-vs-optery
- https://www.aura.com/learn/aura-vs-deleteme
- https://github.com/delistmydata/ca-data-broker-registry
