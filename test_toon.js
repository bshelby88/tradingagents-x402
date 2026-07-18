const { convertToToon } = require("./toon_middleware");
const assert = require("assert");

const samplePayload = {
  ok: true,
  test_info: {
    service: "Self-Test",
    version: "1.0.0",
    primitives: [100, 200, "three", null]
  },
  items: [
    { id: 1, label: "Item A" },
    { id: 2, label: "Item B" }
  ]
};

console.log("=== Serializing TOON for Verification ===");
try {
  const toonResult = convertToToon(samplePayload);
  console.log(toonResult);
  
  // Assertions
  assert(toonResult.includes("ok: true"), "Missing ok: true");
  assert(toonResult.includes("service: Self-Test"), "Missing service field");
  assert(toonResult.includes("primitives[4]: 100,200,three,null"), "Incorrect primitive array formatting");
  assert(toonResult.includes("items[2]{id,label}:"), "Incorrect object array header formatting");
  assert(toonResult.includes("1,Item A"), "Incorrect object array row 1 formatting");
  assert(toonResult.includes("2,Item B"), "Incorrect object array row 2 formatting");
  
  console.log("\n[+] TOON middleware verification passed successfully!");
  process.exit(0);
} catch (e) {
  console.error("\n[-] TOON verification failed:", e.message);
  process.exit(1);
}
