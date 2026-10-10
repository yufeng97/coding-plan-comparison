#!/usr/bin/env node
/* 数据表/导出/并排对比回归（拆分自 test-app.js） */
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");

test("比较和导出保留一次性/席位/4周单位、数据日期/汇率和展开字段", async () => {
  const app = createApp();
  app.run(`
    globalThis.testOnce = PLANS.find(p => p.vendor === "88code" && p.priceM === 66);
    globalThis.testSeat = PLANS.find(p => p.seat && isOnSalePlan(p));
    globalThis.testFourWeek = PLANS.find(p => /4\\s*周/.test(p.plan));
    globalThis.testMirror = PLANS.find(p => p.vendor === "AICodeMirror" && p.plan === "MAX");
    cmpState.items = [testOnce, testSeat]; openCmpModal();
  `);
  const compare = app.elements.get("cmpTable").innerHTML;
  assert.match(compare, /¥66\/一次性/);
  assert.match(compare, /席位\/月/);
  assert.doesNotMatch(compare, /¥66\/月|cmp-best-price/);
  assert.match(compare, /cmp-diff-row/);
  assert.equal(app.run("isPersonalMonthly(testFourWeek)"), false, "4周费用不能当作自然月月费");
  app.run('Object.assign(personalState, { cat: "all", region: "all", q: "", limit: null }); renderPersonalChart(); resetTableFilters();');
  assert.equal(app.run("chartCache.chartPersonal.option.series[0].data.some(d => isFourWeekPlan(d._p))"), false, "个人月费图不应混入4周档");
  assert.equal(app.run("computeTableRows().includes(testFourWeek)"), true, "4周档仍应保留在完整数据表");
  app.run('cmpState.items = PLANS.filter(p => p.vendor === "Anthropic" && ["Claude Pro", "Claude Max 5x"].includes(p.plan)); renderCmpModal();');
  assert.match(app.elements.get("cmpTable").innerHTML, /cmp-best-price/);
  const csv = app.run("tableRowsCsv([testOnce, testSeat, testFourWeek, testMirror])");
  const markdown = app.run("tableRowsMarkdown([testOnce, testSeat, testFourWeek, testMirror])");
  for (const value of ["参考汇率", "一次性", "席位/月", "4周", "Claude Code", app.run("META.updated"), String(app.run("RATE"))]) {
    assert.ok(csv.includes(value), "CSV 缺少 " + value);
    assert.ok(markdown.includes(value), "Markdown 缺少 " + value);
  }
  assert.match(csv, /数据更新日期|数据截至/);
  assert.match(markdown, /数据更新日期|数据截至/);
  assert.doesNotMatch(csv, /同 PRO 档/);
  app.run('tableState.search = "AICodeMirror MAX"; renderTable();');
  app.fire(app.elements.get("exportCsvBtn"), "click");
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].filename, /^coding-plans-.*\.csv$/);
  assert.match(await app.downloads[0].blob.text(), /数据更新日期|数据截至/);
  await app.run("copyTableMarkdown()");
  assert.match(app.run("copiedText"), /参考汇率/);
  healthy(app);
});

test("数据表空态保留对比选择、禁用空导出，清除筛选取消待执行搜索并回到搜索框", async () => {
  const app = createApp();
  app.run('cmpAdd("Anthropic", "Claude Pro");');
  const search = app.elements.get("searchInput");
  search.value = "__没有任何匹配方案__";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.equal(app.run("computeTableRows().length"), 0);
  assert.match(app.elements.get("tableBody").innerHTML, /没有匹配的公开标价记录|已选的对比方案仍保留/);
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(app.elements.get("exportCsvBtn").disabled, true);
  assert.equal(app.elements.get("copyMdBtn").disabled, true);
  app.fire(app.elements.get("exportCsvBtn"), "click");
  app.fire(app.elements.get("copyMdBtn"), "click");
  assert.equal(app.downloads.length, 0);
  assert.equal(app.run('typeof copiedText'), "undefined");
  app.run("exportTableCsv();");
  await app.run("copyTableMarkdown();");
  assert.equal(app.downloads.length, 0, "直接调用也不能生成只有表头的导出");
  assert.match(app.elements.get("tableFeedback").textContent, /没有可复制的方案/);
  assert.equal(app.elements.get("tableFeedback").getAttribute("role"), "status");
  search.value = "__另一个尚未执行的搜索__";
  app.fire(search, "input");
  app.fire(app.elements.get("tableEmptyResetBtn"), "click");
  app.flushTimeouts();
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
  assert.equal(search.value, "");
  assert.equal(app.run("document.activeElement.id"), "searchInput");
  assert.equal(app.elements.get("exportCsvBtn").disabled, false);
  assert.equal(app.elements.get("copyMdBtn").disabled, false);
  assert.equal(app.elements.get("tableResetBtn").disabled, true);
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(new URLSearchParams(app.location.search).has("q"), false);
  healthy(app);
});

