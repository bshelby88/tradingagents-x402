"use strict";

const ALLOWED_ROLES = Object.freeze(["market", "social", "news", "fundamentals"]);
const ROLE_REPORTS = Object.freeze({
  market: [
    "technical",
    "Fallback mode: no live market data was analyzed. Treat this as a service-availability receipt, not a trading signal.",
  ],
  social: ["sentiment", "Fallback mode: no social sources were queried."],
  news: ["news", "Fallback mode: no current news scan completed."],
  fundamentals: ["fundamentals", "Fallback mode: no issuer fundamentals were analyzed."],
});

function normalizeAnalysts(analysts) {
  if (analysts === undefined) return [...ALLOWED_ROLES];
  const valid =
    Array.isArray(analysts) &&
    analysts.length > 0 &&
    analysts.every((role) => typeof role === "string" && ALLOWED_ROLES.includes(role)) &&
    new Set(analysts).size === analysts.length;
  if (!valid) {
    throw new TypeError("analysts must be a non-empty array of unique allowed roles");
  }
  return [...analysts];
}

function fallbackAnalysis({ ticker, date, analysts }, reason) {
  const configuredRoles = normalizeAnalysts(analysts);
  const reports = Object.fromEntries(
    configuredRoles.map((role) => ROLE_REPORTS[role]),
  );
  return {
    ticker: String(ticker || "UNKNOWN").toUpperCase(),
    date: date || new Date().toISOString().slice(0, 10),
    synthetic: true,
    degraded: true,
    configured_roles: configuredRoles,
    decision: "HOLD",
    confidence: "low",
    summary:
      "The analyzer did not complete before the service timeout. Returned a conservative synthetic HOLD placeholder instead of a failed paid response.",
    reports,
    error: String(reason || "analysis unavailable").slice(0, 240),
    disclaimer: "Not financial advice. Synthetic degraded fallback only; no live analysis was performed.",
  };
}

module.exports = { ALLOWED_ROLES, fallbackAnalysis, normalizeAnalysts };
