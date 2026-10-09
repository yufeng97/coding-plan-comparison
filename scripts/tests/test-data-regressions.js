#!/usr/bin/env node
/* 数据语义回归：真实 data/metrics + 内存校验器 fixtures，零依赖且不修改仓库文件。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..", "..");
const dataPath = path.join(root, "js/data.js");
const dataSource = fs.readFileSync(dataPath, "utf8");
const metricsSource = fs.readFileSync(path.join(root, "js/metrics.js"), "utf8");
const validatorSource = fs.readFileSync(path.join(root, "scripts/build/validate-data.js"), "utf8");

function load() {
  const box = { console };
  vm.createContext(box);
  vm.runInContext(dataSource + "\n;\n" + metricsSource +
    "\n;globalThis.__D={PLANS,METRICS_RAW,ESTIMATES,UNCERTAIN,RATE_USD_CNY,resolvedField,matchModelRoles,windowTokens,computeMetrics,isFlagshipModelName,hasIncludedModelQuota,isPurchaseCountryAllowed,isPersonalMonthly,isOnSalePlan,isFourWeekPlan,findPlanReference,hasOwnClient};", box);
  return box.__D;
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plan = (d, vendor, name) => {
  const found = d.PLANS.find((p) => p.vendor === vendor && p.plan === name);
  assert.ok(found, `缺少计划 ${vendor}|${name}`);
  return found;
};
const withPrice = (d, m) => {
  const p = d.findPlanReference(m.ref);
  assert.ok(p, `未解析的价格引用 ${JSON.stringify(m.ref)}`);
  return { ...m, priceM: p.priceM, cur: p.cur, windowPeriod: p.windowPeriod };
};

/* 用虚拟 readFileSync 注入数据变体，运行真实 validate-data.js；真实文件始终只读。 */
function validateFixture(mutation, options = {}) {
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
    vm.runInNewContext(validatorSource + `\n;if (!printReport(module.exports.validateData(${JSON.stringify(options)}))) process.exit(1);`, {
      __dirname: path.join(root, "scripts", "build"),
      require(name) { return name === "fs" ? fakeFs : require(name); },
      module: { exports: {} },
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

/** @type {[string, number][]} */
const modelRanges = [["GPT-6 Sol", 150], ["GPT-6.1 Sol", 160]];
for (const [model, upper] of modelRanges) {
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

test("MiMo、TokenHub与Canopy真实月额度不输出伪5h，并保留月量与成本", () => {
  const d = load();
  const vendors = ["小米 MiMo", "腾讯云 TokenHub", "Canopy Wave"];
  const rows = d.METRICS_RAW.filter((m) => vendors.includes(m.vendor));
  assert.equal(rows.length, 19);
  for (const row of rows) {
    const input = withPrice(d, row);
    assert.equal(input.windowPeriod, "month", row.ref);
    const c = d.computeMetrics(input);
    assert.ok(c, row.ref);
    for (const field of ["fLow", "fHigh", "val5h", "val5hHi", "r5h", "r5hHi"]) assert.equal(c[field], null, row.ref + " " + field);
    const windows = d.windowTokens(input);
    near(c.moLow, windows.moLow);
    assert.ok(c.costPerM > 0 && c.valMo > 0 && c.rmo > 0, row.ref);
  }
  const lite = rows.find((m) => m.ref === "plan-0167" && m.model === "mimo-v2.6-flash");
  const c = d.computeMetrics(withPrice(d, lite));
  near(c.moLow, 90.070495);
  near(c.costPerM, 39 / 90.070495);
  for (const p of d.PLANS.filter((p) => p.vendor === "小米 MiMo")) assert.equal(p.windowPeriod, "month", p.id);
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

test("模型继承展开可检索，局部排除不混淆模型可用性", () => {
  const d = load();
  for (const name of ["Pro+", "Max"]) {
    const text = d.resolvedField(plan(d, "GitHub Copilot", name), "models");
    assert.match(text, /Luna/);
    assert.match(text, /Grok/);
    assert.match(text, /Opus/);
  }
  const small = plan(d, "火山引擎方舟（字节）", "方舟 Agent Plan（Small）");
  assert.ok(!d.matchModelRoles(small.models).some((r) => r.id === "kimi-k3"));
  assert.deepEqual(Array.from(small.modelExcludes), ["Kimi-K3"]);
  for (const name of ["SuperGrok", "SuperGrok Plus"]) assert.ok(d.hasOwnClient(plan(d, "xAI", name)));
  const a = { vendor: "Model Cycle", plan: "A", id: "model-cycle-a", models: "A", modelBaseRef: "model-cycle-b" };
  const b = { vendor: "Model Cycle", plan: "B", id: "model-cycle-b", models: "B", modelBaseRef: "model-cycle-a" };
  d.PLANS.push(a, b);
  assert.equal(d.resolvedField(a, "models"), "");
});

test("永久 ID 在改名和重排后保持引用与权益继承", () => {
  const d = load();
  const original = plan(d, "Cursor", "Pro");
  const inherited = d.PLANS.find((p) => p.fieldRefs?.models === original.id);
  assert.ok(inherited);
  const before = d.resolvedField(inherited, "models");
  original.vendor = "改名厂商";
  original.plan = "改名计划";
  d.PLANS.reverse();
  assert.equal(d.findPlanReference(original.id), original);
  assert.equal(d.resolvedField(inherited, "models"), before);
  assert.equal(d.findPlanReference(["改名厂商", "改名计划"]), original);
  assert.equal(d.findPlanReference("plan-missing"), null);
});

test("所有继承权益在整表更名重排后保持不变", () => {
  const d = load();
  const previous = new Map();
  for (const p of d.PLANS) for (const field of ["models", "tools", "quota"]) previous.set(p.id + "|" + field, d.resolvedField(p, field));
  d.PLANS.reverse();
  for (const p of d.PLANS) { p.vendor = "厂商 " + p.id; p.plan = "档位 " + p.id; }
  for (const p of d.PLANS) for (const field of ["models", "tools", "quota"]) assert.equal(d.resolvedField(p, field), previous.get(p.id + "|" + field));
});

test("真实数据校验通过（内存运行）", () => {
  const result = validateFixture("");
  assert.equal(result.exitCode, 0, result.output);
});

test("讯飞官方请求额度先除模型系数2，异版本牌价代理留在低置信估算", () => {
  const d = load();
  assert.equal(d.METRICS_RAW.some(m => m.ref === "plan-0082"), false);
  const rows = d.ESTIMATES.filter(m => m.ref === "plan-0082");
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.model, "deepseek-v4-flash");
  assert.deepEqual([row.reqPer5h, row.reqPerWk, row.reqPerMo], [6000 / 2, 45000 / 2, 90000 / 2]);
  assert.equal(row.isEst, true);
  assert.equal(row.confidence, "低");
  assert.match(row.confidenceReason, /旧版.*未核实/);
  assert.match(row.note, /0\.8.*未折入/);
  assert.match(row.note, /不同版本.*V4\.1/);
  near(row.apiIn, 0.15 * d.RATE_USD_CNY);
  near(row.apiOut, 0.60 * d.RATE_USD_CNY);
  near(row.apiCache, 0.003 * d.RATE_USD_CNY);
  const c = d.computeMetrics(withPrice(d, row));
  assert.ok(c);
  near(c.fLow, 60);
  near(c.wkLowM, 450);
  near(c.moLow, 900);
  near(c.costPerM, 199 / 900);
});
test("ref解析后的牌价数值锚点校验能发现合法数值漂移", () => {
  const result = validateFixture("METRICS_RAW[0].apiIn=9;");
  assert.equal(result.exitCode, 0, result.output);
  assert.match(result.output, /指标行牌价与 API_PRICES 同厂商同型号条目数值不同/);
});
/** @type {[string, string, RegExp][]} */
const invalidFixtures = [
  ["重复永久ID", "PLANS[1].id=PLANS[0].id;", /重复 id/],
  ["缺失永久ID", "delete PLANS[0].id;", /缺有效永久 id/],
  ["无效ID引用", "METRICS_RAW[0].ref='plan-missing';", /ref 无法解析/],
  ["ref计划与API锚点币种不一致", "PLANS.find(p=>p.id==='plan-0157').cur='USD';", /指标行牌价币种与 API_PRICES/],
  ["原始币种不能覆盖ref计划币种", "PLANS.find(p=>p.id==='plan-0157').cur='USD';METRICS_RAW[0].cur='CNY';", /指标行牌价币种与 API_PRICES/],
  ["NaN 月费", "PLANS.find(p=>p.vendor==='Google'&&p.plan==='Google AI Pro').priceM=NaN;", /priceM 必须为有限非负数/],
  ["Infinity 月费", "PLANS.find(p=>p.vendor==='Google'&&p.plan==='Google AI Pro').priceM=Infinity;", /priceM 必须为有限非负数/],
  ["负月费", "PLANS.find(p=>p.vendor==='Google'&&p.plan==='Google AI Pro').priceM=-1;", /priceM 必须为有限非负数/],
  ["Infinity API 价", "API_PRICES[0].inUSD=Infinity;", /缺有限非负/],
  ["负输出价", "METRICS_RAW[0].apiOut=-1;", /缺完整有限牌价/],
  ["过高缓存价", "METRICS_RAW[0].apiCache=METRICS_RAW[0].apiIn+1;", /缺完整有限牌价/],
  ["倒置官方条数区间", "ESTIMATES.find(m=>m.model==='GPT-6.1 Sol').reqHighPer5h=1;", /区间上下限颠倒/],
  ["用户可见文字含内部字段名", "PLANS.find(p=>p.id==='plan-0149').quota='按席位订阅（priceY=null）';", /内部字段名或开发用语/],
  ["核查说明含开发用语", "PRICE_CHECKS.rows['plan:plan-0002'].reason='确认后 seat 会使其退出 isPersonalMonthly';", /内部字段名或开发用语/],
  ["晚于今天的数据版本", "META.updated='2062-10-09';", /META\.updated 2062-10-09 晚于今天/],
  ["晚于今天的逐行核查日期", "PRICE_CHECKS.rows['plan:plan-0002'].checkedAt='2062-10-09';", /核查日期晚于今天/],
  ["sameAs 指向不存在的主条目", "PLANS.find(p=>p.id==='plan-0109').sameAs='plan-9999';", /sameAs 必须指向/],
  ["sameAs 与主条目价格不一致", "PLANS.find(p=>p.id==='plan-0109').priceM=25;", /sameAs 的主条目价格与币种必须相同/],
  ["单月价低于连续包月标价", "PLANS.find(p=>p.id==='plan-0197').singleMonthPrice=5;", /singleMonthPrice/],
  ["非法售罄标记", "PLANS.find(p=>p.id==='plan-0043').availability='maybe';", /availability 只能是 sold-out/],
  ["厂商自估周额度不成对", "delete METRICS_RAW.find(m=>m.ref==='plan-0031'&&m.model==='GLM-5.3').vendorWkHighM;", /vendorWkLowM\/vendorWkHighM/],
];
for (const [label, mutation, expected] of invalidFixtures) {
  test("校验器拒绝 " + label + " fixture", () => {
    const result = validateFixture(mutation);
    assert.equal(result.exitCode, 1, result.output);
    assert.match(result.output, expected);
  });
}

test("校验器提示已结束的限时活动、复制的周额度与过期首页日期，但不阻断同步", () => {
  const result = validateFixture([
    "PLANS.find(p=>p.id==='plan-0157').note+='；双节活动（09-25~10-07）全天按非高峰消耗';",
    "PLANS.find(p=>p.id==='plan-0066').note+='；截至 2026-10-04 的用量说明';",
    "METRICS_RAW.find(m=>m.ref==='plan-0032'&&m.model==='GLM-5.3').wkLowM=METRICS_RAW.find(m=>m.ref==='plan-0031'&&m.model==='GLM-5.3').wkLowM;",
    "METRICS_RAW.find(m=>m.ref==='plan-0032'&&m.model==='GLM-5.3').wkHighM=METRICS_RAW.find(m=>m.ref==='plan-0031'&&m.model==='GLM-5.3').wkHighM;",
    "META.updated='2026-10-10';",
  ].join("\n"));
  assert.equal(result.exitCode, 0, result.output);
  assert.match(result.output, /已结束的限时活动日期.*plan-0157（09-25~10-07）/);
  assert.doesNotMatch(result.output, /plan-0066（至/, "「截至」是时点说明，不是活动截止");
  assert.match(result.output, /相同周额度但额度原文不同.*plan-0031.*plan-0032/);
  assert.match(result.output, /#heroDate 的静态日期 .* 与 META\.updated 2026-10-10 不一致/);
});

test("核查说明改写去掉字段名与「库存」术语，保留真实商品库存的说法", () => {
  const box = { console };
  vm.createContext(box);
  vm.runInContext(dataSource + "\n;globalThis.__R={displayPriceReason,INTERNAL_TEXT_RE,PRICE_CHECKS};", box);
  const { displayPriceReason, INTERNAL_TEXT_RE, PRICE_CHECKS } = box.__R;
  assert.equal(displayPriceReason("官方订阅表未列年付价，保持 priceY=null。"), "官方订阅表未列年付价，保持 年付折月价为空（官方未列）。");
  assert.equal(displayPriceReason("确认美元正常月费与库存相同"), "确认美元正常月费与本站原记录相同");
  assert.equal(displayPriceReason("实际库存及活动以下单页为准"), "实际库存及活动以下单页为准");
  const kiro = displayPriceReason(PRICE_CHECKS.rows["plan:plan-0075"].reason);
  assert.doesNotMatch(kiro, INTERNAL_TEXT_RE);
  assert.match(kiro, /个人月付与推荐范围/);
  assert.match(kiro, /保持本站原记录个人分类/);
  assert.doesNotMatch(displayPriceReason("full seat $40/月；flex seat 无固定费"), INTERNAL_TEXT_RE, "产品席位名称仍可正常显示");
  for (const row of Object.values(PRICE_CHECKS.rows)) assert.doesNotMatch(displayPriceReason(row.reason), INTERNAL_TEXT_RE);
});

test("同一订阅的重复条目、售罄预付包与已停止的 Gemini CLI 免费档不再作为可购或免费入口", () => {
  const box = { console };
  vm.createContext(box);
  vm.runInContext(dataSource + "\n;globalThis.__R={PLANS,isFreeCodingEntry,isOnSalePlan,isPersonalMonthly,offerable,isSoldOut,isDuplicateListing,isRetiredPlan};", box);
  const d = box.__R;
  const byId = (id) => d.PLANS.find((p) => p.id === id);
  for (const id of ["plan-0108", "plan-0109", "plan-0110"]) {
    assert.ok(d.isDuplicateListing(byId(id)), id);
    assert.equal(d.isFreeCodingEntry(byId(id)) || d.isOnSalePlan(byId(id)) || d.isPersonalMonthly(byId(id)) || d.offerable(byId(id)), false, id);
  }
  assert.ok(d.isFreeCodingEntry(byId("plan-0104")) && d.isOnSalePlan(byId("plan-0105")), "Devin Desktop 主条目保留");
  for (const id of ["plan-0043", "plan-0044", "plan-0045"]) assert.ok(d.isSoldOut(byId(id)) && !d.offerable(byId(id)) && d.isOnSalePlan(byId(id)), id);
  assert.ok(d.isRetiredPlan(byId("plan-0020")) && !d.isFreeCodingEntry(byId("plan-0020")), "Gemini CLI 个人免费档 2026-06-18 已停止服务");
  assert.equal(byId("plan-0197").singleMonthPrice, 15);
});

test("核查日期容差按北京时间跨日，注入无效时间报告校验错误", () => {
  const mutation = "META.updated='2026-10-10';";
  const beforeMidnight = validateFixture(mutation, { now: "2026-10-08T15:59:59Z" });
  assert.equal(beforeMidnight.exitCode, 1, beforeMidnight.output);
  assert.match(beforeMidnight.output, /META\.updated 2026-10-10 晚于今天/);
  const afterMidnight = validateFixture(mutation, { now: "2026-10-08T16:00:00Z" });
  assert.equal(afterMidnight.exitCode, 0, afterMidnight.output);
  assert.match(validateFixture("", { now: "invalid" }).output, /校验时间无效/);
  assert.doesNotMatch(validateFixture("", { now: 0 }).output, /校验时间无效/, "Unix epoch 是有效的注入时间");
});

console.log(`\n数据回归：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