test("并排对比支持逐项移出，重绘聚焦相邻按钮，关闭或入口失联有焦点恢复", () => {
  const app = createApp();
  app.run('tableState.search = "Anthropic"; renderTable();');
  const additions = app.elements.get("tableBody").querySelectorAll(".cmp-add");
  assert.ok(additions.length >= 3);
  additions.slice(0, 3).forEach((button) => app.fire(button, "click"));
  assert.equal(app.run("cmpState.items.length"), 3);
  assert.ok(additions.slice(0, 3).every((button) => button.getAttribute("aria-pressed") === "true"));
  const opener = app.elements.get("cmpOpenBtn");
  opener.focus();
  app.fire(opener, "click");
  assert.equal(app.elements.get("cmpModal").open, true);
  assert.equal(app.run("document.activeElement.id"), "cmpCloseBtn");
  let removals = app.elements.get("cmpTable").querySelectorAll(".cmp-remove");
  assert.equal(removals.length, 3);
  assert.equal(app.elements.get("cmpTable").querySelectorAll("thead th[scope=col]").length, 4);
  const adjacent = removals[2].dataset.plan;
  const removed = removals[1];
  removed.focus();
  app.fire(removed, "click");
  assert.equal(removed.isConnected, false, "重绘移除旧按钮");
  assert.equal(app.run("cmpState.items.length"), 2);
  assert.equal(app.elements.get("cmpModal").open, true);
  assert.equal(app.run("document.activeElement.dataset.plan"), adjacent);
  assert.equal(new URLSearchParams(app.location.search).get("cmp").split(";").length, 2);
  removals = app.elements.get("cmpTable").querySelectorAll(".cmp-remove");
  app.fire(removals[0], "click");
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(app.elements.get("cmpModal").open, false);
  assert.equal(opener.disabled, true);
  assert.equal(app.run("document.activeElement.id"), "searchInput", "只剩一档，禁用的比较入口不能接收焦点");
  assert.equal(app.elements.get("cmpBar").hidden, false);
  assert.match(app.elements.get("cmpBarText").textContent, /再选 1 档/);

  const entry = additions.find((button) => button.getAttribute("aria-pressed") === "false");
  app.fire(entry, "click");
  entry.focus();
  app.fire(opener, "click");
  const escaped = app.fire(app.elements.get("cmpCloseBtn"), "keydown", { key: "Escape" });
  assert.equal(escaped.defaultPrevented, true);
  assert.equal(app.elements.get("cmpModal").open, false);
  assert.equal(app.run("document.activeElement"), entry, "Escape返回原操作入口");
  entry.focus();
  app.fire(opener, "click");
  app.elements.get("cmpModal").close();
  assert.equal(app.run("document.activeElement"), entry, "原生close事件也还原焦点");
  entry.focus();
  app.fire(opener, "click");
  app.run('tableState.search = "__入口失联__"; renderTable();');
  assert.equal(entry.isConnected, false);
  app.fire(app.elements.get("cmpCloseBtn"), "click");
  assert.equal(app.run("document.activeElement"), opener, "原入口失联时返回仍可用的比较入口");
  healthy(app);
});

