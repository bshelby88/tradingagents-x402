// AGENSTRY-W1 cycle-9 replication acceptance (recO9y9mCEnExkp3W, 2026-09-28).
// Boots the real tradingagents-x402 server as a subprocess and verifies the
// free A2A v1.0 surfaces registered ABOVE every gate plus the still-gated
// paid routes. Wire-format expectations are the exact shapes validated on the
// eight A2A surfaces of this workstream (c6-c8). Facilitator transport is a
// LOCAL STUB (same hook as test_facilitator_emission.js) so the real @x402
// middleware emits genuine 402s offline. Price/network expectations are
// DERIVED at runtime from the server's own /.well-known/x402.json manifest —
// no env-brittle literals (local boots on eip155:84532 without CDP secrets;
// Fly boots mainnet — the card follows the live gate either way). No money
// paths executed: localhost bind, canonical treasury via env, probes stop
// unpaid, python analysis is never reached behind the gate.
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");

const CANONICAL_TREASURY = "0x7861DB4EfC14A1ed5dd8C96c528A3796560F1393";
const DRAIN_ERA_WALLET = "0xfbc0eb7811d477e55261d956df39f0046e192240";

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function collectAddressStrings(node, out = []) {
  if (typeof node === "string") {
    for (const m of node.matchAll(/0x[0-9a-fA-F]{40}/g)) out.push(m[0].toLowerCase());
  } else if (Array.isArray(node)) {
    for (const n of node) collectAddressStrings(n, out);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectAddressStrings(v, out);
  }
  return out;
}

