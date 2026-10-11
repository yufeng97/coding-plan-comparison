/* 图表：懒加载与导航顺序、图例、主题配色与响应式。原 scripts/tests/test-app-charts.js，现用真实 App。
 * happy-dom 没有布局：元素尺寸为 0，宽度按页面的回退规则（视口宽度 − 72）计算；需要可见尺寸的用例单独给出。
 * 真实画布尺寸与像素见 charts.browser.spec.js。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { openPage, type FakeChart, type Page } from "../test/page";

/** 懒加载的图表（与 startup.ts 的 LAZY_CHARTS 相同）以及随 API 图一起绘制的购买力图。 */
const LAZY = ["chartRank", "chartPersonal", "chartTeam", "chartTokens", "chartApi"];
const chart = (page: Page, id: string) => {
  const found = page.charts.get(id);
  assert.ok(found, id + " 尚未绘制");
  return found;
};
type TokenRow = { label: string; model: string; lowM: number; highM: number; isOfficial: boolean; conf: string; priceCNY: number };
const tokenRows = (option: { series: { data: ({ _r: TokenRow } | null)[] }[] }): TokenRow[] =>
  [...new Map<string, TokenRow>(option.series.flatMap((series) => series.data.flatMap((point) => point ? [[point._r.label, point._r] as const] : []))).values()];
async function type(page: Page, id: string, value: string) {
  const input = page.byId<HTMLInputElement>(id);
  input.value = value;
  page.fire(input, "input");
  await page.flushTimers();
  return input;
}
async function click(page: Page, element: Element) {
  page.fire(element, "click");
  await page.settle();
}

test("首次导航及分享锚点先渲染前方五组图表，再定位 API 区", async () => {
  for (const fromHash of [false, true]) {
    const page = await openPage({ url: "/index.html" + (fromHash ? "#s4" : "") });
    if (!fromHash) {
      assert.equal(page.charts.size, 0);
      const event = page.fire(page.anchor("#s4"), "click");
      assert.equal(event.defaultPrevented, true);
      await page.settle();
    }
    page.healthy();
    assert.equal(location.hash, "#s4");
    assert.deepEqual([...page.charts.keys()].filter((id) => LAZY.includes(id)).sort(), [...LAZY].sort());
    const scrollIndex = page.timeline.indexOf("scroll:s4");
    assert.ok(scrollIndex >= 0);
    for (const id of [...LAZY, "chartPower"]) {
      const renderIndex = page.timeline.indexOf("render:" + id);
      assert.ok(renderIndex >= 0 && renderIndex < scrollIndex, id + " 应在定位前渲染");
    }
  }
});

