"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { registerPublicDiscovery } = require("./public-discovery");

function renderDiscovery(path, overrides = {}) {
  const handlers = new Map();
  const app = {
    get(route, handler) {
      handlers.set(route, handler);
    },
  };
  const response = {
    contentType: null,
    body: null,
    type(value) {
      this.contentType = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };

  registerPublicDiscovery(app, {
    name: "TradingAgents x402",
    summary: "Structured research consensus.",
    baseUrl: "https://example.test/",
    endpoint: "/api/analyze-ticker",
    price: "$0.05",
    network: "eip155:84532",
    audience: "research agents",
    disclaimer: "Research output only; not financial advice.",
    homepage: false,
    ...overrides,
  });
  handlers.get(path)({}, response);
  return response;
}

test("llms discovery reports the configured runtime network", () => {
  const response = renderDiscovery("/llms.txt");
  assert.equal(response.contentType, "text/plain");
  assert.match(response.body, /Base Sepolia \(eip155:84532\)/);
  assert.doesNotMatch(response.body, /Base mainnet/);
});

test("pricing discovery preserves the research-only disclaimer", () => {
  const response = renderDiscovery("/pricing.md", { network: "eip155:8453" });
  assert.equal(response.contentType, "text/markdown");
  assert.match(response.body, /Base mainnet \(eip155:8453\)/);
  assert.match(response.body, /Research output only; not financial advice\./);
});
