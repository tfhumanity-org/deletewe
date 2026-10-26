import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brokersDir, fixturesDir } from '../load.ts';

const id = process.argv[2];
if (!id || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id)) {
  console.error('usage: npm run broker:new -- <broker-id>');
  process.exit(1);
}

const file = join(brokersDir(), `${id}.yaml`);
if (existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}

const template = `# <Broker name>
#
# UNVERIFIED. Authored from public opt-out documentation; never executed
# against the live site. Set \`verified_at\` once someone has run it.

id: ${id}
name: "<Broker name>"
homepage: https://${id}.example
version: 1.0.0
category: people_search   # people_search | background_check | public_records | marketing | identity_graph | risk_fraud | other
jurisdictions:
  - US
hosts:                    # allowlist: no URL in this file may leave these hosts
  - ${id}.example

automation:
  level: assisted         # automated | assisted | manual | unsupported
  reason: "why this is not fully automated"

search:
  method: url_template
  url_template: "https://${id}.example/search/{name_slug}"
  result_selector: ".result"
  fields:
    name: { selector: ".name", attr: text }
    locality: { selector: ".city", attr: text }
    region: { selector: ".state", attr: text }
    age: { selector: ".age", attr: text }
    url: { selector: "a", attr: href }

match:
  fields:
    name: 0.4
    locality: 0.2
    region: 0.15
    age: 0.25
  thresholds:
    review: 0.5
    auto_confirm: 0.92
  require_manual_confirmation: false

opt_out:
  method: form            # form | email | letter | drop | account | phone
  url: https://${id}.example/optout
  required_fields:        # only what this broker actually needs
    - listing_url
    - email
  steps:
    - id: open
      action: goto
      url: "https://${id}.example/optout"
      expect: { selector_present: "form" }
    - id: listing-url
      action: fill
      selector: "input[name=\\"url\\"]"
      value: "{{listing_url}}"
    - id: submit
      action: click
      selector: "button[type=\\"submit\\"]"
      expect: { text_contains: "received" }

verification:
  method: email_link      # none | email_link | phone_code | account_login
  expected_senders:
    - "@${id}.example"
  link_pattern: "https://${id}\\\\.example/confirm/[A-Za-z0-9_-]+"
  window_hours: 24

relist:
  interval_days: 90

rate_limit:
  max_concurrent: 1
  min_interval_ms: 4000
  daily_cap: 200

references:
  - https://${id}.example/optout
`;

writeFileSync(file, template);
const fixtures = join(fixturesDir(), id);
mkdirSync(fixtures, { recursive: true });

console.log(`created ${file}`);
console.log(`created ${fixtures}/`);
console.log('\nNext:');
console.log('  1. Fill in the definition from the broker’s published opt-out page.');
console.log(`  2. Record fixtures into ${fixtures}/ (synthetic identities only).`);
console.log('  3. npm run catalog:validate');
console.log('  4. npm run verify');
console.log('\nFull checklist: docs/playbook/adding-a-broker.md');
