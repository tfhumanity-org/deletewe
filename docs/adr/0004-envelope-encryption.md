# 0004 — Envelope encryption with per-member keys and blind indexes

**Status:** Accepted · **Date:** 2026-10-27

## Context

The brief requires PII encrypted at rest. The product holds, for each member, a
more complete identity dossier than most individual brokers do: every name they
have used, every address they have lived at, phones, emails, date of birth
([research/01](../research/01-user-journey.md)). A database dump is the
catastrophic outcome, and the adversary we most need to defeat is a stalker
targeting one specific person ([threat-model](../threat-model.md) §2).

Transparent full-disk or platform-managed encryption does not help: anything
that can query the database gets plaintext.

## Decision

Application-level **envelope encryption**:

```
master key (secret binding / key file, versioned)
  └─ wraps a per-member DEK (AES-256-GCM)
       └─ encrypts every PII column and every evidence blob for that member
```

- Column ciphertext is `version || iv || tag || ct`, with `member_id` bound as
  **AAD** so a ciphertext cannot be moved between members.
- Equality lookup uses a **blind index**: `HMAC-SHA256(index_key, kind ||
  ':' || normalise(value))`, truncated to 128 bits, stored in `*_bidx`.
- Keys are versioned; rotation rewraps DEKs without touching ciphertext.
- `WebCrypto` only — available on both Workers and Node, so the crypto
  implementation is shared rather than adapter-specific.

## Consequences

**Good**
- A stolen database yields blind indexes and non-identifying metadata.
- **Deleting a member's DEK cryptographically shreds their data**, making
  account deletion fast and verifiable — it is the first step, with row
  deletion following.
- Per-member keys bound the blast radius of any single key compromise.

**Costs**
- *No server-side search, sort, or range query on PII.* Accepted: the product
  genuinely does not need one (and [threat-model](../threat-model.md) §5.1
  argues it must not have one). Equality lookup via blind index covers login.
- *Blind indexes leak equality.* An attacker holding both the database and the
  index key could test guesses. The index key is stored separately from the
  master key. The alternative — no index — means no login lookup.
- *Key loss is unrecoverable.* Correct, and documented loudly for self-hosters,
  with a key-backup procedure.
- *Every repository method must encrypt/decrypt.* Centralised in one
  `EncryptedRepository` layer so individual use-cases cannot forget.

## Alternatives rejected

- **Platform-managed encryption at rest only.** Does not defend against the
  threat that matters (anything with query access reads plaintext).
- **One global key.** Simpler, but no per-member blast radius, and deletion
  becomes a row-deletion problem with no cryptographic backstop.
- **Client-side end-to-end encryption.** Strongest privacy, but the server must
  read the profile to scan brokers on a schedule while the member is offline.
  Incompatible with the product. Self-hosting is our answer to users who want
  this property.
- **Deterministic encryption instead of blind indexes.** Same leakage, worse
  cryptographic hygiene, no upside.