async function main() {
  const stub = http.createServer((req, res) => {
    if (req.url === "/supported") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ kinds: [
        { x402Version: 2, scheme: "exact", network: "eip155:8453" },
        { x402Version: 2, scheme: "exact", network: "eip155:84532" },
      ] }));
    }
    res.statusCode = 501;
    res.end("{}");
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const stubUrl = `http://127.0.0.1:${stub.address().port}`;

  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      X402_PAY_TO: CANONICAL_TREASURY,
      X402_FACILITATOR_URL: stubUrl,
      CDP_API_KEY_ID: "",
      CDP_API_KEY_SECRET: "",
      CDP_API_KEY_SECRET_B64: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server start timeout log=${out.slice(0, 300)}`)), 30000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (out.includes(`tradingagents-x402 listening on :${port}`)) { clearTimeout(t); resolve(); }
    });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.once("exit", (c) => { clearTimeout(t); reject(new Error(`server exited early code=${c} log=${out.slice(0, 300)}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); assert.ok(cond, name); };
  const nonce = () => Date.now() + "-" + Math.random().toString(36).slice(2, 8);

  // 1. Live manifest is the authoritative price/network source (derived, no drift)
  const man = await fetch(`${base}/.well-known/x402.json`).then((r) => r.json());
  const ticker = man.endpoints["/api/analyze-ticker"].accepts;
  const arb = man.endpoints["/api/analyze-arbitrage"].accepts;
  check("manifest ticker payTo == canonical (full-string)", ticker.payTo.toLowerCase() === CANONICAL_TREASURY.toLowerCase());
  check("manifest arb payTo == canonical (full-string)", arb.payTo.toLowerCase() === CANONICAL_TREASURY.toLowerCase());

  // 2. Agent card (A2A v1.0 discovery)
  const cardRes = await fetch(`${base}/.well-known/agent-card.json`);
  check("agent-card GET 200", cardRes.status === 200);
  const card = await cardRes.json();
  const cardJson = JSON.stringify(card);
  check("protocolVersion 1.0", card.protocolVersion === "1.0");
  check("v1 AgentInterface protocolBinding (REQUIRED for SDK transport matching)", Array.isArray(card.supportedInterfaces) && card.supportedInterfaces[0].protocolBinding === "JSONRPC" && card.supportedInterfaces[0].protocolVersion === "1.0");
  check("preferredTransport JSONRPC", card.preferredTransport === "JSONRPC");
  check("card url is /a2a", typeof card.url === "string" && card.url.endsWith("/a2a"));
  check("4 skills with id/name/description/tags/examples", Array.isArray(card.skills) && card.skills.length === 4 && card.skills.every((s) => s.id && s.name && s.description && Array.isArray(s.tags) && Array.isArray(s.examples)));
  check("card is truthful: synthetic degraded demo, not market research", /synthetic/i.test(cardJson) && /not financial advice|financial advice/i.test(cardJson));
  check("card ticker price matches live manifest (derived)", cardJson.includes(ticker.price));
  check("card arb price matches live manifest (derived)", cardJson.includes(arb.price));
  check("card network matches live manifest", cardJson.includes(ticker.network));
  check("card names canonical treasury", cardJson.toUpperCase().includes(CANONICAL_TREASURY.toUpperCase()));
  check("drain-era wallet absent from card", !cardJson.toLowerCase().includes(DRAIN_ERA_WALLET));
  check("securitySchemes present empty (no hidden auth)", card.securitySchemes && Object.keys(card.securitySchemes).length === 0 && Array.isArray(card.security) && card.security.length === 0);
  const alt = await fetch(`${base}/.well-known/agent.json`);
  check("agent.json alias 200", alt.status === 200);

  // 3. SendMessage v1 → protojson SendMessageResponse wrapper
  const v1 = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `c9-v1-${nonce()}`, method: "SendMessage", params: { message: { messageId: `m-${nonce()}`, role: "ROLE_USER", parts: [{ text: "How do I buy a ticker consensus report?" }] } } }) }).then((r) => r.json());
  check("v1 result.message wrapper ROLE_AGENT + bare parts", v1.result && v1.result.message && v1.result.message.role === "ROLE_AGENT" && v1.result.kind === undefined && v1.result.message.parts[0].kind === undefined);
  check("v1 answer carries manifest price/treasury/gate-free metadata", v1.result.message.parts[0].text.includes(ticker.price) && v1.result.message.parts[0].text.toUpperCase().includes(CANONICAL_TREASURY.toUpperCase()) && v1.result.message.metadata.x402.payTo.toUpperCase() === CANONICAL_TREASURY.toUpperCase() && v1.result.message.metadata.free === true);
  check("v1 answer keeps the synthetic honesty note", /synthetic/i.test(v1.result.message.parts[0].text));
  const v1free = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `c9-free-${nonce()}`, method: "SendMessage", params: { message: { messageId: `m2-${nonce()}`, role: "ROLE_USER", parts: [{ kind: "text", text: "can I see the output shape before paying" }] } } }) }).then((r) => r.json());
  check("v1 accepts kinded inbound parts + keyword hint /sample", /\/sample/.test(v1free.result.message.parts[0].text));
  const v1arb = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `c9-arb-${nonce()}`, method: "SendMessage", params: { message: { messageId: `m3-${nonce()}`, role: "ROLE_USER", parts: [{ text: "does the arbitrage endpoint give financial advice?" }] } } }) }).then((r) => r.json());
  check("v1 arbitrage keyword route refuses financial-advice framing", /not financial advice/i.test(v1arb.result.message.parts[0].text));

  // 4. v0.3 message/send → flat kinded Message (back-compat)
  const v03 = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `c9-v03-${nonce()}`, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: `what does analyze-ticker cost (ref ${nonce()})` }] } } }) }).then((r) => r.json());
  check("v0.3 message/send keeps flat kinded agent message", v03.result.kind === "message" && v03.result.role === "agent" && v03.result.parts[0].kind === "text" && v03.result.parts[0].text.includes(ticker.price));

  // 5. GetAgentCard + JSON-RPC error edges
  const gac = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `c9-gac-${nonce()}`, method: "GetAgentCard" }) }).then((r) => r.json());
  check("GetAgentCard returns the card", gac.result && gac.result.protocolVersion === "1.0" && gac.result.supportedInterfaces[0].protocolBinding === "JSONRPC");
  const bad = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "1.0", id: `c9-bad-${nonce()}`, method: "x" }) }).then((r) => r.json());
  check("non-2.0 request → -32600", bad.error && bad.error.code === -32600);
  const unk = await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `c9-unk-${nonce()}`, method: `tasks/coffee-${nonce()}` }) }).then((r) => r.json());
  check("unknown method → -32601", unk.error && unk.error.code === -32601);

  // 6. Regressions: paid flagships stay gated with GENUINE 402s (valid bodies —
  // the request-contract validator runs BEFORE this gate, so probes must honor
  // the published schema to reach the challenge). Retry tolerates init.
  async function gateProbe(p, body) {
    let r;
    for (let i = 0; i < 12; i++) {
      r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 402) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    return r;
  }
  const paidTicker = await gateProbe("/api/analyze-ticker", { ticker: "NVDA" });
  check("paid POST /api/analyze-ticker unpaid → genuine 402 (never 2xx)", paidTicker.status === 402);
  const hdrT = paidTicker.headers.get("x-payment") || paidTicker.headers.get("payment-required");
  check("ticker 402 carries PAYMENT header challenge", Boolean(hdrT));
  const chT = JSON.parse(Buffer.from(hdrT, "base64").toString("utf8"));
  const addrsT = collectAddressStrings(chT);
  check("decoded ticker 402 payTo == canonical treasury (full-address)", addrsT.includes(CANONICAL_TREASURY.toLowerCase()));
  check("decoded ticker 402 names no drain-era wallet", !addrsT.includes(DRAIN_ERA_WALLET));
  const paidArb = await gateProbe("/api/analyze-arbitrage", { ticker: "NVDA" });
  check("paid POST /api/analyze-arbitrage unpaid → genuine 402 (never 2xx)", paidArb.status === 402);
  // junk route still 404s (A2A surfaces added no catch-all)
  const junk = await fetch(`${base}/api/definitely-not-a-route-${nonce()}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("junk POST route still 404", junk.status === 404);

  // 7. existing free routes untouched
  for (const p of ["/about", "/health", "/sample", "/pricing.md", "/llms.txt", "/openapi.json", "/docs"]) {
    const r = await fetch(`${base}${p}`);
    check(`GET ${p} still 200`, r.status === 200);
  }

  child.kill();
  stub.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log(results.map(([n, ok]) => `${ok ? "PASS" : "FAIL"} — ${n}`).join("\n"));
  if (failed.length) { console.error(`${failed.length} FAILED`); process.exit(1); }
  console.log(`ALL PASS — tradingagents-x402 agent-card acceptance (${results.length} checks)`);
}

main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
