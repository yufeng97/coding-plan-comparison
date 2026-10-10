#!/usr/bin/env node
/* 图表回归：懒加载、图例、主题配色与响应式（拆分自 test-app.js） */
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");

test("首次导航及分享锚点先渲染前方五组图表，再定位 API 区", () => {
  for (const fromHash of [false, true]) {
    const app = createApp({ url: "http://127.0.0.1:8123/index.html" + (fromHash ? "#s4" : "") });
    if (!fromHash) {
      assert.equal(app.charts.size, 0);
      const event = app.fire(app.anchor("#s4"), "click");
      assert.equal(event.defaultPrevented, true);
    }
    healthy(app);
    assert.equal(app.location.hash, "#s4");
    assert.equal(app.run("LAZY_DONE.size"), 5);
    const scrollIndex = app.timeline.indexOf("scroll:s4");
    assert.ok(scrollIndex >= 0);
    for (const id of ["chartRank", "chartPersonal", "chartTeam", "chartTokens", "chartApi", "chartPower"]) {
      const renderIndex = app.timeline.indexOf("render:" + id);
      assert.ok(renderIndex >= 0 && renderIndex < scrollIndex, id + " 应在定位前渲染");
    }
  }
});

test("图表跳表清除旧 cloud/cn 条件并定位，清除按钮恢复默认表格", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?tcat=cloud&tregion=cn&tapply=1" });
  const search = app.elements.get("chartSearch");
  search.value = "Claude Team";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.match(app.elements.get("notePersonal").innerHTML, /在完整表里看/);
  app.fire(app.elements.get("showExcludedInTable"), "click");
  healthy(app);
  assert.equal(app.run("tableState.cat"), "all");
  assert.equal(app.run("tableState.region"), "all");
  assert.equal(app.run("tableState.fromPicker"), false);
  assert.equal(app.run('computeTableRows().filter(p => p.vendor === "Anthropic" && /Claude Team/.test(p.plan)).length'), 2);
  assert.equal(app.run('computeTableRows().every(p => queryHit(planSearchBlob(p), "Claude Team"))'), true);
  assert.equal(app.elements.get("selectCat").value, "all");
  assert.equal(app.elements.get("selectRegion").value, "all");
  assert.equal(app.location.hash, "#table");
  assert.equal(app.run("LAZY_DONE.size"), app.run('LAZY_CHARTS.filter((item) => byId(item.el).compareDocumentPosition(byId("table")) & 4).length'), "只预先渲染数据表之前的图表");
  const params = new URLSearchParams(app.location.search);
  assert.equal(params.get("q"), "Claude Team");
  assert.equal(params.has("tcat"), false);
  assert.equal(params.has("tregion"), false);
  assert.equal(params.has("tapply"), false);
  app.fire(app.elements.get("tableResetBtn"), "click");
  assert.equal(app.run("tableState.search"), "");
  assert.equal(app.run("tableState.sortKey + ':' + tableState.sortDir"), "priceM:1");
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).filter((p) => !tableExtraHidden(p)).length"));
  assert.equal(app.run("tableState.extra"), false, "清除筛选也收起中转站与待核价格");
});

