# 4. Inferred architecture

Everything in this file is **[INFERRED]** unless marked otherwise. We have no
access to DeleteMe's source, infrastructure, or internal documents, and we did
not attempt to obtain any. The purpose is to reason from visible behaviour to a
design we can justify for `deletewe` — not to describe Abine's systems.

## 4.1 What is observable, and what it implies

| Observable | Source | Implies |
| --- | --- | --- |
| First report ~1 week after signup | [SOURCED] | Scan is not real-time; there is a batch/queue with days of slack, and human review in the loop |
| Quarterly re-scan and re-opt-out | [SOURCED] | A durable per-member schedule that survives months — not a cron over a flat table but per-member, per-broker timers |
| "Listings Reviewed" counter | [SOURCED] | A persistent **listing** entity with a review count — listings are first-class rows, not transient scan output |
| Members can flag unrecognised brokers | [SOURCED] | Match confidence is imperfect and the member is used as the final classifier |
| CPRA-driven "notify and ask permission before opting out from newly identified brokers" | [SOURCED — [Wikipedia](https://en.wikipedia.org/wiki/DeleteMe)] | An explicit **consent gate between match and submit** |
| Cases documented in Jira; "adversarial problem sites" | [SOURCED] | A human work queue sits alongside the automated pipeline |
| Screenshot evidence in reports | [SOURCED] | Headless browser capture + blob storage, retained for at least a reporting period |
| Custom removal requests from the dashboard | [SOURCED] | A free-form intake that creates work items outside the broker catalogue |
| Tier markers gate brokers by plan | [SOURCED] | Broker procedures are data with per-broker entitlement metadata |
| DevOps Team Lead + Senior SWE, on-site Boston | [SOURCED — [Lever](https://jobs.lever.co/deleteme)] | Self-managed infrastructure; a small team |

## 4.2 The pipeline, as any such product must be built

Five stages. The names are ours.

```
 profile ──> SCAN ──> MATCH ──> CONFIRM ──> SUBMIT ──> VERIFY ──> EVIDENCE ──> RECHECK
                       │           │           │          │           │           │
                   confidence   consent    form/email/  inbound    screenshot   schedule
                     score       gate        letter     mailbox     + hash      per broker
                                   │           │          │
                                   └───────────┴──────────┴──> GUIDED TASK (human)
```

### SCAN
For each (member profile, broker) pair, fetch the broker's search surface and
retrieve candidate listings. Rate-limited per broker, politely.

### MATCH
Compare each candidate listing against the member's profile and emit a
**confidence score**. This is the hardest correctness problem in the product and
the one with the worst failure mode: a false positive means submitting a
stranger's data to a broker as if it were the member's — a privacy harm caused
by a privacy tool.

[INFERRED] DeleteMe's member-facing "flag a broker you don't recognise" control
is evidence that their matcher also produces false positives and that they
resolve them with the member. We adopt the same principle but invert the
default: **nothing is submitted without the member confirming the match**, above
a configurable auto-confirm threshold.

### CONFIRM
The consent gate. CPRA compliance pushes in the same direction as privacy
ethics here [SOURCED that DeleteMe notifies before opting out from newly
identified brokers]. We treat each (listing, broker) as requiring a recorded,
timestamped mandate before any outbound request.

### SUBMIT
Dispatch by method:
- **form** — headless browser, deterministic step script;
- **email** — templated message from the member's authorized-agent address;
- **letter** — render PDF for postal/fax dispatch via a provider;
- **assisted/manual** — emit a guided task instead.

### VERIFY
The majority of people-search opt-outs complete only when an emailed link is
clicked, often within ~24 hours [SOURCED]. This requires an **inbound mailbox**
with per-member, per-broker addressing so an arriving message can be routed back
to the exact job that is waiting on it. This is the component most likely to be
underbuilt, and [INFERRED] the most likely explanation for services scoring
below a diligent human in the Consumer Reports study: submission is easy,
follow-through is not.

### EVIDENCE
Screenshot + HTTP transcript + content hash, written once, immutable, retained
for the member and surfaced in reports. [SOURCED that DeleteMe ships screenshots
in reports.]

### RECHECK
Re-scan the broker after `relist_interval_days`. If the listing is back, reopen
the case. The recurring subscription exists because this loop never terminates.

## 4.3 Where the humans sit

[INFERRED, from the Jira/"problem sites" evidence]

Three distinct human roles, which we will model as three distinct queues rather
than one undifferentiated inbox:

1. **Member guided tasks** — CAPTCHA, phone call, ID upload. Only the member can
   do these. Routed to the member's dashboard.
2. **Operator review queue** — ambiguous matches, failed submissions, brokers
   whose flow broke. Routed to an admin.
3. **Broker-definition maintenance** — when a broker's page layout changes and a
   step script stops finding its selector. This is a *code/data* change, not a
   ticket. It is the thing that silently degrades every service of this type,
   because a broken flow looks exactly like a broker that ignored you.

**Broker health detection is therefore load-bearing**, and we build it
explicitly: every step script declares what it expects to find, and a run that
fails its expectations marks the broker definition unhealthy and pages an
operator, rather than recording a failed opt-out.

## 4.4 Scale sketch

[INFERRED, order-of-magnitude only]

For N members and B automated brokers, a quarterly cycle is N × B scan jobs.
At 10,000 members and 100 automated brokers that is 1M scans per quarter —
about 130/hour sustained, trivially small. The binding constraints are not
throughput:

- **per-broker politeness** — a single broker might see 10,000 requests from one
  source in a quarter; that must be spread out and rate-limited or it looks like
  an attack;
- **verification latency** — the 24-hour email window;
- **human queue depth** — the real cost centre, as the tier pricing shows.

This is why we choose a queue/workflow architecture with per-broker
concurrency limits and durable multi-day waits, rather than anything throughput
-oriented. See [architecture.md](../architecture.md) and
[adr/0002-cloudflare-platform.md](../adr/0002-cloudflare-platform.md).

## 4.5 Data model implications

Falling directly out of the above:

- `member` → `profile` (the identity assertions) → `identifier` (name, address,
  phone, email rows)
- `broker` (catalogue, versioned, from files)
- `listing` (a found record at a broker, with review count and status)
- `match` (listing ↔ profile, with a confidence score and a decision)
- `mandate` (the recorded consent to act, scoped)
- `job` (one attempt at one stage for one listing)
- `evidence` (immutable blob + hash, linked to a job)
- `task` (human work item, typed by who can do it)
- `report` (a period snapshot)

See [data-model.md](../data-model.md).

## Sources

- https://en.wikipedia.org/wiki/DeleteMe
- https://jobs.lever.co/deleteme
- https://www.builtinboston.com/job/privacy-advisor/8521004
- https://joindeleteme.com/sites-we-remove-from/
- https://help.joindeleteme.com/hc/en-us/articles/8176349468947-How-do-I-submit-a-custom-removal-request
- https://innovation.consumerreports.org/Data-Defense_-Evaluating-People-Search-Site-Removal-Services-.pdf