test("图表跳表清除旧 cloud/cn 条件并定位，清除按钮恢复默认表格", async () => {
  const page = await openPage({ url: "/index.html?tcat=cloud&tregion=cn&tapply=1" });
  const app = page.runtime;
  await type(page, "chartSearch", "Claude Team");
  assert.match(page.byId("notePersonal").textContent!, /在完整表里看/);
  await click(page, page.byId("showExcludedInTable"));
  page.healthy();
  assert.equal(app.tableState.cat, "all");
  assert.equal(app.tableState.region, "all");
  assert.equal(app.tableState.fromPicker, false);
  assert.equal(app.computeTableRows().filter((p: Plan) => p.vendor === "Anthropic" && /Claude Team/.test(p.plan)).length, 2);
  assert.equal(app.computeTableRows().every((p: Plan) => app.queryHit(app.planSearchBlob(p), "Claude Team")), true);
  assert.equal(page.byId<HTMLSelectElement>("selectCat").value, "all");
  assert.equal(page.byId<HTMLSelectElement>("selectRegion").value, "all");
  assert.equal(location.hash, "#table");
  /* 只预先渲染数据表之前可显示的图表；Claude Team 搜索为空时，隐藏的个人图仍保留首次懒加载资格。 */
  const table = page.byId("table");
  const before = LAZY.filter((id) => {
    const host = page.byId(id);
    return !host.closest("[hidden]") && host.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  assert.deepEqual([...page.charts.keys()].filter((id) => LAZY.includes(id)).sort(), before.sort());
  assert.equal(page.charts.has("chartPersonal"), false);
  const params = new URLSearchParams(location.search);
  assert.equal(params.get("q"), "Claude Team");
  assert.equal(params.has("tcat"), false);
  assert.equal(params.has("tregion"), false);
  assert.equal(params.has("tapply"), false);
  await click(page, page.byId("tableResetBtn"));
  assert.equal(app.tableState.search, "");
  assert.equal(app.tableState.sortKey + ":" + app.tableState.sortDir, "priceM:1");
  assert.equal(app.computeTableRows().length, app.PLANS.filter(app.isOnSalePlan).filter((p) => !app.tableExtraHidden(p)).length);
  assert.equal(app.tableState.extra, false, "清除筛选也收起中转站与待核价格");
});

test("个人图表显示全部可收起，空结果可清除并恢复20档与筛选按钮状态", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.renderPersonalChart();
  const option = () => chart(page, "chartPersonal").option;
  assert.equal(option().series[0].data.length, 20);
  assert.equal(page.byId("chartPersonalEmpty").hidden, true);
  await click(page, page.byId("showAllPersonal"));
  assert.equal(app.personalState.limit, null);
  assert.ok(option().series[0].data.length > 20);
  assert.match(page.byId("showAllPersonal").textContent!, /收起为 20 档/);
  assert.equal(new URLSearchParams(location.search).get("plimit"), "all");
  await click(page, page.byId("showAllPersonal"));
  assert.equal(option().series[0].data.length, 20);
  assert.equal(new URLSearchParams(location.search).has("plimit"), false);
  const chips = (id: string) => Array.from(page.byId(id).querySelectorAll<HTMLElement>(".chip"));
  for (const [id, key, value] of [["chipCat", "cat", "cloud"], ["chipRegion", "region", "cn"], ["chipBilling", "billing", "Y"]] as const) {
    const chip = chips(id).find((e) => e.dataset[key] === value)!;
    await click(page, chip);
    assert.equal(chip.getAttribute("aria-pressed"), "true");
  }
  const search = await type(page, "chartSearch", "__没有任何匹配套餐__");
  assert.equal(option().series[0].data.length, 0);
  assert.equal(page.byId("chartPersonal").hidden, true);
  assert.equal(page.byId("chartPersonalEmpty").hidden, false);
  assert.equal(page.byId("chartPersonalEmpty").getAttribute("role"), "status");
  await click(page, page.byId("personalResetBtn"));
  assert.equal(JSON.stringify(app.personalState), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20, fromPicker: false }));
  assert.equal(search.value, "");
  assert.equal(document.activeElement?.id, "chartSearch");
  assert.equal(page.byId("chartPersonal").hidden, false);
  assert.equal(page.byId("chartPersonalEmpty").hidden, true);
  assert.equal(option().series[0].data.length, 20);
  for (const [id, key, value] of [["chipCat", "cat", "all"], ["chipRegion", "region", "all"], ["chipBilling", "billing", "M"]] as const) {
    assert.equal(chips(id).filter((e) => e.getAttribute("aria-pressed") === "true").length, 1);
    assert.equal(chips(id).find((e) => e.dataset[key] === value)!.getAttribute("aria-pressed"), "true");
  }
  page.healthy();
});

test("归一化后为空的图表搜索保持20档，显示全部和收起仍可用", async () => {
  const page = await openPage();
  page.runtime.renderPersonalChart();
  const data = () => chart(page, "chartPersonal").option.series[0].data as { _p: Plan }[];
  for (const value of [" ", "\t\n", "---", " . / _ · "]) {
    await type(page, "chartSearch", value);
    assert.equal(data().length, 20, JSON.stringify(value));
    assert.equal(page.byId("chartPersonal").style.height, "730px");
    assert.ok(document.getElementById("showAllPersonal"), "无有效关键词时不能丢失展开/收起入口");
    assert.doesNotMatch(page.byId("notePersonal").textContent!, /同名模型还有|在完整表里看/);
  }
  await click(page, page.byId("showAllPersonal"));
  assert.ok(data().length > 20);
  await click(page, page.byId("showAllPersonal"));
  assert.equal(data().length, 20);
  await type(page, "chartSearch", " Claude - Pro ");
  assert.ok(data().some((d) => d._p.vendor === "Anthropic" && d._p.plan === "Claude Pro"), "真实关键词仍按相同归一化规则匹配");
  page.healthy();
});

