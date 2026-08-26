"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    "analyze.py",
    "blockrun-arbitrage.js",
  ]) {
    assert.match(serviceCopy, new RegExp(`(?:^|\\s)${runtimeFile.replace(".", "\\.")}(?:\\s|$)`));
  }
});