test("个人图表显示全部可收起，空结果可清除并恢复20档与筛选按钮状态", () => {
  const app = createApp();
  app.run("renderPersonalChart();");
  const chart = () => app.charts.get("chartPersonal").option;
  assert.equal(chart().series[0].data.length, 20);
  assert.equal(app.elements.get("chartPersonalEmpty").hidden, true);
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.equal(app.run("personalState.limit"), null);
  assert.ok(chart().series[0].data.length > 20);
  assert.match(app.elements.get("showAllPersonal").textContent, /收起为 20 档/);
  assert.equal(new URLSearchParams(app.location.search).get("plimit"), "all");
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.equal(chart().series[0].data.length, 20);
  assert.equal(new URLSearchParams(app.location.search).has("plimit"), false);
  for (const [id, key, value] of [["chipCat", "cat", "cloud"], ["chipRegion", "region", "cn"], ["chipBilling", "billing", "Y"]]) {
    const chip = app.elements.get(id).querySelectorAll(".chip").find((e) => e.dataset[key] === value);
    app.fire(chip, "click");
    assert.equal(chip.getAttribute("aria-pressed"), "true");
  }
  const search = app.elements.get("chartSearch");
  search.value = "__没有任何匹配套餐__";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.equal(chart().series[0].data.length, 0);
  assert.equal(app.elements.get("chartPersonal").hidden, true);
  assert.equal(app.elements.get("chartPersonalEmpty").hidden, false);
  assert.equal(app.elements.get("chartPersonalEmpty").getAttribute("role"), "status");
  app.fire(app.elements.get("personalResetBtn"), "click");
  assert.equal(app.run('JSON.stringify(personalState)'), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20, fromPicker:false }));
  assert.equal(search.value, "");
  assert.equal(app.run("document.activeElement.id"), "chartSearch");
  assert.equal(app.elements.get("chartPersonal").hidden, false);
  assert.equal(app.elements.get("chartPersonalEmpty").hidden, true);
  assert.equal(chart().series[0].data.length, 20);
  for (const [id, key, value] of [["chipCat", "cat", "all"], ["chipRegion", "region", "all"], ["chipBilling", "billing", "M"]]) {
    const chips = app.elements.get(id).querySelectorAll(".chip");
    assert.equal(chips.filter((e) => e.getAttribute("aria-pressed") === "true").length, 1);
    assert.equal(chips.find((e) => e.dataset[key] === value).getAttribute("aria-pressed"), "true");
  }
  healthy(app);
});

test("归一化后为空的图表搜索保持20档，显示全部和收起仍可用", () => {
  const app = createApp();
  const search = app.elements.get("chartSearch");
  for (const value of [" ", "\t\n", "---", " . / _ · "]) {
    search.value = value;
    app.fire(search, "input");
    app.flushTimeouts();
    assert.equal(app.charts.get("chartPersonal").option.series[0].data.length, 20, JSON.stringify(value));
    assert.equal(app.elements.get("chartPersonal").style.height, "730px");
    assert.ok(app.elements.get("showAllPersonal"), "无有效关键词时不能丢失展开/收起入口");
    assert.doesNotMatch(app.elements.get("notePersonal").innerHTML, /同名模型还有|在完整表里看/);
  }
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.ok(app.charts.get("chartPersonal").option.series[0].data.length > 20);
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.equal(app.charts.get("chartPersonal").option.series[0].data.length, 20);
  search.value = " Claude - Pro ";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.ok(app.charts.get("chartPersonal").option.series[0].data.some((d) => d._p.vendor === "Anthropic" && d._p.plan === "Claude Pro"), "真实关键词仍按相同归一化规则匹配");
  healthy(app);
});

test("年付图表读屏摘要与人民币柱值一致，缺少年付价时排除该档", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?pq=CursorPro&pbilling=Y#s1" });
  const label = () => app.elements.get("chartPersonal").getAttribute("aria-label");
  const prices = () => app.charts.get("chartPersonal").option.series[0].data;
  assert.match(label(), /年付折月，人民币\/月/);
  for (const row of prices()) assert.ok(label().includes(row._p.plan + " ¥" + row.value), "摘要使用实际绘制的年付人民币价格");
  assert.doesNotMatch(label(), /\$20|\$60/);
  app.run('PLANS.find(p => p.vendor === "Cursor" && p.plan === "Pro").priceY = null; renderPersonalChart();');
  assert.equal(prices().some(row => row._p.plan === "Pro"), false);
  assert.doesNotMatch(label(), /Cursor Pro ¥/);
  assert.match(app.elements.get("notePersonal").innerHTML, /未列公开年付价的档位已排除/);
  healthy(app);
});

