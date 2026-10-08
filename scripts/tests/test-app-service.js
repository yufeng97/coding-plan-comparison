#!/usr/bin/env node
/* 费用、套餐参考、计算 URL 与本机预设回归；沿 index.html 加载真实 service/state，零网络。 */
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plain = (value) => JSON.parse(JSON.stringify(value));
const usdApi = { cur: "USD", inUSD: 2, outUSD: 10, cacheUSD: 0.2 };
/** @param {Record<string, string | number>} [api] */
function workload(app, changes = {}, api = usdApi) {
  return app.run(`calculateWorkload({ ...APP_DEFAULTS.calc, ...${JSON.stringify(changes)} }, ${JSON.stringify(api)})`);
}

test("80%输入的缓存折扣只作用于输入，人民币预算按换算单价计算", () => {
  const app = createApp();
  const c = workload(app, { cache: "50", cachePrice: "0.2", budget: "100" });
  // 44M总量：17.6M普通输入、17.6M缓存输入、8.8M输出，分别付35.2/3.52/88美元。
  near(c.monthlyM, 44);
  near(c.blended, 2.88);
  near(c.costNative, 126.72);
  const rate = app.run("RATE_USD_CNY");
  near(c.costCNY, 126.72 * rate);
  near(c.noCacheCNY, 158.4 * rate);
  near(c.monthlyBudgetM, 100 / (2.88 * rate));
  healthy(app);
});

test("未填写缓存价时不采用虚构折扣或自动挪用API缓存价", () => {
  const app = createApp();
  const ordinary = workload(app, { cache: "0", cachePrice: "" });
  const cached = workload(app, { cache: "100", cachePrice: "" });
  near(ordinary.costNative, 158.4);
  near(cached.costNative, 158.4);
  near(cached.costCNY, cached.noCacheCNY);
  assert.ok(workload(app, { cache: "100", cachePrice: "0.2" }).costNative < cached.costNative);
  app.run('Object.assign(calcState, { cache: "100", cachePrice: "" }); renderCostCalculator();');
  assert.match(app.elements.get("costResult").innerHTML, /未填写缓存单价，按普通输入价估算/);
  healthy(app);
});

test("人民币模型、纯输入输出、零请求及零单价的边界有明确结果", () => {
  const app = createApp();
  const api = { cur: "CNY", inCNY: 8, outCNY: 28 };
  const c = workload(app, { cache: "50", cachePrice: "2", budget: "96" }, api);
  near(c.blended, 9.6);
  near(c.costNative, 422.4);
  near(c.costCNY, 422.4);
  near(c.monthlyBudgetM, 10);
  near(workload(app, { input: "0", cache: "100", cachePrice: "2" }, api).blended, 28);
  near(workload(app, { input: "100", cache: "0", cachePrice: "2" }, api).blended, 8);
  near(workload(app, { input: "100", cache: "100", cachePrice: "2" }, api).blended, 2);
  const idle = workload(app, { requests: "0", budget: "0" }, api);
  assert.equal(idle.monthlyM, 0);
  assert.equal(idle.costCNY, 0);
  assert.equal(idle.monthlyBudgetM, 0);
  const free = workload(app, { input: "100", cache: "100", cachePrice: "0" }, api);
  assert.equal(free.costCNY, 0);
  assert.equal(free.monthlyBudgetM, null, "零单价不能输出Infinity覆盖量");
  healthy(app);
});

test("非法工作量和高于输入价的缓存价拒绝计算，不输出NaN或负费用", () => {
  const app = createApp();
  for (const changes of [
    { model: "unknown|model" }, { requests: "-1" }, { requests: "0.5" }, { requests: "100001" },
    { tokens: "0" }, { tokens: "10000001" }, { days: "0" }, { days: "32" },
    { input: "101" }, { cache: "-1" }, { cache: "101" }, { cachePrice: "2.01" },
    { cachePrice: "NaN" }, { cachePrice: "Infinity" }, { budget: "1e3" }, { budget: "1000000001" },
  ]) assert.equal(workload(app, changes), null, JSON.stringify(changes));
  assert.equal(workload(app, {}, { ...usdApi, inUSD: -1 }), null);
  assert.equal(workload(app, {}, { cur: "USD", inUSD: 2 }), null);
  assert.ok(workload(app, { requests: "100000", tokens: "10000000", days: "31", input: "27.5", cache: "61.5", budget: "1000000000" }));
  healthy(app);
});

