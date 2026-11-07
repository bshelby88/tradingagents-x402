const { HTTPFacilitatorClient, x402ResourceServer } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");

// Use the public x402.org testnet facilitator as a fallback to see what it returns
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register("eip155:84532", new ExactEvmScheme());

(async () => {
  try {
    console.log("Initializing x402 server...");
    await x402Server.initialize();
    console.log("Initialization success!");
    
    // Inspect facilitator configurations
    console.log("Facilitator config:");
    // Let's print out what supported kinds exist in the client
    const supported = facilitatorClient.supportedKinds || {};
    console.log(JSON.stringify(supported, null, 2));
    
    // Let's check what schemes are registered in the server
    console.log("Registered schemes on server:");
    console.log(Array.from(x402Server.schemes.keys()));
    
    // Test if a dummy processHTTPRequest passes the checks
    // We mock a request that would trigger processHTTPRequest
    console.log("Testing processHTTPRequest checks...");
    const dummyReq = {
      method: "POST",
      url: "/api/analyze-ticker",
      headers: {
        "x-payment": "some-payment-header"
      }
    };
    
    // Check if the exact scheme is indeed supported by the facilitator on Sepolia
    const hasExact = x402Server.facilitatorClient.supportsKind("eip155:84532", "exact");
    console.log("Supports exact on eip155:84532?", hasExact);
    
  } catch (e) {
    console.error("Error during check:", e);
  }
})();