test("仅尺寸变化的可见图表响应缩放，离屏图表滚入后补齐", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  const chart = app.charts.get("chartPersonal"), element = app.elements.get("chartPersonal");
  let width = 1208, renderedWidth = width, updates = 0, resizes = 0;
  const height = parseFloat(element.style.height);
  element.getBoundingClientRect = () => ({ top: 50, bottom: 50 + height, left: 0, right: width, width, height });
  chart.getWidth = () => renderedWidth;
  chart.getHeight = () => height;
  chart.setOption = (option) => { updates++; assert.equal(option.series, undefined, "缩放不能重建数据或图例"); };
  chart.resize = () => { resizes++; renderedWidth = width; };
  app.fireWindow("resize");
  app.flushTimeouts();
  assert.equal(updates, 0, "只改变窗口高度或同尺寸resize不重绘");
  width = 600;
  app.fireWindow("resize");
  app.flushTimeouts();
  assert.equal(updates, 1);
  assert.equal(resizes, 1);
  const tokens = app.charts.get("chartTokens"), tokenElement = app.elements.get("chartTokens");
  let tokenUpdates = 0, tokenWidth = 1208;
  tokens.getWidth = () => tokenWidth;
  tokens.getHeight = () => parseFloat(tokenElement.style.height);
  tokens.setOption = () => tokenUpdates++;
  tokens.resize = () => { tokenWidth = 600; };
  assert.equal(tokenUpdates, 0, "离屏图表在resize时不重绘");
  const tokenHeight = parseFloat(tokenElement.style.height);
  tokenElement.getBoundingClientRect = () => ({ top: 50, bottom: 50 + tokenHeight, left: 0, right: 600, width: 600, height: tokenHeight });
  app.fireWindow("scroll");
  assert.equal(tokenUpdates, 1);
  assert.equal(tokenWidth, 600);
  healthy(app);
});

test("tokens图区间由两组DOM图例完整切换，重绘保留隐藏状态；API图例与明细完整", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  /** @type {Array<[string, string, number]>} */
  const legendCases = [["chartTokens", "tokensLegend", 2], ["chartApi", "apiLegend", 1], ["chartPower", "powerLegend", 1]];
  for (const [chartId, legendId, segments] of legendCases) {
    const chart = app.charts.get(chartId);
    const chips = app.elements.get(legendId).querySelectorAll("[data-series]");
    assert.equal(chips.length, 2);
    assert.equal(chart.option.legend.show, false, "可键盘操作的DOM图例替代画布图例");
    for (const chip of chips) {
      assert.equal(chip.tagName, "BUTTON");
      assert.ok(chart.option.legend.data.includes(chip.dataset.series), "图例与series名称一致");
      assert.equal(chart.option.series.filter((s) => s.name === chip.dataset.series).length, segments);
      assert.equal(chip.getAttribute("aria-pressed"), "true");
      app.fire(chip, "click");
      assert.equal(chip.getAttribute("aria-pressed"), "false");
      assert.equal(chart.visibleSeries().some((s) => s.name === chip.dataset.series), false, "基础柱及区间上限段应一起隐藏");
      app.run(chartId === "chartTokens" ? "renderTokensChart();" : "renderApiChart();");
      assert.equal(chip.getAttribute("aria-pressed"), "false", "重绘不能重新选中图例");
      assert.equal(chart.visibleSeries().some((s) => s.name === chip.dataset.series), false);
      const priorActions = chart.actions.length;
      app.fire(chip, "click");
      assert.equal(chart.actions.length, priorActions + 1, "重绘不能叠加点击监听器");
      assert.equal(chip.getAttribute("aria-pressed"), "true");
      assert.equal(chart.visibleSeries().filter((s) => s.name === chip.dataset.series).length, segments);
    }
    chips.forEach((chip) => app.fire(chip, "click"));
    assert.equal(chart.visibleSeries().length, 0, "两组同时隐藏应没有残留柱段");
    app.run(chartId === "chartTokens" ? "renderTokensChart();" : "renderApiChart();");
    assert.equal(chart.visibleSeries().length, 0, "重绘时恢复两组隐藏，legendUnSelect不能误发legendselectchanged");
    assert.ok(chips.every((chip) => chip.getAttribute("aria-pressed") === "false"));
    app.fire(app.elements.get("themeBtn"), "click");
    assert.equal(chart.visibleSeries().length, 0, "主题重绘也保留两组隐藏");
    chips.forEach((chip) => app.fire(chip, "click"));
    assert.equal(chart.visibleSeries().length, 2 * segments);
  }
  const details = app.elements.get("apiDetailBody");
  assert.equal(details.querySelectorAll("tr").length, app.charts.get("chartApi").option.yAxis.data.length);
  assert.equal(details.querySelectorAll("tr").length, 36, "全部36项API报价都应可在明细表访问");
  const solRow = details.querySelectorAll("tr").find((row) => row.querySelector("th").textContent.includes("GPT-6.1 Sol"));
  assert.deepEqual(solRow.querySelectorAll("td").slice(1, 4).map((td) => td.textContent), ["$2", "$10", "1M"], "明细保留输入/输出每百万价格及10美元购买力");
  assert.match(details.innerHTML, /href="https:\/\//);
  healthy(app);
});

