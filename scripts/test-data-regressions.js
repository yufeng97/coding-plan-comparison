#!/usr/bin/env node
/* 数据语义回归：真实 data/metrics + 内存校验器 fixtures，零依赖且不修改仓库文件。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const dataPath = path.join(root, "js/data.js");
const dataSource = fs.readFileSync(dataPath, "utf8");
const metricsSource = fs.readFileSync(path.join(root, "js/metrics.js"), "utf8");
const validatorSource = fs.readFileSync(path.join(root, "scripts/validate-data.js"), "utf8");

function load() {
  const box = { console };
  vm.createContext(box);
  vm.runInContext(dataSource + "\n;\n" + metricsSource +
    "\n;globalThis.__D={PLANS,METRICS_RAW,ESTIMATES,UNCERTAIN,RATE_USD_CNY,resolvedField,matchModelRoles,windowTokens,computeMetrics,isFlagshipModelName,hasIncludedModelQuota,isPurchaseCountryAllowed,isPersonalMonthly,isOnSalePlan,isFourWeekPlan};", box);
  return box.__D;
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plan = (d, vendor, name) => {
  const found = d.PLANS.find((p) => p.vendor === vendor && p.plan === name);
  assert.ok(found, `缺少计划 ${vendor}|${name}`);
  return found;
};
const withPrice = (d, m) => {
  const p = plan(d, m.ref[0], m.ref[1]);
  return { ...m, priceM: p.priceM, cur: p.cur, windowPeriod: p.windowPeriod };
};

/* 用虚拟 readFileSync 注入数据变体，运行真实 validate-data.js；真实文件始终只读。 */
function validateFixture(mutation) {
  const output = [];
  const stopped = {};
  let exitCode = 0;
  const fakeFs = {
    ...fs,
    readFileSync(file, options) {
      return path.resolve(String(file)) === path.resolve(dataPath)
        ? dataSource + "\n;\n" + mutation
        : fs.readFileSync(file, options);
    },
  };
  try {
    vm.runInNewContext(validatorSource, {
      __dirname,
      require(name) { return name === "fs" ? fakeFs : require(name); },
      console: Object.fromEntries(["log", "warn", "error"].map((name) => [name, (...args) => output.push(args.join(" "))])),
      process: { exit(code) { exitCode = code; throw stopped; } },
    }, { filename: "validate-data.fixture.js", timeout: 5000 });
  } catch (err) {
    if (err !== stopped) throw err;
  }
  return { exitCode, output: output.join("\n") };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (err) { failed++; console.error("  ✗ " + name + "\n    " + err.message); }
}

test("明确目标不邻近时仍解析，保留追加权益和限制", () => {
  const d = load();
  const plus = plan(d, "OpenCode (Anomaly/SST)", "OpenCode Go Plus");
  assert.match(d.resolvedField(plus, "tools"), /Claude Code/);
  assert.match(d.resolvedField(plus, "tools"), /任意 agent 可用/);
  assert.match(d.resolvedField(plan(d, "Google", "Google AI Ultra（20x）"), "models"), /Project Genie/);
  assert.match(d.resolvedField(plan(d, "OpenAI", "ChatGPT Pro（$500）"), "models"), /Astra Ultrafast/);
  const base = { vendor: "Fixture", plan: "Starter", models: "Claude Opus / Sonnet" };
  const next = { vendor: "Fixture", plan: "Pro", models: "同 Starter；不含 Opus" };
  d.PLANS.push(base, next);
  const text = d.resolvedField(next, "models");
  assert.match(text, /不含 Opus/);
  assert.ok(!d.matchModelRoles(text).some((r) => r.id === "claude-opus"));
});

test("JetBrains 商业 Pro 继承个人 Pro，避免继承相邻 Ultimate", () => {
  const d = load();
  const text = d.resolvedField(plan(d, "JetBrains AI", "AI Pro（商业）"), "quota");
  assert.match(text, /BYOK/);
  assert.match(text, /商业组织计费/);
  assert.doesNotMatch(text, /更高级别用量/);
});

test("fieldRefs 双向和自循环安全返回空串", () => {
  const d = load();
  const a = { vendor: "Cycle", plan: "A", models: "同错误目标", fieldRefs: { models: ["Cycle", "B"] } };
  const b = { vendor: "Cycle", plan: "B", models: "同 A", fieldRefs: { models: ["Cycle", "A"] } };
  d.PLANS.push(a, b);
  assert.equal(d.resolvedField(a, "models"), "");
  a.fieldRefs.models = ["Cycle", "A"];
  assert.equal(d.resolvedField(a, "models"), "");
});

test("Gemini Pro、连字符 Kimi 为旗舰，轻量变体仍排除", () => {
  const d = load();
  for (const name of ["Gemini 3.1 Pro", "Gemini-3.1-Pro", "Kimi-K2.6", "Kimi K2.6", "kimi-k3"]) assert.ok(d.isFlagshipModelName(name), name);
  for (const name of ["Gemini 3.1 Flash", "Kimi-K2.6-mini", "Kimi-K3-Flash"]) assert.equal(d.isFlagshipModelName(name), false, name);
});

