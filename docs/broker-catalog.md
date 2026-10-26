# The broker catalogue

## 1. Why brokers are data, not code

Every removal service maintains roughly the same hundred opt-out procedures
privately, and every one of them silently breaks when a broker changes a page
([research](research/06-weaknesses-and-edge.md)). `deletewe` makes those
procedures a **shared, versioned, schema-validated, testable commons**.

One file per broker, at `packages/catalog/brokers/<id>.yaml`. The files are the
source of truth; the `broker` table is a projection rebuilt on boot.

Three rules make this safe to accept contributions against:

1. **Declarative only.** A definition describes *what* to do. There is no
   scripting hook, no `eval`, no arbitrary request builder. The step action
   enum is closed.
2. **Host-allowlisted.** Every URL a definition can reach must be on its own
   `hosts` list, and the validator rejects any step referencing a host not
   listed. A malicious definition cannot exfiltrate to an arbitrary endpoint.
3. **Field-scoped.** `required_fields` is a closed enum. The submitter receives
   a projection of the profile containing only those fields and cannot read the
   rest.

## 2. Schema

Authoritative definition: `packages/schema/src/broker.ts` (Zod), with a
generated JSON Schema at `packages/schema/schema/broker.schema.json`.

```yaml
id: spokeo                      # slug, matches filename, [a-z0-9-]+
name: Spokeo
homepage: https://www.spokeo.com
version: 1.0.0                  # semver; bump on any behavioural change
category: people_search         # see enum below
jurisdictions: [US]             # ISO-3166 alpha-2, or US-XX
hosts:                          # allowlist — nothing else may be reached
  - www.spokeo.com
  - spokeo.com

automation:
  level: assisted               # automated | assisted | manual | unsupported
  reason: CAPTCHA on the opt-out form

search:                         # how to find candidate listings
  method: url_template          # url_template | none
  url_template: https://www.spokeo.com/{name_slug}
  result_selector: .people-list .person
  fields:
    name:     { selector: .person-name,     attr: text }
    locality: { selector: .person-location, attr: text }
    age:      { selector: .person-age,      attr: text }
    url:      { selector: a,                attr: href }

match:
  fields: { name: 0.45, locality: 0.2, region: 0.15, age: 0.2 }
  thresholds: { review: 0.5, auto_confirm: 0.9 }
  require_manual_confirmation: false

opt_out:
  method: form                  # form | email | letter | drop | account | phone
  url: https://www.spokeo.com/optout
  required_fields: [listing_url, email]
  steps:
    - id: open
      action: goto
      url: https://www.spokeo.com/optout
      expect: { selector_present: form }
    - id: fill-url
      action: fill
      selector: input[name=url]
      value: "{{listing_url}}"
    - id: fill-email
      action: fill
      selector: input[name=email]
      value: "{{email}}"
    - id: captcha
      action: handoff
      reason: captcha
      instructions: Tick "I'm not a robot", then press Submit.

verification:
  method: email_link            # none | email_link | phone_code | account_login
  expected_senders: ["@spokeo.com"]
  link_pattern: "https://www\\.spokeo\\.com/optout/confirm/[A-Za-z0-9_-]+"
  window_hours: 24

relist:
  interval_days: 90

evidence:
  capture: [screenshot, dom, transcript]

rate_limit:
  max_concurrent: 1
  min_interval_ms: 3000
  daily_cap: 200

references:
  - https://www.spokeo.com/optout
notes: |
  Opt-out is per listing URL, not per person; a member with several listings
  needs one submission each.
```

### Enums

| Field | Values |
| --- | --- |
| `category` | `people_search`, `background_check`, `public_records`, `marketing`, `identity_graph`, `risk_fraud`, `other` |
| `automation.level` | `automated`, `assisted`, `manual`, `unsupported` |
| `opt_out.method` | `form`, `email`, `letter`, `drop`, `account`, `phone` |
| `verification.method` | `none`, `email_link`, `phone_code`, `account_login` |
| `required_fields` | `full_name`, `first_name`, `last_name`, `middle_name`, `aliases`, `email`, `phone`, `address`, `city`, `region`, `postal_code`, `country`, `dob`, `age`, `listing_url`, `jurisdiction` |
| `step.action` | `goto`, `fill`, `select`, `click`, `wait_for`, `expect`, `extract`, `screenshot`, `handoff` |
| `handoff.reason` | `captcha`, `id_upload`, `phone_call`, `payment_wall`, `account_creation`, `unexpected` |

### `automation.level`, precisely

This field is why our coverage number cannot be inflated.