test("Plus区间按公式进入每周tokens图，普通请求与credits折算不混入", () => {
  const app = createApp();
  app.run(`
    const extraBase = { vendor: "回归厂商", plan: "测试档", ver: "—", cur: "CNY", priceM: 100, apiIn: 10, apiOut: 20, apiCache: 1, tps: "—", source: "https://example.test/pricing", note: "" };
    METRICS_ALL.push({ ...extraBase, model: "普通请求回归", reqPer5h: 100 });
    METRICS_ALL.push({ ...extraBase, model: "credits回归", creditCNY: 100 });
    renderTokensChart();
  `);
  assert.ok(app.run('computeMetrics(METRICS_ALL.find(m => m.model === "普通请求回归")).wkLowM') > 0, "普通请求虽可换算，仍不进入周tokens图");
  assert.ok(app.run('computeMetrics(METRICS_ALL.find(m => m.model === "credits回归")).wkLowM') > 0, "credits虽可换算，仍不进入周tokens图");
  const chart = app.charts.get("chartTokens").option;
  const rows = [...new Map(chart.series.flatMap((s) => s.data.filter(Boolean).map((d) => [d._r.label, d._r]))).values()];
  assert.equal(rows.some((r) => ["普通请求回归", "credits回归"].includes(r.model)), false);
  for (const [model, high] of [["GPT-6 Sol", 30], ["GPT-6.1 Sol", 32]]) {
    const row = rows.find((r) => r.label.includes("ChatGPT Plus") && r.model === model);
    assert.ok(row, model + " Plus区间不能因原始wkLowM缺省而消失");
    assert.equal(row.lowM, 1.5, "15次×20,000tokens×5窗口÷百万");
    assert.equal(row.highM, high, "150/160次×40,000tokens×5窗口÷百万");
    assert.equal(row.isOfficial, false, "公式推算不应显示成官方tokens额度");
    assert.equal(row.conf, "中");
    const tip = chart.tooltip.formatter({ data: { _r: row } });
    assert.ok(tip.includes(`1.5–${high}M`));
    assert.match(tip, /中/);
  }
  healthy(app);
});

test("tokens图使用稳定套餐引用取得价格，稳定ID与旧数组都能排除重复估算", () => {
  const app = createApp();
  app.run(`
    globalThis.tokenReferencePlan = findPlanReference(PLAN_TOKENS[0].ref);
    const tokenReferenceMetric = METRICS_ALL.find(m => findPlanReference(m.ref) === tokenReferencePlan);
    METRICS_ALL.push({ ...tokenReferenceMetric, ref: tokenReferencePlan.id, model: "ID重复回归", wkLowM: 1, wkHighM: 2 });
    METRICS_ALL.push({ ...tokenReferenceMetric, ref: [tokenReferencePlan.vendor, tokenReferencePlan.plan], model: "旧数组重复回归", wkLowM: 1, wkHighM: 2 });
    tokenReferencePlan.priceM += 10;
    renderTokensChart();
  `);
  const rows = [...new Map(app.charts.get("chartTokens").option.series.flatMap((s) => s.data.filter(Boolean).map((d) => [d._r.label, d._r]))).values()];
  assert.equal(rows.some((r) => ["ID重复回归", "旧数组重复回归"].includes(r.model)), false, "同套餐的官方tokens和估算行不重复展示");
  const expectedPrice = app.run("tokenReferencePlan.priceM * (tokenReferencePlan.cur === 'USD' ? RATE : 1)");
  const label = app.run("planLabel(tokenReferencePlan)");
  const official = rows.find((r) => r.isOfficial && r.label.startsWith(label + " · "));
  assert.ok(official);
  assert.equal(official.priceCNY, expectedPrice, "官方图表价格直接从当前套餐身份取得");
  app.run("PLAN_TOKENS[0].ref = [tokenReferencePlan.vendor, tokenReferencePlan.plan]; renderTokensChart();");
  const after = app.charts.get("chartTokens").option.series.flatMap((s) => s.data.filter(Boolean)).find((d) => d._r.isOfficial && d._r.label.startsWith(label + " · "));
  assert.equal(after._r.priceCNY, expectedPrice, "旧数组引用仍兼容");
  healthy(app);
});

