import assert from 'node:assert/strict';
import { parseMemWriteInput } from '../scorers/mem-write-args.js';

// Each command is judged the way skill/scripts/mem-write would judge it.
const accepted: [string, string, string][] = [
  ['scripts/mem-write facts dataset-location "Primary logs in k8s-logs-dev"', 'facts', 'dataset-location'],
  ['./scripts/mem-write --project facts payments "Payments logs live in payments-prod"', 'facts', 'payments'],
  ['scripts/mem-write --project --tags prod facts key "long content about prod"', 'facts', 'key'],
  ['scripts/mem-write --tags prod --project facts key "long content about prod"', 'facts', 'key'],
  ['scripts/mem-write --org team facts key "long content for the team"', 'facts', 'key'],
  ['scripts/mem-write --org team --type pattern --tags "db, timeout" --pin patterns conn-pool "Pool exhaustion"', 'patterns', 'conn-pool'],
  ['scripts/mem-write --type query --tags \'cs-reporting\' queries "top-ingesters" "[\'dataset\'] | summarize count()"', 'queries', 'top-ingesters'],
  ['bash scripts/mem-write --pin incidents "2026-10-01-outage" "Root cause: connection pool leak"', 'incidents', '2026-10-01-outage'],
  ['scripts/mem-write --type bogus --type fact facts key "long enough content to count"', 'facts', 'key'],
];

const rejected: [string, string][] = [
  ['scripts/mem-write --org team --project facts key "long content"', '--org with --project'],
  ['scripts/mem-write --project --org team facts key "long content"', '--project with --org'],
  ['scripts/mem-write --type finding facts key "long content"', 'invalid --type'],
  ['scripts/mem-write --type fact --type bogus facts key "long content"', 'last --type invalid'],
  ['scripts/mem-write --verbose facts key "long content"', 'unknown option'],
  ['scripts/mem-write --tags=prod facts key "long content"', 'unknown option form'],
  ['scripts/mem-write --org', '--org without a value'],
  ['scripts/mem-write --project --tags', '--tags without a value'],
];

for (const [command, category, key] of accepted) {
  const args = parseMemWriteInput(command);
  assert.ok(args, `should parse: ${command}`);
  assert.equal(args.category, category, command);
  assert.equal(args.key, key, command);
}

const withContent = parseMemWriteInput('scripts/mem-write --project --tags prod facts key "long content about prod"');
assert.equal(withContent?.content, '"long content about prod"');

for (const [command, why] of rejected) {
  assert.equal(parseMemWriteInput(command), null, `${why}: ${command}`);
}

// Structured inputs carry no options and parse as before.
assert.deepEqual(parseMemWriteInput({ category: 'facts', key: 'k', value: 'v' }), { category: 'facts', key: 'k', content: 'v' });

console.log(`mem-write parse regression passed (${accepted.length} accepted, ${rejected.length} rejected)`);
