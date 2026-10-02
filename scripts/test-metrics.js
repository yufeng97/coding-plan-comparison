#!/usr/bin/env node
/* ============================================================
 * 额度换算与模型分类的单元测试：node scripts/test-metrics.js
 * 零依赖（node:assert + vm），载入 js/data.js + js/metrics.js 后
 * 用手算基准值锁定公式。改动换算假设（缓存率、80/20、4.33 等）
 * 或旗舰正则后必须跑本脚本；退出码 0=通过 1=失败。
 * ============================================================ */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");

const src = ["js/data.js", "js/metrics.js"]
  .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
  .join("\n;\n");
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + "\n;globalThis.__T={computeMetrics,blendPrice,windowTokens,periodRates,fmtTok,isFlagshipModelName,matchModelRoles,WEEKS_PER_MONTH,SLOTS_PER_WEEK,CACHE_HIT_RATE,API_MIX_IN,API_MIX_OUT,TOKENS_PER_REQ};", sandbox, { filename: "metrics-test" });
const { computeMetrics, blendPrice, windowTokens, periodRates, fmtTok, isFlagshipModelName, matchModelRoles } = sandbox.__T;

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (err) { failed++; console.error("  ✗ " + name + "\n    " + err.message); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

console.log("blendPrice（80/20 + 95% 缓存）");
test("GLM-5.3 国内牌价 ¥8/¥28/缓存¥2 → 混合价 7.44", () => {
  assert.ok(near(blendPrice({ apiIn: 8, apiOut: 28, apiCache: 2 }), 7.44));
});
test("Claude Sonnet 5 牌价 $2/$10/缓存$0.2 → 混合价 2.232", () => {
  assert.ok(near(blendPrice({ apiIn: 2, apiOut: 10, apiCache: 0.2 }), 2.232));
});
test("缓存价越高混合价越低", () => {
  assert.ok(blendPrice({ apiIn: 2, apiOut: 10, apiCache: 0.2 }) < blendPrice({ apiIn: 2, apiOut: 10, apiCache: 2 }));
});

console.log("windowTokens（周 tokens → 5h/月展开）");
test("48–104M/周 → 5h 9.6–20.8M、月 207.84–450.32M", () => {
  const w = windowTokens({ wkLowM: 48, wkHighM: 104 });
  assert.ok(near(w.fLow, 9.6) && near(w.fHigh, 20.8));
  assert.ok(near(w.moLow, 207.84) && near(w.moHigh, 450.32));
});
test("wkHighM 缺省时视为单值区间", () => {
  const w = windowTokens({ wkLowM: 10 });
  assert.ok(near(w.wkHighM, 10) && near(w.fHigh, 2));
});
test("请求数制：reqPerWk=2 → 0.04M/周（20K/请求）", () => {
  const w = windowTokens({ reqPerWk: 2 });
  assert.ok(near(w.wkLowM, 0.04) && near(w.moLow, 0.1732, 1e-9));
});
test("请求数制：只有 reqPer5h=100 → 2M/5h、10M/周", () => {
  const w = windowTokens({ reqPer5h: 100 });
  assert.ok(near(w.wkLowM, 10) && near(w.fLow, 2) && near(w.moLow, 43.3, 1e-9));
});
test("无任何口径 → null", () => {
  assert.strictEqual(windowTokens({}), null);
});

console.log("periodRates（分母为时段分摊月费）");
test("月费 21.65、各时段价值 1 → r5h=1、rwk=0.2、rmo≈0.0462", () => {
  const r = periodRates(1, 1, 1, 21.65);
  assert.ok(near(r.r5h, 1));
  assert.ok(near(r.rwk, 4.33 / 21.65));
  assert.ok(near(r.rmo, 1 / 21.65));
});
test("月费非正 → null", () => {
  assert.strictEqual(periodRates(1, 1, 1, 0), null);
});

console.log("computeMetrics（周 tokens 制端到端）");
test("GLM V3 Lite（¥118、48–104M/周）→ 每 M ≈ ¥0.3586、月倍率 ≈ 20.75×", () => {
  const c = computeMetrics({ priceM: 118, cur: "CNY", wkLowM: 48, wkHighM: 104, apiIn: 8, apiOut: 28, apiCache: 2 });
  assert.ok(c, "应返回结果");
  assert.ok(near(c.priceCNY, 118));
  assert.ok(near(c.moMidM, 329.08, 1e-9), "moMidM=" + c.moMidM);
  assert.ok(near(c.costPerM, 118 / 329.08, 1e-9));
  assert.ok(near(c.rmo, (207.84 * 7.44) / 118, 1e-9), "月倍率按 moLow 折算，实际 " + c.rmo);
  assert.ok(near(c.r5hHi / c.r5h, 104 / 48, 1e-9), "上限/下限倍率应等于区间比");
});
test("缺 api 牌价 → null（无法折算）", () => {
  assert.strictEqual(computeMetrics({ priceM: 118, cur: "CNY", wkLowM: 48 }), null);
});

console.log("computeMetrics（credits 制）");
test("Command Code Go（$1、$10 credits、有牌价）→ 每 M ≈ $0.0753×汇率、月倍率 = 杠杆 10×", () => {
  const c = computeMetrics({ priceM: 1, cur: "USD", creditUSD: 10, apiIn: 0.15, apiOut: 0.47, apiCache: 0.016 });
  assert.ok(c, "应返回结果");
  assert.ok(near(c.rmo, 10), "月倍率应等于面值杠杆 10，实际 " + c.rmo);
  assert.ok(near(c.costPerM, 6.71 / (10 / blendPrice({ apiIn: 0.15, apiOut: 0.47, apiCache: 0.016 })), 1e-9));
});
test("无牌价美元 credits：每 M 按假设均价 ¥10/M → $1 买 $10 credits ≈ ¥1/M", () => {
  const c = computeMetrics({ priceM: 1, cur: "USD", creditUSD: 10 });
  assert.ok(c);
  assert.strictEqual(c.moLow, null, "无牌价不出 token 列");
  assert.ok(near(c.costPerM, 1));
});
test("credits 面值非正 → null", () => {
  assert.strictEqual(computeMetrics({ priceM: 1, cur: "USD", creditUSD: 0 }), null);
});

console.log("fmtTok");
test("207.84 → 208M；2047 → 2.0B；0.092 → 0.09M", () => {
  assert.strictEqual(fmtTok(207.84), "208M");
  assert.strictEqual(fmtTok(2047), "2.0B");
  assert.strictEqual(fmtTok(0.092), "0.09M");
});

console.log("isFlagshipModelName（旗舰判定）");
const flagship = ["Claude Opus 5.5", "Claude Sonnet 5", "Claude Fable 5.1", "GPT-6 Sol", "GPT-6.1 Sol", "GPT-5.6", "Kimi K3", "kimi-k3", "DeepSeek V4 Pro", "deepseek-v4-pro", "MiniMax M3", "MiMo Pro", "Qwen3-Max", "qwen3-coder-plus", "qwen3-coder-next", "Doubao Seed 2.0 Pro", "GLM-5.3", "GLM 5.2", "Step 5", "Hy3", "hy4"];
const lightweight = ["GLM-5.3-Flash", "Claude Haiku 4.5", "GPT-6 Luna", "GPT-5 mini", "Gemini Flash", "Luna", "nano"];
for (const m of flagship) {
  test("旗舰：" + m, () => assert.ok(isFlagshipModelName(m), m + " 应判为旗舰"));
}
for (const m of lightweight) {
  test("轻量：" + m, () => assert.ok(!isFlagshipModelName(m), m + " 不应判为旗舰"));
}
test("混合列表任一旗舰即整体算旗舰", () => {
  assert.ok(isFlagshipModelName("GLM-5.3-Flash、Kimi K3"));
});
test("空值安全", () => {
  assert.strictEqual(isFlagshipModelName(""), false);
  assert.strictEqual(isFlagshipModelName(null), false);
});

console.log("matchModelRoles（「不含旗舰」等否定语义回归）");
test("仅 Flash 的写法不匹配 GLM-5 复杂角色", () => {
  const ids = matchModelRoles("GLM-5.3-Flash").map((r) => r.id);
  assert.ok(ids.includes("flash") && !ids.includes("glm-5"));
});
test("「不含 Opus」的套餐不匹配 Opus", () => {
  const ids = matchModelRoles("Claude Sonnet 5 / Haiku 4.5（不含 Opus）").map((r) => r.id);
  assert.ok(!ids.includes("claude-opus") && ids.includes("sonnet"));
});
test("需另购 credits 的 Fable 不算进套餐", () => {
  const ids = matchModelRoles("Claude Opus 5.5 / Sonnet 5 / Haiku 4.5（Fable 5.1 需 usage credits）").map((r) => r.id);
  assert.ok(ids.includes("claude-opus") && !ids.includes("claude-fable"));
});

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
