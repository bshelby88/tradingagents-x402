const fs = require('fs');
const assert = require('assert');

const files = [
  'README.md',
  'FLEET_CONTEXT.md',
  'docs/staci-tradingagents-buyer-tutorial-2026-07-13.md',
];

const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

for (const stale of [
  'staci-tradingagents.fly.dev',
  'eip155:84532',
  '$0.25 USDC',
  'fly deploy --remote-only',
]) {
  assert(!text.includes(stale), `buyer documentation contains stale value: ${stale}`);
}

for (const current of [
  'https://tradingagents-x402.fly.dev',
  'eip155:8453',
  '$0.05 USDC',
  'GitHub Actions',
]) {
  assert(text.includes(current), `buyer documentation is missing current value: ${current}`);
}

console.log('buyer documentation uses the current production route, price, network, and deployment path');
