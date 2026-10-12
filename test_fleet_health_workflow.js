const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/fleet-health.yml', 'utf8');

assert.doesNotMatch(workflow, /-d '\{\}'/,
  'fleet probe must not send an empty object after request validation moved before payment');

const CANON = '0x9b8a27e03ceba490953cda8ab1291c0e13baf72f';
assert.match(workflow, new RegExp(`CANON=${CANON}`),
  'workflow must define the canonical treasury wallet');

const expectedEntries = [
  ['dispute-forge-x402', '750000'],
  ['nanobanana-x402', '10000'],
  ['vault-pro-x402', '50000'],
  ['power-pack-x402', '10000'],
  ['suprapack-x402', '30000'],
  ['tradingagents-x402', '50000'],
  ['nft-alpha-x402', '20000'],
  ['briefsnap-x402', '1000000'],
  ['contract-eye-x402', '50000'],
  ['royal-ruby-x402', '250000'],
  ['royal-feel-x402', '2000000'],
  ['dispatch-x402', '500000'],
];
for (const [app, amount] of expectedEntries) {
  assert.match(workflow, new RegExp(`${app}\\s+\\S+\\s+${amount}\\s+\\$CANON`),
    `${app} must use its live price ${amount} and the canonical wallet`);
  assert.match(workflow, new RegExp(`${app}[|)]`), `${app} must have an explicit valid probe payload`);
}

// suspended services must not be probed (2026-10-12 census)
for (const app of ['sentry-forge-x402', 'lingua-x402']) {
  assert.doesNotMatch(workflow, new RegExp(app), `${app} is suspended and must not be checked`);
}

// payTo policy: canonical 0x9B8a accepted; legacy 0x7861 tolerated with a warning; anything else fails
assert.match(workflow, /LEGACY=0x7861db4efc14a1ed5dd8c96c528a3796560f1393/, 'legacy treasury must be defined');
assert.match(workflow, /::warning::\$app still advertises legacy payTo/, 'legacy payTo must warn, not fail');
assert.match(workflow, /neither canonical/, 'unknown payTo must fail');

assert.match(workflow, /-d "\$request_body"/,
  'the selected valid payload must be sent to the service');

console.log('fleet health workflow uses endpoint-valid probe payloads');
