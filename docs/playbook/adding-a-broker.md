# Adding a broker

The highest-value contribution to this project. A definition that has actually
been run against the real site is worth more than ten written from documentation.

Budget about an hour for your first one, twenty minutes thereafter.

## Before you start

- [ ] You will test using **your own data and your own consent**. Never
      exercise an opt-out with anyone else's details — that is the harm this
      project exists to prevent.
- [ ] The broker publishes an opt-out page. If it does not, the definition is
      `unsupported` and ships disabled; that is a legitimate outcome.
- [ ] You have read the broker's terms. We do not bypass access controls.

## 1. Scaffold

```bash
npm run broker:new -- acme-people-search
```

Creates `packages/catalog/brokers/acme-people-search.yaml` and
`packages/catalog/fixtures/acme-people-search/`.

## 2. Work out the search surface

Open the broker and search for yourself. Record:

- [ ] The **URL pattern** of a results page. Parameterise it with
      `{name_slug}`, `{first_name}`, `{last_name}`, `{city}`, `{region}`.
- [ ] A **selector matching one result**, repeated for every result. Use
      browser devtools; prefer a semantic class over a positional selector.
- [ ] Per-field **selectors scoped inside a result**: `name`, `locality`,
      `region`, `age`, and crucially `url`.

```yaml
search:
  method: url_template
  url_template: "https://acme-people-search.test/find/{name_slug}"
  result_selector: ".result-card"
  fields:
    name:     { selector: ".result-name", attr: text }
    locality: { selector: ".result-city", attr: text }
    region:   { selector: ".result-state", attr: text }
    age:      { selector: ".result-age",  attr: text }
    url:      { selector: "a.result-link", attr: href }
```

If the broker has no searchable index — common for marketing and
identity-graph brokers — use `search: { method: none }` and set
`match.require_manual_confirmation: true`. Be explicit in `notes` that we
cannot tell the member whether they are listed. Do not pretend otherwise.

**Picking selectors.** Tight enough to survive a layout tweak, loose enough not
to break on a class rename. `input[name="email"]` beats
`.form > div:nth-child(3) > input` every time.

## 3. Set the match weights

```yaml
match:
  fields: { name: 0.4, locality: 0.2, region: 0.15, age: 0.25 }
  thresholds: { review: 0.5, auto_confirm: 0.92 }
  require_manual_confirmation: false
```

- Only weight a field the search can actually extract. The validator warns
  otherwise.
- Weight **name** high but never alone — a surname is not evidence. The matcher
  already discounts a listing that exposes few of the declared fields.
- Set `require_manual_confirmation: true` when listings are ambiguous or the
  broker penalises bad requests.

## 4. Work out the opt-out procedure

Pick the method:

| Method | When |
| --- | --- |
| `form` | A web form. Most people-search sites. |
| `email` | A `privacy@` address accepting a written request. The only fully automatable method. |
| `letter` | Postal or fax only. We render a signed PDF; dispatch needs a vendor. |
| `account` | The broker requires an account to manage a listing. |
| `phone` | Telephone only. Always a guided task; can never be `automated`. |
| `drop` | A statutory channel such as California's DROP. |

### For a `form`, write the steps

```yaml
opt_out:
  method: form
  url: https://acme-people-search.test/optout
  required_fields: [listing_url, email]   # ONLY what this broker needs
  steps:
    - id: open
      action: goto
      url: "https://acme-people-search.test/optout"
      expect: { selector_present: "form" }
    - id: listing
      action: fill
      selector: "input[name=\"url\"]"
      value: "{{listing_url}}"
    - id: email
      action: fill
      selector: "input[name=\"email\"]"
      value: "{{email}}"
    - id: submit
      action: click
      selector: "button[type=\"submit\"]"
      expect: { text_contains: "received" }
```

Rules the validator enforces:

- Every URL must be on the `hosts` allowlist.
- Every `{{field}}` must appear in `required_fields`.
- Step ids are unique — health incidents reference them.

**Put an `expect` on every step that changes the page.** This is what lets the
engine distinguish *our procedure broke* from *the broker refused*. Without it,
a redesign is silently recorded as a refusal, and the member is told a lie.

### When you hit a CAPTCHA, ID upload, or phone step

Stop and hand off. Never try to get past it.

```yaml
    - id: captcha
      action: handoff
      reason: captcha      # captcha | id_upload | phone_call | payment_wall | account_creation | unexpected
      instructions: >-
        Open the link below. Your details are already filled in — complete the
        "I am not a robot" challenge and press submit. We do not solve these
        for you, by design.
      url: "https://acme-people-search.test/optout"
```

Then set `automation.level: assisted` with a `reason`. The validator rejects
`automated` on a flow containing a handoff.

## 5. Verification

```yaml
verification:
  method: email_link
  expected_senders: ["@acme-people-search.test"]
  link_pattern: "https://acme-people-search\\.test/confirm/[A-Za-z0-9_-]+"
  window_hours: 24
```

- `link_pattern` must be anchored to an https URL on an allowlisted host. An
  unanchored pattern would let a broker's email redirect us anywhere.
- `window_hours` should reflect reality. Confirmation links commonly expire in
  about 24 hours, and a link that sits in a queue for a day is a failed opt-out.
- No confirmation step? `method: none`. The re-check still has to prove removal.

## 6. Re-list interval and pacing

```yaml
relist:
  interval_days: 90        # how often THIS broker actually re-lists
rate_limit:
  min_interval_ms: 4000
  daily_cap: 200
```

Do not copy the default without thinking. A broker that re-lists monthly needs
checking monthly; one that does not needs checking annually.

## 7. Record fixtures

```
packages/catalog/fixtures/acme-people-search/
  search.html            a results page, including same-name decoys
  optout.html            the opt-out form
  verification-email.eml the confirmation email, if any
  expected.json          what the engine should conclude
```

- [ ] **Redact every real identifier** — names, addresses, phones, emails,
      dates of birth — including in hidden inputs, `data-` attributes and
      inline JSON. Use the synthetic people in `fixtures/_identities.json`.
- [ ] **Include at least two decoys**: a same-name person in a different city,
      and an unrelated person. A fixture with only the right person tests
      nothing about the matcher's hardest job.

## 8. Verify against the live site

The step that makes the definition real.

- [ ] Run the scan against the broker with your own profile.
- [ ] Confirm the match and let the opt-out run.
- [ ] Complete any guided task yourself.
- [ ] Wait, then re-check and confirm the listing is gone.
- [ ] Set `verified_at: "YYYY-MM-DD"`.

If you have not done this, **leave `verified_at` out**. The validator will warn
and the admin console will show "never", which is correct and honest.

## 9. Gates

```bash
npm run catalog:validate
npm run verify
```

Both must pass. Then open a pull request describing what you observed on the
live site, and whether you verified it.

## Repairing a broken definition

When the admin broker-health page shows a broker `broken`:

1. Look at the health incident — it names the **step id** that failed.
2. Open the broker's page and find what changed.
3. Update the selector. Re-record the fixture.
4. **Bump `version`** in the definition. The `definition_sha256` recorded on
   every past job and evidence record makes the change visible in the audit
   trail, which is the point.
5. `npm run verify`, then let an operator flip the status back to `healthy` —
   or let the rolling health window do it once runs succeed again.