test("没有原生dialog接口时对比可显示、焦点循环、逐档移出并精确还原背景", () => {
  const app = createApp({ noNativeDialog: true });
  const dialog = app.elements.get("cmpModal"), backdrop = app.elements.get("cmpBackdrop");
  assert.equal(dialog.showModal, undefined);
  assert.equal(dialog.close, undefined);
  assert.equal(dialog.open, undefined, "兼容未知dialog元素，不能依赖open布尔属性");
  const header = app.run('qs(".topbar")'), hero = app.run('qs(".hero")');
  header.setAttribute("aria-hidden", "false");
  hero.setAttribute("inert", "");
  hero.setAttribute("aria-hidden", "true");
  app.run('cmpState.items = ["plan-0002", "plan-0003", "plan-0004"].map(findPlanReference); renderCmpBar();');
  const opener = app.elements.get("cmpOpenBtn");
  opener.focus();
  app.fire(opener, "click");
  assert.equal(app.run("isCmpModalOpen()"), true);
  assert.notEqual(dialog.getAttribute("open"), null);
  assert.equal(dialog.classList.contains("cmp-fallback"), true);
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(backdrop.hidden, false);
  assert.equal(app.run('document.body.classList.contains("has-cmp-modal")'), true);
  assert.notEqual(header.getAttribute("inert"), null);
  assert.equal(header.getAttribute("aria-hidden"), "true");
  assert.equal(app.run("document.activeElement.id"), "cmpCloseBtn");
  const controls = dialog.querySelectorAll("button, a[href], [tabindex]").filter((e) => !e.disabled && e.tabIndex >= 0);
  const first = controls[0], last = controls.at(-1);
  last.focus();
  const tab = app.fire(last, "keydown", { key: "Tab" });
  assert.equal(tab.defaultPrevented, true);
  assert.equal(app.run("document.activeElement"), first);
  const shiftTab = app.fire(first, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(shiftTab.defaultPrevented, true);
  assert.equal(app.run("document.activeElement"), last);
  app.elements.get("searchInput").focus();
  assert.equal(app.run("document.activeElement"), last, "inert背景不能抢走焦点");
  let removes = dialog.querySelectorAll(".cmp-remove");
  app.fire(removes[1], "click");
  assert.equal(app.run("cmpState.items.length"), 2);
  assert.equal(app.run("isCmpModalOpen()"), true);
  assert.ok(app.run('document.activeElement.classList.contains("cmp-remove")'));
  removes = dialog.querySelectorAll(".cmp-remove");
  app.fire(removes[0], "click");
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(dialog.getAttribute("open"), null);
  assert.equal(dialog.getAttribute("aria-modal"), null);
  assert.equal(backdrop.hidden, true);
  assert.equal(app.run('document.body.classList.contains("has-cmp-modal")'), false);
  assert.equal(header.getAttribute("inert"), null);
  assert.equal(header.getAttribute("aria-hidden"), "false", "关闭恢复原来的aria-hidden而非一律删除");
  assert.equal(hero.getAttribute("inert"), "", "既有inert保留");
  assert.equal(hero.getAttribute("aria-hidden"), "true");
  assert.equal(app.run("document.activeElement.id"), "searchInput");
  app.run('cmpState.items = ["plan-0002", "plan-0003"].map(findPlanReference); renderCmpBar();');
  opener.focus();
  app.fire(opener, "click");
  app.fire(app.elements.get("cmpCloseBtn"), "keydown", { key: "Escape" });
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(app.run("document.activeElement"), opener);
  app.fire(opener, "click");
  app.fire(backdrop, "click");
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(app.run("document.activeElement"), opener);
  app.fire(opener, "click");
  app.fire(app.elements.get("cmpCloseBtn"), "click");
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(app.run("document.activeElement"), opener);
  healthy(app);
});

test("表格排序键盘操作与aria说明一致，明细开关同步展开状态；额度空态恢复默认", () => {
  const app = createApp();
  const price = app.run('qs("#planTable th[data-sort=priceM]")');
  const annual = app.run('qs("#planTable th[data-sort=priceY]")');
  assert.equal(price.tabIndex, 0);
  assert.equal(price.getAttribute("aria-sort"), "ascending");
  assert.equal(annual.getAttribute("aria-sort"), null);
  assert.match(price.getAttribute("aria-label"), /当前从低到高.*激活后从高到低/);
  const event = app.fire(price, "keydown", { key: "Enter" });
  assert.equal(event.defaultPrevented, true);
  assert.equal(price.getAttribute("aria-sort"), "descending");
  app.fire(annual, "keydown", { key: " " });
  assert.equal(app.run("tableState.sortKey + ':' + tableState.sortDir"), "priceY:1");
  assert.equal(price.getAttribute("aria-sort"), null);
  assert.equal(annual.getAttribute("aria-sort"), "ascending");
  for (const [control, target] of [["tableColsToggle", "planTable"], ["metricsToggle", "metricsTable"]]) {
    const button = app.elements.get(control);
    assert.equal(button.getAttribute("aria-controls"), target);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    app.fire(button, "click");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    app.fire(button, "click");
    assert.equal(button.getAttribute("aria-expanded"), "false");
  }
  const weekly = app.run('qs("#metricsTable th[data-sort=twk]")');
  assert.equal(weekly.tabIndex, 0);
  assert.equal(weekly.getAttribute("aria-sort"), null);
  assert.match(weekly.getAttribute("aria-label"), /激活后从高到低/);
  app.fire(weekly, "keydown", { key: " " });
  assert.equal(app.run("metricsState.sortKey + ':' + metricsState.sortDir"), "twk:-1");
  assert.equal(weekly.getAttribute("aria-sort"), "descending");
  assert.match(app.elements.get("metricsNote").innerHTML, /按Tokens\/周从高到低排序/);
  const model = app.elements.get("metricsModel"), version = app.elements.get("metricsVer");
  model.value = "GPT-6.1 Sol";
  app.fire(model, "change");
  version.value = "V2";
  app.fire(version, "change");
  assert.match(app.elements.get("metricsBody").innerHTML, /当前模型与版本没有可展示的额度/);
  app.fire(app.elements.get("metricsEmptyResetBtn"), "click");
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(metricsState)')), { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker:false });
  assert.equal(model.value, "all");
  assert.equal(version.value, "all");
  assert.equal(app.run("document.activeElement.id"), "metricsModel");
  assert.equal(app.elements.get("metricsResetBtn").disabled, true);
  assert.ok(app.elements.get("metricsBody").querySelectorAll("tr").length > 1);
  assert.equal(new URLSearchParams(app.location.search).has("mver"), false);
  healthy(app);
});

test("个人图展开与收起保留同一操作焦点，清空比较条回到可用搜索入口", () => {
  const app = createApp();
  app.run("renderPersonalChart();");
  for (const limit of [null, 20]) {
    const previous = app.elements.get("showAllPersonal");
    previous.focus();
    app.fire(previous, "click");
    assert.equal(previous.isConnected, false, "说明文字重绘确实移除了旧按钮");
    assert.equal(app.run("personalState.limit"), limit);
    assert.equal(app.run("document.activeElement"), app.elements.get("showAllPersonal"));
  }
  app.run('cmpAdd("plan-0002");');
  app.elements.get("cmpClearBtn").focus();
  app.fire(app.elements.get("cmpClearBtn"), "click");
  assert.equal(app.elements.get("cmpBar").hidden, true);
  assert.equal(app.run("document.activeElement.id"), "searchInput");
  app.run('cmpAdd("plan-0002"); cmpAdd("plan-0003");');
  const search = app.elements.get("searchInput");
  search.focus();
  app.run("cmpClear();");
  assert.equal(app.run("document.activeElement"), search, "从其它控件程序性清空不抢焦点");
  healthy(app);
});

test("推荐和数据表同步同一方案的选择、上限与重绘焦点", () => {
  const app = createApp();
  app.run('tableState.search = "Anthropic"; renderTable();');
  const markup = '<button type="button" class="cmp-add" data-plan-id="plan-0002" data-vendor="Anthropic" data-plan="Claude Pro">＋对比</button>';
  const grid = app.elements.get("quickGrid");
  grid.innerHTML = markup;
  app.run("syncTableCmpButtons();");
  const getCardButton = () => grid.querySelector(".cmp-add");
  const tableButton = app.elements.get("tableBody").querySelector('.cmp-add[data-plan-id="plan-0002"]');
  app.fire(getCardButton(), "click");
  assert.equal(tableButton.getAttribute("aria-pressed"), "true");
  assert.equal(getCardButton().getAttribute("aria-pressed"), "true");
  const previous = getCardButton();
  previous.focus();
  grid.innerHTML = markup;
  app.run("syncTableCmpButtons(document.activeElement);");
  assert.equal(app.run("document.activeElement"), getCardButton(), "推荐重绘恢复自身容器的方案按钮，不能跳到表格重复项");
  app.run('cmpAdd("plan-0003"); cmpAdd("plan-0004"); cmpAdd("plan-0005");');
  assert.equal(getCardButton().disabled, false, "已选项仍能移出");
  assert.ok(app.elements.get("tableBody").querySelectorAll(".cmp-add").some((button) => button.disabled));
  app.fire(tableButton, "click");
  assert.equal(getCardButton().getAttribute("aria-pressed"), "false");
  assert.equal(getCardButton().disabled, false);
  healthy(app);
});

test("独立对比导出仅包含已选方案并保留完整元数据，窗口内复制降级可恢复焦点", async () => {
  const app = createApp();
  app.run(`
    const selectedOnce = PLANS.find(p => p.vendor === "88code" && p.priceM === 66);
    const selectedSeat = PLANS.find(p => p.seat && isOnSalePlan(p));
    cmpState.items = [selectedOnce, selectedSeat]; renderCmpBar();
    tableState.search = "Cursor"; renderTable(); openCmpModal();
  `);
  assert.equal(app.elements.get("copyCmpMdBtn").disabled, false);
  assert.equal(app.elements.get("exportCmpCsvBtn").disabled, false);
  app.fire(app.elements.get("exportCmpCsvBtn"), "click");
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].filename, /^coding-plans-compare-\d{8}\.csv$/);
  const csvBytes = Buffer.from(await app.downloads[0].blob.arrayBuffer());
  assert.equal(csvBytes.toString("utf8"), "\uFEFF" + app.run("tableRowsCsv(cmpState.items)"));
  await app.run("copyCmpMarkdown();");
  assert.equal(app.run("copiedText"), "并排对比（2 档方案）\n\n" + app.run("tableRowsMarkdown(cmpState.items)"));
  for (const value of ["一次性", "席位/月", "价格核查来源", app.run("META.updated"), app.run("META.rateAsOf")]) {
    assert.ok(app.run("copiedText").includes(value), "对比副本缺少 " + value);
  }
  const copyButton = app.elements.get("copyCmpMdBtn");
  copyButton.focus();
  app.run(`
    navigator.clipboard.writeText = async () => { throw new Error("clipboard denied"); };
    document.execCommand = () => {
      const text = byId("cmpModal").querySelector("textarea");
      globalThis.fallbackInsideDialog = !!text;
      globalThis.fallbackCopied = text && text.value;
      return !!text;
    };
  `);
  await app.run("copyCmpMarkdown();");
  assert.equal(app.run("fallbackInsideDialog"), true);
  assert.equal(app.run("fallbackCopied"), app.run("copiedText"));
  assert.equal(app.run("document.activeElement"), copyButton);
  app.run("cmpClear();");
  assert.equal(app.elements.get("copyCmpMdBtn").disabled, true);
  assert.equal(app.elements.get("exportCmpCsvBtn").disabled, true);
  app.run("exportCmpCsv();");
  await app.run("copyCmpMarkdown();");
  assert.equal(app.downloads.length, 1, "不足两档时不导出空对比");
  assert.match(app.elements.get("cmpFeedback").textContent, /至少选择 2 档/);
  healthy(app);
});

