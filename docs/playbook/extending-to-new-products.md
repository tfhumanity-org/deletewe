# Extending to a new kind of privacy agent

The engine is not really about data brokers. It is a **consent-gated,
evidence-backed, recurring request pipeline** with a human fallback. That shape
fits several other products.

## What generalises, and what does not

| Reusable as-is | Needs replacing |
| --- | --- |
| Consent and mandate recording | The catalogue's domain vocabulary |
| The job pipeline, retries, durable scheduling | The matcher's fields and weights |
| Evidence capture, hashing, write-once storage | Submission templates |
| Guided tasks and the operator review queue | Whatever "removal" means for you |
| Envelope encryption, blind indexes, the redacting logger | |
| Broker-health detection | |
| Ports and both adapter sets | |

The reusable column is most of the hard work. The replaceable column is mostly
data.

## Four adjacent products

### 1. Subject access requests across a member's own vendors

"Tell me what every company I deal with holds about me."

- **Catalogue entry** → a company, with its privacy contact and request method.
- **Scan** → no public index to search. Discovery comes from the member's own
  list, their email receipts, or a public registry.
- **Match** → not needed. The member names the company.
- **Submit** → an Article 15 / CCPA right-to-know request.
- **Verify** → the company replies; the reply *is* the deliverable.
- **Re-check** → the statutory deadline, then an escalation item.

Changes: drop the matcher, keep everything else. The deadline timer becomes
the central mechanic rather than the re-list interval. **Watch out:** replies
contain large volumes of the member's personal data. Evidence retention and
the export format need rethinking before you ship it.

### 2. Marketing suppression

"Stop sending me things."

- **Catalogue entry** → a suppression list or preference service.
- **Submit** → a suppression request, often with a hashed email.
- **Re-check** → re-register before the suppression expires. Many lapse.

Changes: `relist.interval_days` becomes `expires_after_days` and the re-check
renews rather than verifies. The guided-task mechanism carries over directly
for services that require postal confirmation.

### 3. Breach exposure follow-up

"I was in a breach. Now what?"

- **Catalogue entry** → a known breach plus the controller's obligations.
- **Scan** → check the member's identifiers against breach corpora. **Only
  their own**, and only ones they entered.
- **Submit** → an erasure request to the breached controller.
- **Guided tasks** → the things only the member can do: rotate credentials,
  freeze credit, enable a second factor.

Changes: the matcher becomes an exact-identifier lookup. The guided-task
system carries most of the product. **Watch out:** this is adjacent to a
people-search capability. Keep the one-subject rule absolute — identifiers
must come from the authenticated member's own stored profile and nowhere else.

### 4. Household or organisational mode

Several people under one operator.

Changes: none to the engine, by design. Every member already has their own
profile, consent, mandate, key and evidence. What you add is an account that
can *administer* several members — and the hard part is making sure
administering never means *reading*. One person's dossier must not become
visible to another just because they share a payer.

## Porting checklist

### 1. Define the catalogue entry

- [ ] What is the unit — a broker, a company, a list, a breach?
- [ ] What must the engine know to act? Keep `required_fields` minimal.
- [ ] Which methods apply? Reuse `form` / `email` / `letter` / `phone` /
      `account` where you can; add one only if genuinely new.
- [ ] What proves success? If it is not observable, say so rather than
      inventing a proxy.

### 2. Decide what replaces matching

If there is no ambiguity about *who*, the consent gate still has a job: it
becomes "confirm you want us to contact this organisation". Do not remove the
gate just because the matcher went away.

### 3. Redefine the loop

Every product in this family has one, and it determines the business model:

| Product | The loop |
| --- | --- |
| Broker removal | They re-list; re-scan quarterly |
| Subject access | Deadline passes; escalate |
| Suppression | Registration expires; renew |
| Breach follow-up | New breaches appear; re-check corpora |

If you cannot name the loop, you have a one-time service, not a subscription —
which is fine, but price and design it as one.

### 4. Keep the properties

Non-negotiable in anything built on this engine:

- [ ] **One subject.** No lookups of non-consenting people. Ever.
- [ ] **Consent before action**, recorded, versioned, revocable.
- [ ] **Evidence or it didn't happen.**
- [ ] **No CAPTCHA solving, no access-control bypass.**
- [ ] **Minimum necessary disclosure.**
- [ ] **No PII in logs.**
- [ ] **Honest about what you cannot do**, per entry, in the data model —
      not in a footnote.

### 5. Mechanical steps

1. Fork the schema in `packages/schema/src/broker.ts`. Keep the closed enums,
   the host allowlist and the declared-field projection — those are the
   supply-chain controls, not incidental structure.
2. Rename the domain types in `packages/engine/src/types.ts`.
3. Replace `scoreListing` with your own confirmation step.
4. Rewrite the submit dispatchers for your methods.
5. Redefine `runRecheck` around your loop.
6. **Keep** crypto, logger, projection, evidence, tasks, health, dispatcher,
   store and both adapter sets.
7. Rewrite the member-facing copy. It carries most of the trust.