for (const [model, upper] of [["GPT-6 Sol", 150], ["GPT-6.1 Sol", 160]]) {
  test(model + " Plus 使用条数 × 单次 tokens 派生区间", () => {
    const d = load();
    const row = d.ESTIMATES.find((m) => m.plan === "ChatGPT Plus" && m.model === model);
    assert.ok(row);
    assert.equal(row.reqLowPer5h, 15);
    assert.equal(row.reqHighPer5h, upper);
    assert.equal(row.tokensLowPerReq, 20000);
    assert.equal(row.tokensHighPerReq, 40000);
    const c = d.computeMetrics(withPrice(d, row));
    assert.ok(c);
    near(c.fLow, 15 * 20000 / 1e6);
    near(c.fHigh, upper * 40000 / 1e6);
    near(c.wkLowM, 1.5);
    near(c.wkHighM, upper * 40000 * 5 / 1e6);
    near(c.moHigh, c.wkHighM * 4.33);
  });
}

test("Cursor 用户消费场景不再作为套餐额度，说明保留", () => {
  const d = load();
  assert.ok(!d.ESTIMATES.some((m) => m.vendor === "Cursor"));
  assert.ok(d.UNCERTAIN.some((text) => text.includes("Cursor") && text.includes("消费情景") && text.includes("$60–100")));
});

for (const period of ["none", "month"]) {
  test(period + " 不生成5h限制，同时保留月量与成本", () => {
    const d = load();
    const input = { priceM: 49, cur: "CNY", creditCNY: 400, apiIn: 1.35, apiOut: 8.1, apiCache: 0.27 };
    const baseline = d.computeMetrics(input);
    const c = d.computeMetrics({ ...input, windowPeriod: period });
    assert.ok(c && baseline);
    for (const key of ["fLow", "fHigh", "val5h", "val5hHi", "r5h", "r5hHi"]) assert.equal(c[key], null, key);
    for (const key of ["moLow", "moHigh", "moMidM", "valMo", "rmo", "costPerM"]) near(c[key], baseline[key]);
  });
}

test("月credits未标周期或周期未知也不生成伪5h上限", () => {
  const d = load();
  for (const period of [undefined, "unknown"]) {
    const c = d.computeMetrics({ priceM: 10, cur: "USD", creditUSD: 70, apiIn: 0.15, apiOut: 0.6, apiCache: 0.003, windowPeriod: period });
    assert.ok(c);
    for (const key of ["fLow", "fHigh", "val5h", "val5hHi", "r5h", "r5hHi"]) assert.equal(c[key], null, key);
    assert.ok(c.moMidM > 0 && c.costPerM > 0);
  }
});

test("4周订阅保留完整表，排除按月价格图与个人月付推荐", () => {
  const d = load();
  const rows = d.PLANS.filter((p) => p.vendor === "AIGoCode");
  assert.equal(rows.length, 3);
  for (const p of rows) {
    assert.equal(d.isFourWeekPlan(p), true);
    assert.equal(d.isPersonalMonthly(p), false);
    assert.equal(d.isOnSalePlan(p), true);
  }
  assert.equal(d.isPersonalMonthly(plan(d, "OpenAI", "ChatGPT Plus")), true);
});

test("真实 Step 月池与 Pro 无5h标记正确", () => {
  const d = load();
  const step = d.METRICS_RAW.find((m) => m.vendor === "阶跃星辰 StepFun" && m.model === "step-3.7-flash");
  const c = d.computeMetrics(withPrice(d, step));
  assert.equal(c.fLow, null);
  near(c.valMo, 400);
  near(c.priceCNY, 49);
  near(c.rmo, 400 / 49);
  near(c.costPerM, 49 * 1.8792 / 400);
  for (const p of d.PLANS.filter((p) => p.vendor === "OpenAI" && /^ChatGPT Pro/.test(p.plan))) assert.equal(p.windowPeriod, "none");
});

test("credits 面值与API牌价跨币种时先换算，价值列保持标价币种", () => {
  const d = load();
  const common = { apiIn: 1, apiOut: 4, apiCache: 0.25 };
  const cny = d.computeMetrics({ ...common, priceM: 10, cur: "CNY", creditUSD: 10 });
  near(cny.valMo, 10 * d.RATE_USD_CNY);
  near(cny.moMidM, 10 * d.RATE_USD_CNY / 1.03);
  near(cny.costPerM, 10 / cny.moMidM);
  const usd = d.computeMetrics({ ...common, priceM: 2, cur: "USD", creditCNY: 10 * d.RATE_USD_CNY });
  near(usd.valMo, 10);
  near(usd.moMidM, 10 / 1.03);
  near(usd.priceCNY, 2 * d.RATE_USD_CNY);
  near(usd.rmo, 5);
});

