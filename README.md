# tradingagents-x402

Paid x402 endpoint associated with [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents). **The current `POST /api/analyze-ticker` implementation returns a canned synthetic, degraded demonstration payload. It does not execute TradingAgents, retrieve live market data, or provide agent transcripts.**

- **Price:** `$0.05` USDC unless overridden by `X402_PRICE` as a positive integer in atomic micro-USDC units (`50000` = `$0.05`; 1 USDC = 1,000,000 units). Invalid, fractional, or non-finite values stop startup.
- **Network:** production uses Base mainnet (`eip155:8453`) with the Coinbase CDP facilitator
- **Configured synthetic report roles:** `market`, `social`, `news`, `fundamentals`. The optional `analysts` array controls which synthetic role report fields are returned; the current path does not run those roles.
- **Live at:** https://tradingagents-x402.fly.dev

**Evaluate before paying:** inspect the [landing page](https://tradingagents-x402.fly.dev/), [OpenAPI document](https://tradingagents-x402.fly.dev/openapi.json), [machine-readable pricing](https://tradingagents-x402.fly.dev/pricing.md), and [live x402 manifest](https://tradingagents-x402.fly.dev/.well-known/x402.json). Output is a synthetic demonstration, not research or financial advice.

## Vendor

The TradingAgents source is vendored into `engine/` at build time (not committed):

```bash
cp -r ../TradingAgents engine
rm -rf engine/.git engine/.venv
```

`Dockerfile` runs `pip install -e /app/TradingAgents` against this copy.

## Build + deploy

Production deployments run through the repository's reviewed GitHub Actions
workflow. Re-vendor and test on a feature branch, open a pull request, and let
the scoped Fly deployment workflow deploy the merged `main` branch. Do not
manually deploy from a workstation.

## Secrets

```bash
fly secrets set \
  ANTHROPIC_API_KEY=... \
  CDP_API_KEY_ID=fdab6c4e-1b5c-4299-8a7c-65d31fb91a57 \
  CDP_API_KEY_SECRET=<base64-ed25519> \
  X402_PAY_TO=0x9e6A0CE78Bb2915d0758cc6A1cE8eA77f1B71770 \
  -a tradingagents-x402
```

CDP **v2** key required (bare UUID + Ed25519 base64). v1 SEC1 PEM keys fail with `Invalid key format`.

## Request shape

```bash
# 402 challenge
curl -X POST https://tradingagents-x402.fly.dev/api/analyze-ticker \
  -H 'content-type: application/json' \
  -d '{"ticker":"NVDA"}'

# Real call (signed x402 payment header required; maximum charge $0.05 USDC)
# Body: { ticker: string, date?: "YYYY-MM-DD", analysts?: ["market","social","news","fundamentals"] }
# Current result is synthetic and degraded; no live analysis is performed.
```

## Revenue ledger

Every successful 200 emits `[LEDGER] {...}` to stdout. Captured by `fly logs`. Tail across all 7 x402 apps with `~/bin/x402-revenue-tail.sh`.

## License

ISC for this wrapper. TradingAgents itself ships under its own license — see `engine/LICENSE` after vendoring.

---

Part of the [Royal Agentic x402 portfolio](https://bshelby88.github.io/x402-portfolio/) — seven paid x402 APIs on Base mainnet.
