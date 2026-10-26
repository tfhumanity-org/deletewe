# Adding a jurisdiction

A jurisdiction decides three things: which law a request cites, which statutory
channels the member can use, and what a broker may demand before acting.

> Not legal advice. Everything here needs a lawyer's review before you act for
> anyone. See [docs/research/05-legal-basis.md](../research/05-legal-basis.md).

## What a jurisdiction actually changes

| Aspect | Where it lives |
| --- | --- |
| The citation in a request | `opt_out.email.body_template` / `letter.body_template` per broker |
| Which brokers apply | `jurisdictions:` on each definition, matched by `appliesTo()` |
| Statutory channels | A catalogue entry with `method: drop`, gated by `jurisdictions` |
| Response deadlines | `verification.window_hours`, and the re-check schedule |
| Agent verification | The mandate documents in `packages/engine/src/documents.ts` |

The jurisdiction code is a per-member attribute (`US-CA`, `US-TX`, `GB`, `EU`).
`appliesTo()` treats a country-level entry as covering its subdivisions, so a
broker tagged `US` applies to a `US-CA` member.

## Checklist

### 1. Establish the legal position

- [ ] Which right is being exercised? (Deletion, opt-out of sale, objection to
      processing, erasure.)
- [ ] Does the law permit an **authorized agent**, and what proof may a
      business demand? This is the question that decides whether the product
      works at all there.
- [ ] Is there a **response deadline**? (CCPA: 45 days. GDPR Art. 12(3): one
      month, extendable by two.)
- [ ] Is there a **registry** of brokers, and is it public?
- [ ] Is there a **centralised deletion mechanism**? California's DROP is so
      far the only one — and for an eligible member it beats everything else
      we do.
- [ ] What may a business demand to verify the member's own identity?

Write the answers into `docs/research/05-legal-basis.md` with sources, marked
`[SOURCED]` or `[INFERRED]`. Future you will not remember which was which.

### 2. Add the jurisdiction code

- [ ] Add the option to the signup form in
      `packages/web/src/views/pages.tsx` (`SignupPage`).
- [ ] Check `appliesTo()` in `packages/engine/src/pipeline/dispatcher.ts`
      handles the code shape. Anything matching `^[A-Z]{2}(-[A-Z0-9]{1,3})?$`
      works without change.

### 3. Write the request templates

Per-broker templates carry the citation. Parameterise with `{{jurisdiction}}`
where one template serves several regimes; write a separate definition where
the wording must genuinely differ.

```yaml
body_template: |
  I act as the authorized agent of the individual named below and request,
  on their behalf, erasure of their personal data under Article 17 of the UK
  General Data Protection Regulation.

  You must respond within one month of receipt, per Article 12(3).
```

- [ ] Cite the correct instrument and article.
- [ ] State the deadline the law gives them. It changes behaviour.
- [ ] Offer the signed authorization rather than attaching it unprompted —
      minimum necessary disclosure applies to proof as well as to data.

### 4. Statutory channels

If the jurisdiction has a central mechanism, model it as a catalogue entry so
it appears in the member's dashboard alongside everything else:

```yaml
id: your-state-portal
category: other
jurisdictions: [US-XX]
automation:
  level: manual
  reason: Submitting to a state platform needs operator registration and legal review
opt_out:
  method: drop
  instructions: |
    <state> runs a single deletion request that reaches every registered broker.
    It is free and stronger than asking brokers one at a time.
```

See `packages/catalog/brokers/california-drop.yaml` for the worked example.
Implementing a real submission means writing a `DropChannel` adapter — and
getting operator credentials and legal sign-off first.

### 5. Deadlines and re-checks

- [ ] Set `relist.interval_days` so the first re-check lands **after** the
      statutory deadline. Re-checking before a broker is obliged to act
      produces a false "still listed" and wastes a retry.
- [ ] Decide what happens when a deadline passes with no action. We deliberately
      do **not** auto-file regulator complaints: that is a decision for the
      member, so it becomes an operator review item.

### 6. Mandate documents

- [ ] Does the existing `authorized_agent` wording work there?
- [ ] Is a power-of-attorney variant needed or recognised?
- [ ] Add a new document version in `packages/engine/src/documents.ts` —
      **never edit an existing version in place**. The stored
      `document_sha256` must keep matching the text the member actually signed.
      Bump the version string; old mandates keep referring to old text.

### 7. Tag the brokers

- [ ] Add the code to `jurisdictions:` on every definition that applies.
- [ ] `npm run verify`.

## A worked example: adding the UK

1. Right: UK GDPR Article 17 erasure, Article 21 objection. Article 15 access
   as a discovery step.
2. Agent: permitted under ordinary agency principles; no statutory equivalent
   of CCPA § 7063, so expect brokers to improvise and ask for more proof.
3. Deadline: one month under Article 12(3), extendable by two for complex cases.
4. Registry: none. Broker discovery is manual.
5. Central mechanism: none.
6. Add `GB` to the signup form; write `GB` templates citing Articles 17 and
   12(3); set `relist.interval_days` to at least 35 so the first re-check falls
   after the deadline; tag UK-reachable brokers `GB`.