test("极值图使用明确标注的对数轴，团队价格按席位/整包分组", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  for (const id of ["chartTeam", "chartTokens", "chartApi", "chartPower"]) {
    const option = app.charts.get(id).option;
    assert.equal(option.xAxis.type, "log", id);
    assert.equal(option.xAxis.logBase, 10, id);
    assert.ok(option.xAxis.min > 0, id);
    assert.equal(option.xAxis.startValue, option.xAxis.min, "log柱形从最小刻度起画，不能以默认1为基线反向画小数");
    assert.match(option.xAxis.name, /对数刻度/, id);
    assert.match(app.elements.get(id).getAttribute("aria-label"), /对数刻度/, id);
  }
  const team = app.charts.get("chartTeam").option;
  let packageStarted = false;
  let prior = 0;
  for (const [i, row] of team.series[0].data.entries()) {
    const isPackage = !row._p.seat;
    if (isPackage && !packageStarted) { packageStarted = true; prior = 0; }
    assert.ok(!packageStarted || isPackage, "席位价不能夹在整包价格中间");
    assert.ok(row.value >= prior, "只在同一计价单位内排序");
    prior = row.value;
    assert.match(team.yAxis.data[i], isPackage ? /^整包\/月 · / : /^每席\/月 · /);
    assert.match(team.tooltip.formatter({ data: row }), isPackage ? /整包价\/月/ : /每席位\/用户\/月/);
  }
  healthy(app);
});

test("周tokens图按真实区间端点叠画，定额仅显示一个值且图例颜色可辨", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  const option = app.charts.get("chartTokens").option;
  for (const series of option.series) {
    assert.equal(series.stack, undefined, "对数区间不能把 high-low 差值作为堆叠段");
    for (const point of series.data.filter(Boolean)) {
      assert.ok([point._r.lowM, point._r.highM].includes(point.value));
      if (series.label) {
        const label = series.label.formatter({ data: point });
        assert.equal(label.includes("–"), point._r.lowM !== point._r.highM);
      }
    }
  }
  assert.equal(app.run("weeklyTokenRange(416,416)"), "416M");
  const fixed = { label: "测试定额", lowM: 416, highM: 416, model: "GLM-5.3", priceCNY: 100, isOfficial: true, url: "https://example.test/" };
  assert.match(option.tooltip.formatter({ data: { _r: fixed } }), /每周可用：416M tokens/);
  assert.doesNotMatch(option.tooltip.formatter({ data: { _r: fixed } }), /416–416/);
  for (const legend of ["tokensLegend", "apiLegend", "powerLegend"]) {
    const chips = app.elements.get(legend).querySelectorAll("[data-series]");
    for (const chip of chips) {
      const swatch = chip.querySelector(".legend-swatch");
      assert.ok(swatch, legend + " 色块");
      assert.equal(swatch.getAttribute("aria-hidden"), "true");
      assert.match(swatch.getAttribute("style"), /background:#[0-9a-f]{6}/i);
    }
  }
  const panel = app.elements.get("tokenInsight");
  assert.ok(panel.querySelector(".token-insight-list"));
  assert.ok(panel.querySelector(".token-insight-note"), "说明放在滚动列表外，能独立保留间距");
  healthy(app);
});

