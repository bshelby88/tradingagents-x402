"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("service did not start");
}

function assertBuyerSafeBillingCopy(text, surface) {
  assert.doesNotMatch(text, /per successful call/i, `${surface} must not imply success-contingent billing`);
  assert.match(text, /per request/i, `${surface} must disclose request-based billing`);
  assert.match(text, /synthetic/i, `${surface} must preserve the synthetic-output disclosure`);
  assert.match(text, /not financial advice|not (?:market )?research|(?:do|must) not (?:be )?treat(?:ed)?[^.\n]*(?:market research|trading signal)/i,
    `${surface} must preserve a financial-risk disclosure`);
}

test("each customer-facing surface independently states per-request billing", async (t) => {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: "0x0000000000000000000000000000000000000001",
      X402_FACILITATOR_URL: "http://127.0.0.1:1",
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
      CDP_API_KEY_SECRET_B64: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);

  const liveSurfaces = [
    ["landing page", "/"],
    ["buyer docs", "/docs"],
    ["llms.txt", "/llms.txt"],
    ["pricing.md", "/pricing.md"],
    ["OpenAPI", "/openapi.json"],
    ["x402 manifest", "/.well-known/x402"],
    ["about", "/about"],
  ];
  for (const [name, route] of liveSurfaces) {
    await t.test(name, async () => {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200);
      assertBuyerSafeBillingCopy(await response.text(), name);
    });
  }

  for (const [name, relativePath] of [
    ["README", "README.md"],
    ["buyer tutorial", path.join("docs", "staci-tradingagents-buyer-tutorial-2026-07-13.md")],
  ]) {
    await t.test(name, () => {
      assertBuyerSafeBillingCopy(fs.readFileSync(path.join(__dirname, relativePath), "utf8"), name);
    });
  }
});
