"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

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

async function waitUntil(check, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function post(baseUrl, route, body) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertNoPaymentHeaders(response, label) {
  for (const header of ["payment-required", "x-payment", "payment-signature"]) {
    assert.equal(response.headers.get(header), null, `${label} unexpectedly included ${header}`);
  }
}

test("published schemas reject invalid paid-route bodies before payment", async (t) => {
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
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_FACILITATOR_URL: `http://127.0.0.1:${facilitator.address().port}`,
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
      CDP_API_KEY_SECRET_B64: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const baseUrl = `http://127.0.0.1:${port}`;

  await waitUntil(async () => (await fetch(`${baseUrl}/health`)).ok, "service did not start");
  await waitUntil(async () => (await post(baseUrl, "/api/analyze-ticker", { ticker: "NVDA" })).status === 402,
    "valid ticker request did not reach payment middleware");

  const invalidByRoute = {
    "/api/analyze-ticker": [
      undefined,
      null,
      [],
      "NVDA",
      {},
      { ticker: 42 },
      { ticker: "" },
      { ticker: "TOO-LONG-SYMBOL" },
      { ticker: "BAD/TICKER" },
      { ticker: "NVDA", date: 20260826 },
      { ticker: "NVDA", date: null },
      { ticker: "NVDA", date: "08/26/2026" },
      { ticker: "NVDA", analysts: [] },
      { ticker: "NVDA", analysts: "market" },
      { ticker: "NVDA", analysts: [42] },
      { ticker: "NVDA", analysts: ["market", "market"] },
      { ticker: "NVDA", analysts: ["unknown"] },
      { ticker: "NVDA", extra: true },
    ],
    "/api/analyze-arbitrage": [
      undefined,
      null,
      [],
      "NVDA",
      {},
      { ticker: 42 },
      { ticker: "" },
      { ticker: "TOO-LONG-SYMBOL" },
      { ticker: "BAD/TICKER" },
      { ticker: "NVDA", extra: true },
    ],
  };

  for (const [route, bodies] of Object.entries(invalidByRoute)) {
    await t.test(route, async () => {
      for (const body of bodies) {
        const label = `${route} ${JSON.stringify(body)}`;
        const response = await post(baseUrl, route, body);
        assert.equal(response.status, 400, label);
        assert.match(response.headers.get("content-type") || "", /^application\/json\b/, label);
        assertNoPaymentHeaders(response, label);
        const payload = await response.json();
        assert.equal(payload.ok, false, label);
        assert.equal(typeof payload.error, "string", label);
      }

      const valid = await post(baseUrl, route, { ticker: "NVDA" });
      assert.equal(valid.status, 402, `${route} valid request must still require payment`);
      assert.ok(valid.headers.get("payment-required"), `${route} valid request must include payment challenge`);
    });
  }
});