test("修改缓存率、输入比例或每次token假设后不宣称套餐额度够用", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState, { budget: "100", region: "cn", tool: "any", task: "hard" });
    Object.assign(calcState, { model: "小米 MiMo|mimo-v2.6-pro", requests: "75", tokens: "20000", days: "10", input: "80", cache: "95", cachePrice: "0.025" });`);
  assert.equal(app.run("chooseMain(eligibleProfiles()).p.id"), "plan-0167");
  for (const changes of [{ cache: "0" }, { input: "60" }, { tokens: "10000" }]) {
    app.run(`Object.assign(calcState, { input: "80", cache: "95", tokens: "20000" }, ${JSON.stringify(changes)}); renderCostCalculator();`);
    const text = app.elements.get("costResult").innerHTML;
    assert.match(text, /参考月量/);
    assert.match(text, /修改了折算假设，参考月量不能直接用于判断是否够用/);
    assert.doesNotMatch(text, /按相同基准，你的总量|总量在公布或估算区间下限之内/);
  }
  healthy(app);
});

test("同模型额度优先匹配，daily回退使用日常角色且跨模型不判断够用", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState, { budget: "100", region: "cn", tool: "any", task: "daily" });
    Object.assign(calcState, { model: "小米 MiMo|mimo-v2.6-flash", requests: "75", tokens: "20000", days: "30", input: "80", cache: "95", cachePrice: "0.02" }); renderCostCalculator();`);
  const specific = app.elements.get("costResult").innerHTML;
  assert.match(specific, /MiMo-V2\.6-Flash：参考月量 90M/);
  assert.match(specific, /低于参考区间下限/);
  assert.doesNotMatch(specific, /MiMo-V2\.6-Pro：|高于参考区间上限/);
  app.run('Object.assign(calcState, { model: APP_DEFAULTS.calc.model, cachePrice: "" }); renderCostCalculator();');
  const fallback = app.elements.get("costResult").innerHTML;
  assert.match(fallback, /MiMo-V2\.6-Flash：参考月量 90M/);
  assert.match(fallback, /所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用/);
  assert.doesNotMatch(fallback, /按相同基准，你的总量/);
  healthy(app);
});

test("计算URL字段全部往返，非法值还原默认并从分享链接清理", () => {
  const app = createApp();
  const expected = { model: "智谱 BigModel|GLM-5.3", requests: "73", tokens: "1024", days: "7", input: "27.5", cache: "61.5", cachePrice: "0.01", budget: "88.5" };
  const query = app.run(`Object.assign(calcState, ${JSON.stringify(expected)}); appQueryString();`);
  app.run(`applyUrlState(${JSON.stringify("?" + query)}); syncControlsFromState(); syncUrl();`);
  assert.deepEqual(plain(app.run("calcState")), expected);
  assert.equal(app.elements.get("costCachePrice").value, "0.01");
  assert.equal(app.elements.get("costBudget").value, "88.5");
  assert.equal(app.run("appQueryString()"), query);
  const restored = createApp({ url: "http://127.0.0.1:8123/index.html?" + query });
  assert.deepEqual(plain(restored.run("calcState")), expected);
  app.run('applyUrlState("?cmodel=missing&crequests=-1&ctokens=0&cdays=32&cinput=101&ccache=NaN&ccacheprice=Infinity&cbudget=1e3"); syncUrl();');
  assert.deepEqual(plain(app.run("calcState")), plain(app.run("APP_DEFAULTS.calc")));
  assert.equal(app.run("appQueryString()"), "");
  healthy(app); healthy(restored);
});

test("预设恢复计算、筛选和对比；过长新条件保留已存预设", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState, { budget: "100", region: "intl", tool: "own", task: "daily" });
    Object.assign(calcState, { model: "智谱 BigModel|GLM-5.3", input: "27", cache: "61", cachePrice: "0.01", budget: "88" });
    cmpState.items = [PLANS[0], PLANS[1]]; savePreset();`);
  const saved = app.run("localStorage.getItem(PRESET_KEY)");
  const query = app.run("appQueryString()");
  app.run('tableState.search = "a".repeat(17000); savePreset();');
  assert.equal(app.run("localStorage.getItem(PRESET_KEY)"), saved);
  assert.match(app.elements.get("serviceFeedback").textContent, /条件过长/);
  assert.equal(app.elements.get("loadPresetBtn").disabled, false);
  app.run("Object.assign(pickerState, APP_DEFAULTS.picker); Object.assign(calcState, APP_DEFAULTS.calc); cmpState.items = []; restorePreset();");
  assert.equal(app.run("appQueryString()"), query);
  assert.equal(app.elements.get("costCache").value, "61");
  assert.equal(app.elements.get("costBudget").value, "88");
  assert.equal(app.run("cmpState.items.length"), 2);
  app.run("clearPreset();");
  assert.equal(app.run("readPreset()"), null);
  assert.equal(app.elements.get("loadPresetBtn").disabled, true);
  healthy(app);
});

test("修改其他数字不会掩盖尚未修正的非法输入", () => {
  const app = createApp();
  const tokens = app.elements.get("costTokens"), days = app.elements.get("costDays");
  tokens.value = "0"; app.fire(tokens,"input");
  days.value = "20"; app.fire(days,"input");
  assert.match(app.elements.get("costResult").textContent,/有效数字/);
  assert.equal(app.run("calcState.tokens"),"20000");
  tokens.value = "1000"; app.fire(tokens,"input");
  assert.match(app.elements.get("costResult").innerHTML,/预计月费/);
  assert.equal(app.run("calcState.tokens"),"1000");
  healthy(app);
});

if (require.main === module) main();