test("排行套餐名读取主表，估算柱用斜纹并保留原始精确成本", () => {
  const app = createApp();
  app.run(`
    rankState.scope = "all";
    rankState.tier = "all";
    globalThis.canonicalRankPlan = findPlanReference(METRICS_ALL[0].ref);
    canonicalRankPlan.plan = "统一名称回归";
    renderRankChart();
  `);
  const chart = app.charts.get("chartRank").option;
  const estimates = [];
  for (const [i, point] of chart.series[0].data.entries()) {
    if (!point._r) {
      /* 官方口径折算组与估算组之间的分隔行：无柱值、标签说明分组。 */
      assert.equal(point.value, null);
      assert.match(chart.yAxis.data[i], /以下为第三方或请求次数估算/);
      continue;
    }
    const low = app.run(`provenance(METRICS_ALL.find(m => m.ref === ${JSON.stringify(point._r.m.ref)} && m.model === ${JSON.stringify(point._r.m.model)})).conf === "低"`);
    assert.equal(Boolean(point.itemStyle.decal), Boolean(low), "斜纹只标低置信估算");
    assert.equal(point.value, point._r.c.costPerM, "绘制原值，标签负责小数显示");
    assert.ok(chart.yAxis.data[i].includes(point._r.m.plan));
    estimates.push(low);
  }
  /* 依据官方额度规则折算的档位整体排在估算之前。 */
  assert.ok(estimates.indexOf(true) > 0 && estimates.slice(estimates.indexOf(true)).every(Boolean));
  assert.ok(chart.series[0].data.some((p) => !p._r), "两组之间有分隔行");
  assert.ok(app.elements.get("rankDetailBody").innerHTML.includes("统一名称回归"));
  assert.match(app.elements.get("rankDetailBody").innerHTML, /rank-divider/);
  assert.doesNotMatch(chart.yAxis.data.join(" "), / · Coding (?:Lite|Pro|Max)/);
  assert.match(app.elements.get("rankNote").innerHTML, /实色柱.*斜纹柱/);
  /* 中转站不和官方订阅比单价，排行与厂商下拉都不出现。 */
  assert.equal(app.run("rankRows().filter(r => isRelay(findPlanReference(r.m.ref))).length"), 0);
  assert.doesNotMatch(app.elements.get("rankVendor").innerHTML, /DevPass/);
  healthy(app);
});

test("默认排行含估算，Claude/ChatGPT/Kimi可按厂商定位并分享，完整明细按钮可展开", () => {
  const app = createApp();
  assert.equal(app.run("rankState.scope"), "all");
  const select = app.elements.get("rankVendor");
  assert.match(select.innerHTML, /Claude（Anthropic）/);
  assert.match(select.innerHTML, /ChatGPT（OpenAI）/);
  assert.match(select.innerHTML, /Kimi（月之暗面）/);
  for (const vendor of ["Anthropic", "OpenAI", "月之暗面 Kimi"]) {
    select.value = vendor;
    app.fire(select, "change");
    const chart = app.charts.get("chartRank").option;
    const bars = chart.series[0].data.filter((p) => p._r);
    assert.ok(bars.length > 0, vendor);
    assert.ok(bars.every((p) => p._r.m.vendor === vendor));
    assert.equal(select.value, vendor);
    assert.equal(new URLSearchParams(app.location.search).get("rvendor"), vendor);
    assert.match(app.elements.get("rankNote").innerHTML, /当前口径全厂商共/);
  }
  app.fire(app.elements.get("openRankDetails"), "click");
  assert.equal(app.elements.get("rankDetails").open, true);
  assert.equal(app.run("document.activeElement.id"), "rankDetailsSummary");
  const restored = createApp({ url: "http://127.0.0.1:8123/index.html?rvendor=OpenAI#rank" });
  assert.equal(restored.elements.get("rankVendor").value, "OpenAI");
  assert.ok(restored.charts.get("chartRank").option.series[0].data.filter((p) => p._r).every((p) => p._r.m.vendor === "OpenAI"));
  /* 只有历史/限量档的厂商与旧 official 口径的分享链接被安全回退。 */
  const legacy = createApp({ url: "http://127.0.0.1:8123/index.html?rscope=official&rvendor=%E9%98%BF%E9%87%8C%E4%BA%91%E7%99%BE%E7%82%BC#rank" });
  assert.equal(legacy.run("rankState.scope"), "credits");
  assert.equal(legacy.run("rankState.vendor"), "all");
  assert.doesNotMatch(legacy.elements.get("rankVendor").innerHTML, /value="阿里云百炼"/);
  healthy(app); healthy(restored); healthy(legacy);
});