test("无效价、额度、缓存价格与不完整区间直接拒绝", () => {
  const d = load();
  const base = { priceM: 49, cur: "CNY", creditCNY: 400, apiIn: 1.35, apiOut: 8.1, apiCache: 0.27 };
  for (const field of ["priceM", "creditCNY", "apiIn", "apiOut", "apiCache"]) {
    for (const bad of [NaN, Infinity, -1]) assert.equal(d.computeMetrics({ ...base, [field]: bad }), null, field + "=" + bad);
  }
  assert.equal(d.computeMetrics({ ...base, apiCache: 2 }), null);
  assert.equal(d.computeMetrics({ ...base, apiOut: undefined }), null);
  assert.equal(d.computeMetrics({ ...base, creditUSD: 1 }), null);
  assert.equal(d.windowTokens({ reqLowPer5h: 15, reqHighPer5h: 10, tokensLowPerReq: 20000, tokensHighPerReq: 40000 }), null);
  assert.equal(d.windowTokens({ reqLowPer5h: 15 }), null);
  assert.equal(d.windowTokens({ wkLowM: Infinity }), null);
  assert.equal(d.windowTokens({ reqPer5h: -1 }), null);
});

test("国家限定档默认不满足，印度明确满足；BYOK不计免费推理", () => {
  const d = load();
  const start = plan(d, "Cursor", "Start（印度专属）");
  assert.equal(start.windowPeriod, "month");
  assert.equal(d.isPurchaseCountryAllowed(start), false);
  assert.equal(d.isPurchaseCountryAllowed(start, "US"), false);
  assert.equal(d.isPurchaseCountryAllowed(start, "in"), true);
  assert.equal(d.isPurchaseCountryAllowed(plan(d, "Cursor", "Pro")), true);
  assert.equal(d.hasIncludedModelQuota(plan(d, "Kilo Code", "Free（BYOK/零加价）")), false);
  for (const [vendor, name] of [["Zed", "Free"], ["Cline", "开源版 + 按量充值"], ["Roo Code（Roomote）", "自托管（≤10 用户）"]]) {
    assert.equal(d.hasIncludedModelQuota(plan(d, vendor, name)), false, vendor);
  }
  assert.equal(d.hasIncludedModelQuota(plan(d, "OpenAI", "ChatGPT Plus")), true);
  assert.equal(plan(d, "Google", "Google AI Plus").codingSurface, false);
});

test("明确附赠编码工具的计划保持编程入口资格", () => {
  const d = load();
  for (const name of ["SuperGrok", "SuperGrok Plus", "SuperGrok Heavy"]) {
    const p = plan(d, "xAI", name);
    assert.equal(p.codingSurface, true, name);
    assert.match(p.tools, /Grok Build/);
    assert.equal(d.hasIncludedModelQuota(p), true);
  }
  const canopy = plan(d, "Canopy Wave", "Coding Plan Pro Bundle");
  assert.equal(canopy.codingSurface, true);
  assert.match(canopy.tools, /Kilo Code.*OpenCode.*Cline.*Roo Code/);
  assert.equal(d.hasIncludedModelQuota(canopy), true);
  assert.notEqual(plan(d, "xAI", "SuperGrok Lite").codingSurface, true);
});

test("真实数据校验通过（内存运行）", () => {
  const result = validateFixture("");
  assert.equal(result.exitCode, 0, result.output);
});
for (const [label, mutation, expected] of [
  ["NaN 月费", "PLANS.find(p=>p.vendor==='Google'&&p.plan==='Google AI Pro').priceM=NaN;", /priceM 必须为有限非负数/],
  ["Infinity 月费", "PLANS.find(p=>p.vendor==='Google'&&p.plan==='Google AI Pro').priceM=Infinity;", /priceM 必须为有限非负数/],
  ["负月费", "PLANS.find(p=>p.vendor==='Google'&&p.plan==='Google AI Pro').priceM=-1;", /priceM 必须为有限非负数/],
  ["Infinity API 价", "API_PRICES[0].inUSD=Infinity;", /缺有限非负/],
  ["负输出价", "METRICS_RAW[0].apiOut=-1;", /缺完整有限牌价/],
  ["过高缓存价", "METRICS_RAW[0].apiCache=METRICS_RAW[0].apiIn+1;", /缺完整有限牌价/],
  ["倒置官方条数区间", "ESTIMATES.find(m=>m.model==='GPT-6.1 Sol').reqHighPer5h=1;", /区间上下限颠倒/],
]) {
  test("校验器拒绝 " + label + " fixture", () => {
    const result = validateFixture(mutation);
    assert.equal(result.exitCode, 1, result.output);
    assert.match(result.output, expected);
  });
}

console.log(`\n数据回归：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