test("年付图表读屏摘要与人民币柱值一致，缺少年付价时排除该档", async () => {
  const page = await openPage({ url: "/index.html?pq=CursorPro&pbilling=Y#s1" });
  const app = page.runtime;
  const label = () => page.byId("chartPersonal").getAttribute("aria-label")!;
  const prices = () => chart(page, "chartPersonal").option.series[0].data as { _p: Plan; value: number }[];
  assert.match(label(), /年付折月，人民币\/月/);
  assert.ok(prices().length > 0);
  for (const row of prices()) assert.ok(label().includes(row._p.plan + " ¥" + row.value), "摘要使用实际绘制的年付人民币价格");
  assert.doesNotMatch(label(), /\$20|\$60/);
  app.PLANS.find((p) => p.vendor === "Cursor" && p.plan === "Pro")!.priceY = null;
  app.renderPersonalChart();
  assert.equal(prices().some((row) => row._p.plan === "Pro"), false);
  assert.doesNotMatch(label(), /Cursor Pro ¥/);
  assert.match(page.byId("notePersonal").textContent!, /未列公开年付价的档位已排除/);
  page.healthy();
});

test("仅尺寸变化的可见图表响应缩放，离屏图表滚入后补齐", async () => {
  const page = await openPage({ url: "/index.html#s4" });
  const personal = chart(page, "chartPersonal"), element = page.byId("chartPersonal");
  let width = 1208, renderedWidth = width, updates = 0, resizes = 0;
  const height = parseFloat(element.style.height);
  element.getBoundingClientRect = () => ({ top: 50, bottom: 50 + height, left: 0, right: width, width, height }) as DOMRect;
  personal.getWidth = () => renderedWidth;
  personal.getHeight = () => height;
  personal.setOption = (option: { series?: unknown }) => { updates++; assert.equal(option.series, undefined, "缩放不能重建数据或图例"); };
  personal.resize = () => { resizes++; renderedWidth = width; };
  page.fireWindow("resize");
  await page.flushTimers();
  assert.equal(updates, 0, "只改变窗口高度或同尺寸resize不重绘");
  width = 600;
  page.fireWindow("resize");
  await page.flushTimers();
  assert.equal(updates, 1);
  assert.equal(resizes, 1);
  const tokens = chart(page, "chartTokens"), tokenElement = page.byId("chartTokens");
  let tokenUpdates = 0, tokenWidth = 1208;
  tokens.getWidth = () => tokenWidth;
  tokens.getHeight = () => parseFloat(tokenElement.style.height);
  tokens.setOption = () => { tokenUpdates++; };
  tokens.resize = () => { tokenWidth = 600; };
  assert.equal(tokenUpdates, 0, "离屏图表在resize时不重绘");
  const tokenHeight = parseFloat(tokenElement.style.height);
  tokenElement.getBoundingClientRect = () => ({ top: 50, bottom: 50 + tokenHeight, left: 0, right: 600, width: 600, height: tokenHeight }) as DOMRect;
  page.fireWindow("scroll");
  await page.settle();
  assert.equal(tokenUpdates, 1);
  assert.equal(tokenWidth, 600);
  page.healthy();
});

