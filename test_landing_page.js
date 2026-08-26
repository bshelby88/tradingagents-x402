"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
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

async function waitForServer(url, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`service exited during startup with code ${child.exitCode}`);
    }
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("service did not start within 10 seconds");
}

test("GET / serves the buyer landing page with runtime payment details", async (t) => {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_PRICE: "125000",
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
      CDP_API_KEY_SECRET_B64: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());

  const response = await waitForServer(`http://127.0.0.1:${port}/`, child);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
  assert.ok(body.length > 1_000, "landing page should contain substantive buyer guidance");
  assert.match(body, /TradingAgents x402/);
  assert.match(body, /\$0\.125 USDC/);
  assert.match(body, /eip155:84532/);
  assert.match(body, /POST \/api\/analyze-ticker/);
  assert.match(body, /Not financial advice/);
  assert.match(body, /synthetic, degraded demonstration payload/i);
  assert.match(body, /no live market data/i);

  const buyerSurfaces = [
    body,
    await (await fetch(`http://127.0.0.1:${port}/about`)).text(),
    await (await fetch(`http://127.0.0.1:${port}/openapi.json`)).text(),
    await (await fetch(`http://127.0.0.1:${port}/.well-known/x402`)).text(),
    await (await fetch(`http://127.0.0.1:${port}/llms.txt`)).text(),
  ].join("\n");

  assert.match(buyerSurfaces, /synthetic/i);
  for (const role of ["market", "social", "news", "fundamentals"]) {
    assert.match(buyerSurfaces, new RegExp(`\\b${role}\\b`, "i"));
  }
  assert.doesNotMatch(buyerSurfaces, /five specialist/i);
  assert.doesNotMatch(buyerSurfaces, /full agent transcripts/i);
  assert.doesNotMatch(buyerSurfaces, /live multi-agent analysis/i);
});
