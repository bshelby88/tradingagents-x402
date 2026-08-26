"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

test("Docker runtime includes every service startup module", () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, "Dockerfile"), "utf8");
  const serviceCopy = dockerfile
    .split(/\r?\n/)
    .find((line) => line.startsWith("COPY index.js "));

  assert.ok(serviceCopy, "Dockerfile must have a service-code COPY instruction");
  for (const runtimeFile of [
    "index.js",
    "toon_middleware.js",
    "public-discovery.js",
    "runtime-config.js",
    "analysis-contract.js",
    "analyze.py",
    "blockrun-arbitrage.js",
  ]) {
    assert.match(serviceCopy, new RegExp(`(?:^|\\s)${runtimeFile.replace(".", "\\.")}(?:\\s|$)`));
  }
});

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

test("paid route returns 503 until facilitator is ready and 402 afterward", async (t) => {
  let releaseSupported;
  let supportedRequested = false;
  const supportedGate = new Promise((resolve) => (releaseSupported = resolve));
  const facilitator = http.createServer(async (req, res) => {
    if (req.url !== "/supported") return res.writeHead(404).end();
    supportedRequested = true;
    await supportedGate;
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
  const facilitatorPort = facilitator.address().port;
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_FACILITATOR_URL: `http://127.0.0.1:${facilitatorPort}`,
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
      CDP_API_KEY_SECRET_B64: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());

  await waitUntil(async () => (await fetch(`http://127.0.0.1:${port}/health`)).ok, "service did not start");
  const cold = await fetch(`http://127.0.0.1:${port}/api/analyze-ticker`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: "NVDA" }),
  });
  assert.equal(cold.status, 503);
  assert.equal(cold.headers.get("payment-required"), null);
  assert.equal(cold.headers.get("x-payment"), null);
  assert.match(cold.headers.get("retry-after") || "", /^\d+$/);
  assert.deepEqual(await cold.json(), {
    ok: false,
    error: "payment facilitator is still initializing; retry shortly",
  });

  await waitUntil(() => supportedRequested, "service never initialized the configured facilitator");
  releaseSupported();
  await waitUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/analyze-ticker`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "NVDA" }),
    });
    return response.status === 402;
  }, "paid route did not begin issuing payment challenges after facilitator readiness");

  const invalidRoles = await fetch(`http://127.0.0.1:${port}/api/analyze-ticker`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: "NVDA", analysts: ["market", "invalid"] }),
  });
  assert.equal(invalidRoles.status, 400);
  assert.deepEqual(await invalidRoles.json(), {
    ok: false,
    error: "analysts must be a non-empty array of unique allowed roles",
  });
});