test("tokens图区间由两组DOM图例完整切换，重绘保留隐藏状态；API图例与明细完整", async () => {
  const page = await openPage({ url: "/index.html#s4" });
  const app = page.runtime;
  const rerender = (id: string) => id === "chartTokens" ? app.renderTokensChart() : app.renderApiChart();
  const legendCases: [string, string, number][] = [["chartTokens", "tokensLegend", 2], ["chartApi", "apiLegend", 1], ["chartPower", "powerLegend", 1]];
  for (const [chartId, legendId, segments] of legendCases) {
    const current = chart(page, chartId);
    const chips = Array.from(page.byId(legendId).querySelectorAll<HTMLElement>("[data-series]"));
    assert.equal(chips.length, 2);
    assert.equal(current.option.legend.show, false, "可键盘操作的DOM图例替代画布图例");
    for (const chip of chips) {
      const name = chip.dataset.series!;
      assert.equal(chip.tagName, "BUTTON");
      assert.ok(current.option.legend.data.includes(name), "图例与series名称一致");
      assert.equal(current.option.series.filter((s: { name: string }) => s.name === name).length, segments);
      assert.equal(chip.getAttribute("aria-pressed"), "true");
      await click(page, chip);
      assert.equal(chip.getAttribute("aria-pressed"), "false");
      assert.equal(current.visibleSeries().some((s) => s.name === name), false, "基础柱及区间上限段应一起隐藏");
      rerender(chartId);
      await page.settle();
      assert.equal(chip.getAttribute("aria-pressed"), "false", "重绘不能重新选中图例");
      assert.equal(current.visibleSeries().some((s) => s.name === name), false);
      const priorActions = current.actions.length;
      await click(page, chip);
      assert.equal(current.actions.length, priorActions + 1, "重绘不能叠加点击监听器");
      assert.equal(chip.getAttribute("aria-pressed"), "true");
      assert.equal(current.visibleSeries().filter((s) => s.name === name).length, segments);
    }
    for (const chip of chips) await click(page, chip);
    assert.equal(current.visibleSeries().length, 0, "两组同时隐藏应没有残留柱段");
    rerender(chartId);
    await page.settle();
    assert.equal(current.visibleSeries().length, 0, "重绘时恢复两组隐藏，legendUnSelect不能误发legendselectchanged");
    assert.ok(chips.every((chip) => chip.getAttribute("aria-pressed") === "false"));
    await click(page, page.byId("themeBtn"));
    assert.equal(current.visibleSeries().length, 0, "主题重绘也保留两组隐藏");
    for (const chip of chips) await click(page, chip);
    assert.equal(current.visibleSeries().length, 2 * segments);
  }
  const details = page.byId("apiDetailBody");
  const rows = Array.from(details.querySelectorAll("tr"));
  assert.equal(rows.length, chart(page, "chartApi").option.yAxis.data.length);
  assert.equal(rows.length, 36, "全部36项API报价都应可在明细表访问");
  const solRow = rows.find((row) => row.querySelector("th")!.textContent!.includes("GPT-6.1 Sol"))!;
  assert.deepEqual(Array.from(solRow.querySelectorAll("td")).slice(1, 4).map((td) => td.textContent!.trim()), ["$2", "$10", "1M"], "明细保留输入/输出每百万价格及10美元购买力");
  assert.ok(details.querySelector('a[href^="https://"]'));
  page.healthy();
});

test("Plus区间按公式进入每周tokens图，普通请求与credits折算不混入", async () => {
  const page = await openPage();
  const app = page.runtime;
  const extraBase = { vendor: "回归厂商", plan: "测试档", ver: "—", cur: "CNY", priceM: 100, apiIn: 10, apiOut: 20, apiCache: 1, tps: "—", source: "https://example.test/pricing", note: "" };
  app.METRICS_ALL.push({ ...extraBase, model: "普通请求回归", reqPer5h: 100 } as never, { ...extraBase, model: "credits回归", creditCNY: 100 } as never);
  app.renderTokensChart();
  for (const model of ["普通请求回归", "credits回归"]) {
    const metrics = app.computeMetrics(app.METRICS_ALL.find((m) => m.model === model)!);
    assert.ok(metrics && metrics.wkLowM != null && metrics.wkLowM > 0, model + "虽可换算，仍不进入周tokens图");
  }
  const option = chart(page, "chartTokens").option;
  const rows = tokenRows(option);
  assert.equal(rows.some((r) => ["普通请求回归", "credits回归"].includes(r.model)), false);
  for (const [model, high] of [["GPT-6 Sol", 30], ["GPT-6.1 Sol", 32]] as const) {
    const row = rows.find((r) => r.label.includes("ChatGPT Plus") && r.model === model);
    assert.ok(row, model + " Plus区间不能因原始wkLowM缺省而消失");
    assert.equal(row.lowM, 1.5, "15次×20,000tokens×5窗口÷百万");
    assert.equal(row.highM, high, "150/160次×40,000tokens×5窗口÷百万");
    assert.equal(row.isOfficial, false, "公式推算不应显示成官方tokens额度");
    assert.equal(row.conf, "中");
    const tip = option.tooltip.formatter({ data: { _r: row } });
    assert.ok(tip.includes(`1.5–${high}M`));
    assert.match(tip, /中/);
  }
  page.healthy();
});

