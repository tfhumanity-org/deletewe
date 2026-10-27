import type { BrokerDefinition } from '@deletewe/schema';
import type { Catalog } from '@deletewe/engine';
import type { LoadedBroker } from './load.ts';

export interface BundledBroker {
  readonly definition: BrokerDefinition;
  readonly sha256: string;
}

/**
 * A catalogue backed by the generated module rather than the filesystem, so it
 * works on Workers and costs nothing per invocation.
 */
export class BundledCatalog implements Catalog {
  private readonly byId: Map<string, BundledBroker>;

  constructor(brokers: readonly BundledBroker[]) {
    this.byId = new Map(brokers.map((b) => [b.definition.id, b]));
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

  get size(): number {
    return this.byId.size;
  }
}

/** The exact text `catalog:bundle` writes. Shared so a test can detect drift. */
export function buildBundleSource(brokers: readonly LoadedBroker[]): string {
  const payload = brokers
    .map((b) => ({ definition: b.definition, sha256: b.sha256 }))
    .sort((a, b) => a.definition.id.localeCompare(b.definition.id));

  return [
    '// GENERATED FILE — do not edit.',
    '// Run `npm run catalog:bundle` after changing anything in brokers/.',
    '//',
    '// The YAML files remain the source of truth; this is a platform-free',
    '// projection of them so the Cloudflare build does not need node:fs.',
    "import type { BundledBroker } from './bundle.ts';",
    '',
    `export const BUNDLED_BROKERS: readonly BundledBroker[] = ${JSON.stringify(payload, null, 2)};`,
    '',
  ].join('\n');
}
