# 1. The user journey

## 1.1 Signup and onboarding

The flow a new member goes through, as described publicly:

1. **Free scan first.** DeleteMe offers a free scan before purchase, used as the
   top of the acquisition funnel. [SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review)]
2. **Account creation on joindeleteme.com**, then the member "fill[s] out a data
   sheet sharing your personal information like your name and address".
   [SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review)]
3. **Limited Power of Attorney (LPOA).** The member signs an authorization form
   granting limited power of attorney so DeleteMe can send opt-out requests on
   their behalf. DeleteMe's help center frames this as something that
   "increases the opt-out effectiveness when completing removals from data
   broker sites on your behalf". [SOURCED — help center article surfaced in
   search; [Cloudwards review](https://www.cloudwards.net/deleteme-review/)]
4. **Initial scan.** DeleteMe searches its broker set for the member's details.
5. **First report within about a week** of signing up, showing where data was
   found, what kind, and the opt-out actions taken.
   [SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review)]
6. **Quarterly repeat.** Every three months the scan-and-opt-out cycle repeats.
   [SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review),
   [help center](https://help.joindeleteme.com/hc/en-us/articles/8176349468947-How-do-I-submit-a-custom-removal-request)]

### The LPOA clause

The Terms of Service grant Abine a Limited Power of Attorney to act on the
member's behalf for the purpose of performing the service, including
"submitting opt-out requests to and communicating with third-party websites
like data brokers or aggregators, signing opt-out documents, creating accounts,
and any other action Abine reasonably deems necessary to remove, suppress, or
opt-out personal information from unwanted sources."
[SOURCED — [Terms of Service](https://joindeleteme.com/permission-slip/terms-of-service/)]

Two things to copy, and one to improve on:

- **Copy:** the LPOA is load-bearing. Under CCPA §7063 an authorized agent
  holding a power of attorney is exempt from the extra proof-of-permission
  dance (see [05-legal-basis.md](05-legal-basis.md)). That is why they ask for
  it. [SOURCED]
- **Copy:** "creating accounts" is explicitly in scope, because some brokers
  (Radaris) require an account to manage a listing. [SOURCED]
- **Improve:** the grant is broad and open-ended ("any other action Abine
  reasonably deems necessary"). An open product can scope the mandate per
  broker and per action, and show the member exactly what was authorised.
  [INFERRED]

## 1.2 Personal data collected

The member-facing "Data Sheet" help article is not publicly readable (HTTP 403
when fetched), so the field list below is assembled from what DeleteMe says its
scan looks for and from review coverage. [UNKNOWN as an exact schema]

Data categories DeleteMe states appear in the initial scan results — and which
it therefore must hold to search for them: name, aliases, current and past
addresses, phone numbers, email addresses, age, date of birth, family member
information, and professional details.
[SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review)]

**[INFERRED] minimum viable collection** for a service of this shape:

| Field | Why it is needed | Our stance |
| --- | --- | --- |
| Legal name | Primary search key on every people-search site | Required |
| Aliases / maiden / former names | Brokers index these separately | Optional, high value |
| Current address | Primary disambiguator between same-name people | Required |
| Past addresses | Brokers key heavily on address history | Optional, high value |
| Phone numbers | Match confirmation; Whitepages verifies by phone | Optional |
| Email addresses | Match confirmation; most opt-outs verify by email | Required (≥1) |
| Date of birth / age | Disambiguation where names collide | Optional, coarse (year) preferred |
| Relatives | Strong match signal on people-search profiles | Optional, and about third parties |

**Design note for `deletewe`:** relatives' names are personal data about people
who have not consented. DeleteMe's own scan surfaces "family member
information". We will accept relative names only as a *match hint*, never store
them as profile records, never submit them to a broker, and never let them be
searched on. See [threat-model.md](../threat-model.md).

## 1.3 Plans and pricing

The plans/pricing URL we tried returned HTTP 404, so prices below come from
review coverage and are dated. Prices change; treat as indicative. [SOURCED,
secondary]

| Plan | Price | Notes |
| --- | --- | --- |
| Individual, 1 year | $129/yr (~$10.75/mo) | One person |
| Family of 4, 1 year | $329/yr (~$27.42/mo) | Four people |
| 2-year options | Lower effective monthly rate | Prepay discount |

[SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review),
[AllAboutCookies pricing](https://allaboutcookies.org/deleteme-price-now)]

All plans are stated to include automated and manual data removal, quarterly
privacy reports, recurring removals, and custom removal requests. A full refund
is available before the first privacy report is completed.
[SOURCED — [Surfshark review](https://surfshark.com/blog/deleteme-review)]

Above the consumer plans sit **Business Gold, Diamond, Platinum, and VIP**
tiers, plus **International** plans. Broker coverage is gated by tier — see
[02-broker-coverage.md](02-broker-coverage.md).
[SOURCED — [Sites We Remove From](https://joindeleteme.com/sites-we-remove-from/)]

For Platinum and VIP members, "our Privacy Advisors proactively scan Google
results and submit removal requests on your behalf" — i.e. the top tiers are
differentiated by *human attention*, not by software.
[SOURCED — [Sites We Remove From](https://joindeleteme.com/sites-we-remove-from/)]

**[INFERRED] the pricing logic:** marginal cost per member is dominated by
privacy-advisor labour, not compute. Tiers are therefore sold as labour
allocation. Any product that automates more of the hard tail can either
undercut on price or widen coverage at the same price. That is our opening.

## 1.4 The dashboard

Publicly described features: [SOURCED — [TechRadar](https://www.techradar.com/pro/security/deleteme-data-removal-service-review),
[Cloudwards](https://www.cloudwards.net/deleteme-review/),
[Wikipedia](https://en.wikipedia.org/wiki/DeleteMe)]

- Status of the member's data across tracked brokers, per broker.
- Live metrics: total removals, pending actions, active exposures.
- Charts of data exposure over time.
- A **"Listings Reviewed"** counter — "the total number of times a data broker
  profile has been reviewed since the paid subscription was initially
  purchased". This is a *work-done* metric, not a *results* metric.
- The ability to flag a broker the member does not recognise.
- **Custom removal requests** submitted from the dashboard to the privacy
  advisor team, who "investigate and figure out if they can remove it for you,
  or provide instructions on how you can remove it yourself".
  [SOURCED — [help center](https://help.joindeleteme.com/hc/en-us/articles/8176349468947-How-do-I-submit-a-custom-removal-request)]

Two observations worth carrying into our design:

- **"Listings Reviewed" is a vanity-adjacent metric.** [INFERRED] It counts
  effort. A member cannot tell from it whether their exposure went down. Our
  dashboard should lead with *removed / still listed / blocked*, and keep
  effort metrics secondary.
- **The custom-removal path is an explicit human escape hatch** exposed in the
  product UI. [SOURCED] This is the single best idea to copy: the system
  admits it cannot do everything and routes the remainder to a person, visibly.

## 1.5 The quarterly report

[SOURCED — [Cloudwards](https://www.cloudwards.net/deleteme-review/),
[CyberInsider](https://cyberinsider.com/data-removal/deleteme-review/),
[Optery's review of DeleteMe](https://www.optery.com/deleteme-review/)]

The quarterly privacy report contains:

- which brokers had listed the member's information;
- what kinds of data each listing exposed;
- what was removed, what is pending, what needs follow-up;
- **screenshots** — both of the original listing and as confirmation of removal.

Delivered as a PDF, with links to some but not all of the sites.

**This is the product's trust mechanism.** [INFERRED] A removal service makes a
claim the customer cannot easily verify; the screenshot-backed report is how the
claim is made checkable. Any competitor that reports status without evidence is
asking for faith. We treat evidence capture as a first-class subsystem, not a
reporting nicety — see [architecture.md](../architecture.md).

A weakness to exploit: reports "only provide links to some of those sites"
[SOURCED — [Cloudwards](https://www.cloudwards.net/deleteme-review/)], and the
evidence lives inside DeleteMe's account. There is no portable, machine-readable
export of the evidence trail. [INFERRED]

## Sources

- https://joindeleteme.com/sites-we-remove-from/
- https://joindeleteme.com/permission-slip/terms-of-service/
- https://help.joindeleteme.com/hc/en-us/articles/8176349468947-How-do-I-submit-a-custom-removal-request
- https://en.wikipedia.org/wiki/DeleteMe
- https://surfshark.com/blog/deleteme-review
- https://www.cloudwards.net/deleteme-review/
- https://cyberinsider.com/data-removal/deleteme-review/
- https://www.techradar.com/pro/security/deleteme-data-removal-service-review
- https://allaboutcookies.org/deleteme-price-now
- https://www.optery.com/deleteme-review/