test("tokens图使用稳定套餐引用取得价格，稳定ID与旧数组都能排除重复估算", async () => {
  const page = await openPage();
  const app = page.runtime;
  const reference = app.findPlanReference(app.PLAN_TOKENS[0]!.ref)!;
  const metric = app.METRICS_ALL.find((m) => app.findPlanReference(m.ref) === reference)!;
  app.METRICS_ALL.push({ ...metric, ref: reference.id, model: "ID重复回归", wkLowM: 1, wkHighM: 2 },
    { ...metric, ref: [reference.vendor, reference.plan], model: "旧数组重复回归", wkLowM: 1, wkHighM: 2 } as never);
  reference.priceM! += 10;
  app.renderTokensChart();
  const rows = tokenRows(chart(page, "chartTokens").option);
  assert.equal(rows.some((r) => ["ID重复回归", "旧数组重复回归"].includes(r.model)), false, "同套餐的官方tokens和估算行不重复展示");
  const expectedPrice = reference.priceM! * (reference.cur === "USD" ? app.RATE : 1);
  const label = app.planLabel(reference);
  const official = rows.find((r) => r.isOfficial && r.label.startsWith(label + " · "));
  assert.ok(official);
  assert.equal(official.priceCNY, expectedPrice, "官方图表价格直接从当前套餐身份取得");
  (app.PLAN_TOKENS[0] as { ref: unknown }).ref = [reference.vendor, reference.plan];
  app.renderTokensChart();
  const after = tokenRows(chart(page, "chartTokens").option).find((r) => r.isOfficial && r.label.startsWith(label + " · "))!;
  assert.equal(after.priceCNY, expectedPrice, "旧数组引用仍兼容");
  page.healthy();
});

test("极值图使用明确标注的对数轴，团队价格按席位/整包分组", async () => {
  const page = await openPage({ url: "/index.html#s4" });
  for (const id of ["chartTeam", "chartTokens", "chartApi", "chartPower"]) {
    const option = chart(page, id).option;
    assert.equal(option.xAxis.type, "log", id);
    assert.equal(option.xAxis.logBase, 10, id);
    assert.ok(option.xAxis.min > 0, id);
    assert.equal(option.xAxis.startValue, option.xAxis.min, "log柱形从最小刻度起画，不能以默认1为基线反向画小数");
    assert.match(option.xAxis.name, /对数刻度/, id);
    assert.match(page.byId(id).getAttribute("aria-label")!, /对数刻度/, id);
  }
  const team = chart(page, "chartTeam").option;
  let packageStarted = false;
  let prior = 0;
  for (const [i, row] of (team.series[0].data as { _p: Plan; value: number }[]).entries()) {
    const isPackage = !row._p.seat;
    if (isPackage && !packageStarted) { packageStarted = true; prior = 0; }
    assert.ok(!packageStarted || isPackage, "席位价不能夹在整包价格中间");
    assert.ok(row.value >= prior, "只在同一计价单位内排序");
    prior = row.value;
    assert.match(team.yAxis.data[i], isPackage ? /^整包\/月 · / : /^每席\/月 · /);
    assert.match(team.tooltip.formatter({ data: row }), isPackage ? /整包价\/月/ : /每席位\/用户\/月/);
  }
  page.healthy();
});

