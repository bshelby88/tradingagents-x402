"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { formatAtomicUsdcPrice } = require("./runtime-config");

test("formats atomic micro-USDC without rounding", () => {
  assert.equal(formatAtomicUsdcPrice("1"), "$0.000001");
  assert.equal(formatAtomicUsdcPrice("50000"), "$0.05");
  assert.equal(formatAtomicUsdcPrice("1234567"), "$1.234567");
});

test("rejects non-finite, non-positive, and inexact atomic prices", () => {
  for (const value of ["NaN", "Infinity", "0", "-1", "1.5", "1e6", ""]) {
    assert.throws(
      () => formatAtomicUsdcPrice(value),
      /X402_PRICE must be a finite, positive integer in atomic micro-USDC units/,
      value,
    );
  }
});
