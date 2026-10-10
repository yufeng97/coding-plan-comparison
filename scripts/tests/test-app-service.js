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

test("修改缓存率或输入比例后不宣称套餐额度够用", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState, { budget: "100", region: "cn", tool: "any", task: "hard" });
    Object.assign(calcState, { model: "小米 MiMo|mimo-v2.6-pro", requests: "75", tokens: "20000", days: "10", input: "80", cache: "95", cachePrice: "0.025" });`);
  assert.equal(app.run("chooseMain(eligibleProfiles()).p.id"), "plan-0168");
  for (const changes of [{ cache: "0" }, { input: "60" }]) {
    app.run(`Object.assign(calcState, { input: "80", cache: "95", tokens: "20000" }, ${JSON.stringify(changes)}); renderCostCalculator();`);
    const text = app.elements.get("costResult").innerHTML;
    assert.match(text, /参考月量/);
    assert.match(text, /修改了折算假设，参考月量不能直接用于判断是否够用/);
    assert.doesNotMatch(text, /按相同基准，你的总量|总量在公布或估算区间下限之内/);
  }
  healthy(app);
});

test("积分额度参考比较不受每次请求token变更影响，仍不保证实际够用", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState,{budget:"100",region:"cn",tool:"any",task:"hard"});
    Object.assign(calcState,{model:"小米 MiMo|mimo-v2.6-pro",requests:"75",tokens:"10000",days:"10",input:"80",cache:"95",cachePrice:"0.025"});renderCostCalculator();`);
  assert.equal(app.run('chooseMain(eligibleProfiles()).p.id'),"plan-0168");
  const text = app.elements.get("costResult").innerHTML;
  assert.match(text,/按相同基准，你的总量/);
  assert.match(text,/不能保证实际额度够用/);
  assert.doesNotMatch(text,/修改了折算假设/);
  healthy(app);
});

