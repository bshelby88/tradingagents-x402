"use strict";

const MICRO_USDC_PER_USDC = 1_000_000n;
const INVALID_PRICE_MESSAGE =
  "X402_PRICE must be a finite, positive integer in atomic micro-USDC units";

function formatAtomicUsdcPrice(value) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new TypeError(INVALID_PRICE_MESSAGE);
  }

  const atomicUnits = BigInt(value);
  if (atomicUnits <= 0n) {
    throw new RangeError(INVALID_PRICE_MESSAGE);
  }

  const whole = atomicUnits / MICRO_USDC_PER_USDC;
  const fraction = (atomicUnits % MICRO_USDC_PER_USDC)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");

  return `$${whole}${fraction ? `.${fraction}` : ""}`;
}

function configuredPrice(value) {
  return value === undefined ? "$0.05" : formatAtomicUsdcPrice(value);
}

module.exports = { configuredPrice, formatAtomicUsdcPrice };
