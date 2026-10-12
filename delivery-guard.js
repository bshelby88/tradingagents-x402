"use strict";
// Delivery guard for the paid routes. @x402/express settles on any status < 400, so a
// route that cannot produce real output must answer 5xx. Synthetic output is never sold
// silently: the paid analyze route needs TRADINGAGENTS_FORCE_REAL_ANALYSIS=1 AND a
// non-synthetic analyzer result; anything else -> 503 {ok:false, delivered:false}.

function forceRealEnabled(env = process.env) {
  return env.TRADINGAGENTS_FORCE_REAL_ANALYSIS === "1";
}

function unavailable(res, reason) {
  return res.status(503).json({
    ok: false,
    delivered: false,
    error: "real analysis unavailable; no output delivered, payment not settled",
    reason,
    retryable: false,
  });
}

function createAnalyzeTickerHandler({ runAnalyze, receipts, receiptSecret, env = process.env }) {
  return async function analyzeTicker(req, res) {
    if (!forceRealEnabled(env)) {
      return unavailable(res, "TRADINGAGENTS_FORCE_REAL_ANALYSIS is not enabled; this service only has a synthetic analyzer");
    }
    const { ticker, date } = req.body || {};
    let result;
    try {
      result = await runAnalyze({ ticker: String(ticker).toUpperCase(), date, analysts: req.configuredRoles });
    } catch (e) {
      console.error("analyze failure:", e && e.message);
      return unavailable(res, "analyzer error");
    }
    if (!result || result.synthetic === true || result.degraded === true || result.error) {
      return unavailable(res, "analyzer returned synthetic or degraded output");
    }
    const sig = req.get("PAYMENT-SIGNATURE") || req.get("X-Payment") || "";
    const cached = sig ? receipts.lookup(sig) : null;
    if (cached) {
      return res.json({ ok: true, replay: true, receipt: { payload: cached.payload, signature: receipts.record(sig, cached.response, receiptSecret).signature }, ...cached.response });
    }
    const receipt = receipts.record(sig, result, receiptSecret);
    return res.json({ ok: true, receipt, ...result });
  };
}

function createArbitrageHandler({ synthesizeMarketReport, receipts, receiptSecret }) {
  return async function analyzeArbitrage(req, res) {
    const { ticker } = req.body || {};
    const sig = req.get("PAYMENT-SIGNATURE") || req.get("X-Payment") || "";
    const cached = sig && receipts.lookup(sig);
    if (cached) return res.json({ ok: true, replay: true, receipt: cached.receipt, ...cached.response });
    try {
      const result = await synthesizeMarketReport(ticker);
      if (!result || !result.ok || !result.report) {
        return res.status(502).json({ ok: false, delivered: false, error: "upstream market data unavailable; no output delivered, payment not settled" });
      }
      const receipt = sig ? receipts.record(sig, result.report, receiptSecret) : undefined;
      return res.json({ ok: true, receipt, ...result.report });
    } catch (e) {
      console.error("arbitrage failure:", e && e.message);
      return res.status(502).json({ ok: false, delivered: false, error: "upstream error; no output delivered, payment not settled" });
    }
  };
}

module.exports = { forceRealEnabled, createAnalyzeTickerHandler, createArbitrageHandler };
