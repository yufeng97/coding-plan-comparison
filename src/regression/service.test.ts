
/* 原 test-app-service.js 的整页交互；纯费用公式与非法数值矩阵见 workload.test.ts。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { openPage, type Page } from "../test/page";

const input = async (page: Page, id: string, value: string) => {
  const field = page.byId<HTMLInputElement>(id);
  field.value = value;
  page.fire(field, "input");
  await page.settle();
  return field;
};
const button = (selector: string) => {
  const element = document.querySelector<HTMLButtonElement>(selector);
  assert.ok(element, selector);
  return element;
};

test("官方缓存价与未录入缓存价在费用结果、单位和占位提示中一致", async () => {
  const page = await openPage();
  const app = page.runtime;
  Object.assign(app.calcState, { model: "Anthropic|Claude Sonnet 5.5", cache: "100", cachePrice: "" });
  await page.settle();
  assert.match(page.byId("costResult").textContent!, /缓存命中按官方单价 \$0\.2\/1M 计费/);
  assert.equal(page.byId("costCacheUnit").textContent, "美元");
  assert.match(page.byId<HTMLInputElement>("costCachePrice").placeholder, /留空采用官方 \$0\.2/);
  Object.assign(app.calcState, { model: "阿里云百炼|qwen3-coder-next", cache: "100", cachePrice: "" });
  await page.settle();
  assert.match(page.byId("costResult").textContent!, /未录入官方缓存单价，缓存命中率暂不生效/);
  assert.equal(page.byId("costCacheUnit").textContent, "人民币");
  page.healthy();
});

test("参考额度只在同模型与原折算假设下比较，积分额度不依赖请求 token 数", async () => {
  const page = await openPage({ url: "/?budget=100&region=cn&task=hard" });
  const app = page.runtime;
  Object.assign(app.calcState, { model: "小米 MiMo|mimo-v2.6-pro", requests: "75", tokens: "20000", days: "10", input: "80", cache: "95", cachePrice: "0.025" });
  assert.equal(app.chooseMain(app.eligibleProfiles())!.p.id, "plan-0168");
  for (const changes of [{ cache: "0" }, { input: "60" }]) {
    Object.assign(app.calcState, { input: "80", cache: "95", tokens: "20000" }, changes);
    await page.settle();
    const text = page.byId("costResult").textContent!;
    assert.match(text, /参考月量/);
    assert.match(text, /修改了折算假设，参考月量不能直接用于判断是否够用/);
    assert.doesNotMatch(text, /按相同基准，你的总量|总量在公布或估算区间下限之内/);
  }
  Object.assign(app.calcState, { input: "80", cache: "95", tokens: "10000" });
  await page.settle();
  assert.match(page.byId("costResult").textContent!, /按相同基准，你的总量.*不能保证实际额度够用/);
  assert.doesNotMatch(page.byId("costResult").textContent!, /修改了折算假设/);
  page.healthy();
});

test("同模型额度优先匹配，daily 回退使用日常角色且跨模型不判断够用", async () => {
  const page = await openPage({ url: "/?budget=100&region=cn&task=daily" });
  const app = page.runtime;
  Object.assign(app.calcState, { model: "小米 MiMo|mimo-v2.6-flash", requests: "75", tokens: "20000", days: "30", input: "80", cache: "95", cachePrice: "0.02" });
  await page.settle();
  const specific = page.byId("costResult").textContent!;
  assert.match(specific, /MiMo Token Plan Standard · MiMo-V2\.6-Flash：参考月量 242M/);
  assert.match(specific, /低于参考区间下限/);
  assert.doesNotMatch(specific, /MiMo-V2\.6-Pro：|高于参考区间上限/);
  Object.assign(app.calcState, { model: app.APP_DEFAULTS.calc.model, cachePrice: "" });
  await page.settle();
  const fallback = page.byId("costResult").textContent!;
  assert.match(fallback, /MiMo-V2\.6-Flash：参考月量 242M/);
  assert.match(fallback, /所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用/);
  assert.doesNotMatch(fallback, /按相同基准，你的总量/);
  page.healthy();
});

test("计算 URL 所有字段往返，非法值恢复默认并从分享链接清理", async () => {
  let page = await openPage();
  const expected = { model: "智谱 BigModel|GLM-5.3", requests: "73", tokens: "1024", days: "7", input: "27.5", cache: "61.5", cachePrice: "0.01", budget: "88.5", scenario: "conservative" };
  Object.assign(page.runtime.calcState, expected);
  const query = page.runtime.appQueryString();
  page.runtime.applyUrlState("?" + query);
  page.runtime.syncUrl();
  await page.settle();
  assert.deepEqual({ ...page.runtime.calcState }, expected);
  assert.equal(page.byId<HTMLInputElement>("costCachePrice").value, "0.01");
  assert.equal(page.byId<HTMLInputElement>("costBudget").value, "88.5");
  assert.equal(page.runtime.appQueryString(), query);
  page.healthy();
  page = await openPage({ url: "/index.html?" + query });
  assert.deepEqual({ ...page.runtime.calcState }, expected);
  page.runtime.applyUrlState("?cmodel=missing&crequests=-1&ctokens=0&cdays=32&cinput=101&ccache=NaN&ccacheprice=Infinity&cbudget=1e3");
  page.runtime.syncUrl();
  assert.deepEqual({ ...page.runtime.calcState }, { ...page.runtime.APP_DEFAULTS.calc });
  assert.equal(page.runtime.appQueryString(), "");
  page.healthy();
});

test("预设恢复计算、筛选和对比，过长新条件保留已存预设", async () => {
  const page = await openPage();
  const app = page.runtime;
  Object.assign(app.pickerState, { budget: "100", region: "intl", tool: "own", task: "daily" });
  Object.assign(app.calcState, { model: "智谱 BigModel|GLM-5.3", input: "27", cache: "61", cachePrice: "0.01", budget: "88" });
  app.cmpState.items = [app.PLANS[0]!, app.PLANS[1]!];
  app.savePreset();
  const saved = localStorage.getItem(app.PRESET_KEY), query = app.appQueryString();
  app.tableState.search = "a".repeat(17000);
  app.savePreset();
  await page.settle();
  assert.equal(localStorage.getItem(app.PRESET_KEY), saved);
  assert.match(page.byId("serviceFeedback").textContent!, /条件过长/);
  assert.equal(page.byId<HTMLButtonElement>("loadPresetBtn").disabled, false);
  Object.assign(app.pickerState, app.APP_DEFAULTS.picker);
  Object.assign(app.calcState, app.APP_DEFAULTS.calc);
  app.cmpState.items = [];
  app.restorePreset();
  await page.settle();
  assert.equal(app.appQueryString(), query);
  assert.equal(page.byId<HTMLInputElement>("costCache").value, "61");
  assert.equal(page.byId<HTMLInputElement>("costBudget").value, "88");
  assert.equal(app.cmpState.items.length, 2);
  app.clearPreset();
  await page.settle();
  assert.equal(app.readPreset(), null);
  assert.equal(page.byId<HTMLButtonElement>("loadPresetBtn").disabled, true);
  page.healthy();
});

test("修改其他数字不会掩盖尚未修正的非法输入", async () => {
  const page = await openPage();
  const tokens = await input(page, "costTokens", "0");
  assert.equal(button("[data-cost-preset=daily]").getAttribute("aria-pressed"), "false");
  await input(page, "costDays", "20");
  assert.match(page.byId("costResult").textContent!, /有效数字/);
  assert.equal(tokens.value, "0", "刷新情景按钮不能偷偷纠正其他非法输入");
  assert.equal(page.runtime.calcState.tokens, "20000");
  await input(page, "costTokens", "1000");
  assert.match(page.byId("costResult").textContent!, /预计月费/);
  assert.equal(page.runtime.calcState.tokens, "1000");
  page.healthy();
});

test("三种费用情景展示工作量范围与示例口径，预设和手工编辑在分享刷新后保留", async () => {
  let page = await openPage();
  assert.equal(page.byId("costResult").querySelectorAll("[data-cost-scenario-result]").length, 3);
  assert.match(page.byId("costResult").textContent!, /不代表真实用户用量/);
  assert.match(page.byId("costResult").textContent!, /范围只模拟总工作量 ±20%/);
  const light = button("[data-cost-preset=light]");
  page.fire(light, "click");
  await page.settle();
  assert.equal(page.byId<HTMLInputElement>("costRequests").value, "20");
  assert.equal(page.byId<HTMLInputElement>("costTokens").value, "5000");
  assert.equal(light.getAttribute("aria-pressed"), "true");
  page.fire(button("[data-cost-preset=heavy]"), "click");
  await page.settle();
  assert.equal(page.byId<HTMLInputElement>("costRequests").value, "300");
  assert.equal(page.byId<HTMLInputElement>("costTokens").value, "40000");
  assert.equal(page.byId<HTMLInputElement>("costDays").value, "26");
  assert.equal(light.getAttribute("aria-pressed"), "false");
  page.fire(button("[data-cost-scenario=conservative]"), "click");
  await page.settle();
  assert.equal(page.byId<HTMLInputElement>("costInput").value, "60");
  assert.equal(page.byId<HTMLInputElement>("costCache").value, "50");
  assert.equal(new URLSearchParams(location.search).get("cscenario"), "conservative");
  const url = location.href;
  page.healthy();
  page = await openPage({ url });
  assert.equal(page.byId<HTMLInputElement>("costRequests").value, "300");
  assert.equal(page.byId<HTMLInputElement>("costInput").value, "60");
  assert.equal(button("[data-cost-scenario=conservative]").getAttribute("aria-pressed"), "true");
  await input(page, "costInput", "75");
  assert.equal(button("[data-cost-scenario=conservative]").getAttribute("aria-pressed"), "false");
  page.healthy();
});

test("选购用量 CTA 带入预算与精确模型，模型改变清除缓存价，无匹配时明确保留", async () => {
  const page = await openPage({ url: "/?budget=200&region=cn&task=hard" });
  const app = page.runtime;
  app.calcState.cachePrice = "0.2";
  page.fire(page.byId("checkWorkloadBtn"), "click");
  await page.settle();
  assert.equal(page.byId<HTMLDetailsElement>("costCalculator").open, true);
  assert.equal(page.byId<HTMLInputElement>("costBudget").value, "200");
  assert.equal(page.byId<HTMLSelectElement>("costModel").value, "小米 MiMo|mimo-v2.6-pro");
  assert.equal(page.byId<HTMLInputElement>("costCachePrice").value, "");
  assert.equal(location.hash, "#s4");
  assert.match(page.byId("serviceFeedback").textContent!, /同名的 API 模型/);
  assert.equal(app.recommendedApi(app.planProfile(app.findPlanReference("plan-0002")!))!.model, "Claude Opus 5.5");
  Object.assign(app.pickerState, { budget: "any", region: "intl", tool: "cursor", task: "hard" });
  await input(page, "costBudget", "123.4");
  page.fire(page.byId("checkWorkloadBtn"), "click");
  await page.settle();
  assert.equal(page.byId<HTMLInputElement>("costBudget").value, "123.4");
  assert.match(page.byId("serviceFeedback").textContent!, /没有可精确匹配的 API 报价/);
  assert.match(page.byId("serviceFeedback").textContent!, /预算不限/);
  page.healthy();
});

test("选购条件只切换本区范围，叠加原筛选并在 URL 与刷新后保留", async () => {
  let page = await openPage();
  const app = page.runtime;
  Object.assign(app.pickerState, { budget: "100", region: "cn", tool: "claude", billing: "A" });
  app.tableState.search = "GLM";
  app.metricsState.model = "GLM-5.3";
  app.personalState.q = "GLM";
  for (const [name, param] of [["personal", "papply"], ["metrics", "mapply"], ["table", "tapply"]] as const) {
    const control = button(`[data-apply-picker=${name}]`);
    page.fire(control, "click");
    await page.settle();
    assert.equal(app[`${name}State`].fromPicker, true);
    assert.equal(new URLSearchParams(location.search).get(param), "1");
    assert.equal(control.getAttribute("aria-pressed"), "true");
    assert.match(page.byId(name + "Scope").textContent!, /月均预算 ≤¥100.*国内.*Claude Code.*自动续费/);
    assert.match(page.byId(name + "Scope").textContent!, /叠加/);
  }
  assert.equal(app.tableState.search, "GLM");
  assert.equal(app.metricsState.model, "GLM-5.3");
  assert.equal(app.personalState.q, "GLM");
  assert.match(page.byId("personalScope").textContent!, /图中金额为所选支付方式的月均价/);
  assert.match(page.byId("metricsScope").textContent!, /套餐按所选支付方式重算.*取消选购条件可查看 API 参照/);
  assert.match(page.byId("tableScope").textContent!, /保留目录月付\/年付价，并另标选购口径/);
  app.pickerState.billing = "M";
  assert.equal(app.pickerScopeText().endsWith("月付标价"), true);
  app.syncUrl();
  const url = location.href;
  page.fire(button("[data-apply-picker=table]"), "click");
  await page.settle();
  assert.equal(app.tableState.fromPicker, false);
  assert.equal(app.tableState.search, "GLM");
  assert.match(page.byId("tableScope").textContent!, /尚未应用选购条件/);
  page.healthy();
  page = await openPage({ url });
  assert.ok(page.runtime.tableState.fromPicker && page.runtime.personalState.fromPicker && page.runtime.metricsState.fromPicker);
  page.healthy();
});

test("应用个人图条件停用支付切换，取消、重置与历史恢复后同步", async () => {
  const page = await openPage({ url: "/?region=intl&billing=M&pbilling=Y#s1" });
  const app = page.runtime;
  const chips = Array.from(document.querySelectorAll<HTMLButtonElement>("#chipBilling .chip"));
  assert.ok(chips.length > 0 && chips.every((chip) => !chip.disabled));
  page.fire(button("[data-apply-picker=personal]"), "click");
  await page.settle();
  assert.ok(chips.every((chip) => chip.disabled && chip.getAttribute("aria-describedby") === "personalScope"));
  assert.equal(app.personalState.billing, "Y");
  const tooltip = app.personalTooltip(app.findPlanReference("plan-0002")!);
  assert.match(tooltip, /选购口径：\$20\/月/);
  assert.doesNotMatch(tooltip, /折算价：/);
  assert.match(page.byId("personalScope").textContent!, /暂不可切换/);
  const appliedUrl = location.search;
  page.fire(button("[data-apply-picker=personal]"), "click");
  await page.settle();
  assert.ok(chips.every((chip) => !chip.disabled && chip.getAttribute("aria-describedby") == null));
  assert.equal(app.personalState.billing, "Y");
  assert.match(app.personalTooltip(app.findPlanReference("plan-0002")!), /折算价：\$16.67/);
  app.restoreHistoryState(appliedUrl, false);
  await page.settle();
  assert.ok(chips.every((chip) => chip.disabled));
  page.fire(page.byId("personalResetBtn"), "click");
  await page.settle();
  assert.ok(chips.every((chip) => !chip.disabled));
  assert.equal(app.personalState.billing, "M");
  page.healthy();
});
