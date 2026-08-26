# How to buy a TradingAgents analysis

## What you get
POST `{"ticker":"BTC"}` to `https://tradingagents-x402.fly.dev/api/analyze-ticker` and receive a structured BUY/HOLD/SELL recommendation with per-agent reasoning.

## Price
$0.05 USDC exact on Base mainnet (network `eip155:8453`). Verify the live
HTTP 402 challenge before signing and reject any request above this amount.

## Step 1 — verify the service
Run these four commands before paying:

```bash
curl https://tradingagents-x402.fly.dev/health
curl https://tradingagents-x402.fly.dev/.well-known/x402
curl -X POST https://tradingagents-x402.fly.dev/api/analyze-ticker \
  -H 'Content-Type: application/json' \
  -d '{"ticker":"BTC"}'
curl 'https://tradingagents-x402.fly.dev/api/receipts/verify?receipt=%7B%7D'
```

All should return HTTP 200 except the POST, which returns HTTP 402.

## Step 2 — pay with x402-proxy

```bash
npx x402-proxy https://tradingagents-x402.fly.dev/api/analyze-ticker \
  --body '{"ticker":"BTC"}'
```

## Step 3 — use the Python SDK

```python
from x402 import x402Client
from x402.mechanisms.evm.exact import ExactEvmScheme

client = x402Client()
client.register("eip155:8453", ExactEvmScheme(signer=your_signer))

resp = client.post(
    "https://tradingagents-x402.fly.dev/api/analyze-ticker",
    json={"ticker": "BTC"}
)
print(resp.json())
```

## Step 4 — verify your receipt

Paste the returned receipt into:

```bash
curl -G 'https://tradingagents-x402.fly.dev/api/receipts/verify' \
  --data-urlencode 'receipt=<RECEIPT_JSON>'
```

You should get `{"valid":true}`.

## Need help?
Contact: jadedfocus@gmail.com