test("年付表格、比较和导出优先保留官方全年金额及席位单位", () => {
  const app = createApp();
  app.run(`
    globalThis.exactAnnualPlan = findPlanReference("plan-0002");
    globalThis.annualSeatPlan = findPlanReference("plan-0005");
    cmpState.items = [exactAnnualPlan, annualSeatPlan]; renderCmpModal();
  `);
  assert.match(app.run("planAnnualPriceCell(exactAnnualPlan)"), /\$200\/年/);
  assert.doesNotMatch(app.run("planAnnualPriceCell(exactAnnualPlan)"), /200\.04/);
  assert.match(app.run("planAnnualPriceCell(annualSeatPlan)"), /每席位/);
  const comparison = app.elements.get("cmpTable").innerHTML;
  assert.match(comparison, /年付全年金额/);
  assert.match(comparison, /\$200\/年/);
  assert.doesNotMatch(comparison, /200\.04/);
  for (const format of ["tableRowsCsv", "tableRowsMarkdown"]) {
    const result = app.run(`${format}([exactAnnualPlan, annualSeatPlan])`);
    assert.match(result, /年付全年金额/);
    assert.match(result, /\$200\/年/);
    assert.match(result, /每席位/);
    assert.doesNotMatch(result, /200\.04/);
  }
  healthy(app);
});

