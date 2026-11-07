const core = require("@x402/core/server");
const evm = require("@x402/evm/exact/server");

console.log("Core exports:", Object.keys(core));
console.log("EVM exports:", Object.keys(evm));

const client = new core.HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
console.log("HTTPFacilitatorClient prototype methods:", Object.getOwnPropertyNames(core.HTTPFacilitatorClient.prototype));
console.log("x402ResourceServer prototype methods:", Object.getOwnPropertyNames(core.x402ResourceServer.prototype));

// Let's print out what methods/properties are on client instance
console.log("Client instance keys:", Object.keys(client));
console.log("Client instance properties:");
for (let prop in client) {
  console.log(`- ${prop}: ${typeof client[prop]}`);
}
