# Research: DeleteMe (Abine, Inc.)

Reverse-engineering notes for `deletewe`, an open-source personal-data-removal
agent. The subject is **DeleteMe** (joindeleteme.com), operated by Abine, Inc.

## Method and scope

All research here comes from **public sources only**: the marketing site, the
public help center, published opt-out guides, privacy policy and terms, public
job postings, press coverage, independent reviews, and government registries.

We did **not**:

- create an account, sign up, or purchase a plan;
- access anything behind a login or paywall;
- scrape the site programmatically or bypass any access control;
- send any opt-out request to any real data broker.

Where a page was unreachable without authentication (e.g. the member dashboard,
the data sheet help article returned HTTP 403), we say so and mark the resulting
claim as inferred from secondary reporting.

## Claim labelling

Every substantive claim in these documents carries one of:

- **[SOURCED]** — directly supported by a cited public URL. The link is given
  inline or in the Sources section of that file.
- **[INFERRED]** — our reasoning from observable behaviour, job postings,
  pricing structure, or domain knowledge. Not stated by DeleteMe.
- **[UNKNOWN]** — we looked and could not determine it from public sources.

Treat **[INFERRED]** as a hypothesis for our own design, never as a factual
statement about DeleteMe's systems.

## Contents

| File | Covers |
| --- | --- |
| [01-user-journey.md](01-user-journey.md) | Signup, data collected, plans, pricing, dashboard, quarterly report |
| [02-broker-coverage.md](02-broker-coverage.md) | Which sites, how grouped by tier, re-scan cadence, the "969 brokers" number |
| [03-removal-mechanics.md](03-removal-mechanics.md) | Per-broker opt-out methods, verification, CAPTCHAs, automation vs humans |
| [04-architecture-inference.md](04-architecture-inference.md) | Likely system design: scan, match, job queue, re-check, evidence, reporting |
| [05-legal-basis.md](05-legal-basis.md) | CCPA/CPRA, Delete Act + DROP, other states, GDPR, authorized-agent rules |
| [06-weaknesses-and-edge.md](06-weaknesses-and-edge.md) | Where the incumbent is weak and what an open-source product can do better |

## Headline findings

1. **The business is a subscription on recurrence, not a one-time deletion.**
   Brokers re-list. The quarterly re-scan is the product. [SOURCED]
2. **Measured effectiveness is the category's soft underbelly.** Consumer
   Reports (2024) measured DeleteMe at 27% of listings removed in four months,
   against 70% for a person doing it manually. [SOURCED]
3. **A large fraction of the work is done by humans.** DeleteMe staffs a
   "Privacy Advisor" team that documents cases in Jira and troubleshoots
   "adversarial problem sites". Automation covers the easy brokers; people
   cover the hard ones. [SOURCED]
4. **The advertised broker count is a marketing surface, not a coverage
   promise.** The headline number spans every plan tier plus custom requests;
   the entry plan covers far fewer. [SOURCED]
5. **California's DROP changes the economics.** Since 1 January 2026 a single
   state-run request reaches every registered broker, and since 1 August 2026
   brokers must poll it every 45 days. For Californians this is cheaper and
   more complete than per-broker scraping. [SOURCED]
