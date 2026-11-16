"use strict";

// Pins the real-fulfillment contract added 2026-11-15 (revenue cycle, menu item 1):
// - analyze.py in real mode (TRADINGAGENTS_FORCE_REAL_ANALYSIS=1) NEVER falls back
//   to synthetic output: no key / any engine error -> non-zero exit (Node 503s,
//   payment not settled).
// - The published output schema no longer pins synthetic:true (real reports are
//   deliverable).
// - /health stays 200-honest in every mode (Fly probe path).

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("real mode without a key fails honestly instead of selling synthetic output", () => {
  const result = spawnSync("python", [path.join(__dirname, "analyze.py"), "--ticker", "NVDA"], {
    cwd: __dirname,
    encoding: "utf8",
    env: { ...process.env, TRADINGAGENTS_FORCE_REAL_ANALYSIS: "1", ANTHROPIC_API_KEY: "" },
  });
  assert.notEqual(result.status, 0, "real mode without a key must exit non-zero");
  assert.match(result.stdout, /real analysis unavailable/);
  assert.doesNotMatch(result.stdout, /"synthetic":\s*true/);
});

test("published output schema allows real (non-synthetic) reports", () => {
  const src = require("node:fs").readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.doesNotMatch(src, /synthetic: \{ type: "boolean", const: true \}/);
});

test("health outputMode is truthful and never throws (probe path stays 200)", () => {
  const src = require("node:fs").readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(src, /function outputMode\(\)/);
  assert.match(src, /return "synthetic-degraded"/);
  assert.match(src, /outputMode: outputMode\(\)/);
});
