const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/fleet-health.yml', 'utf8');

assert.doesNotMatch(workflow, /-d '\{\}'/,
  'fleet probe must not send an empty object after request validation moved before payment');

const expectedEntries = [
  ['sentry-forge-x402', '5000000', '0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f'],
  ['nanobanana-x402', '10000', '0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f'],
  ['vault-pro-x402', '50000', '0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f'],
  ['power-pack-x402', '10000', '0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f'],
  ['suprapack-x402', '30000', '0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f'],
  ['tradingagents-x402', '50000', '0x9e6A0CE78Bb2915d0758cc6A1cE8eA77f1B71770'],
  ['nft-alpha-x402', '20000', '0x9e6A0CE78Bb2915d0758cc6A1cE8eA77f1B71770'],
];
for (const [app, amount, payTo] of expectedEntries) {
  assert.match(workflow, new RegExp(`${app}\\s+\\S+\\s+${amount}\\s+${payTo}`, 'i'),
    `${app} must use its live price and payTo wallet`);
  assert.match(workflow, new RegExp(`${app}\\)`), `${app} must have an explicit valid probe payload`);
}

assert.match(workflow, /-d "\$request_body"/,
  'the selected valid payload must be sent to the service');

console.log('fleet health workflow uses endpoint-valid probe payloads');
