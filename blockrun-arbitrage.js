const { exec } = require("child_process");

// Simple wrapper to call agentcash CLI for payments and fetching using exec
function agentcashFetch(url, paymentHeader) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const headerOption = paymentHeader ? `-H "X-Payment: ${paymentHeader}"` : "";
    const cmd = `${isWin ? "npx.cmd" : "npx"} agentcash fetch "${url}" ${headerOption}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`agentcash failed: ${stderr || error.message}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(stdout);
      }
    });
  });
}

// Main function to run the arbitrage synthesis
async function synthesizeMarketReport(ticker) {
  console.log(`[Arbitrage] Starting synthesis for ${ticker}...`);
  try {
    // Query Polymarket prediction odds via BlockRun gateway
    const polyUrl = `http://blockrun.ai/api/polymarket/search?query=${encodeURIComponent(ticker)}`;
    const polyData = await agentcashFetch(polyUrl);

    // Query DefiLlama protocol statistics via BlockRun gateway
    const llamaUrl = `http://blockrun.ai/api/defillama/protocol/${encodeURIComponent(ticker.toLowerCase())}`;
    const llamaData = await agentcashFetch(llamaUrl).catch(() => ({ error: "Protocol not found on DefiLlama" }));

    // Query Grok Search for live market sentiment via BlockRun
    const grokUrl = `http://blockrun.ai/api/grok/search?q=${encodeURIComponent(ticker + " market sentiment price predictions")}`;
    const grokData = await agentcashFetch(grokUrl).catch(() => ({ error: "Grok search failed" }));

    const synthesis = {
      timestamp: new Date().toISOString(),
      ticker: ticker.toUpperCase(),
      polymarket_sentiment: polyData.markets ? polyData.markets.slice(0, 3) : "No direct markets found",
      defillama_tvl: llamaData.tvl || "N/A",
      grok_analysis: grokData.answer || "N/A",
      consensus: "HOLD",
      confidence: "medium"
    };

    // Rule-based consensus decision
    if (grokData.answer && grokData.answer.toLowerCase().includes("bullish")) {
      synthesis.consensus = "BUY";
      synthesis.confidence = "high";
    } else if (grokData.answer && grokData.answer.toLowerCase().includes("bearish")) {
      synthesis.consensus = "SELL";
      synthesis.confidence = "high";
    }

    return { ok: true, report: synthesis };
  } catch (error) {
    console.error("[Arbitrage] Failed to synthesize:", error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = { synthesizeMarketReport };