test("完整权益窗口也能使用剪贴板降级且复制后恢复窗口内焦点", async () => {
  const app = createApp();
  app.run(`
    showPlanDetails("plan-0002");
    navigator.clipboard.writeText = async () => { throw new Error("clipboard denied"); };
    document.execCommand = () => {
      const text = byId("planDetailsModal").querySelector("textarea");
      globalThis.detailFallbackText = text && text.value;
      return !!text;
    };
  `);
  const close = app.elements.get("planDetailsCloseBtn");
  close.focus();
  assert.equal(await app.run('copyTextToClipboard("权益复制回归")'), true);
  assert.equal(app.run("detailFallbackText"), "权益复制回归");
  assert.equal(app.run("document.activeElement"), close);
  assert.equal(app.elements.get("planDetailsModal").querySelectorAll("textarea").length, 0);
  healthy(app);
});

test("价格表与额度表给手机卡片提供字段标签，单价明确区分输入输出和缓存", () => {
  const app = createApp({ width: 375 });
  const plan = app.elements.get("tableBody").querySelector("tr");
  assert.equal(plan.querySelector('[data-column="priceM"]').dataset.label, "价格 / 周期");
  assert.match(plan.querySelector('[data-column="priceM"]').textContent, /免费|¥|\$/);
  const row = app.elements.get("metricsBody").querySelector("tr");
  assert.equal(row.querySelector('[data-column="cpm"]').dataset.label, "💵每M tokens");
  assert.equal(row.querySelector('[data-column="tmo"]').dataset.label, "每月 tokens");
  const hint = app.run('listPriceHint({ apiIn: 1.35, apiOut: 8.1, apiCache: 0.27, cur: "CNY" })');
  assert.match(hint, /输入 ¥1\.35/);
  assert.match(hint, /输出 ¥8\.1/);
  assert.match(hint, /缓存 ¥0\.27/);
  assert.equal(app.run("fTokCell(416, 416)"), "416M");
  healthy(app);
});

