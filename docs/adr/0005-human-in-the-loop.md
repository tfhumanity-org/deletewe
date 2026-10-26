# 0005 — Human-in-the-loop as a mechanism, and no CAPTCHA solving

**Status:** Accepted · **Date:** 2026-10-27

## Context

A meaningful minority of opt-out flows require something software should not do:
a CAPTCHA, a photo-ID upload, a phone call
([research/03](../research/03-removal-mechanics.md)). CAPTCHA-solving services
exist and are cheap.

The incumbent's answer is labour: a Privacy Advisor team that handles
"adversarial problem sites", with access to those humans sold by plan tier
([research/03](../research/03-removal-mechanics.md) §3.4, §6.4).

## Decision

Two parts.

**1. We never solve, bypass, or outsource a CAPTCHA.** No solver integration, no
port for one, no issue accepted proposing one. A CAPTCHA is the site's explicit
statement that it wants a human; defeating it is an access-control bypass and a
terms violation. The same applies to login walls and bot-detection evasion. Our
outbound requests identify the project honestly in the User-Agent.

**2. Human involvement is a first-class pipeline state, available to everyone.**
`handoff` is a schema action. Reaching one does not fail the job — it:
captures evidence of exactly where automation stopped, creates a `task` with the
pre-filled values and a deep link, parks the case in `task_pending`, and resumes
when the member marks it done.

Tasks are typed by audience: `member` (CAPTCHA, ID, phone) and `operator`
(ambiguous match, broken definition, unparseable verification mail).

## Consequences

**Good**
- Legally and ethically defensible, which matters disproportionately for a
  product whose legitimacy rests on acting as a lawful authorized agent.
- The automation boundary is **explicit and published** via
  `automation.level`, instead of hidden behind a coverage number.
- Every member gets the capability the incumbent sells as a premium tier: the
  difference is that the human is the member themselves, with the hard part
  (finding the listing, filling the form) already done.
- Self-hosters get the identical mechanism with no staff.

**Costs**
- Lower fully-automated completion rate than a service willing to buy
  CAPTCHA solves. Accepted, and stated in the product spec's non-goals.
- Members who ignore their tasks get worse outcomes. Mitigated by task
  reminders, due dates, and treating **tasks-completed / tasks-issued** as a
  headline product metric — if it is low, the design is failing, and we want to
  see that.

## Alternatives rejected

- **A CAPTCHA-solving service.** Cheap, effective, and corrosive to the only
  thing that makes this product trustworthy.
- **Staff a human ops team.** The incumbent's model. It works, and it is not
  available to an open-source project or a self-hoster.
- **Silently skip CAPTCHA brokers.** The dishonest option: the member sees a
  broker in the list and assumes it was handled.
