const express = require("express");
const { spawn } = require("node:child_process");
const { paymentMiddleware } = require("@x402/express");
const { x402ResourceServer, HTTPFacilitatorClient } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");
const { declareDiscoveryExtension } = require("@x402/extensions/bazaar");

const PAY_TO = process.env.X402_PAY_TO;
if (!PAY_TO) {
  console.error("FATAL: X402_PAY_TO env var required (Base USDC receive address)");
  process.exit(1);
}

const TRADINGAGENTS_DIR = process.env.TRADINGAGENTS_DIR || "/app/TradingAgents";
const PYTHON = process.env.PYTHON_BIN || "python3";
const ANALYZE_SCRIPT = process.env.ANALYZE_SCRIPT || "/app/analyze.py";
const ANALYSIS_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS || 90000);

const PRICE = process.env.X402_PRICE || "$5.00";

// CDP secret base64 hop
if (process.env.CDP_API_KEY_SECRET_B64) {
  process.env.CDP_API_KEY_SECRET = Buffer.from(process.env.CDP_API_KEY_SECRET_B64, "base64").toString("utf-8");
}

const HAS_CDP = Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
const NETWORK = HAS_CDP ? "eip155:8453" : "eip155:84532";

let facilitatorClient;
if (HAS_CDP) {
  const { facilitator } = require("@coinbase/x402");
  facilitatorClient = new HTTPFacilitatorClient(facilitator);
  console.log("→ Coinbase CDP facilitator (Base mainnet, real USDC)");
} else {
  facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
  console.log("→ public x402.org facilitator (Base Sepolia testnet — set CDP_API_KEY_ID/SECRET to switch to mainnet)");
}

const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register(NETWORK, new ExactEvmScheme());

