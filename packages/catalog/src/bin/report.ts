import { coverage, loadCatalog } from '../load.ts';

const { brokers, issues } = await loadCatalog();
const report = coverage(brokers);

const table = (title: string, data: Record<string, number>) => {
  console.log(`\n${title}`);
  for (const [key, count] of Object.entries(data).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(18)} ${String(count).padStart(4)}`);
  }
};

console.log('deletewe broker catalogue\n');
console.log(`  definitions        ${String(report.total).padStart(4)}`);
console.log(`  enabled            ${String(report.enabled).padStart(4)}`);
console.log(`  verified live      ${String(report.verified).padStart(4)}   <- the only number that means coverage`);

table('By automation level', report.byAutomation);
table('By opt-out method', report.byMethod);
table('By verification', report.byVerification);
table('By category', report.byCategory);

const errors = issues.filter((i) => i.severity === 'error').length;
if (errors > 0) console.log(`\n${String(errors)} definition(s) failed validation and are excluded.`);

console.log(
  '\nA headline broker count without the automation split is a marketing number.\n' +
    'See docs/research/02-broker-coverage.md.',
);
