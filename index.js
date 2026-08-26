const crypto = require("crypto");
const express = require("express");
const Ajv = require("ajv");
const { toonMiddleware } = require("./toon_middleware");
const { spawn } = require("node:child_process");
const { paymentMiddleware } = require("@x402/express");
const { x402ResourceServer, HTTPFacilitatorClient } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");
const { declareDiscoveryExtension } = require("@x402/extensions/bazaar");
const { configuredPrice } = require("./runtime-config");
const {
  ALLOWED_ROLES: CONFIGURED_ROLES,
  fallbackAnalysis,
  normalizeAnalysts,
} = require("./analysis-contract");

const PAY_TO = process.env.X402_PAY_TO;
if (!PAY_TO) {
  console.error("FATAL: X402_PAY_TO env var required (Base USDC receive address)");
  process.exit(1);
}

const TRADINGAGENTS_DIR = process.env.TRADINGAGENTS_DIR || "/app/TradingAgents";
const PYTHON = process.env.PYTHON_BIN || "python3";
const ANALYZE_SCRIPT = process.env.ANALYZE_SCRIPT || "/app/analyze.py";
const ANALYSIS_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS || 90000);
const PRICE = configuredPrice(process.env.X402_PRICE);

// CDP secret base64 hop
if (process.env.CDP_API_KEY_SECRET_B64) {
  process.env.CDP_API_KEY_SECRET = Buffer.from(process.env.CDP_API_KEY_SECRET_B64, "base64").toString("utf-8");
}

const HAS_CDP = Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
const NETWORK = HAS_CDP ? "eip155:8453" : "eip155:84532";
const SYNTHETIC_DESCRIPTION =
  "Current implementation returns a synthetic, degraded demonstration response; it does not execute TradingAgents or retrieve live market data. Configured synthetic report roles: market, social, news, fundamentals. The optional analysts array controls which synthetic role report fields are returned; it does not run those roles. No agent transcripts are produced.";

let facilitatorClient;
if (HAS_CDP) {
  const { facilitator } = require("@coinbase/x402");
  facilitatorClient = new HTTPFacilitatorClient(facilitator);
  console.log("→ Coinbase CDP facilitator (Base mainnet, real USDC)");
} else {
  const facilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
  facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  console.log("→ public x402.org facilitator (Base Sepolia testnet — set CDP_API_KEY_ID/SECRET to switch to mainnet)");
}

const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register(NETWORK, new ExactEvmScheme());