test("亮暗主题的图表tooltip读取当前语义配色，切换后已加载图表同步", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  const renderedCount = app.charts.size;
  const tooltipHtml = () => {
    const personal = app.run('personalTooltip(PLANS.find(p => p.vendor === "Anthropic" && p.plan === "Claude Pro"))');
    const formatItem = (id) => {
      const option = app.charts.get(id).option;
      return option.tooltip.formatter({ data: option.series.flatMap((s) => s.data).find(Boolean) });
    };
    return [personal, formatItem("chartTeam"), formatItem("chartTokens"), formatItem("chartRank"), app.charts.get("chartApi").option.tooltip.formatter([{ dataIndex: 0 }])];
  };
  const before = tooltipHtml();
  for (const theme of ["light", "dark"]) {
    assert.equal(app.run("document.documentElement.dataset.theme"), theme);
    const palette = app.run("Object.values(PAL)");
    for (const tip of tooltipHtml()) {
      const colors = [...tip.matchAll(/style="color:([^;"\s]+)/g)].map((m) => m[1]);
      assert.ok(colors.length > 0);
      assert.ok(colors.every((color) => palette.includes(color)), theme + " tooltip存在未随主题切换的颜色 " + colors.join(","));
    }
    for (const chart of app.charts.values()) if (chart.option.tooltip) {
      assert.equal(chart.option.tooltip.backgroundColor, app.run("PAL.tipBg"));
      assert.equal(chart.option.tooltip.textStyle.color, app.run("PAL.tipText"));
    }
    if (theme === "light") app.fire(app.elements.get("themeBtn"), "click");
  }
  assert.notEqual(tooltipHtml()[0], before[0], "额度和模型标签颜色随主题变化");
  assert.equal(app.charts.size, renderedCount);
  healthy(app);
});

test("390px 视口把类别名放在柱子上方整行显示，绘图区不再被标签挤占", () => {
  const app = createApp({ width: 390, url: "http://127.0.0.1:8123/index.html#s4" });
  healthy(app);
  assert.equal(app.charts.size, 6);
  for (const [id, chart] of app.charts) {
    const option = chart.option, label = option.yAxis.axisLabel, grid = option.grid;
    const width = app.elements.get(id).getBoundingClientRect().width;
    assert.equal(label.inside, true, id + " 窄屏标签应进入绘图区上方");
    assert.equal(label.verticalAlign, "bottom", id);
    assert.ok(label.width >= width - 60, id + " 标签应接近整行宽度，实际为 " + label.width);
    assert.equal(label.overflow, "truncate", id);
    const available = width - grid.left - grid.right;
    assert.ok(available > 180, id + " 绘图区应保留整行宽度，实际为 " + available);
  }
  /* 名称占一行后行高相应增加，避免文字压到上一根柱子。 */
  const rows = app.charts.get("chartRank").option.yAxis.data.length;
  assert.ok(parseFloat(app.elements.get("chartRank").style.height) >= rows * 46, "窄屏排行图每行至少 46px");
  const wide = createApp({ width: 1280, url: "http://127.0.0.1:8123/index.html#s4" });
  for (const [id, chart] of wide.charts) {
    const label = chart.option.yAxis.axisLabel;
    assert.ok(!label.inside && label.width <= 260, id + " 宽屏保留左侧限宽标签");
  }
  healthy(wide);
});

if (require.main === module) main();
