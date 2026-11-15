"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAnalyzeTickerHandler, createArbitrageHandler } = require("./delivery-guard");

function call(handler, headers = {}) {
  const out = { status: 200, body: undefined };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  const req = { body: { ticker: "nvda" }, configuredRoles: ["market"], get: (n) => headers[n] || "" };
  return handler(req, res).then(() => out);
}
const mk = (runAnalyze, env) => {
  const rec = [];
  const receipts = { lookup: () => null, record: (...a) => { rec.push(a); return { signature: "s" }; } };
  return { h: createAnalyzeTickerHandler({ runAnalyze, receipts, receiptSecret: "x", env }), rec };
};
const quiet = (fn) => async () => { const e = console.error; console.error = () => {}; try { await fn(); } finally { console.error = e; } };
const SYN = async () => ({ synthetic: true, degraded: true, decision: "HOLD" });
const REAL = async () => ({ synthetic: false, decision: "BUY" });

test("flag unset -> 503 even with a good analyzer; analyzer never run", async () => {
  let ran = false;
  const { h, rec } = mk(async () => { ran = true; return {}; }, {});
  const o = await call(h);
  assert.equal(o.status, 503); assert.equal(o.body.delivered, false);
  assert.equal(ran, false); assert.equal(rec.length, 0);
});

test("flag=0 / other values do not enable", async () => {
  for (const v of ["0", "true", "", "yes"]) {
    const { h } = mk(REAL, { TRADINGAGENTS_FORCE_REAL_ANALYSIS: v });
    assert.equal((await call(h)).status, 503, v);
  }
});

test("flag=1 but analyzer synthetic/degraded -> 503, no receipt, no canned body", async () => {
  const { h, rec } = mk(SYN, { TRADINGAGENTS_FORCE_REAL_ANALYSIS: "1" });
  const o = await call(h);
  assert.equal(o.status, 503); assert.equal(o.body.decision, undefined); assert.equal(rec.length, 0);
});

test("flag=1 and analyzer throws -> 503 (no synthetic fallback)", quiet(async () => {
  const { h } = mk(async () => { throw new Error("boom"); }, { TRADINGAGENTS_FORCE_REAL_ANALYSIS: "1" });
  const o = await call(h);
  assert.equal(o.status, 503); assert.equal(o.body.synthetic, undefined);
}));

test("flag=1 and real analyzer -> 200 with receipt", async () => {
  const { h, rec } = mk(REAL, { TRADINGAGENTS_FORCE_REAL_ANALYSIS: "1" });
  const o = await call(h);
  assert.equal(o.status, 200); assert.equal(o.body.decision, "BUY"); assert.equal(rec.length, 1);
});

test("arbitrage: upstream ok:false -> 502 (previously 200 with ok:false, which settles)", async () => {
  const receipts = { lookup: () => null, record: () => ({}) };
  const h = createArbitrageHandler({ synthesizeMarketReport: async () => ({ ok: false, error: "x" }), receipts, receiptSecret: "s" });
  assert.equal((await call(h)).status, 502);
});

test("arbitrage: success -> 200; thrown -> 502", quiet(async () => {
  const receipts = { lookup: () => null, record: () => ({}) };
  const ok = createArbitrageHandler({ synthesizeMarketReport: async () => ({ ok: true, report: { a: 1 } }), receipts, receiptSecret: "s" });
  assert.equal((await call(ok)).status, 200);
  const bad = createArbitrageHandler({ synthesizeMarketReport: async () => { throw new Error("n"); }, receipts, receiptSecret: "s" });
  assert.equal((await call(bad)).status, 502);
}));
