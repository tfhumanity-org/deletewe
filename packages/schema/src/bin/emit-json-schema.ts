/**
 * Emits a JSON Schema for editor completion on broker YAML files.
 * Hand-rolled rather than pulling a zod-to-json-schema dependency into the
 * package that defines our supply-chain boundary.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AUTOMATION_LEVELS,
  BROKER_CATEGORIES,
  EVIDENCE_KINDS,
  EXTRACT_ATTRS,
  HANDOFF_REASONS,
  MATCH_FIELDS,
  OPT_OUT_METHODS,
  PROFILE_FIELDS,
  STEP_ACTIONS,
  VERIFICATION_METHODS,
} from '../enums.ts';

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/tfhumanity-org/deletewe/schema/broker.schema.json',
  title: 'deletewe broker definition',
  type: 'object',
  required: ['id', 'name', 'homepage', 'version', 'category', 'jurisdictions', 'hosts', 'automation', 'search', 'match', 'opt_out', 'relist'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$' },
    name: { type: 'string' },
    homepage: { type: 'string', format: 'uri' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    category: { enum: [...BROKER_CATEGORIES] },
    jurisdictions: { type: 'array', items: { type: 'string' }, minItems: 1 },
    hosts: { type: 'array', items: { type: 'string' }, minItems: 1 },
    automation: {
      type: 'object',
      required: ['level'],
      properties: { level: { enum: [...AUTOMATION_LEVELS] }, reason: { type: 'string' } },
    },
    search: { type: 'object' },
    match: { type: 'object' },
    opt_out: {
      type: 'object',
      required: ['method', 'required_fields'],
      properties: {
        method: { enum: [...OPT_OUT_METHODS] },
        required_fields: { type: 'array', items: { enum: [...PROFILE_FIELDS] } },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'action'],
            properties: {
              action: { enum: [...STEP_ACTIONS] },
              reason: { enum: [...HANDOFF_REASONS] },
            },
          },
        },
      },
    },
    verification: {
      type: 'object',
      properties: { method: { enum: [...VERIFICATION_METHODS] } },
    },
    relist: { type: 'object', required: ['interval_days'] },
    evidence: { type: 'object', properties: { capture: { type: 'array', items: { enum: [...EVIDENCE_KINDS] } } } },
    rate_limit: { type: 'object' },
    verified_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    references: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    enabled: { type: 'boolean' },
  },
  $defs: {
    extractAttr: { enum: [...EXTRACT_ATTRS] },
    matchField: { enum: [...MATCH_FIELDS] },
  },
};

const out = resolve(import.meta.dirname, '../../schema/broker.schema.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
process.stdout.write(`wrote ${out}\n`);
