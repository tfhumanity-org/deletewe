import { loadCatalog } from '../load.ts';

const args = process.argv.slice(2);
const strict = args.includes('--strict');

const { brokers, issues, ok } = await loadCatalog();
const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');

for (const issue of issues) {
  const mark = issue.severity === 'error' ? 'ERROR' : 'warn ';
  console.log(`${mark} ${issue.brokerId.padEnd(28)} ${issue.path.padEnd(28)} [${issue.code}] ${issue.message}`);
}

console.log('');
console.log(`${String(brokers.length)} definition(s) loaded, ${String(errors.length)} error(s), ${String(warnings.length)} warning(s)`);

if (!ok || (strict && warnings.length > 0)) process.exit(1);
