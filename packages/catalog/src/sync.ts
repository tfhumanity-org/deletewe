import type { Store } from '@deletewe/engine';
import type { BundledBroker } from './bundle.ts';

/**
 * Projects the catalogue files into the `broker` table for joins and stats.
 * The files remain the source of truth; this runs on boot.
 */
export async function syncCatalog(store: Store, brokers: readonly BundledBroker[]): Promise<number> {
  for (const { definition, sha256 } of brokers) {
    await store.upsertBroker({
      id: definition.id,
      name: definition.name,
      homepage: definition.homepage,
      category: definition.category,
      definitionVersion: definition.version,
      definitionSha256: sha256,
      automationLevel: definition.automation.level,
      optOutMethod: definition.opt_out.method,
      relistIntervalDays: definition.relist.interval_days,
      jurisdictions: definition.jurisdictions,
      enabled: definition.enabled && definition.automation.level !== 'unsupported',
      verifiedAt: definition.verified_at ?? null,
    });
  }
  return brokers.length;
}