// Boot-resilient facilitator init (fix 2026-06-13): eager sync-on-start is disabled in
// paymentMiddleware (5th arg false); pre-warm supported-kinds here with retry/backoff so a
// transient facilitator blip can never crash boot. Previously the eager initialize() promise
// rejected unhandled -> Node exit 1 -> Fly restart loop -> machine death after 10 tries.
(async () => {
  for (let i = 1; i <= 12; i++) {
    try {
      await x402Server.initialize();
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
    service: {
      name: serviceInfo.name,
      description: serviceInfo.description,
      contact: serviceInfo.contact || "jadedfocus@gmail.com",
      operator: serviceInfo.operator || "Royal Agentic Enterprises"
    },
    endpoints: {}
  };

  const openapi = {
    openapi: "3.0.0",
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
      mimeType: routeVal.mimeType
    };

    if (!openapi.paths[path]) {
      openapi.paths[path] = {};
    }
    openapi.paths[path][method] = {
      summary: routeVal.description ? routeVal.description.split(".")[0] : `Endpoint ${path}`,
      description: routeVal.description,
      "x-payment": routeVal.accepts,
      responses: {
        "200": { description: "Successful response" },
        "402": { description: "Payment Required" }
      }
    };
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
  res.json({
    status: "ok",
    service: "tradingagents-x402",
    provider: process.env.TRADINGAGENTS_LLM_PROVIDER || "anthropic",
    deep: process.env.TRADINGAGENTS_DEEP_THINK_LLM || "claude-haiku-4-5-20251001",
  }),
);

app.get("/about", (_req, res) =>
  res.json({
    service: "TradingAgents — Multi-agent LLM ticker consensus",
    operator: "Royal Agentic Enterprises",
    description:
      `Pay ${PRICE} USDC, get a structured multi-agent trading recommendation for any ticker. Five specialist analysts (fundamentals / sentiment / news / technicals), bullish-vs-bearish researcher debate, trader synthesis, risk-management review, portfolio-manager final decision. Returns BUY/HOLD/SELL with confidence, rationale, and full agent transcripts. Powered by the open-source TradingAgents framework (arXiv:2412.20138).`,
    docs: "https://github.com/TauricResearch/TradingAgents",
    contact: "jadedfocus@gmail.com",
  }),
);



function analyzeTickerRequestSchema() {
  return {
    type: "object",
    properties: {
      ticker: {
        type: "string",
        description: "Public equity or crypto ticker symbol, for example NVDA",
      },
      date: {
        type: "string",
        description: "Optional analysis date in YYYY-MM-DD format; defaults to today",
      },
      analysts: {
        type: "array",
        items: {
          type: "string",
          enum: ["market", "social", "news", "fundamentals"],
        },
        description: "Optional analyst modules to run",
      },
    },
    required: ["ticker"],
    additionalProperties: false,
  };
}

function fallbackAnalysis({ ticker, date, analysts }, reason) {
  const normalizedTicker = String(ticker || "UNKNOWN").toUpperCase();
  const selectedAnalysts =
    Array.isArray(analysts) && analysts.length ? analysts : ["market", "news", "fundamentals"];

  return {
    ticker: normalizedTicker,
    date: date || new Date().toISOString().slice(0, 10),
    decision: "HOLD",
    confidence: "low",
    summary:
      "The live multi-agent analyzer did not complete before the service timeout. Returned a conservative HOLD placeholder instead of a failed paid response.",
    reports: {
      market:
        "Fallback mode: no live market data was analyzed. Treat this as a service-availability receipt, not a trading signal.",
      news: "Fallback mode: no current news scan completed.",
      fundamentals: "Fallback mode: no issuer fundamentals were analyzed.",
      selected_analysts: selectedAnalysts,
    },
    degraded: true,
    error: String(reason || "analysis unavailable").slice(0, 240),
    disclaimer: "Not financial advice. Degraded fallback only; run again later for live multi-agent analysis.",
  };
}

const routesConfig = {
  "POST /api/analyze-ticker": {
    accepts: {
      scheme: "exact",
      price: PRICE,
      network: NETWORK,
      payTo: PAY_TO,
    },
    description:
      "Run a full multi-agent analysis for any publicly traded ticker. Body: { ticker: string, date?: 'YYYY-MM-DD' (defaults to today), analysts?: string[] (default ['market','social','news','fundamentals']) }. Returns final BUY/HOLD/SELL decision, confidence, structured rationale, and per-agent reports. Uses Claude Haiku 4.5 for cost-efficient deep+quick reasoning; debate rounds=1, risk rounds=1. End-to-end latency typically 60-180s. Not financial advice — research output only.",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension({
        method: "POST",
        bodyType: "json",
        inputSchema: analyzeTickerRequestSchema(),
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
            decision: "BUY",
            confidence: "high",
            summary: "Strong fundamentals, bullish momentum, positive sentiment despite macro headwinds.",
            reports: {
              fundamentals: "Q1 earnings beat by 12%...",
              sentiment: "StockTwits bull/bear ratio 3.2:1...",
              news: "Data-center capex guidance upgraded...",
              technical: "Above 50/200 SMA, RSI 62...",
              trader_plan: "Long entry $920, target $1080, stop $880",
              risk_review: "Position size capped at 3% portfolio",
            },
          },
          schema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
              ok: { type: "boolean" },
              ticker: { type: "string" },
              date: { type: "string" },
              decision: { type: "string", enum: ["BUY", "HOLD", "SELL"] },
              confidence: { type: "string" },
              summary: { type: "string" },
              reports: { type: "object" },
              error: { type: "string" },
            },
            required: ["ok"],
          },
        },
      }),
    },
  },
};

registerDiscoveryEndpoints(app, routesConfig, {
  name: "tradingagents",
  title: "TradingAgents — Multi-agent LLM ticker consensus",
  description: `Pay ${PRICE} USDC, get a structured multi-agent trading recommendation for any ticker. Five specialist analysts (fundamentals / sentiment / news / technicals), bullish-vs-bearish researcher debate, trader synthesis, risk-management review, portfolio-manager final decision. Returns BUY/HOLD/SELL with confidence, rationale, and full agent transcripts. Powered by the open-source TradingAgents framework (arXiv:2412.20138).`,
  contact: "jadedfocus@gmail.com",
  operator: "Royal Agentic Enterprises"
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
  const { ticker, date, analysts } = req.body || {};
  if (!ticker || typeof ticker !== "string" || !/^[A-Za-z0-9.\-]{1,10}$/.test(ticker)) {
    return res.status(400).json({ ok: false, error: "invalid ticker" });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: "date must be YYYY-MM-DD" });
  }
  if (analysts && (!Array.isArray(analysts) || analysts.some((a) => typeof a !== "string"))) {
    return res.status(400).json({ ok: false, error: "analysts must be array of strings" });
  }
  try {
    const result = await runAnalyze({ ticker: ticker.toUpperCase(), date, analysts });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("analyze failure:", e.message);
    res.json({
      ok: true,
      ...fallbackAnalysis({ ticker, date, analysts }, e.message),
    });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`tradingagents-x402 listening on :${PORT} (network=${NETWORK}, price=${PRICE})`);
});
