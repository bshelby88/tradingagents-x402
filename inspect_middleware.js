const expressModule = require("@x402/express");
console.log("expressModule exports:", Object.keys(expressModule));
console.log("paymentMiddleware function signature:");
console.log(expressModule.paymentMiddleware.toString());
