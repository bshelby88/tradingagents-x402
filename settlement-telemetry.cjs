// settlement-telemetry.cjs — drop-in middleware for RAEN x402 services.
// Records the paid-route funnel: 402 challenges, settled paid calls, failures,
// latency. Fire-and-forget POST to the fleet settlement-collector; never blocks
// or breaks a paid route (all failures swallowed).
//   app.use(require("./settlement-telemetry.cjs")({ service: "briefsnap", priceMap: {...} }));
// Place BEFORE paymentMiddleware.
const COLLECTOR = process.env.X402_COLLECTOR_URL || "https://settlement-collector.fly.dev/events";
const KEY = process.env.X402_COLLECTOR_KEY || "";

// TRUTH FIX (Nov 11): decode the settlement receipt (x-payment-response header,
// base64 JSON) so settled events carry payer address + tx hash for ledger
// attribution. Returns { payer, tx }, empty strings when unavailable.
function decodeSettlementReceipt(res) {
  const out = { payer: "", tx: "" };
  try {
    const raw =
      res.getHeader("x-payment-response") ||
      res.getHeader("payment-response") ||
      res.getHeader("PAYMENT-RESPONSE");
    if (!raw) return out;
    const d = JSON.parse(Buffer.from(String(raw), "base64").toString("utf-8"));
    const s = d?.successResponse || d || {};
    out.payer = String(s.payer || s.from || s.payerAddress || d?.payer || d?.from || "").toLowerCase();
    out.tx = String(s.txHash || s.transaction || s.transactionHash || s.tx_hash || d?.txHash || d?.transaction || "");
  } catch { /* malformed receipt — emit without attribution */ }
  return out;
}

module.exports = function settlementTelemetry({ service, priceMap = {}, variantOf = null }) {
  return function (req, res, next) {
    const start = Date.now();
    // x402 v2 uses PAYMENT-SIGNATURE; v1 used X-PAYMENT. Treat either as paid.
    const paid = Boolean(req.headers["x-payment"] || req.headers["payment-signature"]);
    if (!paid && req.method === "GET") return next(); // free discovery routes
    let emitted = false;
    function emit(event, error_class) {
      if (emitted) return; emitted = true;
      // Decode the receipt one tick after "finish": paymentMiddleware sets the
      // x-payment-response header in a finish listener registered AFTER ours
      // (this middleware mounts before paymentMiddleware), so a synchronous
      // read here would race and always miss it.
      setImmediate(() => {
        const { payer, tx } = event === "settled" ? decodeSettlementReceipt(res) : { payer: "", tx: "" };
        // TRUTH FIX (Nov 11): a 200 on a paid request without an on-chain tx is
        // NOT revenue. Report it as settled-unverified so the collector can
        // exclude it from revenue totals.
        if (event === "settled" && !tx) event = "settled-unverified";
        const body = {
          service, event,
          route: req.path.slice(0, 100),
          price_usd: priceMap[req.path] ?? null,
          variant: typeof variantOf === "function" ? variantOf(req) : undefined,
          status: res.statusCode,
          error_class: error_class || null,
          latency_ms: Date.now() - start,
          payer: payer || null,
          tx: tx || null,
        };
        try {
          fetch(COLLECTOR, {
            method: "POST",
            headers: { "content-type": "application/json", "x-collector-key": KEY },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(2000),
          }).catch(() => {});
        } catch { /* telemetry must never break payment */ }
        console.log(`[settle-tel] ${service} ${event} ${req.path} ${res.statusCode} ${body.latency_ms}ms payer=${payer || "-"} tx=${tx ? tx.slice(0, 18) + "…" : "-"}`);
      });
    }
    res.on("finish", () => {
      if (res.statusCode === 402) emit("challenge");
      else if (res.statusCode >= 500) emit("failed", `http_${res.statusCode}`);
      else if (res.statusCode < 400) emit(paid ? "settled" : "free-200");
      else emit("failed", `http_${res.statusCode}`);
    });
    res.on("close", () => { if (!emitted && !res.writableEnded) emit("failed", "client_abort"); });
    next();
  };
};
