function convertToToon(obj, indent = 0) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") {
    return String(obj);
  }

  const space = " ".repeat(indent);
  let lines = [];

  if (Array.isArray(obj)) {
    const isPrimitiveArray = obj.every(x => typeof x !== "object" || x === null);
    if (isPrimitiveArray) {
      return obj.map(x => String(x === null ? "null" : x)).join(",");
    }

    if (obj.length === 0) return "";
    
    const allKeys = Array.from(new Set(obj.flatMap(x => Object.keys(x || {}))));
    const headerStr = `{${allKeys.join(",")}}`;
    lines.push(headerStr);
    for (const item of obj) {
      const row = allKeys.map(k => {
        const val = item ? item[k] : "";
        if (typeof val === "object") {
          return val === null ? "null" : JSON.stringify(val).replace(/,/g, ";");
        }
        return String(val).replace(/,/g, ";");
      }).join(",");
      lines.push(row);
    }
    return lines.map(l => space + l).join("\n");
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${space}${key}: null`);
    } else if (Array.isArray(value)) {
      const isPrimitiveArray = value.every(x => typeof x !== "object" || x === null);
      if (isPrimitiveArray) {
        lines.push(`${space}${key}[${value.length}]: ${value.map(x => String(x === null ? "null" : x)).join(",")}`);
      } else {
        if (value.length === 0) {
          lines.push(`${space}${key}[0]:`);
        } else {
          const allKeys = Array.from(new Set(value.flatMap(x => Object.keys(x || {}))));
          lines.push(`${space}${key}[${value.length}]{${allKeys.join(",")}}:`);
          for (const item of value) {
            const row = allKeys.map(k => {
              const val = item ? item[k] : "";
              if (typeof val === "object") {
                return val === null ? "null" : JSON.stringify(val).replace(/,/g, ";");
              }
              return String(val).replace(/,/g, ";");
            }).join(",");
            lines.push(space + "  " + row);
          }
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${space}${key}:`);
      lines.push(convertToToon(value, indent + 2));
    } else {
      lines.push(`${space}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

function toonMiddleware(req, res, next) {
  const originalJson = res.json;
  res.json = function(body) {
    const accept = req.headers.accept || req.headers.Accept || "";
    if (accept.includes("text/markdown")) {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      return res.send(convertToToon(body));
    }
    return originalJson.call(this, body);
  };
  next();
}

module.exports = { toonMiddleware, convertToToon };
