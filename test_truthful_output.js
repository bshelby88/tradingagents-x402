"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("analyzer labels its unconditional canned response as synthetic and degraded", () => {
  const result = spawnSync("python", [path.join(__dirname, "analyze.py"), "--ticker", "NVDA"], {
    cwd: __dirname,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.synthetic, true);
  assert.equal(payload.degraded, true);
  assert.match(payload.summary, /synthetic/i);
  for (const report of Object.values(payload.reports)) {
    assert.match(report, /synthetic|canned/i);
  }
});

test("repository buyer copy does not promise unavailable live analysis or transcripts", () => {
  const copy = ["README.md", "package.json", "docs/staci-tradingagents-buyer-tutorial-2026-07-13.md"]
    .map((file) => fs.readFileSync(path.join(__dirname, file), "utf8"))
    .join("\n");
  assert.match(copy, /synthetic/i);
  assert.doesNotMatch(copy, /multi-agent LLM ticker consensus/i);
  assert.doesNotMatch(copy, /per-agent reasoning/i);
  assert.doesNotMatch(copy, /live multi-agent analysis/i);
  assert.doesNotMatch(copy, /full agent transcripts/i);
});