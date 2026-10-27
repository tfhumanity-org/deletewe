/**
 * Generates a platform-free catalogue module.
 *
 * The file loader uses `node:fs`, which does not exist on Workers, and
 * re-reading 29 YAML files per invocation would be wasteful even where it
 * does. This emits the already-validated definitions as a plain TypeScript
 * module that any runtime can import.
 *
 * Run via `npm run catalog:bundle`. A test fails if the committed output is
 * stale, so it cannot silently drift from the YAML.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBundleSource } from '../bundle.ts';
import { loadCatalog } from '../load.ts';

const { brokers, issues } = await loadCatalog();
const errors = issues.filter((i) => i.severity === 'error');
if (errors.length > 0) {
  console.error(`refusing to bundle: ${String(errors.length)} definition(s) failed validation`);
  for (const issue of errors) console.error(`  ${issue.brokerId}: ${issue.message}`);
  process.exit(1);
}

// From dist/bin back to the package's src/ directory.
const out = join(import.meta.dirname, '..', '..', 'src', 'generated.ts');
writeFileSync(out, buildBundleSource(brokers));
console.log(`bundled ${String(brokers.length)} definition(s) into ${out}`);
