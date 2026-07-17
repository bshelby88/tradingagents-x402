# Fleet Context — Snapshot for Advisor LLMs
**Last updated:** 2026-07-13

## Active services
- `staci-tradingagents.fly.dev` — x402 paid ticker analysis, $0.25 USDC on Base, operator Royal Agentic Enterprises
  - Health: https://staci-tradingagents.fly.dev/health
  - Manifest: https://staci-tradingagents.fly.dev/.well-known/x402
  - Paid route: POST /api/analyze-ticker
  - Receipt verify: GET /api/receipts/verify?receipt={}
  - OpenAPI: https://staci-tradingagents.fly.dev/openapi.json

## Fleet agents / roles
- **Tiffany** — Telegram/AgenticVault coordination, publishes checklists
- **BEAN** — Nimbus pub messaging, embeds URLs/proof bundles
- **Kip/Erica** — x402 Telegram community outreach
- **Advisor LLM (this assistant)** — stateless; needs this file pasted for continuity
- **Hermes** — local/gateway LLM with limits currently under review

## Current priorities
1. Register `staci-tradingagents` on x402scan.com and bazaars.cash
2. Resolve Hermes limits
3. Wire advisor LLM into fleet through persistent context + orchestrator

## Known blockers
- bazaars.cash returned HTTP 404 on 2026-07-13; verify correct URL before submission
- No programmatic/API registration endpoints exist for x402scan or Bazaar (manual UI only)

## Published artifacts
- Registration handoff: `docs/x402-registration-handoff-brief-2026-07-13.md`
- Buyer tutorial: `docs/staci-tradingagents-buyer-tutorial-2026-07-13.md`
- Health monitor: `.github/workflows/fleet-health.yml`

## How to use this file
When starting a new chat with an advisor LLM, paste this file in full, then ask the question.