test("同模型额度优先匹配，daily回退使用日常角色且跨模型不判断够用", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState, { budget: "100", region: "cn", tool: "any", task: "daily" });
    Object.assign(calcState, { model: "小米 MiMo|mimo-v2.6-flash", requests: "75", tokens: "20000", days: "30", input: "80", cache: "95", cachePrice: "0.02" }); renderCostCalculator();`);
  const specific = app.elements.get("costResult").innerHTML;
  /* 官方系数折算的中置信额度参与排序，≤¥100 的日常主计划是额度更大的 Standard（¥99）。 */
  assert.match(specific, /MiMo Token Plan Standard · MiMo-V2\.6-Flash：参考月量 242M/);
  assert.match(specific, /低于参考区间下限/);
  assert.doesNotMatch(specific, /MiMo-V2\.6-Pro：|高于参考区间上限/);
  app.run('Object.assign(calcState, { model: APP_DEFAULTS.calc.model, cachePrice: "" }); renderCostCalculator();');
  const fallback = app.elements.get("costResult").innerHTML;
  assert.match(fallback, /MiMo-V2\.6-Flash：参考月量 242M/);
  assert.match(fallback, /所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用/);
  assert.doesNotMatch(fallback, /按相同基准，你的总量/);
  healthy(app);
});

test("计算URL字段全部往返，非法值还原默认并从分享链接清理", () => {
  const app = createApp();
  const expected = { model: "智谱 BigModel|GLM-5.3", requests: "73", tokens: "1024", days: "7", input: "27.5", cache: "61.5", cachePrice: "0.01", budget: "88.5", scenario:"conservative" };
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
  assert.equal(app.run('document.querySelector("[data-cost-preset=daily]").getAttribute("aria-pressed")'), "false", "非法编辑也不能保留与可见输入不符的预设高亮");
  days.value = "20"; app.fire(days,"input");
  assert.match(app.elements.get("costResult").textContent,/有效数字/);
  assert.equal(tokens.value,"0","刷新情景按钮不能偷偷纠正其他非法输入");
  assert.equal(app.run("calcState.tokens"),"20000");
  tokens.value = "1000"; app.fire(tokens,"input");
  assert.match(app.elements.get("costResult").innerHTML,/预计月费/);
  assert.equal(app.run("calcState.tokens"),"1000");
  healthy(app);
});

test("三种费用情景按明确示例假设计算，各自保留工作量区间，缓存缺价不虚构折扣", () => {
  const app = createApp();
  const rows = plain(app.run(`calculateCostScenarios({ ...APP_DEFAULTS.calc,cachePrice:"0.2" },${JSON.stringify(usdApi)})`));
  const rate = app.run("RATE_USD_CNY");
  for (const [i,usd] of [205.04,98.208,51.92].entries()) {
    near(rows[i].costNative,usd);
    near(rows[i].lowCNY,usd * rate * 0.8);
    near(rows[i].highCNY,usd * rate * 1.2);
    assert.equal(rows[i].monthlyM,44);
  }
  const noCache = plain(app.run(`calculateCostScenarios({ ...APP_DEFAULTS.calc,cachePrice:"" },${JSON.stringify(usdApi)})`));
  for (const [i,usd] of [228.8,158.4,123.2].entries()) near(noCache[i].costNative,usd);
  assert.deepEqual(plain(app.run(`calculateCostScenarios({ ...APP_DEFAULTS.calc,requests:"0" },${JSON.stringify(usdApi)}).map(r=>r.costCNY)`)),[0,0,0]);
  const result = app.elements.get("costResult");
  assert.equal(result.querySelectorAll("[data-cost-scenario-result]").length,3);
  assert.match(result.innerHTML,/不代表真实用户用量/);
  assert.match(result.innerHTML,/范围只模拟总工作量 ±20%/);
  healthy(app);
});

test("工作量预设与费用情景可直接修改可见输入，分享刷新保留实际假设", () => {
  const app = createApp();
  const light = app.run('document.querySelector("[data-cost-preset=light]")');
  const heavy = app.run('document.querySelector("[data-cost-preset=heavy]")');
  app.fire(light,"click");
  assert.equal(app.elements.get("costRequests").value,"20");
  assert.equal(app.elements.get("costTokens").value,"5000");
  assert.equal(light.getAttribute("aria-pressed"),"true");
  app.fire(heavy,"click");
  assert.equal(app.elements.get("costRequests").value,"300");
  assert.equal(app.elements.get("costTokens").value,"40000");
  assert.equal(app.elements.get("costDays").value,"26");
  assert.equal(light.getAttribute("aria-pressed"),"false");
  const conservative = app.run('document.querySelector("[data-cost-scenario=conservative]")');
  app.fire(conservative,"click");
  assert.equal(app.elements.get("costInput").value,"60");
  assert.equal(app.elements.get("costCache").value,"50");
  assert.equal(conservative.getAttribute("aria-pressed"),"true");
  assert.equal(new URLSearchParams(app.location.search).get("cscenario"),"conservative");
  const restored = createApp({ url:app.location.href });
  assert.equal(restored.elements.get("costRequests").value,"300");
  assert.equal(restored.elements.get("costInput").value,"60");
  assert.equal(restored.run('document.querySelector("[data-cost-scenario=conservative]").getAttribute("aria-pressed")'),"true");
  const input = app.elements.get("costInput");
  input.value = "75"; app.fire(input,"input");
  assert.equal(conservative.getAttribute("aria-pressed"),"false","手动改变示例假设后不再标为选中");
  healthy(app); healthy(restored);
});

test("选购用量CTA带入预算和精确匹配模型，模型改变清除旧缓存价，无匹配时明确保留", () => {
  const app = createApp();
  app.run('Object.assign(pickerState,{ budget:"200",region:"cn",tool:"any",task:"hard",billing:"M" }); calcState.cachePrice="0.2";');
  app.fire(app.elements.get("checkWorkloadBtn"),"click");
  assert.equal(app.elements.get("costCalculator").open,true);
  assert.equal(app.elements.get("costBudget").value,"200");
  assert.equal(app.elements.get("costModel").value,"小米 MiMo|mimo-v2.6-pro");
  assert.equal(app.elements.get("costCachePrice").value,"");
  assert.equal(app.location.hash,"#s4");
  assert.match(app.elements.get("serviceFeedback").textContent,/同名的 API 模型/);
  assert.equal(app.run('recommendedApi(planProfile(findPlanReference("plan-0002"))).model'),"Claude Opus 5.5","主表完整型号可匹配，即使没有该模型的逐行套餐额度");
  app.run('Object.assign(pickerState,{ budget:"any",region:"intl",tool:"cursor",task:"hard" });');
  app.elements.get("costBudget").value = "123.4";
  app.fire(app.elements.get("costBudget"),"input");
  app.fire(app.elements.get("checkWorkloadBtn"),"click");
  assert.equal(app.elements.get("costBudget").value,"123.4");
  assert.match(app.elements.get("serviceFeedback").textContent,/没有可精确匹配的 API 报价/);
  assert.match(app.elements.get("serviceFeedback").textContent,/预算不限/);
  healthy(app);
});

test("应用与取消选购条件只切换本区范围，叠加原筛选并在URL及刷新后保留", () => {
  const app = createApp();
  app.run('Object.assign(pickerState,{ budget:"100",region:"cn",tool:"claude",billing:"A" }); tableState.search="GLM"; metricsState.model="GLM-5.3"; personalState.q="GLM";');
  for (const [name,param] of [["personal","papply"],["metrics","mapply"],["table","tapply"]]) {
    const button = app.run(`document.querySelector('[data-apply-picker="${name}"]')`);
    app.fire(button,"click");
    assert.equal(app.run(`${name}State.fromPicker`),true);
    assert.equal(new URLSearchParams(app.location.search).get(param),"1");
    assert.equal(button.getAttribute("aria-pressed"),"true");
    assert.match(app.elements.get(name + "Scope").textContent,/月均预算 ≤¥100.*国内.*Claude Code.*自动续费/);
    assert.match(app.elements.get(name + "Scope").textContent,/叠加/);
  }
  assert.equal(app.run("tableState.search"),"GLM");
  assert.equal(app.run("metricsState.model"),"GLM-5.3");
  assert.equal(app.run("personalState.q"),"GLM");
  assert.match(app.elements.get("personalScope").textContent,/图中金额为所选支付方式的月均价/);
  assert.match(app.elements.get("metricsScope").textContent,/套餐按所选支付方式重算.*取消选购条件可查看 API 参照/);
  assert.match(app.elements.get("tableScope").textContent,/保留目录月付\/年付价，并另标选购口径/);
  assert.equal(app.run('Object.assign(pickerState,{ billing:"M" }); pickerScopeText().endsWith("月付标价")'),true);
  const restored = createApp({ url:app.location.href });
  assert.equal(restored.run("tableState.fromPicker && personalState.fromPicker && metricsState.fromPicker"),true);
  app.fire(app.run('document.querySelector("[data-apply-picker=table]")'),"click");
  assert.equal(app.run("tableState.fromPicker"),false);
  assert.equal(app.run("tableState.search"),"GLM");
  assert.match(app.elements.get("tableScope").textContent,/尚未应用选购条件/);
  healthy(app); healthy(restored);
});

test("应用个人图条件停用本区支付切换，金额使用选购方式且取消、清除及历史恢复后同步", () => {
  const app = createApp({url:"http://127.0.0.1:8123/?region=intl&billing=M&pbilling=Y#s1"});
  const chips = app.run('Array.from(document.querySelectorAll("#chipBilling .chip"))');
  assert.ok(chips.every((chip) => !chip.disabled));
  app.fire(app.run('document.querySelector("[data-apply-picker=personal]")'),"click");
  assert.ok(chips.every((chip) => chip.disabled && chip.getAttribute("aria-describedby") === "personalScope"));
  assert.equal(app.run("personalState.billing"),"Y", "原本区年付选择保留，取消后可以恢复");
  const tooltip = app.run('personalTooltip(findPlanReference("plan-0002"))');
  assert.match(tooltip,/选购口径：\$20\/月/);
  assert.doesNotMatch(tooltip,/折算价：/);
  assert.match(app.elements.get("personalScope").textContent,/暂不可切换/);
  const appliedUrl = app.location.search;
  app.fire(app.run('document.querySelector("[data-apply-picker=personal]")'),"click");
  assert.ok(chips.every((chip) => !chip.disabled && chip.getAttribute("aria-describedby") == null));
  assert.equal(app.run("personalState.billing"),"Y");
  assert.match(app.run('personalTooltip(findPlanReference("plan-0002"))'),/折算价：\$16.67/);
  app.run('restoreHistoryState(' + JSON.stringify(appliedUrl) + ', false)');
  assert.ok(chips.every((chip) => chip.disabled));
  app.fire(app.elements.get("personalResetBtn"),"click");
  assert.ok(chips.every((chip) => !chip.disabled));
  assert.equal(app.run("personalState.billing"),"M");
  healthy(app);
});

test("导入 Claude Code 日志后填好计算器、匹配 API 牌价并展开套餐用量对照，原文不进入链接", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=any&region=all" });
  const line = (id, day) => JSON.stringify({ type: "assistant", timestamp: `2026-10-0${day}T10:00:00.000Z`, requestId: "req_" + id,
    message: { id: "msg_" + id, model: "claude-opus-5-5-20260901", usage: { input_tokens: 2000, output_tokens: 6000, cache_creation_input_tokens: 4000, cache_read_input_tokens: 188000 } } });
  const text = Array.from({ length: 14 }, (_, i) => [line(i * 2, (i % 7) + 1), line(i * 2 + 1, (i % 7) + 1)]).flat().join("\n");
  app.elements.get("usageImportText").value = text;
  app.fire(app.elements.get("usageImportBtn"), "click");
  const out = app.elements.get("usageImportResult").textContent;
  assert.match(out, /已从粘贴内容导入 2026-10-01 至 2026-10-07（7 天，活跃 7 天）/);
  assert.match(out, /主要模型 claude-opus-5-5-20260901 已对应 Anthropic · Claude Opus 5\.5 的 API 牌价/);
  assert.match(out, /缓存写入按普通输入价计算/);
  assert.match(out, /原始内容没有上传或保存/);
  assert.equal(app.run("calcState.model"), "Anthropic|Claude Opus 5.5");
  assert.equal(app.run("calcState.requests"), "4");
  assert.equal(app.run("calcState.days"), "30");
  assert.equal(app.run("calcState.input"), "97");
  assert.equal(app.run("calcState.cache"), "96.9");
  assert.equal(app.elements.get("costRequests").value, "4");
  const result = app.elements.get("costResult").innerHTML;
  assert.match(result, /<details class="usage-fit" id="usageFit" open>/);
  assert.match(result, /当前输入 97% \/ 输出 3%/);
  app.run('calcState.input = "97.9"; renderCostCalculator();');
  assert.match(app.elements.get("costResult").innerHTML, /当前输入 97\.9% \/ 输出 2\.1%/, "小数输入占比不产生浮点误差");
  assert.match(result, /按这个用量对照套餐参考额度（\d+ 档保守够用，\d+ 档有参考月量）/);
  assert.match(result, /保守够用|落在参考区间|超出参考额度/);
  assert.doesNotMatch(app.location.href, /msg_|req_|claude-opus-5-5-2026/, "链接只保存折算后的计算条件");
  /* 恢复默认清掉导入说明；解析失败不改动已有条件。 */
  app.fire(app.elements.get("costResetBtn"), "click");
  assert.equal(app.elements.get("usageImportResult").textContent, "");
  app.elements.get("usageImportText").value = "not usage";
  app.fire(app.elements.get("usageImportBtn"), "click");
  assert.match(app.elements.get("usageImportResult").textContent, /不是 JSON 或 JSONL/);
  assert.equal(app.run("calcState.requests"), "100");
  healthy(app);
});

test("日志模型只匹配完全一致或带日期后缀的牌价，不把新版本对到旧版本", () => {
  const app = createApp();
  assert.equal(app.run('(apiForUsageModel("claude-opus-5-5") || {}).model'), "Claude Opus 5.5");
  assert.equal(app.run('(apiForUsageModel("claude-opus-5-5-latest") || {}).model'), "Claude Opus 5.5");
  assert.equal(app.run('apiForUsageModel("claude-opus-5-7")'), null);
  assert.equal(app.run('(apiForUsageModel("claude-sonnet-5") || {}).model'), "Claude Sonnet 5");
  assert.equal(app.run('apiForUsageModel("claude-sonnet-5-9")'), null);
  assert.equal(app.run('(apiForUsageModel("kimi-k3") || {}).vendor'), "月之暗面 Kimi");
  assert.equal(app.run('apiForUsageModel("")'), null);
  healthy(app);
});

test("触屏设备用系统分享面板发送方案链接，取消不复制，失败时退回复制", async () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=500&region=intl" });
  const btn = app.elements.get("shareResultsBtn");
  assert.equal(btn.textContent, "复制当前方案链接", "桌面保持复制");
  await app.run("shareCurrentResults()");
  assert.match(app.run("copiedText"), /budget=500&region=intl/);
  app.run(`window.matchMedia = (q) => ({ matches: q === "(pointer: coarse)" }); globalThis.shared = [];
    navigator.share = async (data) => { shared.push(data); };`);
  app.run("copiedText = ''");
  await app.run("shareCurrentResults()");
  const shared = JSON.parse(app.run("JSON.stringify(shared)"));
  assert.equal(shared.length, 1);
  assert.match(shared[0].url, /budget=500&region=intl/);
  assert.match(shared[0].text, /≤¥500 · 国际/);
  assert.equal(app.run("copiedText"), "", "系统分享成功时不再复制");
  assert.match(app.elements.get("serviceFeedback").textContent, /已打开系统分享/);
  app.run(`navigator.share = async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; };`);
  await app.run("shareCurrentResults()");
  assert.equal(app.elements.get("serviceFeedback").textContent, "已取消分享。");
  assert.equal(app.run("copiedText"), "");
  app.run(`navigator.share = async () => { throw new Error("denied"); };`);
  await app.run("shareCurrentResults()");
  assert.match(app.run("copiedText"), /budget=500/, "其他失败退回复制链接");
  healthy(app);
});

if (require.main === module) main();
