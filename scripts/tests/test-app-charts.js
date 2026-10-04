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
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?tcat=cloud&tregion=cn" });
  const search = app.elements.get("chartSearch");
  search.value = "Claude Team";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.match(app.elements.get("notePersonal").innerHTML, /在完整表里看/);
  app.fire(app.elements.get("showExcludedInTable"), "click");
  healthy(app);
  assert.equal(app.run("tableState.cat"), "all");
  assert.equal(app.run("tableState.region"), "all");
  assert.equal(app.run("computeTableRows().length"), 2);
  assert.equal(app.elements.get("selectCat").value, "all");
  assert.equal(app.elements.get("selectRegion").value, "all");
  assert.equal(app.location.hash, "#table");
  assert.equal(app.run("LAZY_DONE.size"), 5);
  const params = new URLSearchParams(app.location.search);
  assert.equal(params.get("q"), "Claude Team");
  assert.equal(params.has("tcat"), false);
  assert.equal(params.has("tregion"), false);
  app.fire(app.elements.get("tableResetBtn"), "click");
  assert.equal(app.run("tableState.search"), "");
  assert.equal(app.run("tableState.sortKey + ':' + tableState.sortDir"), "priceM:1");
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
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
  assert.equal(app.run('JSON.stringify(personalState)'), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20 }));
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

test("年付图表读屏摘要与人民币柱值一致，缺少年付价时明确标出月付", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?pq=CursorPro&pbilling=Y#s1" });
  const label = () => app.elements.get("chartPersonal").getAttribute("aria-label");
  const prices = () => app.charts.get("chartPersonal").option.series[0].data;
  assert.match(label(), /年付折月，人民币\/月/);
  for (const row of prices()) assert.ok(label().includes(row._p.plan + " ¥" + row.value), "摘要使用实际绘制的年付人民币价格");
  assert.doesNotMatch(label(), /\$20|\$60/);
  app.run('PLANS.find(p => p.vendor === "Cursor" && p.plan === "Pro").priceY = null; renderPersonalChart();');
  const monthly = prices().find((row) => row._p.plan === "Pro");
  assert.ok(label().includes("Cursor Pro ¥" + monthly.value + "（未列年付价，按月付）"));
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
  const label = app.run("PLAN_TOKENS[0].plan");
  const official = rows.find((r) => r.isOfficial && r.label.startsWith(label + "·"));
  assert.ok(official);
  assert.equal(official.priceCNY, expectedPrice, "官方图表价格直接从当前套餐身份取得");
  app.run("PLAN_TOKENS[0].ref = [tokenReferencePlan.vendor, tokenReferencePlan.plan]; renderTokensChart();");
  const after = app.charts.get("chartTokens").option.series.flatMap((s) => s.data.filter(Boolean)).find((d) => d._r.isOfficial && d._r.label.startsWith(label + "·"));
  assert.equal(after._r.priceCNY, expectedPrice, "旧数组引用仍兼容");
  healthy(app);
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

test("390px 视口所有图表限制轴标签宽度并保留绘图区预算", () => {
  const app = createApp({ width: 390, url: "http://127.0.0.1:8123/index.html#s4" });
  healthy(app);
  assert.equal(app.charts.size, 6);
  for (const [id, chart] of app.charts) {
    const option = chart.option, label = option.yAxis.axisLabel, grid = option.grid;
    assert.ok(label.width > 0 && label.width <= 110, id + " 标签宽度应不超过110px");
    assert.equal(label.overflow, "truncate", id);
    const available = app.elements.get(id).getBoundingClientRect().width - grid.left - grid.right - label.width - label.margin;
    assert.ok(available > 70, id + " 配置下至少保留70px绘图区，实际为 " + available);
  }
});

if (require.main === module) main();
