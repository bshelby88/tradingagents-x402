const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/fleet-health.yml', 'utf8');

assert.doesNotMatch(workflow, /-d '\{\}'/,
  'fleet probe must not send an empty object after request validation moved before payment');

const CANON = '0x7861DB4EfC14A1ed5dd8C96c528A3796560F1393';
assert.match(workflow, new RegExp(`CANON=${CANON}`),
  'workflow must define the canonical treasury wallet');

const expectedEntries = [
  ['sentry-forge-x402', '5000000'],
  ['dispute-forge-x402', '750000'],
  ['nanobanana-x402', '10000'],
  ['vault-pro-x402', '50000'],
  ['power-pack-x402', '10000'],
  ['suprapack-x402', '30000'],
  ['tradingagents-x402', '50000'],
  ['nft-alpha-x402', '20000'],
  ['lingua-x402', '1000000'],
  ['briefsnap-x402', '1000000'],
  ['contract-eye-x402', '50000'],
  ['royal-ruby-x402', '250000'],
  ['royal-feel-x402', '2000000'],
];
for (const [app, amount] of expectedEntries) {
  assert.match(workflow, new RegExp(`${app}\\s+\\S+\\s+${amount}\\s+\\$CANON`),
    `${app} must use its live price ${amount} and the canonical wallet`);
  assert.match(workflow, new RegExp(`${app}[|)]`), `${app} must have an explicit valid probe payload`);
}

// live-schema probe fixes (verified against each service /openapi.json on 2026-09-12)
assert.match(workflow, /"text":"Synthetic health check sentence\.","to":"es"/,
  'lingua probe must use the live schema field "to", not "target"');

assert.match(workflow, /-d "\$request_body"/,
  'the selected valid payload must be sent to the service');

console.log('fleet health workflow uses endpoint-valid probe payloads');
