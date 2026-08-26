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
    if (config.disclaimer) lines.push(`- Note: ${config.disclaimer}`);
    res.type("text/plain").send(`${lines.join("\n")}\n`);
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
        `${disclaimer}\n`,
    );
  });

  if (config.homepage !== false) {
    app.get("/", (_req, res) => res.type("html").send(""));
  }
}

module.exports = { registerPublicDiscovery };
