"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  ALLOWED_ROLES,
  fallbackAnalysis,
  normalizeAnalysts,
} = require("./analysis-contract");

function runAnalyzer(...args) {
  const result = spawnSync("python", [path.join(__dirname, "analyze.py"), "--ticker", "NVDA", ...args], {
    cwd: __dirname,
    encoding: "utf8",
  });
  const payload = JSON.parse(result.stdout.trim().split("\n").at(-1));
  return { result, payload };
}

test("analyzer default output truthfully configures all four roles", () => {
  const { result, payload } = runAnalyzer();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(payload.synthetic, true);
  assert.equal(payload.degraded, true);
  assert.deepEqual(payload.configured_roles, ["market", "social", "news", "fundamentals"]);
  assert.deepEqual(Object.keys(payload.reports), [
    "technical",
    "sentiment",
    "news",
    "fundamentals",
    "trader_plan",
    "risk_review",
    "final_decision",
  ]);
  assert.match(payload.summary, /synthetic/i);
  for (const report of Object.values(payload.reports)) {
    assert.match(report, /synthetic|canned/i);
  }
});

test("analyzer honors an exact allowlisted role subset", () => {
  const { result, payload } = runAnalyzer("--analysts", "social,market");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(payload.configured_roles, ["social", "market"]);
  assert.deepEqual(Object.keys(payload.reports), [
    "sentiment",
    "technical",
    "trader_plan",
    "risk_review",
    "final_decision",
  ]);
});

test("analyzer rejects an invalid role before returning synthetic output", () => {
  const { result, payload } = runAnalyzer("--analysts", "market,invalid");
  assert.notEqual(result.status, 0);
  assert.deepEqual(payload, { error: "invalid analysts list" });
});

test("fallback default output includes all roles and truthfulness markers", () => {
  const payload = fallbackAnalysis({ ticker: "nvda" }, "timeout");
  assert.equal(payload.synthetic, true);
  assert.equal(payload.degraded, true);
  assert.deepEqual(payload.configured_roles, ALLOWED_ROLES);
  assert.deepEqual(Object.keys(payload.reports), ["technical", "sentiment", "news", "fundamentals"]);
});

test("fallback output honors an exact allowlisted role subset", () => {
  const payload = fallbackAnalysis({ ticker: "NVDA", analysts: ["social", "market"] }, "timeout");
  assert.deepEqual(payload.configured_roles, ["social", "market"]);
  assert.deepEqual(Object.keys(payload.reports), ["sentiment", "technical"]);
});

test("request role normalization rejects empty, duplicate, and unknown selections", () => {
  for (const analysts of [[], ["market", "market"], ["market", "invalid"], "market"]) {
    assert.throws(() => normalizeAnalysts(analysts), /analysts must be a non-empty array of unique allowed roles/);
  }
});

for (const file of ["README.md", "docs/staci-tradingagents-buyer-tutorial-2026-07-13.md"]) {
  test(`${file} truthfully explains analyst selection semantics`, () => {
    const copy = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.match(copy, /controls which synthetic role report fields are returned/i);
    assert.match(copy, /does not run/i);
  });
}

for (const file of [
  "README.md",
  "package.json",
  "docs/staci-tradingagents-buyer-tutorial-2026-07-13.md",
]) {
  test(`${file} independently describes synthetic output without live-analysis promises`, () => {
    const copy = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.match(copy, /synthetic/i);
    assert.doesNotMatch(copy, /multi-agent LLM ticker consensus/i);
    assert.doesNotMatch(copy, /per-agent reasoning/i);
    assert.doesNotMatch(copy, /live multi-agent analysis/i);
    assert.doesNotMatch(copy, /full agent transcripts/i);
  });
}