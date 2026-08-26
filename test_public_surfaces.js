"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

const EXPECTED_ROLES = ["market", "social", "news", "fundamentals"];

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

function assertRoleInputSchema(schema) {
  assert.deepEqual(schema.properties.analysts.items.enum, EXPECTED_ROLES);
  assert.deepEqual(schema.properties.analysts.default, EXPECTED_ROLES);
  assert.equal(schema.properties.analysts.minItems, 1);
  assert.equal(schema.properties.analysts.uniqueItems, true);
}

function assertTruthfulOutputSchema(schema) {
  assert.ok(schema.required.includes("synthetic"));
  assert.ok(schema.required.includes("configured_roles"));
  assert.deepEqual(schema.properties.configured_roles.items.enum, EXPECTED_ROLES);
}

test("each live public surface independently advertises the truthful role contract", async (t) => {
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

  await t.test("OpenAPI", async () => {
    const document = await (await fetch(`${baseUrl}/openapi.json`)).json();
    const operation = document.paths["/api/analyze-ticker"].post;
    assertRoleInputSchema(operation.requestBody.content["application/json"].schema);
    assertTruthfulOutputSchema(operation.responses["200"].content["application/json"].schema);
  });

  await t.test("x402 well-known manifest", async () => {
    const manifest = await (await fetch(`${baseUrl}/.well-known/x402.json`)).json();
    const contract = manifest.endpoints["/api/analyze-ticker"].extensions["x-analysis-contract"];
    assertRoleInputSchema(contract.inputSchema);
    assertTruthfulOutputSchema(contract.outputSchema);
  });

  await t.test("landing page", async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();
    assert.match(html, /synthetic, degraded demonstration/i);
    assert.match(html, /controls which synthetic role report fields are returned/i);
    for (const role of EXPECTED_ROLES) assert.match(html, new RegExp(`<code>${role}</code>`));
  });

  await t.test("llms.txt", async () => {
    const text = await (await fetch(`${baseUrl}/llms.txt`)).text();
    assert.match(text, /synthetic, degraded demonstration/i);
    for (const role of EXPECTED_ROLES) assert.match(text, new RegExp(role));
  });

  await t.test("about", async () => {
    const about = await (await fetch(`${baseUrl}/about`)).json();
    assert.match(about.description, /synthetic degraded demonstration/i);
    for (const role of EXPECTED_ROLES) assert.match(about.description, new RegExp(role));
  });
});