test("周tokens图按真实区间端点叠画，定额仅显示一个值且图例颜色可辨", async () => {
  const page = await openPage({ url: "/index.html#s4" });
  const option = chart(page, "chartTokens").option;
  for (const series of option.series) {
    assert.equal(series.stack, undefined, "对数区间不能把 high-low 差值作为堆叠段");
    for (const point of series.data.filter(Boolean)) {
      assert.ok([point._r.lowM, point._r.highM].includes(point.value));
      if (series.label) assert.equal(series.label.formatter({ data: point }).includes("–"), point._r.lowM !== point._r.highM);
    }
  }
  assert.equal(page.runtime.weeklyTokenRange(416, 416), "416M");
  const fixed = { label: "测试定额", lowM: 416, highM: 416, model: "GLM-5.3", priceCNY: 100, isOfficial: true, url: "https://example.test/" };
  assert.match(option.tooltip.formatter({ data: { _r: fixed } }), /每周可用：416M tokens/);
  assert.doesNotMatch(option.tooltip.formatter({ data: { _r: fixed } }), /416–416/);
  for (const legend of ["tokensLegend", "apiLegend", "powerLegend"]) {
    for (const chip of page.byId(legend).querySelectorAll("[data-series]")) {
      const swatch = chip.querySelector<HTMLElement>(".legend-swatch");
      assert.ok(swatch, legend + " 色块");
      assert.equal(swatch.getAttribute("aria-hidden"), "true");
      assert.match(swatch.getAttribute("style")!, /background:\s*#[0-9a-f]{6}/i);
    }
  }
  const panel = page.byId("tokenInsight");
  assert.ok(panel.querySelector(".token-insight-list"));
  assert.ok(panel.querySelector(".token-insight-note"), "说明放在滚动列表外，能独立保留间距");
  page.healthy();
});

test("排行套餐名读取主表，估算柱用斜纹并保留原始精确成本", async () => {
  const page = await openPage();
  const app = page.runtime;
  Object.assign(app.rankState, { scope: "all", tier: "all" });
  app.findPlanReference(app.METRICS_ALL[0]!.ref)!.plan = "统一名称回归";
  /* 目录数据不是响应式的：改名后像数据更新那样让排行重新计算。 */
  app.rankState.tier = "flagship";
  await page.settle();
  app.rankState.tier = "all";
  await page.settle();
  app.renderRankChart();
  const option = chart(page, "chartRank").option;
  const estimates: boolean[] = [];
  for (const [i, point] of (option.series[0].data as { _r?: { m: { ref: string; model: string; plan: string }; c: { costPerM: number } }; value: number | null; itemStyle: { decal?: unknown } }[]).entries()) {
    if (!point._r) {
      /* 官方口径折算组与估算组之间的分隔行：无柱值、标签说明分组。 */
      assert.equal(point.value, null);
      assert.match(option.yAxis.data[i], /以下为第三方或请求次数估算/);
      continue;
    }
    const low = app.provenance(app.METRICS_ALL.find((m) => m.ref === point._r!.m.ref && m.model === point._r!.m.model)!).conf === "低";
    assert.equal(Boolean(point.itemStyle.decal), low, "斜纹只标低置信估算");
    assert.equal(point.value, point._r.c.costPerM, "绘制原值，标签负责小数显示");
    assert.ok(option.yAxis.data[i].includes(point._r.m.plan));
    estimates.push(low);
  }
  /* 依据官方额度规则折算的档位整体排在估算之前。 */
  assert.ok(estimates.indexOf(true) > 0 && estimates.slice(estimates.indexOf(true)).every(Boolean));
  assert.ok(option.series[0].data.some((p: { _r?: unknown }) => !p._r), "两组之间有分隔行");
  assert.ok(page.byId("rankDetailBody").textContent!.includes("统一名称回归"));
  assert.ok(page.byId("rankDetailBody").querySelector(".rank-divider"));
  assert.doesNotMatch(option.yAxis.data.join(" "), / · Coding (?:Lite|Pro|Max)/);
  assert.match(page.byId("rankNote").textContent!, /实色柱.*斜纹柱/);
  /* 中转站不和官方订阅比单价，排行与厂商下拉都不出现。 */
  assert.equal(app.rankRows().filter((r: { m: { ref: string } }) => app.isRelay(app.findPlanReference(r.m.ref)!)).length, 0);
  assert.doesNotMatch(page.byId("rankVendor").textContent!, /DevPass/);
  page.healthy();
});

test("默认排行含估算，Claude/ChatGPT/Kimi可按厂商定位并分享，完整明细按钮可展开", async () => {
  const page = await openPage({ url: "/index.html#rank" });
  const app = page.runtime;
  assert.equal(app.rankState.scope, "all");
  const select = page.byId<HTMLSelectElement>("rankVendor");
  assert.match(select.textContent!, /Claude（Anthropic）/);
  assert.match(select.textContent!, /ChatGPT（OpenAI）/);
  assert.match(select.textContent!, /Kimi（月之暗面）/);
  for (const vendor of ["Anthropic", "OpenAI", "月之暗面 Kimi"]) {
    select.value = vendor;
    page.fire(select, "change");
    await page.settle();
    const bars = (chart(page, "chartRank").option.series[0].data as { _r?: { m: { vendor: string } } }[]).filter((p) => p._r);
    assert.ok(bars.length > 0, vendor);
    assert.ok(bars.every((p) => p._r!.m.vendor === vendor));
    assert.equal(select.value, vendor);
    assert.equal(new URLSearchParams(location.search).get("rvendor"), vendor);
    assert.match(page.byId("rankNote").textContent!, /当前口径全厂商共/);
  }
  await click(page, page.byId("openRankDetails"));
  assert.equal(page.byId<HTMLDetailsElement>("rankDetails").open, true);
  assert.equal(document.activeElement?.id, "rankDetailsSummary");
  page.healthy();
  const restored = await openPage({ url: "/index.html?rvendor=OpenAI#rank" });
  assert.equal(restored.byId<HTMLSelectElement>("rankVendor").value, "OpenAI");
  assert.ok((chart(restored, "chartRank").option.series[0].data as { _r?: { m: { vendor: string } } }[]).filter((p) => p._r).every((p) => p._r!.m.vendor === "OpenAI"));
  restored.healthy();
  /* 只有历史/限量档的厂商与旧 official 口径的分享链接被安全回退。 */
  const legacy = await openPage({ url: "/index.html?rscope=official&rvendor=%E9%98%BF%E9%87%8C%E4%BA%91%E7%99%BE%E7%82%BC#rank" });
  assert.equal(legacy.runtime.rankState.scope, "credits");
  assert.equal(legacy.runtime.rankState.vendor, "all");
  assert.equal(legacy.byId("rankVendor").querySelector('option[value="阿里云百炼"]'), null);
  legacy.healthy();
});

test("亮暗主题的图表tooltip读取当前语义配色，切换后已加载图表同步", async () => {
  const page = await openPage({ url: "/index.html#s4" });
  const app = page.runtime;
  const renderedCount = page.charts.size;
  const tooltipHtml = () => {
    const personal = app.personalTooltip(app.PLANS.find((p) => p.vendor === "Anthropic" && p.plan === "Claude Pro")!);
    const formatItem = (id: string) => {
      const option = chart(page, id).option;
      return option.tooltip.formatter({ data: option.series.flatMap((s: { data: unknown[] }) => s.data).find(Boolean) });
    };
    return [personal, formatItem("chartTeam"), formatItem("chartTokens"), formatItem("chartRank"), chart(page, "chartApi").option.tooltip.formatter([{ dataIndex: 0 }])] as string[];
  };
  const before = tooltipHtml();
  for (const theme of ["light", "dark"]) {
    assert.equal(document.documentElement.dataset.theme, theme);
    const palette = Object.values(app.PAL);
    for (const tip of tooltipHtml()) {
      const colors = [...tip.matchAll(/style="color:([^;"\s]+)/g)].map((m) => m[1]);
      assert.ok(colors.length > 0);
      assert.ok(colors.every((color) => palette.includes(color!)), theme + " tooltip存在未随主题切换的颜色 " + colors.join(","));
    }
    for (const current of page.charts.values() as Iterable<FakeChart>) if (current.option.tooltip) {
      assert.equal(current.option.tooltip.backgroundColor, app.PAL.tipBg);
      assert.equal(current.option.tooltip.textStyle.color, app.PAL.tipText);
    }
    if (theme === "light") await click(page, page.byId("themeBtn"));
  }
  assert.notEqual(tooltipHtml()[0], before[0], "额度和模型标签颜色随主题变化");
  assert.equal(page.charts.size, renderedCount);
  page.healthy();
});