test("额度默认范围与排行同样排除轻量和续费档，可明确切换查看历史数据", () => {
  const app = createApp();
  app.run('resetMetricsFilters(); globalThis.currentMetricRows = metricsTableRows().rows;');
  assert.equal(app.run("currentMetricRows.every(r => metricOfferOk(r.m) && isFlagshipModelName(r.m.model))"), true);
  assert.equal(app.run('currentMetricRows.some(r => /老用户|续费/.test(r.m.plan))'), false);
  app.run('Object.assign(metricsState, { tier: "all", offer: "all" }); renderMetricsTable();');
  assert.equal(app.run('metricsTableRows().rows.some(r => /Flash/.test(r.m.model))'), true);
  assert.equal(app.run('metricsTableRows().rows.some(r => /老用户|续费/.test(r.m.plan))'), true);
  assert.match(app.elements.get("metricsNote").innerHTML, /含历史与仅老用户续费档/);
  assert.equal(app.elements.get("metricsResetBtn").disabled, false);
  app.run('resetMetricsFilters();');
  assert.equal(app.run('metricsState.tier + ":" + metricsState.offer'), "flagship:current");
  healthy(app);
});

test("动态按上海日期标明计划和结束状态，来源分组默认折叠", () => {
  const app = createApp();
  assert.equal(app.run('chinaCalendarDay(new Date("2026-10-07T16:01:00Z"))'), "2026-10-08");
  assert.equal(app.run('chinaCalendarDay(new Date("2026-10-07T15:59:00Z"))'), "2026-10-07");
  const future = app.run('dynItem(DYNAMICS.find(d => d.date === "2026-10-14" && !d.checked), "2026-10-08")');
  assert.match(future, /计划中 · 尚未发生/);
  assert.match(future, /计划于 2026-10-14 退役/);
  assert.doesNotMatch(app.run('dynItem(DYNAMICS.find(d => d.date === "2026-10-14" && !d.checked), "2026-10-14")'), /尚未发生/);
  const activity = app.run('dynItem(DYNAMICS.find(d => d.date === "2026-09-25" && !d.checked), "2026-10-08")');
  assert.match(activity, /已结束 · 2026-10-07/);
  assert.doesNotMatch(app.run('dynItem(DYNAMICS.find(d => d.date === "2026-09-25" && !d.checked), "2026-10-07")'), /已结束/);
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(dynamicStatus({date:"2026-10-03",checked:true,text:"双节活动（09-25~10-07）仍在进行"},"2026-10-08"))')), { key: "", label: "" });
  const groups = app.elements.get("sourceList").querySelectorAll("details.source-group");
  assert.equal(groups.length, app.run("SOURCES.length"));
  assert.ok(groups.every((group) => group.getAttribute("open") == null));
  assert.ok(groups.every((group) => group.querySelector("summary") && group.querySelectorAll("a").length));
  healthy(app);
});

