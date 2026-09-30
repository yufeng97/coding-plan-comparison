// 一次性脚本：validate-data.js 的 PLAN_TOKENS 价格改为 ref 解析
const fs = require("fs");
const FILE = "D:/workbuddy/coding-plan-comparison/scripts/validate-data.js";
let s = fs.readFileSync(FILE, "utf8");
const anchor = "  check(t.priceCNY != null || t.priceUSD != null, `缺价格: ${key}`);";
if (!s.includes(anchor)) throw new Error("anchor not found");
const replacement = `  let priceCNY = t.priceCNY != null ? t.priceCNY : t.priceUSD != null ? t.priceUSD * RATE_USD_CNY : null;
  if (Array.isArray(t.ref)) {
    const p = idx.get(t.ref[0] + "|" + t.ref[1]);
    check(!!p, \`PLAN_TOKENS ref 无法解析: \${t.ref.join("|")}\`);
    if (p) priceCNY = p.cur === "USD" ? p.priceM * RATE_USD_CNY : p.priceM;
  }
  check(priceCNY != null, \`缺价格(且无有效 ref): \${key}\`);`;
s = s.replace(anchor, replacement);
fs.writeFileSync(FILE, s);
console.log("校验器已支持 ref 解析 PLAN_TOKENS");
