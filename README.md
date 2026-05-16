# tradingagents-x402

Paid x402 wrapper for [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — multi-agent LLM ticker consensus over `POST /api/analyze-ticker`.

- **Price:** $1.00 USDC on Base mainnet (`eip155:8453`)
- **Network:** real USDC via Coinbase CDP facilitator
- **Backbone:** Claude Haiku 4.5 (deep + quick), debate rounds=1, risk rounds=1
- **Live at:** https://tradingagents-x402.fly.dev

## Vendor

The TradingAgents source is vendored into `engine/` at build time (not committed):

```bash
cp -r ../TradingAgents engine
rm -rf engine/.git engine/.venv
```

`Dockerfile` runs `pip install -e /app/TradingAgents` against this copy.

## Build + deploy

```bash
# Re-vendor before deploy
cp -r ../TradingAgents engine && rm -rf engine/.git engine/.venv

fly deploy --remote-only
```

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

# Real call (signed x402 payment header required)
# Body: { ticker: string, date?: "YYYY-MM-DD", analysts?: ["market","social","news","fundamentals"] }
```

## Revenue ledger

Every successful 200 emits `[LEDGER] {...}` to stdout. Captured by `fly logs`. Tail across all 7 x402 apps with `~/bin/x402-revenue-tail.sh`.

## License

ISC for this wrapper. TradingAgents itself ships under its own license — see `engine/LICENSE` after vendoring.

---

Part of the [Royal Agentic x402 portfolio](https://bshelby88.github.io/x402-portfolio/) — seven paid x402 APIs on Base mainnet.
