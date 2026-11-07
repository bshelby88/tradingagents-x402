const { HTTPFacilitatorClient, x402ResourceServer } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");

process.env.CDP_API_KEY_ID = "organizations/0a560462-a8ae-4cc0-96d6-a62afd77154c/apiKeys/6c77aba3-3f73-41d9-98a5-13486fed976f";
// The exact base64 value from container env:
const b64Secret = "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR0hBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJHMHdhd0lCQVFRZzVwK3kySlJlcDNiMnNHQ0YKMGJ5YWxDUmoxMmJGc3BWMEllS3NvMDdHNTZDaFJBTkNBQVFva1J2U3A5UHNQU2F6cmxMU09CTURlSWpocXpXVAppOVBzNThNckhuZ1Q3N1Y5V3NLYS9HZFpJaHFFeUQ3V2pUZGhFRUlWUlV2dzlaZW1qOHR1bmU4MwotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg==";
process.env.CDP_API_KEY_SECRET = Buffer.from(b64Secret, "base64").toString("utf-8");

const { facilitator } = require("@coinbase/x402");

(async () => {
  try {
    const client = new HTTPFacilitatorClient(facilitator);
    const x402Server = new x402ResourceServer(client);
    x402Server.register("eip155:8453", new ExactEvmScheme());
    
    console.log("Initializing x402Server...");
    await x402Server.initialize();
    console.log("Initialization success!");
    
    console.log("Testing getSupportedKind(2, 'eip155:8453', 'exact')...");
    const supportedKind = x402Server.getSupportedKind(2, "eip155:8453", "exact");
    console.log("Result:", supportedKind);
    
    console.log("\nTesting getSupportedKind(1, 'base', 'exact')...");
    const v1Kind = x402Server.getSupportedKind(1, "base", "exact");
    console.log("Result (v1):", v1Kind);

  } catch (e) {
    console.error("Error:", e);
  }
})();
