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
npm run catalog:validate     # schema + cross-field rules, all definitions
npm run catalog:report       # the honest coverage breakdown
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
packages/catalog/fixtures/
  _identities.json         # synthetic people to use everywhere
  <broker-id>/
    search.html            # a results page, including same-name decoys
    optout.html            # the opt-out form
    verification-email.eml # a confirmation email, if the broker sends one
    expected.json          # what the engine should conclude
```

```bash
npm test -- tests/src/catalog-fixtures.test.ts
```

`tests/src/catalog-fixtures.test.ts` loads a **real shipped definition** from
the catalogue, serves its fixtures through the fixture browser driver, and runs
the production scan, match and submit paths against them. It asserts the things
that matter: that the selectors extract every result, that both same-name
decoys are discarded, that the listing URL resolves to the broker's own host,
and — for an `assisted` definition — that the run genuinely stops at the
handoff without submitting anything.

What a fixture cannot tell you is whether a selector matches the real site.
Only running it against the live broker does that, which is why `verified_at`
exists and why it is empty.

**Fixtures must not contain a real person's data.** Use the synthetic
identities in `packages/catalog/fixtures/_identities.json`. A test checks the
committed fixtures against a deny-list of real-looking identifiers, and
contributors are asked to redact aggressively. See
[CONTRIBUTING.md](../CONTRIBUTING.md) and
[the fixtures README](../packages/catalog/fixtures/README.md).

**Decoys are not optional.** A fixture containing only the right person tests
nothing about the matcher's hardest job, which is refusing a stranger who
shares a surname.

## 6. Seeded brokers

The repo ships **29 definitions**, chosen for coverage of the method matrix
rather than for headline count — the point is that every code path in the
engine is exercised by a real shipped definition, not that the number is large.

Run `npm run cli -- catalog report` for the live breakdown. At time of writing:

| Dimension | Breakdown |
| --- | --- |
| Automation | assisted 22, automated 5, manual 1, unsupported 1 |
| Method | form 23, email 3, drop 1, letter 1, account 1 |
| Verification | email_link 20, none 7, account_login 1, phone_code 1 |
| Category | people_search 13, background_check 6, public_records 4, identity_graph 2, marketing 2, risk_fraud 1, other 1 |

Two entries are deliberately not conventional brokers:

- **`california-drop`** models the statutory DROP channel as a catalogue entry,
  so the integration point is concrete rather than hypothetical
  ([research](research/05-legal-basis.md)).
- **`oracle-data-cloud`** ships `unsupported` and **disabled**. It is what an
  honest entry looks like when we know a broker exists and have no procedure we
  trust. Counting entries like it towards a coverage number is precisely the
  practice [research/02](research/02-broker-coverage.md) criticises.

**The `phone` method has no seed.** The engine supports it and the validator
enforces that a phone opt-out can never claim to be `automated`, but we did not
want to publish a telephone number we had not confirmed from a primary source.
`i-360` carries a sourced phone alternative in `opt_out.phone` alongside its
web form, which exercises the field without inventing anything.

Seeds were selected from the major US people-search sites named across public
opt-out literature, plus entries representative of the California Data Broker
Registry's marketing and identity-graph categories
([research](research/02-broker-coverage.md)).

> **The caveat that ships with the catalogue.** The step selectors in these
> seeds were authored from public documentation and the structure of published
> opt-out guides. They have **not** been executed against live broker sites —
> doing so was outside the authorised scope of this build. Every definition is
> therefore unverified: the schema carries `verified_at`, the validator warns
> when it is absent, the admin broker-health page shows "never", and a test
> asserts the claim stays honest until someone actually runs one.

## 7. Adding a broker

Full checklist: [playbook/adding-a-broker.md](playbook/adding-a-broker.md).
Short form:

```bash
npm run broker:new -- <id>    # scaffolds YAML + fixture directory
# fill in the definition, record fixtures
npm run catalog:validate
npm run verify                # lint + typecheck + full test suite
```

## 8. Governance

- `packages/catalog/brokers/**` is CODEOWNERS-protected.
- A definition change must include a fixture change, or state why not.
- `definition_sha256` is recorded on every job and every evidence record, so a
  definition cannot be changed retroactively without the change being visible in
  the audit trail.
- Observed outcomes accumulate per definition and are published. A definition
  whose removal rate collapses is a bug report.
