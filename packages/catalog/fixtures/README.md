# Broker fixtures

Recorded pages that broker definitions are tested against, so **no live broker
traffic ever happens in CI**.

## The rule that matters

**No fixture may contain a real person's data.** Use the synthetic identities
in [`_identities.json`](_identities.json). This repository exists to get
people's data taken down; publishing more of it in a test fixture would be a
small betrayal of the whole point.

When you record from a live site, redact before you commit: every name,
address, phone number, email and date of birth, including the ones in hidden
fields, data attributes and inline JSON.

## Status of what is here

The fixtures currently committed are **synthetic stand-ins**, shaped to match
the selectors in the definitions rather than captured from the live sites —
the seeded definitions have not been run against real brokers. They are useful
for exercising extraction and matching logic; they cannot tell you whether a
selector matches reality.

Replacing one with a genuine redacted recording, and setting `verified_at` on
the definition at the same time, is the single most valuable contribution to
this project.

## Layout

```
fixtures/
  _identities.json         synthetic people to use everywhere
  <broker-id>/
    search.html            a results page, including same-name decoys
    optout.html            the opt-out form
    verification-email.eml a confirmation email, if the broker sends one
    expected.json          what the engine should conclude
```

Decoys are not optional. A fixture with only the right person tests nothing
about the matcher's hardest job, which is refusing a stranger who shares a
surname.
