# Security

`deletewe` holds the most complete identity dossier most of its users will ever
assemble in one place: every name they have used, every address they have lived
at, their phone numbers, emails, and date of birth. And the adversary the
product most needs to defeat is not an opportunistic scanner — it is someone
trying to locate a specific person who does not want to be found.

We take reports seriously and we would rather hear about a problem than not.

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private vulnerability reporting on
[the repository](https://github.com/tfhumanity-org/deletewe/security/advisories/new),
which is the fastest route to the maintainers.

Please include: what you found, how to reproduce it, what an attacker could do
with it, and whether you need us to coordinate disclosure timing.

### What to expect

| | |
| --- | --- |
| Acknowledgement | within 3 working days |
| Initial assessment | within 10 working days |
| Fix or mitigation for a high-severity issue | as fast as we can, with you kept informed |
| Credit | however you prefer, including not at all |

We will not take legal action against good-faith research that respects user
privacy, does not access other people's data, and does not degrade the service.

### Please do not

- Test against a hosted instance you do not own. Run your own — that is what
  `docker compose up` is for, and it takes a minute.
- Use a real third party's data in a proof of concept.
- Send an opt-out request to a real broker as part of testing.

## In scope

- Anything that lets one member reach another member's data.
- Anything that lets the system be used to look up a person who has not
  consented.
- Broker definitions that exfiltrate data, over-collect, or reach hosts outside
  their declared allowlist.
- Weaknesses in the encryption scheme, key handling, or blind indexes.
- PII reaching logs, error messages, job rows, or the admin console.
- Authentication, session, or CSRF weaknesses.
- Anything that causes an outbound request without a live consent and mandate.

## Out of scope

- Missing hardening on a self-hosted instance the operator chose not to
  configure (no TLS, default port exposed to the internet, and so on). The
  quick start says what to set; we will still fix anything we can make safe by
  default.
- Rate limiting on a local instance you are running yourself.
- Reports generated solely by an automated scanner with no demonstrated impact.
- Social engineering of maintainers.

## What we commit to in the code

These are design properties, not aspirations. If one is not true, that is a
vulnerability and we want the report.

1. **All member PII is encrypted at rest** with a per-member key, wrapped by a
   master key, with the member id bound as additional authenticated data so a
   ciphertext cannot be transplanted between members.
2. **No PII can reach the logs.** The logger's API accepts only ids, enum codes,
   counts and booleans — a profile value is not representable in it. A test
   seeds sentinel values and asserts none reach the sink across a full run.
3. **Deleting an account destroys the key first.** Row and blob deletion follow,
   but the cryptographic shredding is what makes it irreversible. No support
   ticket, no waiting period.
4. **A broker definition cannot reach a host it has not declared**, cannot read
   a profile field it has not declared, and cannot execute code. The action
   enum is closed.
5. **Nothing leaves the system without a recorded consent and a live mandate.**
   Revoking either halts outbound work at the next gate check.
6. **The admin console shows no decrypted member data.** Reading it requires an
   explicit break-glass action, written to an append-only audit log and
   surfaced to the member in their own history.
7. **We never solve a CAPTCHA, bypass a login, or evade a bot check**, and we
   identify the project honestly in our User-Agent.

See [docs/threat-model.md](docs/threat-model.md) for the full analysis,
including the risks we have explicitly accepted and the residual items that
need a human — among them a real penetration test, which has **not** been done.

## Self-hosting checklist

If you run an instance for anyone other than yourself:

- [ ] Back up `data/keys.json`, encrypted and offline. Losing it destroys
      everything stored under it, permanently and by design.
- [ ] Terminate TLS in front of the app; `DELETEWE_BASE_URL` must be `https://`
      so session cookies are marked Secure.
- [ ] Set `DELETEWE_MASTER_KEY` and `DELETEWE_INDEX_KEY` from your own secret
      store rather than relying on the generated key file.
- [ ] Keep the `/admin` routes off the public internet, or behind a second
      factor at the proxy.
- [ ] Have a lawyer review the consent and mandate documents for your
      jurisdiction before you act for anybody else.
