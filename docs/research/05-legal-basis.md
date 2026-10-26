# 5. Legal basis for acting as someone's agent

> **This is not legal advice.** It is engineering research, assembled from
> public sources, to decide what the software must be capable of. Every
> jurisdictional claim here must be reviewed by a qualified lawyer before
> `deletewe` is operated as a service for anyone other than its own author.
> See [the open items list](../../README.md#what-still-needs-a-human).

## 5.1 The core legal shape of the product

The product does one legally-recognised thing over and over: **submit a
consumer's deletion/opt-out request to a business, as that consumer's agent.**
Everything else is scheduling and evidence.

Two consequences:

1. The right being exercised belongs to the **member**, not to us. We never have
   an independent right to demand anything. If the mandate is absent or
   withdrawn, we must stop.
2. The broker is entitled to be satisfied that the request is genuine. Most
   friction in the product (verification emails, ID checks, authorized-agent
   proof) is that entitlement in action, not obstruction.

## 5.2 California: CCPA / CPRA

### The right

CCPA as amended by CPRA gives California consumers rights to know, delete, and
correct personal information, and to opt out of its sale or sharing. People
-search sites and data brokers are squarely in scope.

### Authorized agents — CCPA Regulations § 7063

This is the provision the whole product rests on. [SOURCED —
[§ 7063 text](https://california-ccpa.org/cpra/section-7063-authorized-agents/),
[Clarip summary](https://www.clarip.com/leads/articles/verify-agents-authority-to-submit-consumer-requests)]

- When a consumer uses an authorized agent to submit a request to delete,
  correct, or know, **the business may require the agent to provide proof that
  the consumer gave the agent signed permission.**
- The business **may also require the consumer to verify their own identity
  directly** with the business, or to confirm directly that they gave the agent
  permission.
- **Power-of-attorney exception:** the above does not apply where the consumer
  has granted the agent a power of attorney under California Probate Code
  §§ 4121–4130.
- **Agent obligations:** an authorized agent must "implement and maintain
  reasonable security procedures and practices to protect the consumer's
  information", and **may not use the consumer's personal information for any
  purpose other than fulfilling the consumer's requests, verification, and
  fraud prevention.**

Three hard requirements for our software fall straight out of this:

| § 7063 requirement | What `deletewe` must do |
| --- | --- |
| Signed permission, producible on demand | Store a signed, timestamped, versioned **mandate** per member, exportable as a document to attach to a request |
| Consumer may be asked to confirm directly | Support a **member-confirmation guided task** when a broker bounces the request back to the consumer |
| Reasonable security practices | Encryption at rest, minimal collection, no PII in logs — the whole of [threat-model.md](../threat-model.md) is a legal obligation, not just good practice |
| No use beyond fulfilling the request | A hard architectural rule: member PII may be read **only** by scan/match/submit paths. No analytics, no training, no secondary use. Enforced by code review and by the data model. |

The POA exception explains why DeleteMe asks for an LPOA rather than a bare
authorization [SOURCED that they do; INFERRED as to why]. We will support both:
a baseline **authorized-agent mandate**, and an optional **limited power of
attorney** that unlocks brokers requiring it.

## 5.3 California: the Delete Act (SB 362) and DROP

The single most important legal development for this product category.

[SOURCED — [TrustArc](https://trustarc.com/resource/california-delete-act-drop-platform-data-brokers/),
[DataGrail](https://www.datagrail.io/blog/regulations/the-delete-act-and-drop-what-you-need-to-know/),
[Clark Hill](https://www.clarkhill.com/news-events/news/is-your-business-a-data-broker-californias-drop-goes-live-and-calprivacy-continues-to-enforce-delete-act/),
[Fenwick](https://www.fenwick.com/insights/publications/dont-drop-ball-upcoming-changes-california-delete-act-five-key-steps-companies),
[CalPrivacy](https://cppa.ca.gov/data_broker_registry/)]

| Date | Event |
| --- | --- |
| 10 Oct 2023 | SB 362 (Delete Act) signed |
| Oct 2025 | Amended by SB 361 |
| **1 Jan 2026** | **DROP goes live** — one request reaches every registered broker |
| **1 Aug 2026** | Brokers must access DROP **at least every 45 days**, process verified deletions within 45 days, and report status back |
| 1 July each year | Brokers publish request-handling metrics |
| 1 Jan 2028 | Independent compliance audits begin, every three years |
| 1–31 Jan annually | Broker registration with CalPrivacy |

Over 300,000 California residents had registered and submitted deletion
requests through DROP. [SOURCED]

### Why this matters strategically

For a California resident, **one DROP submission is more complete and far
cheaper than scraping 100 brokers individually**, and it is legally binding on
every *registered* broker. A removal service that ignores DROP is selling
manual labour that the state now does centrally.

But DROP does not make the product obsolete, for four reasons:

1. It covers **registered** brokers only. Unregistered people-search sites, and
   sites that do not meet the statutory definition, are untouched.
2. It is **California residents only**.
3. It is a deletion request, not monitoring — it does not tell you whether you
   were re-listed.
4. It does not touch search-engine results, forums, or the non-broker web.

**Our position:** DROP is a *channel*, not a competitor. `deletewe` treats it as
one submission method among several, used first where eligible because it is
cheaper and stronger, with per-broker scraping as the complement. The
integration point is specified in [architecture.md](../architecture.md) and
stubbed in the code — see "what's stubbed" in the README.

## 5.4 Other US states

[SOURCED — [CA Lawyers Association comparative analysis](https://calawyers.org/privacy-law/data-broker-regulation-framework-a-comparative-analysis-of-california-texas-vermont-and-oregon/),
[Captain Compliance](https://captaincompliance.com/education/state-data-broker-laws-compared-ct-ca-tx-vt-mt/),
[Pandectes 2026 guide](https://pandectes.io/blog/data-broker-compliance-in-2026-a-guide-to-california-connecticut-new-jersey-and-beyond/)]

| State | Registry | Deletion right | Centralised portal |
| --- | --- | --- | --- |
| **California** | Yes (CalPrivacy, 603 brokers in 2026) | Yes | **Yes — DROP** |
| **Texas** | Yes (SoS, $300, 31 Jan) | Yes, separate | No |
| **Oregon** | Yes (DFR) | Yes, separate | No |
| **Vermont** | Yes (Act 171 of 2018 § 2446) | **No** general right to delete — no comprehensive consumer privacy law | No; Act 138 / H.211 (2026) overhauls the framework effective 1 Jan 2027, with a feasibility study rather than a one-stop deletion mechanism |

Plus the broader wave of comprehensive state privacy laws (Connecticut, New
Jersey, Colorado, Virginia and others) which grant deletion rights against
businesses generally, with varying authorized-agent provisions.

**Design implication:** jurisdiction is a **per-member attribute** that selects
which legal basis is cited in a request and which channels are available. Our
request templates are therefore parameterised by jurisdiction, and adding a
jurisdiction is a documented, repeatable procedure — see
[docs/playbook/adding-a-jurisdiction.md](../playbook/adding-a-jurisdiction.md).

## 5.5 GDPR / UK GDPR

For members in the EU/UK the equivalent instruments are:

- **Article 17** — right to erasure ("right to be forgotten").
- **Article 21** — right to object to processing, including an absolute right
  to object to direct marketing.
- **Article 15** — right of access, useful as a *discovery* tool: a subject
  access request tells you what a broker holds before you ask them to delete it.
- **Article 12(3)** — the controller must respond **within one month**,
  extendable by two further months for complex requests.
- **Article 12(6)** — where the controller has reasonable doubts about identity,
  it may request additional information to confirm it.

Representation by a third party is generally permitted under national law and
ordinary agency principles; GDPR has no § 7063 analogue setting out a uniform
agent-verification procedure, which in practice means brokers improvise and ask
for more proof. [INFERRED from the absence of a prescribed mechanism]

**Design implications:**

- a **one-month response clock** per request, with a defined escalation when it
  lapses (complaint to the supervisory authority);
- support for **Article 15 first, Article 17 second** as a two-step flow on
  brokers that will not act on a bare erasure request;
- jurisdiction-specific templates citing the correct article.

`deletewe` ships GDPR templates and the one-month timer. It does **not** ship
automated supervisory-authority complaints — that is a human decision.

## 5.6 Rules we impose on ourselves

Beyond what any statute requires, and binding on the codebase:

1. **Consent is per-member, explicit, recorded, versioned, and revocable.** No
   profile is created without it; revocation stops all outbound work
   immediately.
2. **One subject only.** The system may only hold and act on data about the
   authenticated member themselves. There is no mechanism — by design, not by
   policy — to run a profile for a third party. Any "look someone up" capability
   would turn a privacy tool into a people-search engine, which is the thing we
   are removing data from.
3. **No CAPTCHA solving, no access-control bypass, no scraping behind a login.**
4. **No ID documents at rest.** Where a broker demands photo ID, the member
   uploads it to the broker directly via a guided task. We never hold it.
5. **Minimum necessary disclosure.** Each outbound request contains only the
   fields that broker actually needs to find and remove the listing. Sending a
   full profile to 100 brokers to delete one record is itself a privacy harm.
6. **Everything is logged as evidence, nothing sensitive is logged as telemetry.**

## 5.7 Open legal questions for human review

- Is the LPOA instrument we generate valid and enforceable in each target
  jurisdiction, and does it satisfy Probate Code §§ 4121–4130 for the California
  exception?
- Does operating a self-hosted instance make the self-hoster a controller, a
  processor, or neither?
- What are the obligations of a *service* operator of `deletewe` under CCPA as a
  business in its own right, including its own data-broker-registry question?
- Can an open-source project distribute broker opt-out procedures without
  falling foul of any broker's terms of service?
- Cross-border transfer analysis for an EU member whose request is processed on
  US infrastructure.

## Sources

- https://california-ccpa.org/cpra/section-7063-authorized-agents/
- https://www.clarip.com/leads/articles/verify-agents-authority-to-submit-consumer-requests
- https://medium.com/golden-data/what-is-an-authorized-agent-under-the-ccpa-cc4229ec07af
- https://cppa.ca.gov/data_broker_registry/
- https://cppa.ca.gov/data_brokers/
- https://trustarc.com/resource/california-delete-act-drop-platform-data-brokers/
- https://www.datagrail.io/blog/regulations/the-delete-act-and-drop-what-you-need-to-know/
- https://www.clarkhill.com/news-events/news/is-your-business-a-data-broker-californias-drop-goes-live-and-calprivacy-continues-to-enforce-delete-act/
- https://www.fenwick.com/insights/publications/dont-drop-ball-upcoming-changes-california-delete-act-five-key-steps-companies
- https://www.recordinglaw.com/news/california-delete-act-drop-deletion-mandate/
- https://calawyers.org/privacy-law/data-broker-regulation-framework-a-comparative-analysis-of-california-texas-vermont-and-oregon/
- https://captaincompliance.com/education/state-data-broker-laws-compared-ct-ca-tx-vt-mt/
- https://pandectes.io/blog/data-broker-compliance-in-2026-a-guide-to-california-connecticut-new-jersey-and-beyond/