test("390px 视口把类别名放在柱子上方整行显示，绘图区不再被标签挤占", async () => {
  const narrow = await openPage({ width: 390, url: "/index.html#s4" });
  narrow.healthy();
  assert.equal(narrow.charts.size, 6);
  /* 没有布局时图表宿主宽度按视口宽度 − 72 计算（与真实页面的边距一致）。 */
  const width = 390 - 72;
  for (const [id, current] of narrow.charts) {
    const option = current.option, label = option.yAxis.axisLabel, grid = option.grid;
    assert.equal(label.inside, true, id + " 窄屏标签应进入绘图区上方");
    assert.equal(label.verticalAlign, "bottom", id);
    assert.ok(label.width >= width - 60, id + " 标签应接近整行宽度，实际为 " + label.width);
    assert.equal(label.overflow, "truncate", id);
    const available = width - grid.left - grid.right;
    assert.ok(available > 180, id + " 绘图区应保留整行宽度，实际为 " + available);
  }
  /* 名称占一行后行高相应增加，避免文字压到上一根柱子。 */
  const rows = chart(narrow, "chartRank").option.yAxis.data.length;
  assert.ok(parseFloat(narrow.byId("chartRank").style.height) >= rows * 46, "窄屏排行图每行至少 46px");
  const wide = await openPage({ width: 1280, url: "/index.html#s4" });
  for (const [id, current] of wide.charts) {
    const label = current.option.yAxis.axisLabel;
    assert.ok(!label.inside && label.width <= 260, id + " 宽屏保留左侧限宽标签");
  }
  wide.healthy();
});
