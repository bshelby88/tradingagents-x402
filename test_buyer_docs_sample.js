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

async function withService(t) {
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
  return baseUrl;
}

test("GET /docs gives buyers a truthful contract derived from public discovery", async (t) => {
  const baseUrl = await withService(t);
  const [docsResponse, openApiResponse, manifestResponse] = await Promise.all([
    fetch(`${baseUrl}/docs`),
    fetch(`${baseUrl}/openapi.json`),
    fetch(`${baseUrl}/.well-known/x402.json`),
  ]);
  assert.equal(docsResponse.status, 200);
  assert.match(docsResponse.headers.get("content-type"), /text\/html/);

  const docs = await docsResponse.text();
  const openapi = await openApiResponse.json();
  const manifest = await manifestResponse.json();
  const operation = openapi.paths["/api/analyze-ticker"].post;
  const endpoint = manifest.endpoints["/api/analyze-ticker"];

  assert.match(docs, new RegExp(endpoint.method));
  assert.match(docs, /\/api\/analyze-ticker/);
  assert.match(docs, new RegExp(endpoint.accepts.price.replace("$", "\\$")));
  assert.match(docs, new RegExp(endpoint.accepts.network));
  for (const role of operation.requestBody.content["application/json"].schema.properties.analysts.items.enum) {
    assert.match(docs, new RegExp(role));
  }
  assert.match(docs, /synthetic[^.]*degraded/i);
  assert.match(docs, /no live market data/i);
  assert.match(docs, /not (?:live )?(?:market )?research|not financial advice/i);
  assert.match(docs, /href="\/sample"/);
  assert.match(docs, /href="\/openapi\.json"/);
  assert.match(docs, /href="\/\.well-known\/x402\.json"/);
});

test("the landing page makes the free buyer evaluation routes discoverable", async (t) => {
  const baseUrl = await withService(t);
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/docs"/);
  assert.match(html, /href="\/sample"/);
});

test("GET /sample returns a free canned response matching the paid output contract", async (t) => {
  const baseUrl = await withService(t);
  const [sampleResponse, openApiResponse] = await Promise.all([
    fetch(`${baseUrl}/sample`),
    fetch(`${baseUrl}/openapi.json`),
  ]);
  assert.equal(sampleResponse.status, 200);
  assert.match(sampleResponse.headers.get("content-type"), /application\/json/);
  assert.equal(sampleResponse.headers.get("payment-required"), null);

  const sample = await sampleResponse.json();
  const openapi = await openApiResponse.json();
  const outputSchema = openapi.paths["/api/analyze-ticker"].post.responses["200"]
    .content["application/json"].schema;
  for (const field of outputSchema.required) assert.ok(Object.hasOwn(sample, field), `missing ${field}`);

  assert.equal(sample.ok, true);
  assert.equal(sample.ticker, "NVDA");
  assert.equal(sample.synthetic, true);
  assert.equal(sample.degraded, true);
  assert.equal(sample.decision, "HOLD");
  assert.equal(sample.confidence, "low");
  assert.deepEqual(sample.configured_roles, ["market", "social", "news", "fundamentals"]);
  assert.deepEqual(Object.keys(sample.reports), ["technical", "sentiment", "news", "fundamentals"]);
  assert.match(sample.summary, /free canned synthetic/i);
  assert.match(sample.disclaimer, /no live analysis was performed/i);
  assert.doesNotMatch(sample.summary, /analyzer did not complete|paid response/i);
  assert.equal(Object.hasOwn(sample, "receipt"), false);
});
