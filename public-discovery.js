"use strict";

function networkDescription(network) {
  if (network === "eip155:8453") return "Base mainnet (eip155:8453)";
  if (network === "eip155:84532") return "Base Sepolia (eip155:84532)";
  return network;
}

function registerPublicDiscovery(app, config) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const method = config.method || "POST";
  const network = networkDescription(config.network);
  const links = {
    manifest: `${baseUrl}/.well-known/x402.json`,
    openapi: `${baseUrl}/openapi.json`,
    health: `${baseUrl}/health`,
    sample: config.sample ? `${baseUrl}${config.sample}` : null,
  };

const CROSS_WALL_CATALOG_LLMS = "\n## More RAEN services (live catalog)\n\nAll prices are USDC on Base (eip155:8453) via x402; each service answers unpaid POSTs with a live 402 challenge that is authoritative.\n\n- suprapack \u2014 https://suprapack-x402.fly.dev \u2014 Find the right agent skill for a task \u2014 $0.03 USDC/Base\n- power-pack \u2014 https://power-pack-x402.fly.dev \u2014 Cold-email deliverability and reply-rate scoring \u2014 $0.01 USDC/Base\n- vault-pro \u2014 https://vault-pro-x402.fly.dev \u2014 Scaffold Obsidian-ready project and agent vault templates \u2014 $0.05 USDC/Base\n- nft-alpha \u2014 https://nft-alpha-x402.fly.dev \u2014 Real-time OpenSea market-signal metrics for a collection \u2014 $0.02 USDC/Base\n- lingua \u2014 https://lingua-x402.fly.dev \u2014 Translation, localization, and batch translate (from $1.00) \u2014 $1.00 USDC/Base\n- nanobanana \u2014 https://nanobanana-x402.fly.dev \u2014 AI image generation from a prompt \u2014 $0.01 USDC/Base\n- royal-ruby \u2014 https://royal-ruby-x402.fly.dev \u2014 Plain-language US consumer-protection law lookups \u2014 $0.25 USDC/Base\n- escrow \u2014 https://escrow-x402.fly.dev \u2014 x402 agent-to-agent escrow deal creation \u2014 $0.05 USDC/Base\n- royal-feel \u2014 https://royal-feel-x402.fly.dev \u2014 FTC-compliance copy linting + rewrite (from $2.00) \u2014 $2.00 USDC/Base\n- dispatch \u2014 https://dispatch-x402.fly.dev \u2014 Agent task dispatch with fulfillment tracking \u2014 $0.50 USDC/Base\n- contract-eye \u2014 https://contract-eye-x402.fly.dev \u2014 Contract risk-clause analysis (text or address) \u2014 $0.05 USDC/Base\n- briefsnap \u2014 https://briefsnap-x402.fly.dev \u2014 Summarize / extract-actions / ELI5 / compare docs (from $1.00) \u2014 $1.00 USDC/Base\n- dispute-forge \u2014 https://dispute-forge-x402.fly.dev \u2014 FCRA-compliant dispute letter pack generation \u2014 $0.75 USDC/Base\n- sentry-forge \u2014 https://sentry-forge-x402.fly.dev \u2014 Debt-dispute forensics pack generation \u2014 $5.00 USDC/Base\n- opensea-data \u2014 https://opensea-data-x402.fly.dev \u2014 OpenSea floor / listings / offers / traits for any collection slug \u2014 $0.01 USDC/Base\n";
const CROSS_WALL_CATALOG_PRICING = "\n## More RAEN services\n\n| Service | Endpoint | Capability | Base price |\n|---|---|---|---|\n| suprapack | [suprapack-x402.fly.dev](https://suprapack-x402.fly.dev) | Find the right agent skill for a task | $0.03 |\n| power-pack | [power-pack-x402.fly.dev](https://power-pack-x402.fly.dev) | Cold-email deliverability and reply-rate scoring | $0.01 |\n| vault-pro | [vault-pro-x402.fly.dev](https://vault-pro-x402.fly.dev) | Scaffold Obsidian-ready project and agent vault templates | $0.05 |\n| nft-alpha | [nft-alpha-x402.fly.dev](https://nft-alpha-x402.fly.dev) | Real-time OpenSea market-signal metrics for a collection | $0.02 |\n| lingua | [lingua-x402.fly.dev](https://lingua-x402.fly.dev) | Translation, localization, and batch translate (from $1.00) | $1.00 |\n| nanobanana | [nanobanana-x402.fly.dev](https://nanobanana-x402.fly.dev) | AI image generation from a prompt | $0.01 |\n| royal-ruby | [royal-ruby-x402.fly.dev](https://royal-ruby-x402.fly.dev) | Plain-language US consumer-protection law lookups | $0.25 |\n| escrow | [escrow-x402.fly.dev](https://escrow-x402.fly.dev) | x402 agent-to-agent escrow deal creation | $0.05 |\n| royal-feel | [royal-feel-x402.fly.dev](https://royal-feel-x402.fly.dev) | FTC-compliance copy linting + rewrite (from $2.00) | $2.00 |\n| dispatch | [dispatch-x402.fly.dev](https://dispatch-x402.fly.dev) | Agent task dispatch with fulfillment tracking | $0.50 |\n| contract-eye | [contract-eye-x402.fly.dev](https://contract-eye-x402.fly.dev) | Contract risk-clause analysis (text or address) | $0.05 |\n| briefsnap | [briefsnap-x402.fly.dev](https://briefsnap-x402.fly.dev) | Summarize / extract-actions / ELI5 / compare docs (from $1.00) | $1.00 |\n| dispute-forge | [dispute-forge-x402.fly.dev](https://dispute-forge-x402.fly.dev) | FCRA-compliant dispute letter pack generation | $0.75 |\n| sentry-forge | [sentry-forge-x402.fly.dev](https://sentry-forge-x402.fly.dev) | Debt-dispute forensics pack generation | $5.00 |\n| opensea-data | [opensea-data-x402.fly.dev](https://opensea-data-x402.fly.dev) | OpenSea floor / listings / offers / traits for any collection slug | $0.01 |\n\nPrices shown are the headline USDC/Base (eip155:8453) price harvested from each service's own /pricing.md on 2026-09-18; the live 402 challenge is authoritative.\n";
  app.get("/llms.txt", (_req, res) => {
    const lines = [
      `# ${config.name}`,
      "",
      `> ${config.summary}`,
      "",
      `- Paid endpoint: ${method} ${baseUrl}${config.endpoint}`,
      `- Current configured price: ${config.price} USDC per request`,
      `- Payment network: ${network}, USDC via x402`,
      `- Intended users: ${config.audience}`,
      `- x402 manifest: ${links.manifest}`,
      `- OpenAPI: ${links.openapi}`,
      `- Health: ${links.health}`,
    ];
    if (links.sample) lines.push(`- Free sample: ${links.sample}`);
    if (config.roles && config.roles.length) lines.push(`- Configured report roles: ${config.roles.join(", ")}`);
    if (config.disclaimer) lines.push(`- Note: ${config.disclaimer}`);
    res.type("text/plain").send(`${lines.join("\n")}\n` + CROSS_WALL_CATALOG_LLMS);
  });

  app.get("/pricing.md", (_req, res) => {
    const sampleLine = links.sample
      ? `\n- Free evaluation: [sample response](${links.sample})`
      : "";
    const disclaimer = config.disclaimer ? `\n\n${config.disclaimer}` : "";
    res.type("text/markdown").send(
      `# Pricing — ${config.name}\n\n` +
        `- Price: **${config.price} USDC per request**\n` +
        "- Billing: pay per request; no account or subscription\n" +
        `- Network: ${network}\n` +
        `- Paid endpoint: \`${method} ${config.endpoint}\`\n` +
        `- Live payment requirements: [x402 manifest](${links.manifest})${sampleLine}\n\n` +
        "The live x402 payment challenge is authoritative if the configured price changes." +
        `${disclaimer}\n` + CROSS_WALL_CATALOG_PRICING
    );
  });

  if (config.homepage !== false) {
    app.get("/", (_req, res) => res.type("html").send(""));
  }
}

module.exports = { registerPublicDiscovery };
