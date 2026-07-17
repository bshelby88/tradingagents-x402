# How to buy a TradingAgents analysis

## What you get
POST `{"ticker":"BTC"}` to `https://staci-tradingagents.fly.dev/api/analyze-ticker` and receive a structured BUY/HOLD/SELL recommendation with per-agent reasoning.

## Price
$0.25 USDC exact on Base (network `eip155:84532`).

## Step 1 — verify the service
Run these four commands before paying:

```bash
curl https://staci-tradingagents.fly.dev/health
curl https://staci-tradingagents.fly.dev/.well-known/x402
curl -X POST https://staci-tradingagents.fly.dev/api/analyze-ticker \
  -H 'Content-Type: application/json' \
  -d '{"ticker":"BTC"}'
curl 'https://staci-tradingagents.fly.dev/api/receipts/verify?receipt=%7B%7D'
```

All should return HTTP 200 except the POST, which returns HTTP 402.

## Step 2 — pay with x402-proxy

```bash
npx x402-proxy https://staci-tradingagents.fly.dev/api/analyze-ticker \
  --body '{"ticker":"BTC"}'
```

## Step 3 — use the Python SDK

```python
from x402 import x402Client
from x402.mechanisms.evm.exact import ExactEvmScheme

client = x402Client()
client.register("eip155:84532", ExactEvmScheme(signer=your_signer))

resp = client.post(
    "https://staci-tradingagents.fly.dev/api/analyze-ticker",
    json={"ticker": "BTC"}
)
print(resp.json())
```

## Step 4 — verify your receipt

Paste the returned receipt into:

```bash
curl -G 'https://staci-tradingagents.fly.dev/api/receipts/verify' \
  --data-urlencode 'receipt=<RECEIPT_JSON>'
```

You should get `{"valid":true}`.

## Need help?
Contact: jadedfocus@gmail.com
