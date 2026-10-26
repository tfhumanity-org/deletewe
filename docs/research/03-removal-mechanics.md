# 3. How removal actually works, per broker

## 3.1 The best public source is DeleteMe's own opt-out guides

DeleteMe publishes free, public, per-broker opt-out guides at
`joindeleteme.com/opt-out-guides/<broker>-opt-out-guide/`. They are a content
marketing play, and they are also the most detailed public description of the
procedures the paid service automates.
[SOURCED — e.g. [i-360 opt-out guide](https://joindeleteme.com/opt-out-guides/i-360-opt-out-guide/)]

Observed template of a guide [SOURCED]:

- a **difficulty/speed rating** (i-360 is rated 2/5);
- an overview of what the broker is;
- a numbered walkthrough with screenshots;
- alternative contact routes (phone, email);
- cross-links to related guides;
- a CTA for the paid service.

**The difficulty rating is the giveaway.** [INFERRED] A service that rates each
broker's opt-out by difficulty is a service that models brokers as a
heterogeneous set of procedures with known cost — exactly the data model we are
going to build explicitly.

### Worked example: i-360 [SOURCED]

| Attribute | Value |
| --- | --- |
| Method | Web form |
| Entry point | Footer link "Do Not Sell or Share My Personal Information…" under Legal |
| Form fields | Requestor type, request type, state, first/last name, address, city, phone, zip, email, optional notes |
| Requestor type options | **Consumer, Authorized Agent, or Power of Attorney** |
| CAPTCHA | Yes — "I'm not a robot" checkbox |
| Email verification | Not mentioned |
| ID verification | Not mentioned |
| Alternative | Phone, 1-844-611-2737 |
| Processing time | "after a waiting period", unspecified |

Note the requestor-type field. Brokers that accept **Authorized Agent** or
**Power of Attorney** as a requestor type are brokers where an LPOA-backed
submission is a first-class, supported path rather than an argument to be had.
Our broker schema captures this as `agent_support`.

## 3.2 The method taxonomy

Across the public opt-out literature, every broker procedure reduces to a small
set of methods. [SOURCED in aggregate — opt-out guide roundups listed in
Sources; per-broker specifics cited inline]

| Method | Typical shape | Automatable? |
| --- | --- | --- |
| **Web form** | Paste listing URL / enter identity, submit | Yes, unless CAPTCHA-gated |
| **Email** | Send a request to a `privacy@` address | Yes, fully |
| **Account-required** | Create/claim an account, then suppress the record | Partly — account creation is in LPOA scope |
| **Mail / fax** | Printed, signed request posted to an address | Generate the letter; posting needs a provider |
| **Phone** | Call an IVR or an agent | No — guided task for the member |

### Verification sub-methods

| Verification | Example | Handling |
| --- | --- | --- |
| Email confirmation link | Spokeo, BeenVerified | **Automatable** with an inbound mailbox |
| Phone call / SMS code | Whitepages | Guided task, or inbound SMS provider |
| Account login | Radaris | Automatable within LPOA scope |
| Photo ID upload | Rare on people-search sites | **Always** a guided task; we never hold ID images |
| None | Some email-based brokers | — |

Specific confirmations [SOURCED — [Omlumi guide](https://omlumi.com/guides/how-to-remove-yourself-from-people-search-sites),
[OptOut.ws](https://www.optout.ws/post/how-to-opt-out-of-spokeo-whitepages-beenverified/),
[SecurityHero manual guide](https://www.securityhero.io/how-to-opt-out-of-data-brokers/)]:

- **Spokeo** — paste the listing URL at `spokeo.com/optout`, give an email,
  complete a CAPTCHA, then click the emailed confirmation link.
- **Whitepages** — locate the listing, enter a phone number, confirm by
  verification call or text; 24–48h processing.
- **BeenVerified** — search, select the record, enter an email, click the
  emailed link.
- **Radaris** — find the listing, use "Control Information", **requires creating
  an account**.

A useful negative finding: *"none of the opt-out pages asked for a photo ID.
You should only need enough to identify your listing and an email address to
confirm the request."* [SOURCED — [Omlumi](https://omlumi.com/guides/how-to-remove-yourself-from-people-search-sites)]
ID upload exists on some brokers but is **not** the norm for people-search
sites, so a product can treat it as an exceptional path.

Also commonly reported: **confirmation emails expire within about 24 hours**,
and processing takes up to ~72 hours on major sites.
[SOURCED — [ContentRemoval guide](https://www.contentremoval.com/blog/people-search-opt-out)]
That 24-hour window is a hard scheduling constraint: a verification email that
sits in a queue for a day is a failed opt-out. Our engine treats
verification-link handling as latency-critical.

## 3.3 CAPTCHAs

CAPTCHAs appear on a meaningful minority of opt-out forms — i-360's form has
one, Spokeo's has one. [SOURCED]

**`deletewe` will never solve, bypass, or outsource a CAPTCHA.** A CAPTCHA is a
site's explicit statement that it wants a human. Defeating it is both an access
-control bypass and a direct violation of most brokers' terms. When our engine
reaches a CAPTCHA it:

1. stops;
2. captures the page state as evidence;
3. emits a **guided task** to the member with a deep link, the pre-filled values
   to enter, and instructions;
4. marks the broker's procedure `automation.level: assisted`.

This is a deliberate product constraint and a differentiator, not a limitation
we are apologising for. See [threat-model.md](../threat-model.md).

## 3.4 Automated vs human: what DeleteMe actually splits

The clearest public evidence is their hiring. The **Privacy Advisor** role
(Privacy Operations team, Boston, on-site) is responsible for:
[SOURCED — [Built In Boston posting](https://www.builtinboston.com/job/privacy-advisor/8521004)]

- "finding and removing personal information across a wide range of online
  sources";
- "Investigate and troubleshoot adversarial *'problem sites'*, applying critical
  thinking and creative strategies";
- "Maintain detailed case documentation in **Jira** and internal systems";
- "Identify and escalate patterns in site behavior, member issues, or internal
  tooling gaps";
- collaborating with Product, Engineering and Customer Success "to improve
  processes and tooling".

Required background: 2–3 years in internal operations, Trust & Safety,
professional services, or customer support. Tools named: Jira, G Suite.

Wikipedia describes the service as using "both automated methods and human
intervention". [SOURCED — [Wikipedia](https://en.wikipedia.org/wiki/DeleteMe)]

### What that implies [INFERRED]

1. **There is a case-per-listing work queue with human assignees.** Jira is
   being used as the opt-out case tracker. Each stubborn listing becomes a
   ticket.
2. **"Problem sites" are tracked as a recurring category**, and patterns in site
   behaviour get escalated — i.e. they have a **broker-health problem** and solve
   it socially (advisors notice and escalate) rather than, or as well as,
   automatically.
3. **Tooling gaps are a known, named issue** the advisors are asked to report.
   The automation does not cover the long tail.
4. **Humans are the premium product.** Platinum/VIP buy proactive advisor
   attention. [SOURCED — Sites We Remove From]

This is the single most useful architectural inference available from public
sources, and it directly shapes our design: we build the review queue and the
broker-health detector as **first-class product surfaces**, and we make the
automated/assisted/manual split explicit per broker rather than hidden behind a
coverage number.

## 3.5 Does it work? The effectiveness ceiling

Consumer Reports' 2024 study *Data Defense: Evaluating People Search Site
Removal Services* is the most important external datapoint in this whole
research effort.
[SOURCED — [CR report PDF](https://innovation.consumerreports.org/Data-Defense_-Evaluating-People-Search-Site-Removal-Services-.pdf),
[The Record](https://therecord.media/data-removal-services-mostly-worthless-study)]

Methodology: 32 volunteers, four months, 13 people-search sites. 332 data
"instances" found for the 28 participants assigned to a removal service; four
further participants opted out manually as a control.

Results after four months:

| Service | Listings removed |
| --- | --- |
| **Manual opt-out (control)** | **70%** |
| Optery Ultimate | 68% |
| EasyOptOuts | 65% |
| IDX | 40% |
| Kanary | 34% |
| **DeleteMe** | **27%** |
| ReputationDefender | 6% |
| Confidently | 4% |
| *All services pooled* | *35% (117 of 332)* |

For balance: NYT Wirecutter named DeleteMe the best data removal service in
2025, praising coverage and interface. [SOURCED — [Wikipedia](https://en.wikipedia.org/wiki/DeleteMe)]
And practitioners put the realistic ceiling at 70–80% even with diligent manual
work, and only with repeated checking.
[SOURCED — [Silicon Canals summary](https://siliconcanals.com/n-no-service-can-delete-your-digital-footprint-the-honest-number-from-the-people-who-do-this-for-a-living-is-70-to-80-percent-and-even-that-requires-checking-back/)]

### Three conclusions we build on

1. **A careful human beats every tested service.** The gap is not knowledge —
   the procedures are public — it is persistence and follow-through. Software
   should be *better* at persistence than a human, which means the
   services underperforming a human are failing at follow-up, not at
   submission. **Our engine is therefore designed around the re-check loop,
   not the submit action.**
2. **Nobody reaches 100%, and honest products should say so.** We will report a
   measured removal rate per broker, and never promise erasure.
3. **Effectiveness is measurable, so it should be measured in public.** Our
   catalogue records observed outcomes per broker, which over time produces the
   thing no incumbent publishes: a public, per-broker success rate.

## Sources

- https://joindeleteme.com/opt-out-guides/i-360-opt-out-guide/
- https://joindeleteme.com/sites-we-remove-from/
- https://www.builtinboston.com/job/privacy-advisor/8521004
- https://jobs.lever.co/deleteme
- https://en.wikipedia.org/wiki/DeleteMe
- https://innovation.consumerreports.org/Data-Defense_-Evaluating-People-Search-Site-Removal-Services-.pdf
- https://therecord.media/data-removal-services-mostly-worthless-study
- https://siliconcanals.com/n-no-service-can-delete-your-digital-footprint-the-honest-number-from-the-people-who-do-this-for-a-living-is-70-to-80-percent-and-even-that-requires-checking-back/
- https://omlumi.com/guides/how-to-remove-yourself-from-people-search-sites
- https://www.optout.ws/post/how-to-opt-out-of-spokeo-whitepages-beenverified/
- https://www.securityhero.io/how-to-opt-out-of-data-brokers/
- https://www.contentremoval.com/blog/people-search-opt-out
