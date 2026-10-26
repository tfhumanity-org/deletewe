import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import { checkDefinition, type BrokerDefinition, type ValidationIssue } from '@deletewe/schema';
import { sha256Text, type Catalog } from '@deletewe/engine';

export interface LoadedBroker {
  readonly definition: BrokerDefinition;
  readonly sha256: string;
  readonly path: string;
}

export interface LoadResult {
  readonly brokers: readonly LoadedBroker[];
  readonly issues: readonly ValidationIssue[];
  readonly ok: boolean;
}

export function brokersDir(): string {
  return join(import.meta.dirname, '..', 'brokers');
}

export function fixturesDir(): string {
  return join(import.meta.dirname, '..', 'fixtures');
}

/**
 * Loads and validates every broker definition.
 *
 * Validation is not optional and not deferred: a definition that fails the
 * schema or any cross-field rule is excluded from the catalogue, so a bad
 * contribution cannot reach the dispatcher. See docs/adr/0003.
 */
export async function loadCatalog(dir = brokersDir()): Promise<LoadResult> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  const brokers: LoadedBroker[] = [];
  const issues: ValidationIssue[] = [];

  for (const file of files) {
    const path = join(dir, file);
    const text = readFileSync(path, 'utf8');
    const id = basename(file).replace(/\.ya?ml$/, '');

    let raw: unknown;
    try {
      raw = parse(text);
    } catch (error) {
      issues.push({
        brokerId: id,
        severity: 'error',
        code: 'yaml_parse',
        path: file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const result = checkDefinition(raw, id);
    issues.push(...result.issues);
    if (result.ok && result.definition) {
      brokers.push({ definition: result.definition, sha256: await sha256Text(text), path });
    }
  }

  return { brokers, issues, ok: !issues.some((i) => i.severity === 'error') };
}

/** An in-memory catalogue backed by the loaded files. */
export class FileCatalog implements Catalog {
  private readonly byId: Map<string, LoadedBroker>;

  constructor(brokers: readonly LoadedBroker[]) {
    this.byId = new Map(brokers.map((b) => [b.definition.id, b]));
  }

  static async load(dir?: string): Promise<{ catalog: FileCatalog; result: LoadResult }> {
    const result = await loadCatalog(dir);
    return { catalog: new FileCatalog(result.brokers), result };
  }

  get(brokerId: string): BrokerDefinition | undefined {
    return this.byId.get(brokerId)?.definition;
  }

  list(): readonly BrokerDefinition[] {
    return [...this.byId.values()].map((b) => b.definition);
  }

  sha256(brokerId: string): string | undefined {
    return this.byId.get(brokerId)?.sha256;
  }
}

export interface CoverageReport {
  readonly total: number;
  readonly enabled: number;
  readonly verified: number;
  readonly byAutomation: Record<string, number>;
  readonly byMethod: Record<string, number>;
  readonly byVerification: Record<string, number>;
  readonly byCategory: Record<string, number>;
}

/**
 * The honest coverage breakdown. A headline broker count means nothing without
 * the automation split — see docs/research/02-broker-coverage.md.
 */
export function coverage(brokers: readonly LoadedBroker[]): CoverageReport {
  const tally = (values: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const v of values) out[v] = (out[v] ?? 0) + 1;
    return out;
  };
  const defs = brokers.map((b) => b.definition);

  return {
    total: defs.length,
    enabled: defs.filter((d) => d.enabled).length,
    verified: defs.filter((d) => d.verified_at !== undefined).length,
    byAutomation: tally(defs.map((d) => d.automation.level)),
    byMethod: tally(defs.map((d) => d.opt_out.method)),
    byVerification: tally(defs.map((d) => d.verification.method)),
    byCategory: tally(defs.map((d) => d.category)),
  };
}