| Level | Meaning |
| --- | --- |
| `automated` | The engine completes the opt-out with no human step |
| `assisted` | The engine gets partway and hands off (CAPTCHA, ID, login) |
| `manual` | No automation; the member is given instructions |
| `unsupported` | We know the broker exists and have no working procedure |

Any published coverage figure must state the breakdown. "969 brokers" where
most are `unsupported` is a marketing number, not a capability
([research](research/02-broker-coverage.md)).

## 3. Templating

Values in steps and templates use `{{field}}` where `field` must appear in
`required_fields`. The renderer:

- resolves only declared fields, from the projection;
- throws on an undeclared field — a definition cannot reach for `dob` without
  asking for it in the schema;
- HTML-escapes nothing (values go into form fields, not markup) but strips
  control characters;
- is pure and unit-tested.

`{name_slug}` in `search.url_template` is the one exception: a URL-safe
slug of the member's name, produced by the engine.

## 4. Validation

```bash
pnpm catalog:validate     # schema + cross-field rules, all definitions
```

Beyond the Zod schema, the validator enforces:

| Rule | Reason |
| --- | --- |
| `id` matches the filename | Predictable lookup |
| Every URL in every step is on `hosts` | Supply-chain containment |
| Every `{{field}}` appears in `required_fields` | No silent over-collection |
| Steps have unique `id`s | Health incidents reference a step |
| `method: form` ⇒ at least one step; `method: email` ⇒ `email` block present; `letter` ⇒ `letter` block | Internal consistency |
| `automation.level: automated` ⇒ **no `handoff` step** | The level must be true |
| `automation.level` ≠ `automated` ⇒ `automation.reason` required | Explain the gap |
| `verification.method: email_link` ⇒ `link_pattern` and `expected_senders` | Anti-forgery |
| `link_pattern` compiles and is anchored to an allowlisted host | No open redirect following |
| `relist.interval_days` in 7…730 | Politeness floor and staleness ceiling |
| `rate_limit.min_interval_ms` ≥ 1000 | Politeness floor |

## 5. Testing a definition

Definitions are tested against **recorded fixtures**, never live brokers. CI
makes no outbound request to any real site.

```
packages/catalog/fixtures/<broker-id>/
  search.html         # a recorded search-results page (synthetic or redacted)
  listing.html
  optout-form.html
  verification-email.eml
  expected.json       # extracted listings, scores, and the expected outcome
```

```bash
pnpm catalog:test                 # all
pnpm catalog:test --broker spokeo # one
```

The fixture runner mounts the HTML in the mock browser driver, runs the real
search/extract/match code paths against it, and asserts `expected.json`.

**Fixtures must not contain a real person's data.** Use the synthetic identities
in `packages/catalog/fixtures/_identities.json`. A test asserts no fixture
contains a value from a small deny-list of well-known real names, and
contributors are asked to redact aggressively. See
[CONTRIBUTING.md](../CONTRIBUTING.md).

## 6. Seeded brokers

The repo ships **27 definitions**, chosen for coverage of the method matrix
rather than for headline count — every opt-out method, every verification
method, and every automation level is represented so the engine's paths are all
exercised.

Run `pnpm catalog:report` for the live breakdown. At time of writing:

| Dimension | Breakdown |
| --- | --- |
| Method | form, email, letter, account, phone, drop |
| Verification | none, email_link, phone_code, account_login |
| Automation | automated, assisted, manual, unsupported |

Seeds were selected from the major US people-search sites named across public
opt-out literature, plus entries representative of the California Data Broker
Registry's marketing and identity-graph categories
([research](research/02-broker-coverage.md)).

> **Important caveat shipped with the catalogue.** The step selectors in these
> seeds were authored from public documentation and the structure of published
> opt-out guides. They have **not** been executed against live broker sites —
> doing so was outside the authorised scope of this build. Treat every
> definition as `unverified` until someone runs it against the real site and
> flips `verified_at`. The schema carries that field, the validator warns when
> it is absent, and the admin broker-health page surfaces it.

## 7. Adding a broker

Full checklist: [playbook/adding-a-broker.md](playbook/adding-a-broker.md).
Short form:

```bash
pnpm broker:new <id>          # scaffolds YAML + fixture directory
# fill in the definition, record fixtures
pnpm catalog:validate
pnpm catalog:test --broker <id>
pnpm verify                   # lint + typecheck + full test suite
```

## 8. Governance

- `packages/catalog/brokers/**` is CODEOWNERS-protected.
- A definition change must include a fixture change, or state why not.
- `definition_sha256` is recorded on every job and every evidence record, so a
  definition cannot be changed retroactively without the change being visible in
  the audit trail.
- Observed outcomes accumulate per definition and are published. A definition
  whose removal rate collapses is a bug report.
