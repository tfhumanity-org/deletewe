# The research method

How to reverse-engineer a hosted service from public sources, well enough to
build a credible alternative, without signing up or touching anything you are
not entitled to.

This is the method that produced [docs/research/](../research/).

## The boundary, first

Decide before you start, and write it down:

- Public sources only: marketing site, help centre, published guides, terms,
  privacy policy, job postings, press, independent reviews, government
  registries.
- No signing up, no authenticated access, no scraping, no access-control
  bypass.
- No sending requests to third parties on anyone's behalf.

This is not only ethics. The service you are studying is in a trust business,
and so is the one you are building. The boundary is the thing you are selling.

It is also practical: in this project, **everything load-bearing came from
public sources**. The authenticated product tour would have added detail, not
insight.

## Label every claim

Three labels, used relentlessly:

- **[SOURCED]** — a cited public URL supports this exactly.
- **[INFERRED]** — our reasoning. A hypothesis for our design, never a
  statement about their system.
- **[UNKNOWN]** — we looked and could not tell.

Keep them visually separated. An inference you later mistake for a fact is how
a design acquires a requirement nobody can justify, and how a comparison
becomes a smear.

## Source ranking

Spend your time in this order.

### 1. Job postings — the highest-signal source available

Engineering and operations postings describe internal systems because they have
to attract people who will use them.

What to extract: named tools, team names, role counts and seniority, what the
role "troubleshoots", what it "escalates", on-site versus remote, and what the
role is asked to *improve*.

The single most useful sentence found for this project was that a Privacy
Advisor must "maintain detailed case documentation in **Jira**" and
"investigate and troubleshoot adversarial **problem sites**". Three conclusions
follow immediately: there is a per-listing human work queue; hard brokers are
handled by people; and tooling gaps are a known, named, recurring problem.

Look at what they are hiring for *now* versus a year ago. The delta is their
roadmap.

### 2. Independent measurement

Someone has probably tested the thing. Consumer Reports' 2024 study measured
removal rates across seven services and produced the number no vendor
publishes. It reframed the entire competitive analysis: the gap is not
knowledge of the procedures — those are public — it is follow-through.

Search for the category plus "study", "tested", "measured", "comparison",
"benchmark". Prefer a methodology you can read.

### 3. The company's own free content

Content marketing is the most detailed public description of what the paid
product does. This company publishes per-broker opt-out guides — the exact
procedures their service automates — including a **difficulty rating**, which
quietly reveals that they model brokers as a heterogeneous set with known cost.

Read the free tier as a specification.

### 4. Government registries and filings

Regulated categories leave public records. The "secret" broker list turned out
to be a downloadable CSV of 603 registered companies with contact details.

Check for registries, licence lists, regulator enforcement actions, court
filings, and compliance deadlines. A new legal requirement is also a product
requirement, and often a strategic opening.

### 5. Small print on marketing pages

The marketing claim is "969 data brokers". The footnote legend defining `*`,
`**`, `***` and `^` decodes that into roughly 87 on the entry plan.

Always read the asterisks, the legend, the comparison-table footnotes, and the
"as of" date.

### 6. Reviews and third-party comparisons

Useful for screenshots of surfaces you cannot reach, and for counting what the
marketing page obscures. Check the byline: half the "X vs Y" articles are
written by Y.

### 7. Terms of service and privacy policy

Lower signal than you hope, but occasionally decisive. The limited power of
attorney clause here explains a load-bearing product decision, and reading the
relevant statute explained *why* — a power of attorney exempts the agent from
an extra verification step.

## Inferring architecture from visible behaviour

Every behaviour a user can see constrains the system behind it. Work backwards
systematically:

1. **List what a user observes.** Timelines, counters, states, controls,
   notification copy, plan differences.
2. **For each, ask what it forces to exist.** A counter implies a persisted
   entity. A multi-month cadence implies durable scheduling. A "flag this"
   control implies a classifier with false positives and a human as final
   arbiter.
3. **For each, ask what it forces to be absent.** "Report within a week" rules
   out real-time. A tier-gated broker list rules out procedures hard-coded in
   one module.
4. **Look for tension between marketing and operations.** "24/7 monitoring"
   alongside "quarterly reports" means two different clocks. Reconciling that
   tells you where the batch boundary is.
5. **Price structure reveals cost structure.** When top tiers are sold as
   *human attention*, the marginal cost is labour, not compute — which tells
   you exactly where to compete.

## Turning research into a design

Three questions at the end:

1. **What must any product in this category do?** That is your requirements
   list, and it is not negotiable.
2. **What did they choose that you would choose differently, and why?** That is
   your ADR list. Write the *why* down before you start building, while you can
   still remember the alternative.
3. **Where are they structurally weak?** Not "their UI is dated" — structurally.
   Here: the central claim is unverifiable, the coverage number is a marketing
   surface, and users must hand their whole identity to a third party. Those
   are weaknesses an incumbent cannot easily fix without changing what they are.

Then write down, honestly, **where you will be worse**. We did:
[docs/research/06-weaknesses-and-edge.md](../research/06-weaknesses-and-edge.md#68-honest-assessment-of-where-we-will-be-worse).
A competitive analysis that finds no advantages in the incumbent is not
analysis, it is marketing — and it will mislead your own roadmap first.

## A practical sequence

1. Two broad searches to map the category and find the critics.
2. Fetch the primary pages: marketing, help centre, terms, privacy, pricing,
   the big list page. Read the footnotes.
3. Search job boards for every engineering and operations role. Read them all.
4. Search for independent testing and press.
5. Find the regulator, the registry, the statute, the deadlines.
6. Fetch two or three of the company's own how-to guides.
7. Write the research notes *before* writing any design, with every claim
   labelled.
8. Only then write the specification.

Doing it in that order matters. If you design first, you will read the research
looking for confirmation.
