"use strict";

// Facilitator-emission regression (W1-3 / TRADINGAGENTS-BUY-1 2026-09-15; AgentPay
// field report 2026-09-12, re-confirmed by fleet live 402 decode 2026-09-15T20:10Z on
// tradingagents-x402.fly.dev: accepts[0].extra carried only {name,version} — no
// facilitator, no serviceName; /api/analyze-ticker header already at 3,956 B,
// minutes from the 4 KB proxy wall). The REAL @x402 middleware must emit
// accepts[0].extra.facilitator and resource.serviceName inside the actual 402
// PAYMENT-REQUIRED header on BOTH paid routes. Only the facilitator transport is
// stubbed (local server answering /supported); route config, middleware, EVM scheme,
// bazaar extension, and header encoding are the real locked SDK. Mirrors shipped
// fleet pattern: lingua a3d49da / nft-alpha aa9c86c / dispute-forge a782277 /
// power-pack 36ee216 / royal-ruby b23de44. No payment, no network spend.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const CANON = "0x7861DB4EfC14A1ed5dd8C96c528A3796560F1393";

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function decodeChallenge(header) {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
}

async function waitUntil(check, message) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function boot(t) {
  // Facilitator transport stub: only /supported (what initialize() calls).
  const facilitator = http.createServer((req, res) => {
    if (req.url !== "/supported") return res.writeHead(404).end();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
      extensions: [],
      signers: {},
    }));
  });
  await new Promise((resolve) => facilitator.listen(0, "127.0.0.1", resolve));
  t.after(() => facilitator.close());

  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: CANON,
      X402_FACILITATOR_URL: `http://127.0.0.1:${facilitator.address().port}`,
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
      CDP_API_KEY_SECRET_B64: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await waitUntil(
    async () => (await fetch(`http://127.0.0.1:${port}/health`)).ok,
    "service did not start",
  );
  await waitUntil(async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/analyze-arbitrage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "BTCUSD" }),
    });
    return r.status === 402;
  }, "paid routes did not begin issuing payment challenges");
  return `http://127.0.0.1:${port}`;
}

for (const [route, body] of [
  ["/api/analyze-arbitrage", { ticker: "BTCUSD" }],
  ["/api/analyze-ticker", { ticker: "NVDA" }],
]) {
  test(`unpaid POST ${route} returns 402 naming facilitator + serviceName via the real middleware`, async (t) => {
    const base = await boot(t);
    const response = await fetch(base + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 402);
    const header = response.headers.get("payment-required");
    assert.ok(header, "PAYMENT-REQUIRED header present");
    assert.ok(
      Buffer.byteLength(header) < 4096,
      `challenge header stays under the 4 KB proxy buffer (got ${Buffer.byteLength(header)})`,
    );
    const d = decodeChallenge(header);
    assert.equal(d.x402Version, 2);
    assert.equal(d.resource.serviceName, "tradingagents");
    assert.equal(d.accepts.length, 1);
    const acc = d.accepts[0];
    // Buyer lookup order: accepts[0].extra.facilitator, accepts[0].facilitator, root.
    assert.equal(acc.extra.facilitator, "https://x402-agent-pay.com/facilitator");
    assert.equal(acc.payTo.toLowerCase(), CANON.toLowerCase());
  });
}

test("boot aborts unless X402_PAY_TO is the canonical treasury address", async () => {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = await new Promise((resolve) => {
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("exit", (c) => {
      assert.match(err, /canonical X402_PAY_TO required/, "boot must name the canonical rule");
      resolve(c);
    });
    setTimeout(() => child.kill(), 10_000);
  });
  assert.notEqual(code, 0, "non-canonical payTo must exit nonzero");
  child.kill();
});
