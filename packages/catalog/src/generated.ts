// GENERATED FILE — do not edit.
// Run `npm run catalog:bundle` after changing anything in brokers/.
//
// The YAML files remain the source of truth; this is a platform-free
// projection of them so the Cloudflare build does not need node:fs.
import type { BundledBroker } from './bundle.ts';

export const BUNDLED_BROKERS: readonly BundledBroker[] = [
  {
    "definition": {
      "id": "acxiom",
      "name": "Acxiom",
      "homepage": "https://www.acxiom.com",
      "version": "1.0.0",
      "category": "identity_graph",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.acxiom.com",
        "acxiom.com",
        "isapps.acxiom.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "Identity verification step on the preference portal"
      },
      "search": {
        "method": "none"
      },
      "match": {
        "fields": {
          "name": 1
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": true
      },
      "opt_out": {
        "method": "form",
        "url": "https://isapps.acxiom.com/optout/optout.aspx",
        "required_fields": [
          "full_name",
          "email",
          "address",
          "city",
          "region",
          "postal_code"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://isapps.acxiom.com/optout/optout.aspx",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "name",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"fullName\"]",
            "value": "{{full_name}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "address",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"address\"]",
            "value": "{{address}}"
          },
          {
            "id": "city",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"city\"]",
            "value": "{{city}}"
          },
          {
            "id": "region",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"state\"]",
            "value": "{{region}}"
          },
          {
            "id": "postal",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"zip\"]",
            "value": "{{postal_code}}"
          },
          {
            "id": "verify",
            "optional": false,
            "action": "handoff",
            "reason": "id_upload",
            "instructions": "Acxiom verifies identity before acting. Open the link, submit the details below, and complete their verification step directly with them. We never hold a copy of your ID.",
            "url": "https://isapps.acxiom.com/optout/optout.aspx"
          }
        ]
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 365
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.acxiom.com/privacy/"
      ],
      "notes": "A marketing identity-graph broker with no public index, so there is nothing to\nscan. ID verification goes directly to the broker: we do not store identity\ndocuments under any circumstances. See docs/threat-model.md.\n",
      "enabled": true
    },
    "sha256": "e943f93ff530f209b8e1745bc7d2f478e168e20027fd70d525045a42c474ddbc"
  },
  {
    "definition": {
      "id": "advancedbackgroundchecks",
      "name": "Advanced Background Checks",
      "homepage": "https://www.advancedbackgroundchecks.com",
      "version": "1.0.0",
      "category": "background_check",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.advancedbackgroundchecks.com",
        "advancedbackgroundchecks.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.advancedbackgroundchecks.com/names/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.advancedbackgroundchecks.com/removal",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.advancedbackgroundchecks.com/removal",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.advancedbackgroundchecks.com/removal"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@advancedbackgroundchecks.com"
        ],
        "link_pattern": "https://www\\.advancedbackgroundchecks\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.advancedbackgroundchecks.com/removal"
      ],
      "enabled": true
    },
    "sha256": "b471619a5c71bfbb6e43d66120f43728b4eba29938dcce4d53a295b6c6b21c11"
  },
  {
    "definition": {
      "id": "anywho",
      "name": "AnyWho",
      "homepage": "https://www.anywho.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.anywho.com",
        "anywho.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.anywho.com/people/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.anywho.com/optout",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.anywho.com/optout",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.anywho.com/optout"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@anywho.com"
        ],
        "link_pattern": "https://www\\.anywho\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.anywho.com/optout"
      ],
      "enabled": true
    },
    "sha256": "18ced28b7962e84ce0c5e9600932b10a5587eacf717c932a809522e0bb9a56b3"
  },
  {
    "definition": {
      "id": "beenverified",
      "name": "BeenVerified",
      "homepage": "https://www.beenverified.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.beenverified.com",
        "beenverified.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.beenverified.com/people/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.beenverified.com/app/optout/search",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.beenverified.com/app/optout/search",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.beenverified.com/app/optout/search"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@beenverified.com"
        ],
        "link_pattern": "https://www\\.beenverified\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.beenverified.com/app/optout/search"
      ],
      "notes": "Search by name, select the record, supply an email, then click the link they send.\n",
      "enabled": true
    },
    "sha256": "c4555fbe6babdfe1769ad755fb2afc3d0796c7da98b8593325284e1336d3ad79"
  },
  {
    "definition": {
      "id": "california-drop",
      "name": "California DROP (Delete Request and Opt-out Platform)",
      "homepage": "https://privacy.ca.gov",
      "version": "2.0.0",
      "category": "other",
      "jurisdictions": [
        "US-CA"
      ],
      "hosts": [
        "privacy.ca.gov",
        "cppa.ca.gov"
      ],
      "automation": {
        "level": "manual",
        "reason": "Cal. Code Regs. tit. 11 § 7620(a) requires the consumer to submit through DROP after the Agency verifies California residency via the California Identity Gateway or Login.gov. § 7621(a) lets an authorized agent \"aid in\" a request, not make one. No agent submission API exists; the DROP API (§§ 7610-7613) is the data-broker side, a role a removal agent must not occupy."
      },
      "search": {
        "method": "none"
      },
      "match": {
        "fields": {
          "name": 1
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": true
      },
      "opt_out": {
        "method": "drop",
        "url": "https://privacy.ca.gov/drop/",
        "required_fields": [
          "full_name",
          "email",
          "jurisdiction"
        ],
        "steps": [],
        "instructions": "California runs a single deletion request that reaches every registered\ndata broker at once — including ones this catalogue has no procedure for.\nIt is free, and for a California resident it is stronger than asking\nbrokers one at a time.\n\nWe cannot submit it for you: the portal verifies your residency through a\ngovernment identity check, and the regulations let an agent aid a request\nrather than make one. {{full_name}} submits it; we hold the clock\nafterwards and remind you to check.\n\nConfirmation for {{email}} comes from the portal, not from us, and in\n{{jurisdiction}} a data broker is forbidden from emailing you to verify a\nDROP request.\n"
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 45
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://privacy.ca.gov/drop/",
        "https://consumer.drop.privacy.ca.gov",
        "https://www.cppa.ca.gov/regulations/pdf/ccpa_updates_accessible_deletion_mechanism_text.pdf",
        "https://privacy.ca.gov/drop-for-data-brokers/technical-specifications/"
      ],
      "notes": "Timeline encoded from the regulations:\n  § 7612(a)  brokers must retrieve deletion lists every 45 calendar days\n  § 7620(d)  a consumer may not amend or cancel for the first 45 days\n  § 7621(b)  the agent's name, email and trade name must be in the consumer's\n             DROP account before submission\n  § 7621(c)  an agent may not cancel a request unless expressly directed\n  § 7622(a)  a residency classification may be challenged within 10 days\n  § 7616(c)  a data broker must not contact a consumer to verify a DROP request\nCalPrivacy tells consumers status can take up to 90 days.\n",
      "enabled": true
    },
    "sha256": "484c968bcbbca11c8a8c01144423eb6732c78cb9adce6ace4466e93eed8f9097"
  },
  {
    "definition": {
      "id": "clustrmaps",
      "name": "ClustrMaps",
      "homepage": "https://clustrmaps.com",
      "version": "1.0.0",
      "category": "public_records",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "clustrmaps.com",
        "www.clustrmaps.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://clustrmaps.com/persons/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://clustrmaps.com/bl/opt-out",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://clustrmaps.com/bl/opt-out",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://clustrmaps.com/bl/opt-out"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@clustrmaps.com"
        ],
        "link_pattern": "https://clustrmaps\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://clustrmaps.com/bl/opt-out"
      ],
      "enabled": true
    },
    "sha256": "bb38e0c29b3ba85330b9831f2e966626bf9743f8a03d305a9d902b830b90d931"
  },
  {
    "definition": {
      "id": "epsilon",
      "name": "Epsilon Data Management",
      "homepage": "https://www.epsilon.com",
      "version": "1.0.0",
      "category": "marketing",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.epsilon.com",
        "epsilon.com"
      ],
      "automation": {
        "level": "automated"
      },
      "search": {
        "method": "none"
      },
      "match": {
        "fields": {
          "name": 1
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": true
      },
      "opt_out": {
        "method": "email",
        "required_fields": [
          "full_name",
          "address",
          "city",
          "region",
          "postal_code",
          "email",
          "jurisdiction"
        ],
        "steps": [],
        "email": {
          "to": "privacy@epsilon.com",
          "subject_template": "Authorized agent deletion and opt-out request for {{full_name}}",
          "body_template": "To whom it may concern,\n\nI am writing as the authorized agent of {{full_name}}, acting on their explicit\nwritten instruction, to request the deletion of their personal information and\nto opt them out of its sale or sharing.\n\n  Name:     {{full_name}}\n  Address:  {{address}}, {{city}}, {{region}} {{postal_code}}\n  Email:    {{email}}\n\nThis request is made under the California Consumer Privacy Act as amended by\nthe California Privacy Rights Act, and under any other privacy law applicable\nto this individual in {{jurisdiction}}.\n\nPlease confirm in writing once the information has been deleted and suppressed\nfrom future collection. A signed authorization is available on request.\n\nSent on behalf of the above individual by deletewe, acting as authorized agent.\n"
        }
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 180
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.epsilon.com/us/privacy-policy"
      ],
      "notes": "A marketing data broker rather than a people-search site: there is no public\nindex to scan, so we cannot tell a member whether they are listed. We send the\nrequest and record the evidence; we never claim to have confirmed a removal we\ncould not observe.\n",
      "enabled": true
    },
    "sha256": "744f45306e5e1eb6f3264ae0443bd7b8ed13ad8e02d70faf564c2e0eecc55a75"
  },
  {
    "definition": {
      "id": "fastpeoplesearch",
      "name": "FastPeopleSearch",
      "homepage": "https://www.fastpeoplesearch.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.fastpeoplesearch.com",
        "fastpeoplesearch.com"
      ],
      "automation": {
        "level": "automated"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.fastpeoplesearch.com/name/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.fastpeoplesearch.com/removal",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.fastpeoplesearch.com/removal",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "submit",
            "optional": false,
            "action": "click",
            "selector": "button[type=\"submit\"]",
            "expect": {
              "text_contains": "request"
            }
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@fastpeoplesearch.com"
        ],
        "link_pattern": "https://www\\.fastpeoplesearch\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.fastpeoplesearch.com/removal"
      ],
      "enabled": true
    },
    "sha256": "d14ef742eef20bae632e790d43a5add68a669d6e4b49af3b4f7afd5761b93d1f"
  },
  {
    "definition": {
      "id": "i-360",
      "name": "i-360",
      "homepage": "https://i-360.com",
      "version": "1.0.0",
      "category": "marketing",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "i-360.com",
        "www.i-360.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "none"
      },
      "match": {
        "fields": {
          "name": 1
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": true
      },
      "opt_out": {
        "method": "form",
        "url": "https://i-360.com/privacy-request",
        "required_fields": [
          "full_name",
          "address",
          "city",
          "region",
          "postal_code",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://i-360.com/privacy-request",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "name",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"name\"]",
            "value": "{{full_name}}"
          },
          {
            "id": "address",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"address\"]",
            "value": "{{address}}"
          },
          {
            "id": "city",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"city\"]",
            "value": "{{city}}"
          },
          {
            "id": "state",
            "optional": false,
            "action": "select",
            "selector": "select[name=\"state\"]",
            "value": "{{region}}"
          },
          {
            "id": "zip",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"zip\"]",
            "value": "{{postal_code}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "requestor-type",
            "optional": false,
            "action": "select",
            "selector": "select[name=\"requestorType\"]",
            "value": "Authorized Agent"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "This form ends with an \"I am not a robot\" challenge. Open the link, check the values below are filled in, choose \"Authorized Agent\" or \"Power of Attorney\" as the requestor type, complete the challenge and submit. A phone alternative is listed on this case if you prefer to call.",
            "url": "https://i-360.com/privacy-request"
          }
        ],
        "phone": "+1-844-611-2737"
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://joindeleteme.com/opt-out-guides/i-360-opt-out-guide/"
      ],
      "notes": "DeleteMe publish a free guide to this one. The form offers a requestor-type\nfield with \"Authorized Agent\" and \"Power of Attorney\" among the options, which\nmakes an agent-submitted request a first-class path rather than an argument.\nA phone alternative is published as well; it is recorded below so a member who\nprefers to call has the number.\n",
      "enabled": true
    },
    "sha256": "ec43c891f1b98d0f3858b4aef1081f1f10a6608c2ed2b0e8fd73355ae2ba6154"
  },
  {
    "definition": {
      "id": "instantcheckmate",
      "name": "Instant Checkmate",
      "homepage": "https://www.instantcheckmate.com",
      "version": "1.0.0",
      "category": "background_check",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.instantcheckmate.com",
        "instantcheckmate.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.instantcheckmate.com/people/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.instantcheckmate.com/opt-out/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.instantcheckmate.com/opt-out/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.instantcheckmate.com/opt-out/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@instantcheckmate.com"
        ],
        "link_pattern": "https://www\\.instantcheckmate\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.instantcheckmate.com/opt-out/"
      ],
      "enabled": true
    },
    "sha256": "fb9bb0125fc31b1534f62decd0cc96fac9447661f00514599929cf9b52df406b"
  },
  {
    "definition": {
      "id": "intelius",
      "name": "Intelius",
      "homepage": "https://www.intelius.com",
      "version": "1.0.0",
      "category": "background_check",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.intelius.com",
        "intelius.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.intelius.com/people-search/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.intelius.com/opt-out/submit/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.intelius.com/opt-out/submit/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.intelius.com/opt-out/submit/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@intelius.com"
        ],
        "link_pattern": "https://www\\.intelius\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.intelius.com/opt-out/submit/"
      ],
      "enabled": true
    },
    "sha256": "470b2559c0f072920dee65f0dbfd2d3b507f4ab21ab0aab941ccedbc9622635b"
  },
  {
    "definition": {
      "id": "lexisnexis",
      "name": "LexisNexis Risk Solutions",
      "homepage": "https://risk.lexisnexis.com",
      "version": "1.0.0",
      "category": "risk_fraud",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "risk.lexisnexis.com",
        "lexisnexis.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "Opt-out is accepted by post or fax; no postal provider is configured by default"
      },
      "search": {
        "method": "none"
      },
      "match": {
        "fields": {
          "name": 1
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": true
      },
      "opt_out": {
        "method": "letter",
        "required_fields": [
          "full_name",
          "address",
          "city",
          "region",
          "postal_code",
          "dob",
          "email"
        ],
        "steps": [],
        "letter": {
          "recipient": "LexisNexis Risk Solutions, Consumer Center",
          "address_lines": [
            "LexisNexis Risk Solutions",
            "Consumer Center",
            "P.O. Box 105108",
            "Atlanta, GA 30348-5108"
          ],
          "body_template": "To whom it may concern,\n\nI act as the authorized agent of the individual named below and request, on\ntheir behalf, that you delete their personal information from your databases\nand suppress it from future collection and disclosure.\n\n  Name:            {{full_name}}\n  Current address: {{address}}, {{city}}, {{region}} {{postal_code}}\n  Date of birth:   {{dob}}\n  Email:           {{email}}\n\nThis request is made under the California Consumer Privacy Act as amended, and\nunder any other privacy law applicable to this individual.\n\nPlease confirm completion in writing to the email address above. A signed\nauthorization naming me as this individual's agent is available on request.\n\nSent on behalf of the above individual by deletewe, acting as authorized agent.\n"
        }
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 365
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://risk.lexisnexis.com/consumer-disclosure"
      ],
      "notes": "A postal opt-out. The engine renders a signed letter as a PDF; dispatching it\nneeds a postal or fax vendor, and that vendor would see the member name and\naddress in plaintext, so choosing one is a human decision. Until then the\nmember gets the letter to print and post, which still works.\n",
      "enabled": true
    },
    "sha256": "a576667b955b30bd635ab6fb28fb39b973f73aed8db09ef892c98b42298395f6"
  },
  {
    "definition": {
      "id": "mylife",
      "name": "MyLife",
      "homepage": "https://www.mylife.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.mylife.com",
        "mylife.com"
      ],
      "automation": {
        "level": "automated"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.mylife.com/{name_slug}",
        "result_selector": ".search-result",
        "fields": {
          "name": {
            "selector": ".result-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".result-city",
            "attr": "text"
          },
          "region": {
            "selector": ".result-state",
            "attr": "text"
          },
          "age": {
            "selector": ".result-age",
            "attr": "text"
          },
          "url": {
            "selector": "a",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.45,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.2
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "email",
        "required_fields": [
          "full_name",
          "address",
          "city",
          "region",
          "postal_code",
          "email",
          "jurisdiction"
        ],
        "steps": [],
        "email": {
          "to": "privacy@mylife.com",
          "subject_template": "Authorized agent deletion request for {{full_name}}",
          "body_template": "To whom it may concern,\n\nI am writing as the authorized agent of {{full_name}}, acting on their explicit\nwritten instruction, to request the deletion of their personal information and\nto opt them out of its sale or sharing.\n\n  Name:     {{full_name}}\n  Address:  {{address}}, {{city}}, {{region}} {{postal_code}}\n  Email:    {{email}}\n\nThis request is made under the California Consumer Privacy Act as amended by\nthe California Privacy Rights Act, and under any other privacy law applicable\nto this individual in {{jurisdiction}}.\n\nPlease confirm in writing once the information has been deleted and suppressed\nfrom future collection. A signed authorization is available on request.\n\nSent on behalf of the above individual by deletewe, acting as authorized agent.\n"
        }
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.mylife.com/ccpa/index.pubview"
      ],
      "notes": "Email-based requests are the one method we can fully automate end to end: no\nrendering, no CAPTCHA, and a durable record of exactly what was sent.\n",
      "enabled": true
    },
    "sha256": "07cda387c227de50e2eea81dee977e0133b6e03d28ace22868e4d101ff5c6cf3"
  },
  {
    "definition": {
      "id": "neighborwho",
      "name": "NeighborWho",
      "homepage": "https://www.neighborwho.com",
      "version": "1.0.0",
      "category": "public_records",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.neighborwho.com",
        "neighborwho.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.neighborwho.com/people/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.neighborwho.com/opt-out/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.neighborwho.com/opt-out/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.neighborwho.com/opt-out/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@neighborwho.com"
        ],
        "link_pattern": "https://www\\.neighborwho\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.neighborwho.com/opt-out/"
      ],
      "enabled": true
    },
    "sha256": "410eb02d141d525e427baec7de9ae99c4f240b8b9718af9f0f92e37dd667730f"
  },
  {
    "definition": {
      "id": "nuwber",
      "name": "Nuwber",
      "homepage": "https://nuwber.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "nuwber.com",
        "www.nuwber.com"
      ],
      "automation": {
        "level": "automated"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://nuwber.com/search?name={name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://nuwber.com/removal/link",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://nuwber.com/removal/link",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "submit",
            "optional": false,
            "action": "click",
            "selector": "button[type=\"submit\"]",
            "expect": {
              "text_contains": "request"
            }
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@nuwber.com"
        ],
        "link_pattern": "https://nuwber\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://nuwber.com/removal/link"
      ],
      "enabled": true
    },
    "sha256": "7976760641b6289e88a0fdcd0567cc674a5752c7d82181f7a4dafa0f6315b7d0"
  },
  {
    "definition": {
      "id": "oracle-data-cloud",
      "name": "Oracle Data Cloud",
      "homepage": "https://www.oracle.com",
      "version": "1.0.0",
      "category": "identity_graph",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.oracle.com",
        "oracle.com"
      ],
      "automation": {
        "level": "unsupported",
        "reason": "No working opt-out procedure is known to this catalogue"
      },
      "search": {
        "method": "none"
      },
      "match": {
        "fields": {
          "name": 1
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": true
      },
      "opt_out": {
        "method": "email",
        "required_fields": [
          "full_name",
          "address",
          "city",
          "region",
          "postal_code",
          "email",
          "jurisdiction"
        ],
        "steps": [],
        "email": {
          "to": "privacy_ww@oracle.com",
          "subject_template": "Authorized agent deletion request for {{full_name}}",
          "body_template": "To whom it may concern,\n\nI am writing as the authorized agent of {{full_name}}, acting on their explicit\nwritten instruction, to request the deletion of their personal information and\nto opt them out of its sale or sharing.\n\n  Name:     {{full_name}}\n  Address:  {{address}}, {{city}}, {{region}} {{postal_code}}\n  Email:    {{email}}\n\nThis request is made under the California Consumer Privacy Act as amended by\nthe California Privacy Rights Act, and under any other privacy law applicable\nto this individual in {{jurisdiction}}.\n\nPlease confirm in writing once the information has been deleted and suppressed\nfrom future collection. A signed authorization is available on request.\n\nSent on behalf of the above individual by deletewe, acting as authorized agent.\n"
        }
      },
      "verification": {
        "method": "none",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 365
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.oracle.com/legal/privacy/"
      ],
      "notes": "Shipped disabled and marked unsupported on purpose. This is what an honest\ncatalogue entry looks like when we know a broker exists but have no procedure\nwe trust. Counting entries like this one towards a coverage number is exactly\nthe practice docs/research/02-broker-coverage.md criticises.\n",
      "enabled": false
    },
    "sha256": "5d4224ba832a33ab877ad6a2dd91ec9dfbf6699e7a69ae3c764370d86e7bf886"
  },
  {
    "definition": {
      "id": "ownerly",
      "name": "Ownerly",
      "homepage": "https://www.ownerly.com",
      "version": "1.0.0",
      "category": "public_records",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.ownerly.com",
        "ownerly.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.ownerly.com/people/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.ownerly.com/opt-out/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.ownerly.com/opt-out/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.ownerly.com/opt-out/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@ownerly.com"
        ],
        "link_pattern": "https://www\\.ownerly\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.ownerly.com/opt-out/"
      ],
      "enabled": true
    },
    "sha256": "70d3124a0dec4040302a4bdc0d0fa7bd27bca53ce0c0a0bb056ac084d9e057e5"
  },
  {
    "definition": {
      "id": "peekyou",
      "name": "PeekYou",
      "homepage": "https://www.peekyou.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.peekyou.com",
        "peekyou.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.peekyou.com/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.peekyou.com/about/contact/optout/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.peekyou.com/about/contact/optout/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.peekyou.com/about/contact/optout/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@peekyou.com"
        ],
        "link_pattern": "https://www\\.peekyou\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.peekyou.com/about/contact/optout/"
      ],
      "enabled": true
    },
    "sha256": "c1de6f3f45ea01c2edce3c2132cfa4b14378db044358b45ca3caab3fa0ef8e14"
  },
  {
    "definition": {
      "id": "peoplefinders",
      "name": "PeopleFinders",
      "homepage": "https://www.peoplefinders.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.peoplefinders.com",
        "peoplefinders.com"
      ],
      "automation": {
        "level": "automated"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.peoplefinders.com/name/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.peoplefinders.com/opt-out",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.peoplefinders.com/opt-out",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "submit",
            "optional": false,
            "action": "click",
            "selector": "button[type=\"submit\"]",
            "expect": {
              "text_contains": "request"
            }
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@peoplefinders.com"
        ],
        "link_pattern": "https://www\\.peoplefinders\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.peoplefinders.com/opt-out"
      ],
      "enabled": true
    },
    "sha256": "37fd88102e1c15586120f916a3854a4f0c2673c405e5b033be87aa75571b7add"
  },
  {
    "definition": {
      "id": "publicrecordsnow",
      "name": "PublicRecordsNow",
      "homepage": "https://www.publicrecordsnow.com",
      "version": "1.0.0",
      "category": "public_records",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.publicrecordsnow.com",
        "publicrecordsnow.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.publicrecordsnow.com/name/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.publicrecordsnow.com/optout",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.publicrecordsnow.com/optout",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.publicrecordsnow.com/optout"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@publicrecordsnow.com"
        ],
        "link_pattern": "https://www\\.publicrecordsnow\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.publicrecordsnow.com/optout"
      ],
      "enabled": true
    },
    "sha256": "c25c30d182bf38b2cdbafbf73d3b5dd678990b1ae12358641da0eec73515293e"
  },
  {
    "definition": {
      "id": "radaris",
      "name": "Radaris",
      "homepage": "https://radaris.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "radaris.com",
        "www.radaris.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "Managing a listing requires creating an account with the broker"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://radaris.com/p/{name_slug}/",
        "result_selector": ".search-results .person",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-city",
            "attr": "text"
          },
          "region": {
            "selector": ".person-state",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "account",
        "url": "https://radaris.com/control/privacy",
        "required_fields": [
          "listing_url",
          "email",
          "full_name"
        ],
        "steps": [],
        "instructions": "Radaris requires an account before it will let anyone manage a listing.\nOur mandate covers creating one on your behalf, but doing so from an\nautomated session would look like exactly the behaviour their controls\nexist to stop, so this one is yours.\n\nOpen this listing: {{listing_url}}\nRegister or sign in as {{email}}, claim the record for {{full_name}},\nthen use \"Control Information\" to remove it.\n"
      },
      "verification": {
        "method": "account_login",
        "expected_senders": [],
        "window_hours": 72
      },
      "relist": {
        "interval_days": 60
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://radaris.com/control/privacy",
        "https://omlumi.com/guides/how-to-remove-yourself-from-people-search-sites"
      ],
      "notes": "Radaris re-lists more aggressively than most, so the re-check interval here is\nshorter than the catalogue default.\n",
      "enabled": true
    },
    "sha256": "5741d9802fcdac1b26357ce656ae1926730f0a17ef9c81d6f8ca88e6b435ce62"
  },
  {
    "definition": {
      "id": "searchpeoplefree",
      "name": "SearchPeopleFree",
      "homepage": "https://www.searchpeoplefree.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.searchpeoplefree.com",
        "searchpeoplefree.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.searchpeoplefree.com/find/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.searchpeoplefree.com/opt-out",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.searchpeoplefree.com/opt-out",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.searchpeoplefree.com/opt-out"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@searchpeoplefree.com"
        ],
        "link_pattern": "https://www\\.searchpeoplefree\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.searchpeoplefree.com/opt-out"
      ],
      "enabled": true
    },
    "sha256": "f09f93802dab8ef1cb012a1ce30005cd01dbd4a7654788d52c38af114c8b6dee"
  },
  {
    "definition": {
      "id": "smartbackgroundchecks",
      "name": "SmartBackgroundChecks",
      "homepage": "https://www.smartbackgroundchecks.com",
      "version": "1.0.0",
      "category": "background_check",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.smartbackgroundchecks.com",
        "smartbackgroundchecks.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.smartbackgroundchecks.com/people/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.smartbackgroundchecks.com/optout",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.smartbackgroundchecks.com/optout",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.smartbackgroundchecks.com/optout"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@smartbackgroundchecks.com"
        ],
        "link_pattern": "https://www\\.smartbackgroundchecks\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.smartbackgroundchecks.com/optout"
      ],
      "enabled": true
    },
    "sha256": "94fe7600fa63b6dbf64f7b6b9201770433fc5fd61ca71267b5067862981c71bf"
  },
  {
    "definition": {
      "id": "spokeo",
      "name": "Spokeo",
      "homepage": "https://www.spokeo.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.spokeo.com",
        "spokeo.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.spokeo.com/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.spokeo.com/optout",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.spokeo.com/optout",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.spokeo.com/optout"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@spokeo.com"
        ],
        "link_pattern": "https://www\\.spokeo\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.spokeo.com/optout",
        "https://www.optout.ws/post/how-to-opt-out-of-spokeo-whitepages-beenverified/"
      ],
      "notes": "Opt-out is per listing URL rather than per person, so a member with several\nlistings needs one submission for each. A confirmation email follows; public\nguides report the link expires quickly.\n",
      "enabled": true
    },
    "sha256": "c06d431bdaef8db78e09af417b6123eef1a60093cfc959a6352507bdd617d5f6"
  },
  {
    "definition": {
      "id": "truepeoplesearch",
      "name": "TruePeopleSearch",
      "homepage": "https://www.truepeoplesearch.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.truepeoplesearch.com",
        "truepeoplesearch.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.truepeoplesearch.com/results?name={name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.truepeoplesearch.com/removal",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.truepeoplesearch.com/removal",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.truepeoplesearch.com/removal"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@truepeoplesearch.com"
        ],
        "link_pattern": "https://www\\.truepeoplesearch\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.truepeoplesearch.com/removal"
      ],
      "enabled": true
    },
    "sha256": "6dd5ffe913d6e6a29c8d8f3371990a2c21e38e3c0114f33698a1e897ee047828"
  },
  {
    "definition": {
      "id": "truthfinder",
      "name": "TruthFinder",
      "homepage": "https://www.truthfinder.com",
      "version": "1.0.0",
      "category": "background_check",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.truthfinder.com",
        "truthfinder.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.truthfinder.com/people-search/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.truthfinder.com/opt-out/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.truthfinder.com/opt-out/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.truthfinder.com/opt-out/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@truthfinder.com"
        ],
        "link_pattern": "https://www\\.truthfinder\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.truthfinder.com/opt-out/"
      ],
      "enabled": true
    },
    "sha256": "5e03e19950b536d574e286dad73691cf9a731c99b4bbf60b00510a2771bcd371"
  },
  {
    "definition": {
      "id": "usphonebook",
      "name": "USPhoneBook",
      "homepage": "https://www.usphonebook.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.usphonebook.com",
        "usphonebook.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.usphonebook.com/{name_slug}",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.usphonebook.com/opt-out",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.usphonebook.com/opt-out",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.usphonebook.com/opt-out"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@usphonebook.com"
        ],
        "link_pattern": "https://www\\.usphonebook\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.usphonebook.com/opt-out"
      ],
      "enabled": true
    },
    "sha256": "5f6db23b446a46e46168eb9b05ef0b1869d29fe2ab96dd558e09ae8fb5c92ede"
  },
  {
    "definition": {
      "id": "ussearch",
      "name": "US Search",
      "homepage": "https://www.ussearch.com",
      "version": "1.0.0",
      "category": "background_check",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.ussearch.com",
        "ussearch.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "CAPTCHA on the opt-out form"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.ussearch.com/people/{name_slug}/",
        "result_selector": ".person-card",
        "fields": {
          "name": {
            "selector": ".person-name",
            "attr": "text"
          },
          "locality": {
            "selector": ".person-location",
            "attr": "text"
          },
          "region": {
            "selector": ".person-region",
            "attr": "text"
          },
          "age": {
            "selector": ".person-age",
            "attr": "text"
          },
          "url": {
            "selector": "a.person-link",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.ussearch.com/opt-out/submit/",
        "required_fields": [
          "listing_url",
          "email"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.ussearch.com/opt-out/submit/",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "email",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"email\"]",
            "value": "{{email}}"
          },
          {
            "id": "captcha",
            "optional": false,
            "action": "handoff",
            "reason": "captcha",
            "instructions": "Open the link below. The listing URL and email address are already filled in for you — paste them if the page is blank, complete the \"I am not a robot\" challenge, and press submit. We do not solve these for you, by design.",
            "url": "https://www.ussearch.com/opt-out/submit/"
          }
        ]
      },
      "verification": {
        "method": "email_link",
        "expected_senders": [
          "@ussearch.com"
        ],
        "link_pattern": "https://www\\.ussearch\\.com/[A-Za-z0-9_/-]*(?:confirm|optout|removal|opt-out)[A-Za-z0-9_/-]*",
        "window_hours": 24
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.ussearch.com/opt-out/submit/"
      ],
      "enabled": true
    },
    "sha256": "767e6b42e2e1f16e1a8d98554bf9e99efff99e5e3af326887728b6d243a6c661"
  },
  {
    "definition": {
      "id": "whitepages",
      "name": "Whitepages",
      "homepage": "https://www.whitepages.com",
      "version": "1.0.0",
      "category": "people_search",
      "jurisdictions": [
        "US"
      ],
      "hosts": [
        "www.whitepages.com",
        "whitepages.com"
      ],
      "automation": {
        "level": "assisted",
        "reason": "Verification is a phone call or SMS code, which only the member can complete"
      },
      "search": {
        "method": "url_template",
        "url_template": "https://www.whitepages.com/name/{name_slug}",
        "result_selector": ".results-list .result",
        "fields": {
          "name": {
            "selector": ".name",
            "attr": "text"
          },
          "locality": {
            "selector": ".location",
            "attr": "text"
          },
          "region": {
            "selector": ".region",
            "attr": "text"
          },
          "age": {
            "selector": ".age",
            "attr": "text"
          },
          "url": {
            "selector": "a",
            "attr": "href"
          }
        }
      },
      "match": {
        "fields": {
          "name": 0.4,
          "locality": 0.2,
          "region": 0.15,
          "age": 0.25
        },
        "thresholds": {
          "review": 0.5,
          "auto_confirm": 0.92
        },
        "require_manual_confirmation": false
      },
      "opt_out": {
        "method": "form",
        "url": "https://www.whitepages.com/suppression-requests",
        "required_fields": [
          "listing_url",
          "phone"
        ],
        "steps": [
          {
            "id": "open",
            "optional": false,
            "action": "goto",
            "url": "https://www.whitepages.com/suppression-requests",
            "expect": {
              "selector_present": "form"
            }
          },
          {
            "id": "listing-url",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"url\"]",
            "value": "{{listing_url}}"
          },
          {
            "id": "phone",
            "optional": false,
            "action": "fill",
            "selector": "input[name=\"phone\"]",
            "value": "{{phone}}"
          },
          {
            "id": "verify",
            "optional": false,
            "action": "handoff",
            "reason": "phone_call",
            "instructions": "Whitepages confirms removals by calling or texting the phone number on the listing. Open the link, submit the form with the details below, then answer the call or enter the code they send. Public guides report processing takes 24-48 hours.",
            "url": "https://www.whitepages.com/suppression-requests"
          }
        ]
      },
      "verification": {
        "method": "phone_code",
        "expected_senders": [],
        "window_hours": 48
      },
      "relist": {
        "interval_days": 90
      },
      "evidence": {
        "capture": [
          "screenshot",
          "dom",
          "transcript"
        ]
      },
      "rate_limit": {
        "max_concurrent": 1,
        "min_interval_ms": 4000,
        "daily_cap": 200
      },
      "references": [
        "https://www.whitepages.com/suppression-requests",
        "https://omlumi.com/guides/how-to-remove-yourself-from-people-search-sites"
      ],
      "notes": "Whitepages verifies by phone rather than email, so the final step can only be\ncompleted by whoever holds the handset. That is a hard automation boundary, not\na gap we intend to close.\n",
      "enabled": true
    },
    "sha256": "662d19f03d5c80813163907d2b19e508abbfaf77f97f94cbec726f6c7b8e74c0"
  }
];
