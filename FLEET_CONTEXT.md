# Fleet Context — Snapshot for Advisor LLMs
**Last updated:** 2026-08-26

## Active services
- `tradingagents-x402.fly.dev` — x402 paid ticker analysis, $0.05 USDC on Base mainnet (`eip155:8453`), operator Royal Agentic Enterprises
  - Health: https://tradingagents-x402.fly.dev/health
  - Manifest: https://tradingagents-x402.fly.dev/.well-known/x402
  - Paid route: POST /api/analyze-ticker
  - Receipt verify: GET /api/receipts/verify?receipt={}
  - OpenAPI: https://tradingagents-x402.fly.dev/openapi.json

## Fleet agents / roles
- **Tiffany** — Telegram/AgenticVault coordination, publishes checklists
- **BEAN** — Nimbus pub messaging, embeds URLs/proof bundles
- **Kip/Erica** — x402 Telegram community outreach
- **Advisor LLM (this assistant)** — stateless; needs this file pasted for continuity
- **Hermes** — local/gateway LLM with limits currently under review

## Current priorities
1. Complete one controlled CDP-facilitated settlement per active service after funding and authorization checks.
2. Verify all seven exact URLs in the public CDP Bazaar catalog.
3. Convert buyer traffic through current tutorials, manifests, and trackable campaign links.

## Known blockers
- Public CDP Bazaar audit currently finds 0 of 7 fleet services.
- The Coinbase payer currently lacks sufficient USDC for the $0.67 aggregate bootstrap cap and receives HTTP 403 from x402 discovery tooling.
- No x402 revenue is verified until an external USDC receipt is reconciled on Base.

## Published artifacts
- Registration handoff: `docs/x402-registration-handoff-brief-2026-07-13.md`
- Buyer tutorial: `docs/staci-tradingagents-buyer-tutorial-2026-07-13.md`
- Health monitor: `.github/workflows/fleet-health.yml`

## How to use this file
When starting a new chat with an advisor LLM, paste this file in full, then ask the question.