test("完整价格表分批显示，筛选排序重置页数；导出和对比始终保留全部匹配记录", async () => {
  const app = createApp();
  const total = app.run("computeTableRows().length");
  assert.ok(total > 40);
  assert.equal(app.elements.get("tableBody").querySelectorAll("tr").length, 20);
  assert.match(app.elements.get("tableCount").textContent, new RegExp("已显示 20 / " + total));
  assert.equal(app.elements.get("tableMoreBtn").hidden, false);
  app.run("showMoreTableRows();");
  assert.equal(app.elements.get("tableBody").querySelectorAll("tr").length, 40);
  assert.equal(app.run("document.activeElement.dataset.planId"), app.run("computeTableRows()[20].id"));
  app.run("exportTableCsv();");
  assert.equal((await app.downloads[0].blob.text()).split("\r\n").length, total + 1);
  const selected = app.run("computeTableRows().at(-1).id");
  app.run('cmpAdd(' + JSON.stringify(selected) + ');');
  assert.equal(app.run("cmpState.items[0].id"), selected, "不可见页的方案仍可通过推荐或稳定 ID 加入比较");
  assert.equal(app.run('revealTablePlan(' + JSON.stringify(selected) + ')'), true);
  assert.ok(app.elements.get("tableBody").querySelector('.cmp-add[data-plan-id="' + selected + '"]'));
  assert.equal(app.run('revealTablePlan("missing-plan-id")'), false);
  app.elements.get("searchInput").focus();
  app.run('tableState.sortDir = -1; renderTable();');
  assert.equal(app.elements.get("tableBody").querySelectorAll("tr").length, 20);
  app.run('tableState.search = "Cursor Start"; renderTable();');
  assert.equal(app.elements.get("tableBody").querySelectorAll("tr").length, app.run("computeTableRows().length"));
  assert.equal(app.elements.get("tableMoreBtn").hidden, true);
  assert.equal(app.run("cmpState.items[0].id"), selected);
  healthy(app);
});

test("额度表分批展示完整排序结果，更多记录不改变筛选结果；排序与筛选重置页数", () => {
  const app = createApp();
  const total = app.run("metricsTableRows().shownRows.length");
  assert.ok(total > 40);
  const sorted = app.run('JSON.stringify(metricsTableRows().shownRows.map(r => [r.m.plan, r.m.model, r.c.costPerM]))');
  assert.equal(app.elements.get("metricsBody").querySelectorAll("tr").length, 20);
  assert.equal(app.elements.get("metricsMoreBtn").hidden, false);
  assert.equal(app.elements.get("metricsCount").textContent, `已显示 20 / ${total} 行`);
  app.run("showMoreMetricsRows();");
  assert.equal(app.elements.get("metricsBody").querySelectorAll("tr").length, 40);
  assert.equal(app.run("document.activeElement"), app.elements.get("metricsBody").querySelectorAll("tr")[20]);
  assert.equal(app.run('JSON.stringify(metricsTableRows().shownRows.map(r => [r.m.plan, r.m.model, r.c.costPerM]))'), sorted);
  app.run('metricsState.sortDir = -1; renderMetricsTable();');
  assert.equal(app.elements.get("metricsBody").querySelectorAll("tr").length, 20);
  app.run('metricsState.model = "deepseek-v4-pro"; renderMetricsTable();');
  assert.equal(app.elements.get("metricsBody").querySelectorAll("tr").length, app.run("metricsTableRows().shownRows.length"));
  assert.equal(app.elements.get("metricsCount").textContent, "1 行");
  assert.equal(app.elements.get("metricsMoreBtn").hidden, true);
  healthy(app);
});

test("两张表手机每批5行、桌面每批20行，跨断点重绘重新应用首批记录", () => {
  const app = createApp({ width: 375 });
  const counts = () => ["tableBody", "metricsBody"].map(id => app.elements.get(id).querySelectorAll("tr").length);
  assert.deepEqual(counts(), [5, 5]);
  app.run("showMoreTableRows(); showMoreMetricsRows();");
  assert.deepEqual(counts(), [10, 10]);
  app.run("window.innerWidth = 1280; renderTable(); renderMetricsTable();");
  assert.deepEqual(counts(), [20, 20]);
  app.run("window.innerWidth = 375; renderTable(); renderMetricsTable();");
  assert.deepEqual(counts(), [5, 5]);
  healthy(app);
});

