# 6. Weaknesses in the incumbent, and our edge

A fair reading first: DeleteMe created this category in 2010, has run it for
fifteen years, was named Wirecutter's best data removal service in 2025, and
publishes free opt-out guides that help people who will never pay them.
[SOURCED — [Wikipedia](https://en.wikipedia.org/wiki/DeleteMe)] The criticisms
below are structural, not accusations of bad faith.

## 6.1 Weakness: you cannot verify the central claim

The product's promise — "your data was removed" — is exactly the kind of claim a
customer cannot check without redoing the work themselves. DeleteMe's answer is
the screenshot-backed quarterly report [SOURCED], which is genuinely good. But:

- the reports link to only some of the sites [SOURCED — [Cloudwards](https://www.cloudwards.net/deleteme-review/)];
- evidence lives inside the member's account with no portable export [INFERRED];
- the headline dashboard metric, "Listings Reviewed", counts *effort*, not
  *outcome* [SOURCED].

And when measured externally, the number came in low: **27% of listings removed
in four months, versus 70% for a person doing it by hand**
[SOURCED — [Consumer Reports](https://innovation.consumerreports.org/Data-Defense_-Evaluating-People-Search-Site-Removal-Services-.pdf)].

> **Our edge — evidence as a first-class, exportable artefact.** Every state
> transition is backed by a stored screenshot, HTTP transcript, and content
> hash. The whole evidence trail exports as a signed, machine-readable bundle
> the member owns. The dashboard leads with *still listed / removed / blocked*,
> never with effort.

## 6.2 Weakness: the coverage number is a marketing surface

"969 data brokers" spans every tier plus custom-request-only sites; the standard
plan covers roughly 87. [SOURCED — list page footnote legend; review counts]
DeleteMe half-concedes this on the page itself: *"Is list size the best measure
of a removal service? Not always."* [SOURCED]

> **Our edge — an auditable catalogue.** Brokers live as reviewable files in a
> public AGPL repo, each carrying an explicit `automation.level`
> (`automated` / `assisted` / `manual` / `unsupported`). A coverage claim can be
> diffed against the California registry by anyone. We cannot inflate the number
> without someone noticing, which is the point.

## 6.3 Weakness: closed broker procedures, duplicated across the industry

Every removal service independently discovers and maintains the same ~100
opt-out procedures, and every one of them breaks when a broker changes its page.
None of that maintenance is shared. The public opt-out guides are the shared
artefact — written for humans, in prose, un-executable.
[SOURCED that the guides exist and are prose]

> **Our edge — broker definitions as executable, community-maintained data.**
> One schema-validated file per broker: search URL, match rules, opt-out method,
> ordered steps, verification, re-list interval. The thing the industry already
> maintains in private becomes a shared, versioned, testable commons. A broken
> selector is a pull request, not an internal ticket.

## 6.4 Weakness: the human tier is a pricing lever, not a capability

Platinum and VIP members get Privacy Advisors who "proactively scan Google
results and submit removal requests on your behalf" [SOURCED]. Advisors
"investigate and troubleshoot adversarial problem sites" and "escalate… internal
tooling gaps" [SOURCED — [job posting](https://www.builtinboston.com/job/privacy-advisor/8521004)].

Read plainly: the hard brokers are handled by people, and access to those people
is sold by tier. A standard-plan member's hard brokers are handled by... the
custom-request queue, if they happen to notice and ask.

> **Our edge — human-in-the-loop is a *mechanism*, not a *tier*.** Every member
> gets guided tasks for the steps software must not do (CAPTCHA, ID upload,
> phone calls), with the values pre-filled and a deep link. The member's own
> five minutes replaces the premium plan. Self-hosters are their own privacy
> advisor, with the same tooling.

## 6.5 Weakness: you must hand your entire identity to a third party

To remove your data from 100 brokers you first give one company your name,
aliases, every address you have lived at, phone numbers, emails, and date of
birth — a dossier more complete than most of the brokers hold. Consumer Reports
specifically criticised DeleteMe's privacy policy for permitting sale or
transfer of data in a business transaction. [SOURCED — [Wikipedia](https://en.wikipedia.org/wiki/DeleteMe)]

This is the category's central irony and its biggest trust problem.

> **Our edge — self-hosting, and a user-run mode.** `deletewe` ships as a Docker
> image you can run on your own machine, where your profile never leaves your
> hardware. For people who will not run a server, **user-run mode** does the
> scanning and match-detection locally and emits guided tasks for everything
> else — no hosted account at all. Where a hosted instance is used, PII is
> encrypted per-member at rest, excluded from logs by construction, and deletion
> is immediate and complete rather than a support ticket.

## 6.6 Weakness: no DROP story

California's DROP has been live since 1 January 2026, binding on registered
brokers every 45 days since 1 August 2026, with 300,000+ residents enrolled
[SOURCED]. For a Californian it is stronger and cheaper than per-broker
scraping. We found no public description of DeleteMe integrating it.
[UNKNOWN — absence of evidence, not evidence of absence]

> **Our edge — DROP first, scraping second.** For eligible members we use the
> statutory channel where it exists and reserve per-broker work for what DROP
> cannot reach. The integration point is specified and stubbed.

## 6.7 Weakness: effectiveness is never published

No removal service publishes per-broker success rates. The only numbers the
public has came from a third party running a four-month study with 32
volunteers. [SOURCED]

> **Our edge — measured outcomes, published.** Because every re-check writes an
> outcome against a broker definition, the catalogue accumulates a real
> per-broker removal and re-list rate. We publish it. It will sometimes be
> unflattering; that is what makes it worth anything.

## 6.8 Honest assessment of where we will be worse

Stated up front so nobody is surprised:

| Area | Incumbent advantage |
| --- | --- |
| Breadth on day one | 87+ maintained procedures vs our 25 seeds |
| The hard tail | Paid staff who will fight a stubborn broker for weeks |
| Postal/fax dispatch | Existing vendor relationships; ours is a stub |
| Legal cover | In-house counsel; ours is an open question list |
| Non-broker removals | Google results, forums, press — out of our scope |
| Support | Humans to email; ours is a GitHub issue |

An open-source project wins on transparency, auditability, and shared
maintenance — not on headcount. The roadmap is written accordingly:
see [roadmap.md](../roadmap.md).

## 6.9 Our differentiating thesis, in one paragraph

Data removal is a *recurring maintenance* problem whose procedures are public
knowledge, whose failure mode is silent breakage, and whose central promise is
unverifiable. The industry's answer has been to keep the procedures private and
sell the labour. The better answer is to make the procedures a shared, executable,
testable commons; back every claim with portable evidence the user owns; route
honestly to a human whenever software should not act; use statutory channels
like DROP where they exist; and let anyone run the whole thing on their own
hardware so the privacy tool is not itself a privacy risk.

## Sources

- https://en.wikipedia.org/wiki/DeleteMe
- https://joindeleteme.com/sites-we-remove-from/
- https://www.builtinboston.com/job/privacy-advisor/8521004
- https://innovation.consumerreports.org/Data-Defense_-Evaluating-People-Search-Site-Removal-Services-.pdf
- https://www.cloudwards.net/deleteme-review/
- https://cppa.ca.gov/data_broker_registry/
- https://trustarc.com/resource/california-delete-act-drop-platform-data-brokers/