// Boot-resilient facilitator init (fix 2026-06-13): eager sync-on-start is disabled in
// paymentMiddleware (5th arg false); pre-warm supported-kinds here with retry/backoff so a
// transient facilitator blip can never crash boot. Previously the eager initialize() promise
// rejected unhandled -> Node exit 1 -> Fly restart loop -> machine death after 10 tries.
let facilitatorReady = false;
(async () => {
  for (let i = 1; i <= 12; i++) {
    try {
      await x402Server.initialize();
      facilitatorReady = true;
      console.log(`→ x402 facilitator ready (attempt ${i})`);
      return;
    } catch (e) {
      console.warn(`x402 facilitator init attempt ${i}/12 failed: ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, Math.min(2000 * i, 15000)));
    }
  }
  console.warn("x402 facilitator not ready after retries; will init lazily on first paid request");
})();

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "request body must contain valid JSON" });
  }
  return next(error);
});
app.use(toonMiddleware);

// ------------------ x402 compliance hardenings (PR #381) ------------------
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment, PAYMENT-SIGNATURE, Authorization, X-Credit-Token");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, X-Payment, PAYMENT-SIGNATURE, Cache-Control");
  if (req.method === "OPTIONS") return res.sendStatus(204);

  const originalWriteHead = res.writeHead;
  res.writeHead = function(statusCode, ...args) {
    const actualStatus = statusCode || res.statusCode;
    if (actualStatus === 402) {
      res.setHeader("Cache-Control", "private, no-store");
    }
    return originalWriteHead.call(this, statusCode, ...args);
  };
  next();
});

function registerDiscoveryEndpoints(serverApp, routes, serviceInfo) {
  const x402Manifest = {
    version: "2.0.0",
    openapi: "/openapi.json",
    documentation: "/openapi.json",
    service: {
      name: serviceInfo.name,
      description: serviceInfo.description,
      contact: serviceInfo.contact || "jadedfocus@gmail.com",
      operator: serviceInfo.operator || "Royal Agentic Enterprises"
    },
    endpoints: {}
  };

  const openapi = {
    openapi: "3.1.0",
    info: {
      title: serviceInfo.title || serviceInfo.name,
      description: serviceInfo.description,
      version: "1.0.0",
      contact: {
        email: serviceInfo.contact || "jadedfocus@gmail.com"
      }
    },
    paths: {}
  };

  for (const [routeKey, routeVal] of Object.entries(routes)) {
    const parts = routeKey.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const method = parts[0].toLowerCase();
    const path = parts[1];

    x402Manifest.endpoints[path] = {
      method: method.toUpperCase(),
      accepts: routeVal.accepts,
      description: routeVal.description,
      mimeType: routeVal.mimeType,
      ...(routeVal.extensions ? { extensions: routeVal.extensions } : {})
    };

    const inputSchema = routeVal.inputSchema || {
      type: "object",
      properties: { ticker: { type: "string" } },
      required: ["ticker"]
    };
    const outputSchema = routeVal.outputSchema;

    const opObj = {
      summary: routeVal.description ? routeVal.description.split(".")[0] : `Endpoint ${path}`,
      description: routeVal.description,
      "x-payment-info": {
        price: { mode: "fixed", currency: "USD", amount: routeVal.accepts && routeVal.accepts.price ? String(routeVal.accepts.price).replace("$","") + "0000" : "0.050000" },
        protocols: [{ x402: {} }],
      },
      responses: {
        "200": {
          description: "Successful response",
          content: outputSchema ? { "application/json": { schema: outputSchema } } : {
            "application/json": {
              schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
            }
          }
        },
        "402": {
          description: "Payment Required"
        }
      }
    };

    if (method === "post" || method === "put" || method === "patch") {
      opObj.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: inputSchema
          }
        }
      };
    }

    if (!openapi.paths[path]) {
      openapi.paths[path] = {};
    }
    openapi.paths[path][method] = opObj;
  }

  serverApp.get("/.well-known/x402.json", (req, res) => res.json(x402Manifest));
  serverApp.get("/.well-known/x402", (req, res) => res.json(x402Manifest));
  serverApp.get("/.well-known/x402/services", (req, res) => res.json({
    services: [
      {
        name: serviceInfo.name,
        description: serviceInfo.description,
        endpoints: Object.keys(x402Manifest.endpoints)
      }
    ]
  }));
  serverApp.get("/openapi.json", (req, res) => res.json(openapi));
}
// --------------------------------------------------------------------------

app.get("/health", (_req, res) =>
  res.status(200).json({
    ok: true,
    status: "ok",
    service: "tradingagents-x402",
    outputMode: "synthetic-degraded",
    configuredRoles: CONFIGURED_ROLES,
    facilitatorReady,
  }),
);

require("./public-discovery").registerPublicDiscovery(app, {
  name: "TradingAgents x402",
  summary: `Buy a synthetic degraded ticker demonstration payload. ${SYNTHETIC_DESCRIPTION}`,
  baseUrl: "https://tradingagents-x402.fly.dev",
  endpoint: "/api/analyze-ticker",
  price: PRICE,
  network: NETWORK,
  audience: "integrators evaluating the current x402 response shape, not buyers seeking live market research",
  disclaimer: "Synthetic demonstration only; not financial advice or a live trading signal.",
  homepage: false,
});

app.get("/about", (_req, res) =>
  res.json({
    service: "TradingAgents x402 — synthetic degraded ticker demonstration",
    operator: "Royal Agentic Enterprises",
    description:
      `Pay ${PRICE} USDC per request for the current synthetic degraded demonstration payload. ${SYNTHETIC_DESCRIPTION} The response contains canned BUY/HOLD/SELL-shaped fields and must not be treated as market research.`,
    docs: "https://github.com/TauricResearch/TradingAgents",
    contact: "jadedfocus@gmail.com",
  }),
);

function tickerSymbolSchema() {
  return {
    type: "string",
    minLength: 1,
    maxLength: 10,
    pattern: "^[A-Za-z0-9.\\-]+$",
    description: "Public equity or crypto ticker symbol, for example NVDA",
  };
}

function analyzeTickerRequestSchema() {
  return {
    type: "object",
    properties: {
      ticker: tickerSymbolSchema(),
      date: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Optional analysis date in YYYY-MM-DD format; defaults to today",
      },
      analysts: {
        type: "array",
        items: {
          type: "string",
          enum: CONFIGURED_ROLES,
        },
        default: CONFIGURED_ROLES,
        minItems: 1,
        uniqueItems: true,
        description: "Optional exact subset of synthetic report roles to return",
      },
    },
    required: ["ticker"],
    additionalProperties: false,
  };
}

function analyzeArbitrageRequestSchema() {
  return {
    type: "object",
    properties: { ticker: tickerSymbolSchema() },
    required: ["ticker"],
    additionalProperties: false,
  };
}

function analyzeTickerOutputSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      ok: { type: "boolean" },
      ticker: { type: "string" },
      date: { type: "string" },
      decision: { type: "string", enum: ["BUY", "HOLD", "SELL"] },
      confidence: { type: "string" },
      summary: { type: "string" },
      synthetic: { type: "boolean", const: true },
      degraded: { type: "boolean" },
      configured_roles: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", enum: CONFIGURED_ROLES },
      },
      reports: { type: "object" },
      error: { type: "string" },
    },
    required: [
      "ok",
      "ticker",
      "date",
      "decision",
      "confidence",
      "summary",
      "synthetic",
      "degraded",
      "configured_roles",
      "reports",
    ],
  };
}

const RECEIPT_SECRET = process.env.RECEIPT_SECRET || "tradingagents-dev";
// Simple in-memory receipt store
function createReceiptStore(maxEntries = 5000) {
  const map = new Map();
  return {
    lookup(nonce) {
      return map.get(nonce);
    },
    record(nonce, response, secret) {
      const responseJson = JSON.stringify(response);
      const responseHash = crypto.createHash("sha256").update(responseJson).digest("hex");
      const receipt = {
        paymentNonce: nonce,
        responseHash,
        deliveredAt: new Date().toISOString(),
        hmac: crypto
          .createHmac("sha256", secret || "staci-dev")
          .update(nonce + responseHash)
          .digest("hex"),
      };
      map.set(nonce, { responseHash, response, receipt, ts: Date.now() });
      if (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
      }
      return receipt;
    },
    verify(receipt, secret) {
      if (!receipt || !receipt.paymentNonce || !receipt.responseHash) return false;
      const expect = crypto
        .createHmac("sha256", secret || "staci-dev")
        .update(receipt.paymentNonce + receipt.responseHash)
        .digest("hex");
      try {
        return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(String(receipt.hmac || "")));
      } catch {
        return false;
      }
    },
    size() {
      return map.size;
    },
  };
}

const receipts = createReceiptStore();
// duplicate RECEIPT_SECRET removed

const ANALYZE_ARBITRAGE_INPUT_SCHEMA = analyzeArbitrageRequestSchema();
const ANALYZE_TICKER_INPUT_SCHEMA = analyzeTickerRequestSchema();
const ANALYZE_TICKER_OUTPUT_SCHEMA = analyzeTickerOutputSchema();

const routesConfig = {
  "POST /api/analyze-arbitrage": {
    accepts: {
      scheme: "exact",
      price: PRICE,
      network: NETWORK,
      payTo: PAY_TO,
    },
    description: `Price ${PRICE} USDC per request. Run BlockRun.ai-backed arbitrage market consensus. Body: { ticker: string }. Not financial advice.`,
    mimeType: "application/json",
    inputSchema: ANALYZE_ARBITRAGE_INPUT_SCHEMA,
  },
  "POST /api/analyze-ticker": {
    accepts: {
      scheme: "exact",
      price: PRICE,
      network: NETWORK,
      payTo: PAY_TO,
    },
    description:
      `Price ${PRICE} USDC per request. Return the current synthetic degraded ticker demonstration payload. Body: { ticker: string, date?: 'YYYY-MM-DD' (defaults to today), analysts?: string[] (default ['market','social','news','fundamentals']) }. ${SYNTHETIC_DESCRIPTION} Not financial advice.`,
    mimeType: "application/json",
    inputSchema: ANALYZE_TICKER_INPUT_SCHEMA,
    outputSchema: ANALYZE_TICKER_OUTPUT_SCHEMA,
    extensions: {
      "x-analysis-contract": {
        inputSchema: ANALYZE_TICKER_INPUT_SCHEMA,
        outputSchema: ANALYZE_TICKER_OUTPUT_SCHEMA,
      },
      ...declareDiscoveryExtension({
        method: "POST",
        bodyType: "json",
        inputSchema: ANALYZE_TICKER_INPUT_SCHEMA,
        input: {
          ticker: "NVDA",
          analysts: ["market", "news", "fundamentals"],
        },
        output: {
          example: {
            input: {
              type: "http",
              method: "POST",
              bodyFields: {
                ticker: "NVDA",
                analysts: ["market", "news", "fundamentals"],
              },
            },
            ok: true,
            ticker: "NVDA",
            date: "2026-05-15",
            synthetic: true,
            degraded: true,
            decision: "BUY",
            confidence: "high",
            summary: "Synthetic degraded demonstration response for NVDA; no live market data or TradingAgents execution was used.",
            configured_roles: ["market", "news", "fundamentals"],
            reports: {
              fundamentals: "Synthetic canned example; no issuer data was checked.",
              news: "Synthetic canned example; no news sources were queried.",
              technical: "Synthetic canned example; no price data was retrieved.",
              trader_plan: "Synthetic canned example; not a trading signal.",
              risk_review: "Synthetic canned example; no portfolio was analyzed.",
            },
          },
          schema: ANALYZE_TICKER_OUTPUT_SCHEMA,
        },
      }),
    },
  },
};

registerDiscoveryEndpoints(app, routesConfig, {
  name: "tradingagents",
  title: "TradingAgents x402 — synthetic degraded ticker demonstration",
  description: `Pay ${PRICE} USDC per request for the current synthetic degraded demonstration payload. ${SYNTHETIC_DESCRIPTION} The response is not market research.`,
  contact: "jadedfocus@gmail.com",
  operator: "Royal Agentic Enterprises"
});

function buyerDocsHtml() {
  const route = routesConfig["POST /api/analyze-ticker"];
  const roles = route.inputSchema.properties.analysts.items.enum;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradingAgents x402 buyer documentation</title></head><body>
<main><h1>TradingAgents x402 buyer documentation</h1>
<p><strong>Synthetic, degraded demonstration only.</strong> The response uses canned data: no live market data or TradingAgents execution. It is not market research and not financial advice.</p>
<h2>Paid endpoint</h2>
<p><code>POST /api/analyze-ticker</code> costs <code>${route.accepts.price}</code> USDC per request on <code>${route.accepts.network}</code>.</p>
<pre>{ "ticker": "NVDA", "analysts": [${roles.map((role) => `"${role}"`).join(", ")}] }</pre>
<p>The optional <code>analysts</code> array selects synthetic report fields; it does not run analyst agents.</p>
<h2>Evaluate before paying</h2><ul>
<li><a href="/sample">Free synthetic sample</a></li>
<li><a href="/openapi.json">OpenAPI contract</a></li>
<li><a href="/.well-known/x402.json">x402 manifest</a></li>
</ul></main></body></html>`;
}

app.get("/docs", (_req, res) => res.type("html").send(buyerDocsHtml()));
app.get("/sample", (_req, res) => res.json({
  ok: true,
  ...fallbackAnalysis(
    { ticker: "NVDA", date: "2026-05-15", analysts: CONFIGURED_ROLES },
    "free canned sample; no analyzer was run",
  ),
  summary: "Free canned synthetic degraded HOLD example; no live market data or TradingAgents execution was used.",
}));

function originOf(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function landingHtml(req) {
  const origin = originOf(req);
  const title = "TradingAgents x402 - Synthetic degraded ticker demonstration";
  const desc = `Paid x402 endpoint. Pay ${PRICE} USDC per request on Base and POST /api/analyze-ticker for a synthetic degraded demonstration payload. No live market data or TradingAgents execution is used. Configured request roles: market, social, news, fundamentals. No agent transcripts are produced. Not financial advice.`;
  const favicon =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0a0a0a"/><path d="M14 46 L26 22 L34 38 L42 18 L50 46" fill="none" stroke="#4ade80" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    );
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "WebService",
    name: "TradingAgents x402",
    description: desc,
    provider: { "@type": "Organization", name: "Royal Agentic Enterprises" },
    documentation: `${origin}/openapi.json`,
    termsOfService: `${origin}/about`,
  };
  const esc = (s) => s.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${favicon}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${origin}/">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="alternate" type="application/json" href="/openapi.json" title="OpenAPI 3.0">
<link rel="alternate" type="application/json" href="/.well-known/x402" title="x402 discovery">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e6e6e6; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
  h1 { font-size: 1.8rem; line-height: 1.2; margin: 0 0 8px; }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; }
  .price { color: #4ade80; font-weight: 700; }
  code { background: #1a1a1a; padding: 1px 6px; border-radius: 4px; }
  pre { background: #141414; padding: 16px; border-radius: 8px; overflow: auto; }
  a { color: #6cb6ff; }
  ul { padding-left: 1.1em; }
  .tag { display: inline-block; font-size: .8rem; background: #1a1a1a; border: 1px solid #2a2a2a; padding: 2px 10px; border-radius: 999px; }
</style>
</head>
<body>
<main>
  <span class="tag">x402 &middot; Base USDC</span>
  <h1>TradingAgents x402</h1>
  <p>Pay <span class="price">${PRICE} USDC per request</span> on Base and <code>POST /api/analyze-ticker</code> for the current synthetic, degraded demonstration payload. It uses canned data: no live market data, TradingAgents execution, or agent transcripts.</p>
  <p>Configured synthetic report roles: <code>market</code>, <code>social</code>, <code>news</code>, and <code>fundamentals</code>. The optional <code>analysts</code> array controls which synthetic role report fields are returned; it does not run those roles.</p>
  <h2>Endpoint</h2>
  <pre>POST ${origin}/api/analyze-ticker
Content-Type: application/json
X-Payment: &lt;x402 payment&gt;

{ "ticker": "NVDA" }</pre>
  <p>Optional: <code>{ "ticker": "NVDA", "date": "2026-05-15", "analysts": ["market","social","news","fundamentals"] }</code>.</p>
  <h2>Discovery</h2>
  <ul>
    <li><a href="/docs">Buyer documentation</a> &middot; <a href="/sample">Free synthetic sample</a></li>
    <li><a href="/openapi.json">OpenAPI 3.1 spec</a></li>
    <li><a href="/.well-known/x402">x402 well-known manifest</a></li>
    <li><a href="/about">About</a> &middot; <a href="/health">Health</a></li>
  </ul>
  <p>Network: <code>${NETWORK}</code> &middot; Operator: Royal Agentic Enterprises</p>
  <p style="opacity:.7">Not financial advice. Synthetic degraded demonstration only; do not treat it as a trading signal.</p>
</main>
</body>
</html>`;
}

app.get("/", (req, res) => res.type("html").send(landingHtml(req)));
const ajv = new Ajv({ allErrors: true, strict: false });
const requestValidators = new Map(
  Object.entries(routesConfig).map(([routeKey, route]) => [routeKey, ajv.compile(route.inputSchema)]),
);
app.use((req, res, next) => {
  const validate = requestValidators.get(`${req.method} ${req.path}`);
  if (!validate || validate(req.body)) return next();
  return res.status(400).json({
    ok: false,
    error: "request body does not match the published schema",
    details: validate.errors,
  });
});
app.use((req, res, next) => {
  const paidRoute = Object.keys(routesConfig).some((routeKey) => {
    const [method, path] = routeKey.split(" ");
    return req.method === method && req.path === path;
  });
  if (!paidRoute || facilitatorReady) return next();
  res.setHeader("Retry-After", "1");
  return res.status(503).json({
    ok: false,
    error: "payment facilitator is still initializing; retry shortly",
  });
});
app.use((req, res, next) => {
  if (req.method !== "POST" || req.path !== "/api/analyze-ticker") return next();
  try {
    req.configuredRoles = normalizeAnalysts(req.body && req.body.analysts);
    return next();
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});
app.use(paymentMiddleware(routesConfig, x402Server, undefined, undefined, false));

function runAnalyze({ ticker, date, analysts }) {
  return new Promise((resolve, reject) => {
    const args = [ANALYZE_SCRIPT, "--ticker", ticker];
    if (date) args.push("--date", date);
    if (analysts && analysts.length) args.push("--analysts", analysts.join(","));

    const env = { ...process.env, PYTHONUNBUFFERED: "1" };
    const child = spawn(PYTHON, args, { env, cwd: TRADINGAGENTS_DIR });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`analysis timed out after ${Math.round(ANALYSIS_TIMEOUT_MS / 1000)}s`));
    }, ANALYSIS_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`analyze.py exit ${code}: ${stderr.slice(-2000)}`));
      }
      try {
        const lines = stdout.trim().split("\n");
        const lastJson = lines.reverse().find((l) => l.trim().startsWith("{"));
        if (!lastJson) return reject(new Error("no JSON output from analyzer"));
        resolve(JSON.parse(lastJson));
      } catch (e) {
        reject(new Error(`bad JSON from analyzer: ${e.message}`));
      }
    });
  });
}

// Ledger: emit one [LEDGER] line to stdout per successful paid call (captured by fly logs)
app.use((req, res, next) => {
  if (req.method !== "POST" || !req.path.startsWith("/api/")) return next();
  const t0 = Date.now();
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      try {
        console.log(`[LEDGER] ${JSON.stringify({
            ts: new Date().toISOString(),
            app: "tradingagents-x402",
            endpoint: req.path,
            price_usdc: PRICE,
            network: NETWORK,
            pay_to: PAY_TO,
            ok: Boolean(body && body.ok),
            latency_ms: Date.now() - t0,
          })}`);
      } catch (_) {}
    }
    return origJson(body);
  };
  next();
});

app.post("/api/analyze-ticker", async (req, res) => {
  const { ticker, date } = req.body || {};
  const configuredRoles = req.configuredRoles;
  try {
    const result = await runAnalyze({ ticker: ticker.toUpperCase(), date, analysts: configuredRoles });
    const paymentSignature = req.get("PAYMENT-SIGNATURE") || req.get("X-Payment") || "";
    const cached = paymentSignature ? receipts.lookup(paymentSignature) : null;
    if (cached) return res.json({ ok: true, replay: true, receipt: { payload: cached.payload, signature: receipts.record(paymentSignature, cached.response, RECEIPT_SECRET).signature }, ...cached.response });
    const receipt = receipts.record(paymentSignature, result, RECEIPT_SECRET);
    res.json({ ok: true, receipt, ...result });
  } catch (e) {
    console.error("analyze failure:", e.message);
    const fallback = fallbackAnalysis({ ticker, date, analysts: configuredRoles }, e.message);
    const paymentSignature = req.get("PAYMENT-SIGNATURE") || req.get("X-Payment") || "";
    const receipt = receipts.record(paymentSignature, fallback, RECEIPT_SECRET);
    res.json({ ok: true, receipt, ...fallback });
  }
});

const { synthesizeMarketReport } = require("./blockrun-arbitrage");

app.post("/api/analyze-arbitrage", async (req, res) => {
  const { ticker } = req.body || {};

  const paymentSignature = req.get("PAYMENT-SIGNATURE") || req.get("X-Payment") || "";
  const cached = paymentSignature && receipts.lookup(paymentSignature);
  if (cached) {
    return res.json({ ok: true, replay: true, receipt: cached.receipt, ...cached.response });
  }

  try {
    const result = await synthesizeMarketReport(ticker);
    const receipt = paymentSignature ? receipts.record(paymentSignature, result.report || { error: result.error }, RECEIPT_SECRET) : undefined;
    res.json({ ok: result.ok, receipt, ...(result.report || { error: result.error }) });
  } catch (e) {
    console.error("arbitrage failure:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.get("/api/receipts/verify", (req, res) => {
  try {
    const receipt = JSON.parse(req.query.receipt || "{}");
    res.json({ valid: receipts.verify(receipt, RECEIPT_SECRET) });
  } catch {
    res.json({ valid: false });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`tradingagents-x402 listening on :${PORT} (network=${NETWORK}, price=${PRICE})`);
});