test("多关键词与厂商别名搜索保留型号、空白及标点归一化", () => {
  const app = createApp();
  for (const query of ["OpenAI Plus", "Plus OpenAI", "CHATGPT   Plus", "Codex Plus"]) {
    app.run(`tableState.search = ${JSON.stringify(query)}; renderTable();`);
    assert.ok(app.run('computeTableRows().some(p => p.id === "plan-0010")'), query);
  }
  app.run('tableState.search = "克劳德 Pro"; renderTable();');
  assert.ok(app.run('computeTableRows().some(p => p.vendor === "Anthropic" && p.plan === "Claude Pro")'));
  app.run('tableState.search = "Moonshot"; renderTable();');
  assert.ok(app.run('computeTableRows().some(p => /Kimi/.test(p.vendor))'));
  for (const query of ["", "   ", " _-./· "]) {
    app.run(`tableState.search = ${JSON.stringify(query)};`);
    assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
  }
  assert.equal(app.run('queryHit("gpt6sol", "GPT-6 Sol")'), true);
  assert.equal(app.run('queryHit("gpt6sol", "GPT-6 Luna")'), false);
  healthy(app);
});

test("降级对比窗口包含核查说明且跳过收起详情内的链接", () => {
  const app = createApp({ noNativeDialog:true });
  app.run('cmpAdd("plan-0024"); cmpAdd("plan-0027"); openCmpModal();');
  const modal = app.elements.get("cmpModal");
  const summary = modal.querySelector("details.price-check-details summary");
  summary.focus();
  const tab = app.fire(summary, "keydown", { key:"Tab" });
  assert.equal(tab.defaultPrevented, false, "第一条核查说明后应继续正常 Tab 浏览");
  assert.equal(app.run('cmpFocusableElements().filter(el => el.tagName === "SUMMARY").length'), 2);
  app.run('byId("cmpFeedback").innerHTML = \'<details id="closedReviewFixture"><summary>隐藏链接测试</summary><a id="hiddenReviewLink" href="https://example.com">证据</a></details>\';');
  assert.equal(app.run('cmpFocusableElements().some(el => el.id === "hiddenReviewLink")'), false);
  app.run('byId("closedReviewFixture").open = true;');
  assert.equal(app.run('cmpFocusableElements().some(el => el.id === "hiddenReviewLink")'), true);
  const focusable = app.run("cmpFocusableElements()");
  const first = focusable[0], last = focusable[focusable.length - 1];
  last.focus();
  assert.equal(app.fire(last,"keydown",{key:"Tab"}).defaultPrevented, true);
  assert.equal(app.run("document.activeElement"), first);
  healthy(app);
});


test("风险徽章按结构化推理来源标注，金额中的 403 不算访问异常", () => {
  const app = createApp();
  const badges = (vendor, plan) => JSON.parse(app.run(`JSON.stringify(planBadges(PLANS.find((p) => p.vendor === ${JSON.stringify(vendor)} && p.plan === ${JSON.stringify(plan)})).map((b) => b.t))`));
  assert.ok(!badges("Z.ai", "GLM Coding V3 Max").includes("访问不稳"), "季付 $403.2 不是 HTTP 403");
  assert.ok(badges("88code", "PLUS 包月").includes("访问不稳"), "站点访问 403 仍需提示");
  assert.ok(!badges("Cursor", "Teams（Standard 席位）").includes("要自备 Key"), "可选 BYOK 不等于必须自备 Key");
  assert.ok(!badges("JetBrains AI", "AI Pro（个人）").includes("要自备 Key"), "含云端模型用量的档位不应要求自备 Key");
  assert.ok(badges("Kilo Code", "Teams").includes("要自备 Key"));
  assert.ok(badges("Roo Code（Roomote）", "自托管（≤10 用户）").includes("要自备 Key"), "结构化 byok 档即使备注未写 BYOK 也要提示");
  assert.ok(badges("Zed", "Business").includes("推理另计"), "按量推理档提示推理另计");
  assert.equal(app.run('PLANS.filter((p) => p.modelAccess === "byok").every((p) => planBadges(p).some((b) => b.t === "要自备 Key"))'), true);
  healthy(app);
});

test("额度表空态的模型档提示与下拉选项文字一致", () => {
  const app = createApp();
  app.run('metricsState.model = "__none__"; renderMetricsTable();');
  const html = app.elements.get("metricsBody").innerHTML;
  assert.match(html, /含轻量模型/);
  assert.doesNotMatch(html, /全部模型档/);
  healthy(app);
});

if (require.main === module) main();
