# deletewe — product specification

## 1. What this is

`deletewe` is an open-source **personal data removal agent**. A person enrols,
proves who they are, grants a scoped mandate, and the system then finds their
records on data brokers and people-search sites, asks them to remove each one,
proves what happened, and keeps doing it forever because brokers re-list.

It is the open counterpart to services like DeleteMe. The research behind that
comparison is in [research/](research/).

## 2. Principles

These are binding. Code that violates one is a bug, not a trade-off.

1. **One subject.** The system holds and acts on data about the authenticated
   member and nobody else. There is no code path that profiles a third party.
   This is what separates a removal agent from a people-search engine.
2. **Consent before action.** Nothing leaves the system without a recorded,
   timestamped, scoped mandate. Revocation halts outbound work immediately.
3. **Evidence or it didn't happen.** Every state transition is backed by stored
   evidence the member can export.
4. **Honest automation boundary.** Software does what software should do.
   CAPTCHAs, ID uploads and phone calls become guided tasks for the member. We
   never solve a CAPTCHA or bypass an access control.
5. **Minimum necessary disclosure.** Each outbound request carries only the
   fields that broker needs. Broadcasting a full profile to 100 brokers to
   delete one record is itself a privacy harm.
6. **Your data, your hardware, if you want it.** Self-hosting is a first-class
   mode, not an afterthought.
7. **Measured, not claimed.** Per-broker outcomes are recorded and published.

## 3. Who it is for

| Persona | Need | Mode |
| --- | --- | --- |
| **Hosted member** | "Make this go away, send me a report" | Hosted service |
| **Self-hoster** | "I don't want to give anyone my address history" | Docker |
| **Privacy-literate user** | "Do the finding, I'll do the clicking" | User-run mode / CLI |
| **Operator** | Runs an instance for others | Hosted + admin |
| **Contributor** | Maintains broker definitions | Repo |

## 4. Core user journeys

### 4.1 Enrolment

1. Create account (email + password, or passkey in a later version).
2. **Consent screen.** Plain-language explanation of what will be collected,
   what will be sent to whom, and what the system will never do. Explicit
   per-purpose checkboxes. Nothing is pre-ticked.
3. **Authorized-agent agreement.** The member grants a scoped mandate to act as
   their agent for data-deletion requests. Optionally an **LPOA** for brokers
   that require one. Both are versioned documents; the accepted version, the
   timestamp, and the document hash are recorded.
4. **Profile.** Names and aliases, addresses (current + past), phones, emails,
   date of birth. Every field optional except one name and one email; the UI
   states what each field improves and what it costs in disclosure.
5. **Jurisdiction.** Selects which legal basis is cited and which statutory
   channels (e.g. California DROP) are available.

### 4.2 Scan → match → confirm

1. The engine runs a scan job per (profile, broker) pair.
2. Candidate listings are scored by the matcher (0.0–1.0) with a per-field
   explanation of *why* it matched.
3. Listings land in one of three buckets:
   - `>= auto_confirm_threshold` (default 0.9) → auto-confirmed if the member
     has enabled it; otherwise queued for review;
   - `>= review_threshold` (default 0.5) → **member review task**, showing the
     listing side by side with the profile fields that matched;
   - below → discarded, counted, never submitted.
4. The member confirms or rejects. A rejection is recorded and feeds back into
   match tuning for that broker.

**No listing is ever submitted without a confirmed match and a live mandate.**

### 4.3 Submit

Dispatch by the broker definition's method:

| Method | Behaviour |
| --- | --- |
| `form` | Headless browser executes the definition's ordered steps |
| `email` | Templated request from the member's agent address |
| `letter` | Renders a signed PDF for postal/fax dispatch |
| `drop` | California statutory channel (stubbed; see README) |
| `assisted` | Emits a guided task — software got partway, member finishes |
| `manual` | Emits a guided task with full instructions |

### 4.4 Verify

Most people-search opt-outs complete only when an emailed confirmation link is
clicked, often within ~24 hours ([research](research/03-removal-mechanics.md)).
The system:

- allocates a unique inbound address per (member, broker, job);
- receives the broker's mail, extracts the confirmation link against the
  broker definition's `verification.link_pattern`;
- follows it, captures evidence, advances the job.

Links that cannot be matched, or messages that look like a rejection, raise an
operator review item rather than silently failing.

### 4.5 Evidence

Each job step writes an immutable evidence record: screenshot (where a browser
was used), HTTP transcript, extracted text, SHA-256 content hash, and
timestamp. Evidence is write-once and member-scoped.

### 4.6 Re-check

After the broker definition's `relist_interval_days`, the engine re-scans. If
the listing is back, the case reopens and the re-list is recorded against the
broker's statistics. This loop is the product.

### 4.7 Report

A period report (default quarterly, configurable) showing per broker: found,
submitted, verified, removed, re-listed, blocked, and the evidence for each.
Available in the UI, as PDF, and as a signed JSON bundle.

### 4.8 Export and deletion

- **Export** — everything the system holds, as JSON plus evidence blobs.
- **Delete account** — immediate, irreversible, cascades to evidence blobs, with
  a tombstone retained containing no personal data. No support ticket required.

## 5. Functional requirements

### Must (MVP)

- F1 Account with consent + authorized-agent agreement capture, versioned.
- F2 Profile CRUD with field-level encryption at rest.
- F3 Broker catalogue loaded from schema-validated definition files.
- F4 Scan, match with explained confidence, member confirmation.
- F5 Submit via `form`, `email`, `letter`; guided tasks for the rest.
- F6 Inbound-mail verification with per-job addressing.
- F7 Evidence capture with content hashing.
- F8 Re-check scheduling per broker.
- F9 Dashboard with per-broker status; reports page.
- F10 Data export and full account deletion.
- F11 Admin: job monitoring, broker health, review queue.
- F12 CLI for self-hosters.
- F13 Docker self-host mode at feature parity for everything above.

### Should (v1)

- F14 California DROP submission channel.
- F15 Published per-broker effectiveness statistics.
- F16 Family/household plans (multiple members, each with own consent).
- F17 Postal/fax dispatch via a provider adapter.
- F18 Passkeys; TOTP second factor.

### Later

- F19 Browser extension for one-click guided tasks.
- F20 GDPR Article 15 discovery flow.
- F21 Community broker-definition registry with signed contributions.

## 6. Non-functional requirements

| # | Requirement |
| --- | --- |
| N1 | All member PII encrypted at rest with per-member keys (envelope encryption) |
| N2 | No PII in application logs, ever — enforced by a redacting logger and a test |
| N3 | Per-broker request rate limits and concurrency caps; polite by default |
| N4 | Durable multi-day waits (verification windows, re-check intervals) |
| N5 | No live broker traffic in CI; all broker tests run against fixtures or the mock server |
| N6 | Typecheck, lint, and full test suite green before any commit |
| N7 | Self-host mode requires no cloud account and no paid services |
| N8 | Deletion completes within one request cycle, not a batch job |

## 7. Explicit non-goals

- Not a people-search tool. No lookups of other people. Ever.
- Not a CAPTCHA solver, and will not integrate one.
- Not a scraper of authenticated surfaces.
- Not a guarantee of erasure. The honest ceiling is 70–80% with persistent
  re-checking ([research](research/03-removal-mechanics.md)).
- Not legal advice, and not a substitute for a lawyer reviewing deployment.
- Not a reputation-management or content-takedown service.

## 8. Success metrics

| Metric | Why |
| --- | --- |
| **Removal rate at 30/90/180 days**, per broker | The only metric that matters; comparable to the Consumer Reports methodology |
| Re-list rate per broker | Tunes `relist_interval_days` |
| Guided tasks completed / issued | If members ignore tasks, the human-in-the-loop design is failing |
| Broker-definition health (% runs meeting expectations) | Silent breakage is the category's main failure mode |
| Median time from submit to verified | The 24-hour email window is unforgiving |

Deliberately **not** a headline metric: number of brokers covered, or listings
reviewed. Both measure effort ([research](research/06-weaknesses-and-edge.md)).
