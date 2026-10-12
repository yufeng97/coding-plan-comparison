
/* 数据表、额度表、导出与并排对比。原 scripts/tests/test-app-tables.js（页面虚拟 DOM + 经典表格渲染），现用真实 App。
 * Vue 按永久 ID 保留行与按钮节点，原来「重绘替换旧节点」的断言改为检查焦点与状态仍落在同一方案上。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { mount } from "@vue/test-utils";
import { openPage, type Page } from "../test/page";

const plan = (page: Page, id: string) => page.runtime.findPlanReference(id) as Plan;
const rows = (page: Page, id: string) => page.byId(id).querySelectorAll("tr");
const defaultTableSize = (page: Page) => page.runtime.PLANS.filter(page.runtime.isOnSalePlan).filter((p) => !page.runtime.tableExtraHidden(p)).length;
async function click(page: Page, element: Element) {
  const event = page.fire(element, "click");
  await page.settle();
  return event;
}
async function key(page: Page, element: Element, name: string, init: Record<string, unknown> = {}) {
  const event = page.fire(element, "keydown", { key: name, ...init });
  await page.settle();
  return event;
}
async function choose(page: Page, id: string, value: string) {
  const select = page.byId<HTMLSelectElement>(id);
  select.value = value;
  page.fire(select, "change");
  await page.settle();
  return select;
}

test("比较和导出保留一次性/席位/4周单位、数据日期/汇率和展开字段", async () => {
  const page = await openPage();
  const app = page.runtime;
  const once = app.PLANS.find((p) => p.vendor === "88code" && p.priceM === 66)!;
  const seat = app.PLANS.find((p) => p.seat && app.isOnSalePlan(p))!;
  const fourWeek = app.PLANS.find((p) => /4\s*周/.test(p.plan))!;
  const mirror = app.PLANS.find((p) => p.vendor === "AICodeMirror" && p.plan === "MAX")!;
  app.cmpState.items = [once, seat];
  app.openCmpModal();
  await page.settle();
  const compare = page.byId("cmpTable");
  assert.match(compare.textContent!, /¥66\/一次性/);
  assert.match(compare.textContent!, /席位\/月/);
  assert.doesNotMatch(compare.textContent!, /¥66\/月/);
  assert.equal(compare.querySelector(".cmp-best-price"), null);
  assert.ok(compare.querySelector(".cmp-diff-row"));
  assert.equal(app.isPersonalMonthly(fourWeek), false, "4周费用不能当作自然月月费");
  Object.assign(app.personalState, { cat: "all", region: "all", q: "", limit: null });
  app.resetTableFilters();
  await page.settle();
  app.renderPersonalChart();
  assert.equal(page.charts.get("chartPersonal")!.option.series[0].data.some((d: { _p: Plan }) => app.isFourWeekPlan(d._p)), false, "个人月费图不应混入4周档");
  assert.equal(app.isRelay(fourWeek) && app.computeTableRows().includes(fourWeek), false, "4周档来自中转站，默认收起");
  app.tableState.extra = true;
  assert.equal(app.computeTableRows().includes(fourWeek), true, "4周档仍应保留在完整数据表");
  app.tableState.extra = false;
  app.cmpState.items = app.PLANS.filter((p) => p.vendor === "Anthropic" && ["Claude Pro", "Claude Max 5x"].includes(p.plan));
  await page.settle();
  assert.ok(page.byId("cmpTable").querySelector(".cmp-best-price"));
  const csv = app.tableRowsCsv([once, seat, fourWeek, mirror]);
  const markdown = app.tableRowsMarkdown([once, seat, fourWeek, mirror]);
  for (const value of ["参考汇率", "一次性", "席位/月", "4周", "Claude Code", app.META.updated, String(app.RATE)]) {
    assert.ok(csv.includes(value), "CSV 缺少 " + value);
    assert.ok(markdown.includes(value), "Markdown 缺少 " + value);
  }
  assert.match(csv, /数据更新日期|数据截至/);
  assert.match(markdown, /数据更新日期|数据截至/);
  assert.doesNotMatch(csv, /同 PRO 档/);
  Object.assign(app.tableState, { search: "AICodeMirror MAX", extra: true });
  await page.settle();
  await click(page, page.byId("exportCsvBtn"));
  assert.equal(page.downloads.length, 1);
  assert.match(page.downloads[0]!.filename, /^coding-plans-.*\.csv$/);
  assert.match(await page.downloads[0]!.blob.text(), /数据更新日期|数据截至/);
  await app.copyTableMarkdown();
  assert.match(page.copied!, /参考汇率/);
  page.healthy();
});

test("数据表空态保留对比选择、禁用空导出，清除筛选取消待执行搜索并回到搜索框", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.cmpAdd("Anthropic", "Claude Pro");
  const search = page.byId<HTMLInputElement>("searchInput");
  search.value = "__没有任何匹配方案__";
  page.fire(search, "input");
  await page.flushTimers();
  assert.equal(app.computeTableRows().length, 0);
  assert.match(page.byId("tableBody").textContent!, /没有匹配的公开标价记录|已选的对比方案仍保留/);
  assert.equal(app.cmpState.items.length, 1);
  assert.equal(page.byId<HTMLButtonElement>("exportCsvBtn").disabled, true);
  assert.equal(page.byId<HTMLButtonElement>("copyMdBtn").disabled, true);
  await click(page, page.byId("exportCsvBtn"));
  await click(page, page.byId("copyMdBtn"));
  assert.equal(page.downloads.length, 0);
  assert.equal(page.copied, undefined);
  app.exportTableCsv();
  await app.copyTableMarkdown();
  await page.settle();
  assert.equal(page.downloads.length, 0, "直接调用也不能生成只有表头的导出");
  assert.match(page.byId("tableFeedback").textContent!, /没有可复制的方案/);
  assert.equal(page.byId("tableFeedback").getAttribute("role"), "status");
  search.value = "__另一个尚未执行的搜索__";
  page.fire(search, "input");
  await click(page, page.byId("tableEmptyResetBtn"));
  await page.flushTimers();
  assert.equal(app.computeTableRows().length, defaultTableSize(page), "清除后回到默认范围：中转站与待核价格默认不显示");
  assert.equal(search.value, "");
  assert.equal(document.activeElement?.id, "searchInput");
  assert.equal(page.byId<HTMLButtonElement>("exportCsvBtn").disabled, false);
  assert.equal(page.byId<HTMLButtonElement>("copyMdBtn").disabled, false);
  assert.equal(page.byId<HTMLButtonElement>("tableResetBtn").disabled, true);
  assert.equal(app.cmpState.items.length, 1);
  assert.equal(new URLSearchParams(location.search).has("q"), false);
  page.healthy();
});

test("并排对比支持逐项移出，移出后聚焦相邻按钮，关闭或入口失联有焦点恢复", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.tableState.search = "Anthropic";
  await page.settle();
  const additions = Array.from(page.byId("tableBody").querySelectorAll<HTMLButtonElement>(".cmp-add"));
  assert.ok(additions.length >= 3);
  for (const button of additions.slice(0, 3)) await click(page, button);
  assert.equal(app.cmpState.items.length, 3);
  assert.ok(additions.slice(0, 3).every((button) => button.getAttribute("aria-pressed") === "true"));
  const opener = page.byId<HTMLButtonElement>("cmpOpenBtn");
  opener.focus();
  await click(page, opener);
  assert.equal(page.byId<HTMLDialogElement>("cmpModal").open, true);
  assert.equal(document.activeElement?.id, "cmpCloseBtn");
  let removals = Array.from(page.byId("cmpTable").querySelectorAll<HTMLElement>(".cmp-remove"));
  assert.equal(removals.length, 3);
  assert.equal(page.byId("cmpTable").querySelectorAll("thead th[scope=col]").length, 4);
  const adjacent = removals[2]!.dataset.planId;
  const removed = removals[1]!;
  removed.focus();
  await click(page, removed);
  assert.equal(removed.isConnected, false, "移出的方案列不再显示");
  assert.equal(app.cmpState.items.length, 2);
  assert.equal(page.byId<HTMLDialogElement>("cmpModal").open, true);
  assert.equal((document.activeElement as HTMLElement).dataset.planId, adjacent);
  assert.equal(new URLSearchParams(location.search).get("cmp")!.split(";").length, 2);
  removals = Array.from(page.byId("cmpTable").querySelectorAll<HTMLElement>(".cmp-remove"));
  await click(page, removals[0]!);
  assert.equal(app.cmpState.items.length, 1);
  assert.equal(page.byId<HTMLDialogElement>("cmpModal").open, false);
  assert.equal(opener.disabled, true);
  assert.equal(document.activeElement?.id, "searchInput", "只剩一档，禁用的比较入口不能接收焦点");
  assert.equal(page.byId("cmpBar").hidden, false);
  assert.match(page.byId("cmpBarText").textContent!, /再选 1 档/);

  const entry = additions.find((button) => button.getAttribute("aria-pressed") === "false")!;
  await click(page, entry);
  entry.focus();
  await click(page, opener);
  const escaped = await key(page, page.byId("cmpCloseBtn"), "Escape");
  assert.equal(escaped.defaultPrevented, true);
  assert.equal(page.byId<HTMLDialogElement>("cmpModal").open, false);
  assert.equal(document.activeElement, entry, "Escape返回原操作入口");
  entry.focus();
  await click(page, opener);
  page.byId<HTMLDialogElement>("cmpModal").close();
  await page.settle();
  assert.equal(document.activeElement, entry, "原生close事件也还原焦点");
  entry.focus();
  await click(page, opener);
  app.tableState.search = "__入口失联__";
  await page.settle();
  assert.equal(entry.isConnected, false);
  await click(page, page.byId("cmpCloseBtn"));
  assert.equal(document.activeElement, opener, "原入口失联时返回仍可用的比较入口");
  page.healthy();
});

test("没有原生dialog接口时对比可显示、焦点循环、逐档移出并精确还原背景", async () => {
  const page = await openPage({ noNativeDialog: true });
  const app = page.runtime;
  const dialog = page.byId<HTMLDialogElement>("cmpModal"), backdrop = page.byId("cmpBackdrop");
  /* 不认识 dialog 的旧环境也没有 open 布尔属性；降级必须按 HTML 属性判断打开与关闭。 */
  Object.defineProperty(dialog, "open", { configurable: true, value: undefined });
  assert.equal(dialog.showModal, undefined);
  assert.equal(dialog.close, undefined);
  assert.equal(dialog.open, undefined, "未知 dialog 元素不能依赖 open 布尔属性");
  /* 背景是 body 下除窗口与遮罩外的元素：整页挂载点 #app，以及一个原本就 inert 的元素。 */
  const header = page.byId("app");
  header.setAttribute("aria-hidden", "false");
  const hero = document.body.appendChild(document.createElement("div"));
  hero.setAttribute("inert", "");
  hero.setAttribute("aria-hidden", "true");
  app.cmpState.items = ["plan-0002", "plan-0003", "plan-0004"].map((id) => plan(page, id));
  await page.settle();
  const opener = page.byId<HTMLButtonElement>("cmpOpenBtn");
  opener.focus();
  await click(page, opener);
  assert.equal(app.isCmpModalOpen(), true);
  assert.notEqual(dialog.getAttribute("open"), null);
  assert.equal(dialog.open, undefined, "打开降级窗口只写 HTML 属性");
  assert.equal(dialog.classList.contains("cmp-fallback"), true);
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(backdrop.hidden, false);
  assert.equal(document.body.classList.contains("has-cmp-modal"), true);
  assert.notEqual(header.getAttribute("inert"), null);
  assert.equal(header.getAttribute("aria-hidden"), "true");
  assert.equal(document.activeElement?.id, "cmpCloseBtn");
  const controls = app.cmpFocusableElements();
  const first = controls[0]!, last = controls.at(-1)!;
  last.focus();
  assert.equal((await key(page, last, "Tab")).defaultPrevented, true);
  assert.equal(document.activeElement, first);
  assert.equal((await key(page, first, "Tab", { shiftKey: true })).defaultPrevented, true);
  assert.equal(document.activeElement, last);
  page.byId("searchInput").focus();
  await page.settle();
  assert.ok(dialog.contains(document.activeElement), "inert背景不能抢走焦点");
  let removes = Array.from(dialog.querySelectorAll<HTMLElement>(".cmp-remove"));
  await click(page, removes[1]!);
  assert.equal(app.cmpState.items.length, 2);
  assert.equal(app.isCmpModalOpen(), true);
  assert.ok(document.activeElement!.classList.contains("cmp-remove"));
  removes = Array.from(dialog.querySelectorAll<HTMLElement>(".cmp-remove"));
  await click(page, removes[0]!);
  assert.equal(app.cmpState.items.length, 1);
  assert.equal(app.isCmpModalOpen(), false);
  assert.equal(dialog.getAttribute("open"), null);
  assert.equal(dialog.getAttribute("aria-modal"), null);
  assert.equal(backdrop.hidden, true);
  assert.equal(document.body.classList.contains("has-cmp-modal"), false);
  assert.equal(header.getAttribute("inert"), null);
  assert.equal(header.getAttribute("aria-hidden"), "false", "关闭恢复原来的aria-hidden而非一律删除");
  assert.equal(hero.getAttribute("inert"), "", "既有inert保留");
  assert.equal(hero.getAttribute("aria-hidden"), "true");
  assert.equal(document.activeElement?.id, "searchInput");
  app.cmpState.items = ["plan-0002", "plan-0003"].map((id) => plan(page, id));
  await page.settle();
  opener.focus();
  await click(page, opener);
  await key(page, page.byId("cmpCloseBtn"), "Escape");
  assert.equal(app.isCmpModalOpen(), false);
  assert.equal(document.activeElement, opener);
  await click(page, opener);
  await click(page, backdrop);
  assert.equal(app.isCmpModalOpen(), false);
  assert.equal(document.activeElement, opener);
  await click(page, opener);
  await click(page, page.byId("cmpCloseBtn"));
  assert.equal(app.isCmpModalOpen(), false);
  assert.equal(document.activeElement, opener);
  page.healthy();
});

test("表格排序键盘操作与aria说明一致，明细开关同步展开状态；额度空态恢复默认", async () => {
  const page = await openPage();
  const app = page.runtime;
  const price = document.querySelector<HTMLElement>("#planTable th[data-sort=priceM]")!;
  const annual = document.querySelector<HTMLElement>("#planTable th[data-sort=priceY]")!;
  assert.equal(price.tabIndex, 0);
  assert.equal(price.getAttribute("aria-sort"), "ascending");
  assert.equal(annual.getAttribute("aria-sort"), null);
  assert.match(price.getAttribute("aria-label")!, /当前从低到高.*激活后从高到低/);
  assert.equal((await key(page, price, "Enter")).defaultPrevented, true);
  assert.equal(price.getAttribute("aria-sort"), "descending");
  await key(page, annual, " ");
  assert.equal(app.tableState.sortKey + ":" + app.tableState.sortDir, "priceY:1");
  assert.equal(price.getAttribute("aria-sort"), null);
  assert.equal(annual.getAttribute("aria-sort"), "ascending");
  for (const [control, target] of [["tableColsToggle", "planTable"], ["metricsToggle", "metricsTable"]]) {
    const button = page.byId(control!);
    assert.equal(button.getAttribute("aria-controls"), target);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    await click(page, button);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    await click(page, button);
    assert.equal(button.getAttribute("aria-expanded"), "false");
  }
  const weekly = document.querySelector<HTMLElement>("#metricsTable th[data-sort=twk]")!;
  assert.equal(weekly.tabIndex, 0);
  assert.equal(weekly.getAttribute("aria-sort"), null);
  assert.match(weekly.getAttribute("aria-label")!, /激活后从高到低/);
  await key(page, weekly, " ");
  assert.equal(app.metricsState.sortKey + ":" + app.metricsState.sortDir, "twk:-1");
  assert.equal(weekly.getAttribute("aria-sort"), "descending");
  assert.match(page.byId("metricsNote").textContent!, /按Tokens\/周从高到低排序/);
  const model = await choose(page, "metricsModel", "GPT-6.1 Sol");
  const version = await choose(page, "metricsVer", "V2");
  assert.match(page.byId("metricsBody").textContent!, /当前模型与版本没有可展示的额度/);
  await click(page, page.byId("metricsEmptyResetBtn"));
  assert.deepEqual({ ...app.metricsState }, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
  assert.equal(model.value, "all");
  assert.equal(version.value, "all");
  assert.equal(document.activeElement?.id, "metricsModel");
  assert.equal(page.byId<HTMLButtonElement>("metricsResetBtn").disabled, true);
  assert.ok(rows(page, "metricsBody").length > 1);
  assert.equal(new URLSearchParams(location.search).has("mver"), false);
  page.healthy();
});

test("个人图展开与收起保留同一操作焦点，清空比较条回到可用搜索入口", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.renderPersonalChart();
  for (const limit of [null, 20]) {
    const button = page.byId("showAllPersonal");
    button.focus();
    await click(page, button);
    assert.equal(app.personalState.limit, limit);
    assert.equal(document.activeElement, page.byId("showAllPersonal"));
  }
  app.cmpAdd("plan-0002");
  await page.settle();
  page.byId("cmpClearBtn").focus();
  await click(page, page.byId("cmpClearBtn"));
  assert.equal(page.byId("cmpBar").hidden, true);
  assert.equal(document.activeElement?.id, "searchInput");
  app.cmpAdd("plan-0002");
  app.cmpAdd("plan-0003");
  await page.settle();
  const search = page.byId("searchInput");
  search.focus();
  app.cmpClear();
  await page.settle();
  assert.equal(document.activeElement, search, "从其它控件程序性清空不抢焦点");
  page.healthy();
});

test("推荐和数据表同步同一方案的选择、上限与重绘焦点", async () => {
  const page = await openPage();
  const app = page.runtime;
  const grid = page.byId("quickGrid");
  const id = grid.querySelector<HTMLElement>(".cmp-add")!.dataset.planId!;
  const cardButton = () => grid.querySelector<HTMLButtonElement>(`.cmp-add[data-plan-id="${id}"]`)!;
  assert.equal(app.revealTablePlan(id), true);
  await page.settle();
  const tableButton = page.byId("tableBody").querySelector<HTMLButtonElement>(`.cmp-add[data-plan-id="${id}"]`)!;
  await click(page, cardButton());
  assert.equal(tableButton.getAttribute("aria-pressed"), "true");
  assert.equal(cardButton().getAttribute("aria-pressed"), "true");
  cardButton().focus();
  /* 推荐按共享状态重新计算后，焦点留在推荐区自己的按钮，不能跳到表格里的同一方案。 */
  app.dataRevision.benchmark++;
  await page.settle();
  assert.equal(document.activeElement, cardButton());
  for (const other of app.PLANS.filter((p) => p.id !== id && app.isOnSalePlan(p)).slice(0, app.CMP_MAX - 1)) app.cmpAdd(other.id);
  await page.settle();
  assert.equal(app.cmpState.items.length, app.CMP_MAX);
  assert.equal(cardButton().disabled, false, "已选项仍能移出");
  assert.ok(Array.from(page.byId("tableBody").querySelectorAll<HTMLButtonElement>(".cmp-add")).some((button) => button.disabled));
  await click(page, tableButton);
  assert.equal(cardButton().getAttribute("aria-pressed"), "false");
  assert.equal(cardButton().disabled, false);
  page.healthy();
});

test("独立对比导出仅包含已选方案并保留完整元数据，窗口内复制降级可恢复焦点", async () => {
  const page = await openPage();
  const app = page.runtime;
  const once = app.PLANS.find((p) => p.vendor === "88code" && p.priceM === 66)!;
  const seat = app.PLANS.find((p) => p.seat && app.isOnSalePlan(p))!;
  app.cmpState.items = [once, seat];
  app.tableState.search = "Cursor";
  await page.settle();
  app.openCmpModal();
  await page.settle();
  assert.equal(page.byId<HTMLButtonElement>("copyCmpMdBtn").disabled, false);
  assert.equal(page.byId<HTMLButtonElement>("exportCmpCsvBtn").disabled, false);
  await click(page, page.byId("exportCmpCsvBtn"));
  assert.equal(page.downloads.length, 1);
  assert.match(page.downloads[0]!.filename, /^coding-plans-compare-\d{8}\.csv$/);
  assert.equal(Buffer.from(await page.downloads[0]!.blob.arrayBuffer()).toString("utf8"), "﻿" + app.tableRowsCsv(app.cmpState.items));
  await app.copyCmpMarkdown();
  assert.equal(page.copied, "并排对比（2 档方案）\n\n" + app.tableRowsMarkdown(app.cmpState.items));
  for (const value of ["一次性", "席位/月", "价格核查来源", app.META.updated, app.META.rateAsOf]) assert.ok(page.copied!.includes(value), "对比副本缺少 " + value);
  const copyButton = page.byId("copyCmpMdBtn");
  copyButton.focus();
  page.failClipboard();
  await app.copyCmpMarkdown();
  assert.equal(page.fallbackCopies.at(-1)?.dialog, "cmpModal", "降级复制的文本框放在打开的对比窗口内");
  assert.equal(page.fallbackCopies.at(-1)?.text, page.copied);
  assert.equal(document.activeElement, copyButton);
  app.cmpClear();
  await page.settle();
  assert.equal(page.byId<HTMLButtonElement>("copyCmpMdBtn").disabled, true);
  assert.equal(page.byId<HTMLButtonElement>("exportCmpCsvBtn").disabled, true);
  app.exportCmpCsv();
  await app.copyCmpMarkdown();
  await page.settle();
  assert.equal(page.downloads.length, 1, "不足两档时不导出空对比");
  assert.match(page.byId("cmpFeedback").textContent!, /至少选择 2 档/);
  page.healthy();
});

test("年付表格、比较和导出优先保留官方全年金额及席位单位", async () => {
  const page = await openPage();
  const app = page.runtime;
  const exact = plan(page, "plan-0002"), seat = plan(page, "plan-0005");
  app.cmpState.items = [exact, seat];
  app.openCmpModal();
  await page.settle();
  const { default: PlanPrice } = await import("../components/PlanPrice.vue");
  const annualCell = (p: Plan) => {
    const wrapper = mount(PlanPrice, { props: { plan: p, annual: true } });
    const text = wrapper.text();
    wrapper.unmount();
    return text;
  };
  assert.match(annualCell(exact), /\$200\/年/);
  assert.doesNotMatch(annualCell(exact), /200\.04/);
  assert.match(annualCell(seat), /每席位/);
  const comparison = page.byId("cmpTable").textContent!;
  assert.match(comparison, /年付全年金额/);
  assert.match(comparison, /\$200\/年/);
  assert.doesNotMatch(comparison, /200\.04/);
  for (const result of [app.tableRowsCsv([exact, seat]), app.tableRowsMarkdown([exact, seat])]) {
    assert.match(result, /年付全年金额/);
    assert.match(result, /\$200\/年/);
    assert.match(result, /每席位/);
    assert.doesNotMatch(result, /200\.04/);
  }
  page.healthy();
});

test("完整权益窗口也能使用剪贴板降级且复制后恢复窗口内焦点", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.showPlanDetails("plan-0002");
  await page.settle();
  page.failClipboard();
  const close = page.byId("planDetailsCloseBtn");
  close.focus();
  assert.equal(await app.copyTextToClipboard("权益复制回归"), true);
  assert.deepEqual(page.fallbackCopies.at(-1), { command: "copy", text: "权益复制回归", dialog: "planDetailsModal" });
  assert.equal(document.activeElement, close);
  assert.equal(page.byId("planDetailsModal").querySelectorAll("textarea").length, 0);
  page.healthy();
});

test("价格表与额度表给手机卡片提供字段标签，单价明确区分输入输出和缓存", async () => {
  const page = await openPage({ width: 375 });
  const app = page.runtime;
  const planRow = page.byId("tableBody").querySelector("tr")!;
  const price = planRow.querySelector<HTMLElement>('[data-column="priceM"]')!;
  assert.equal(price.dataset.label, "价格 / 周期");
  assert.match(price.textContent!, /免费|¥|\$/);
  const metricRow = page.byId("metricsBody").querySelector("tr")!;
  assert.equal(metricRow.querySelector<HTMLElement>('[data-column="cpm"]')!.dataset.label, "💵每M tokens");
  assert.equal(metricRow.querySelector<HTMLElement>('[data-column="tmo"]')!.dataset.label, "每月 tokens");
  const hint = app.listPriceHint({ apiIn: 1.35, apiOut: 8.1, apiCache: 0.27, cur: "CNY" });
  assert.match(hint, /输入 ¥1\.35/);
  assert.match(hint, /输出 ¥8\.1/);
  assert.match(hint, /缓存 ¥0\.27/);
  assert.equal(app.fTokCell(416, 416), "416M");
  page.healthy();
});

test("额度默认范围与排行同样排除轻量和续费档，可明确切换查看历史数据", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.resetMetricsFilters();
  await page.settle();
  const current = app.metricsTableRows().rows;
  assert.equal(current.every((r) => app.metricOfferOk(r.m) && app.isFlagshipModelName(r.m.model)), true);
  assert.equal(current.some((r) => /老用户|续费/.test(r.m.plan)), false);
  Object.assign(app.metricsState, { tier: "all", offer: "all" });
  await page.settle();
  const all = app.metricsTableRows().rows as { m: { model: string; plan: string } }[];
  assert.equal(all.some((r) => /Flash/.test(r.m.model)), true);
  assert.equal(all.some((r) => /老用户|续费/.test(r.m.plan)), true);
  assert.match(page.byId("metricsNote").textContent!, /含历史与仅老用户续费档/);
  assert.equal(page.byId<HTMLButtonElement>("metricsResetBtn").disabled, false);
  app.resetMetricsFilters();
  await page.settle();
  assert.equal(app.metricsState.tier + ":" + app.metricsState.offer, "flagship:current");
  page.healthy();
});

test("动态按上海日期标明计划和结束状态，来源分组默认折叠", async () => {
  const page = await openPage();
  const app = page.runtime;
  assert.equal(app.chinaCalendarDay(new Date("2026-10-07T16:01:00Z")), "2026-10-08");
  assert.equal(app.chinaCalendarDay(new Date("2026-10-07T15:59:00Z")), "2026-10-07");
  const future = app.DYNAMICS.find((d) => d.date === "2026-10-14" && !d.checked)!;
  assert.equal(app.dynamicStatus(future, "2026-10-08").label, "计划中 · 尚未发生");
  assert.match(app.dynamicText(future, "2026-10-08"), /计划于 2026-10-14 退役/);
  assert.doesNotMatch(app.dynamicText(future, "2026-10-14"), /计划于/);
  assert.equal(app.dynamicStatus(future, "2026-10-14").label, "");
  const activity = app.DYNAMICS.find((d) => d.date === "2026-09-25" && !d.checked)!;
  assert.equal(app.dynamicStatus(activity, "2026-10-08").label, "已结束 · 2026-10-07");
  assert.equal(app.dynamicStatus(activity, "2026-10-07").label, "");
  assert.deepEqual(app.dynamicStatus({ date: "2026-10-03", checked: true, text: "双节活动（09-25~10-07）仍在进行" }, "2026-10-08"), { key: "", label: "" });
  const groups = Array.from(page.byId("sourceList").querySelectorAll("details.source-group"));
  assert.equal(groups.length, app.SOURCES.length);
  assert.ok(groups.every((group) => group.getAttribute("open") == null));
  assert.ok(groups.every((group) => group.querySelector("summary") && group.querySelectorAll("a").length));
  page.healthy();
});

test("完整价格表分批显示，筛选排序重置页数；导出和对比始终保留全部匹配记录", async () => {
  const page = await openPage();
  const app = page.runtime;
  const total = app.computeTableRows().length;
  assert.ok(total > 40);
  assert.equal(rows(page, "tableBody").length, 20);
  assert.match(page.byId("tableCount").textContent!, new RegExp("已显示 20 / " + total));
  assert.equal(page.byId("tableMoreBtn").hidden, false);
  app.showMoreTableRows();
  await page.settle();
  assert.equal(rows(page, "tableBody").length, 40);
  assert.equal((document.activeElement as HTMLElement).dataset.planId, app.computeTableRows()[20].id);
  app.exportTableCsv();
  assert.equal((await page.downloads[0]!.blob.text()).split("\r\n").length, total + 1);
  const finalPlan = app.computeTableRows().at(-1);
  assert.ok(finalPlan, "完整价格表应有可加入对比的最后一项");
  const selected = finalPlan.id;
  app.cmpAdd(selected);
  assert.equal(app.cmpState.items[0]!.id, selected, "不可见页的方案仍可通过推荐或稳定 ID 加入比较");
  assert.equal(app.revealTablePlan(selected), true);
  await page.settle();
  assert.ok(page.byId("tableBody").querySelector(`.cmp-add[data-plan-id="${selected}"]`));
  assert.equal(app.revealTablePlan("missing-plan-id"), false);
  page.byId("searchInput").focus();
  app.tableState.sortDir = -1;
  await page.settle();
  assert.equal(rows(page, "tableBody").length, 20);
  app.tableState.search = "Cursor Start";
  await page.settle();
  assert.equal(rows(page, "tableBody").length, app.computeTableRows().length);
  assert.equal(page.byId("tableMoreBtn").hidden, true);
  assert.equal(app.cmpState.items[0]!.id, selected);
  page.healthy();
});

test("额度表分批展示完整排序结果，更多记录不改变筛选结果；排序与筛选重置页数", async () => {
  const page = await openPage();
  const app = page.runtime;
  const shown = () => JSON.stringify(app.metricsTableRows().shownRows.map((r) => [r.m.plan, r.m.model, r.c.costPerM]));
  const total = app.metricsTableRows().shownRows.length;
  assert.ok(total > 40);
  const sorted = shown();
  assert.equal(rows(page, "metricsBody").length, 20);
  assert.equal(page.byId("metricsMoreBtn").hidden, false);
  assert.equal(page.byId("metricsCount").textContent, `已显示 20 / ${total} 行`);
  app.showMoreMetricsRows();
  await page.settle();
  assert.equal(rows(page, "metricsBody").length, 40);
  assert.equal(document.activeElement, rows(page, "metricsBody")[20]);
  assert.equal(shown(), sorted);
  app.metricsState.sortDir = -1;
  await page.settle();
  assert.equal(rows(page, "metricsBody").length, 20);
  app.metricsState.model = "deepseek-v4-pro";
  await page.settle();
  assert.equal(rows(page, "metricsBody").length, app.metricsTableRows().shownRows.length);
  assert.equal(page.byId("metricsCount").textContent, "1 行");
  assert.equal(page.byId("metricsMoreBtn").hidden, true);
  page.healthy();
});

test("两张表手机每批5行、桌面每批20行，跨断点重绘重新应用首批记录", async () => {
  const page = await openPage({ width: 375 });
  const app = page.runtime;
  const counts = () => ["tableBody", "metricsBody"].map((id) => rows(page, id).length);
  const resize = async (width: number) => {
    window.innerWidth = width;
    page.fireWindow("resize");
    await page.flushTimers();
  };
  assert.deepEqual(counts(), [5, 5]);
  app.showMoreTableRows();
  app.showMoreMetricsRows();
  await page.settle();
  assert.deepEqual(counts(), [10, 10]);
  await resize(1280);
  assert.deepEqual(counts(), [20, 20]);
  await resize(375);
  assert.deepEqual(counts(), [5, 5]);
  page.healthy();
});

test("多关键词与厂商别名搜索保留型号、空白及标点归一化", async () => {
  const page = await openPage();
  const app = page.runtime;
  const search = (query: string) => { app.tableState.search = query; return app.computeTableRows() as Plan[]; };
  for (const query of ["OpenAI Plus", "Plus OpenAI", "CHATGPT   Plus", "Codex Plus"]) assert.ok(search(query).some((p) => p.id === "plan-0010"), query);
  assert.ok(search("克劳德 Pro").some((p) => p.vendor === "Anthropic" && p.plan === "Claude Pro"));
  assert.ok(search("Moonshot").some((p) => /Kimi/.test(p.vendor)));
  for (const query of ["", "   ", " _-./· "]) assert.equal(search(query).length, defaultTableSize(page));
  assert.equal(app.queryHit("gpt6sol", "GPT-6 Sol"), true);
  assert.equal(app.queryHit("gpt6sol", "GPT-6 Luna"), false);
  await page.settle();
  page.healthy();
});

test("降级对比窗口包含核查说明且跳过收起详情内的链接", async () => {
  const page = await openPage({ noNativeDialog: true });
  const app = page.runtime;
  app.cmpAdd("plan-0024");
  app.cmpAdd("plan-0027");
  app.openCmpModal();
  await page.settle();
  const modal = page.byId("cmpModal");
  const summary = modal.querySelector<HTMLElement>("details.price-check-details summary")!;
  summary.focus();
  assert.equal((await key(page, summary, "Tab")).defaultPrevented, false, "第一条核查说明后应继续正常 Tab 浏览");
  assert.equal(app.cmpFocusableElements().filter((el: Element) => el.tagName === "SUMMARY").length, 2);
  /* 在窗口里放一个收起的详情：其中的链接只在展开后进入焦点循环。 */
  const fixture = document.createElement("details");
  fixture.id = "closedReviewFixture";
  fixture.innerHTML = '<summary>隐藏链接测试</summary><a id="hiddenReviewLink" href="https://example.com">证据</a>';
  page.byId("cmpFeedback").append(fixture);
  assert.equal(app.cmpFocusableElements().some((el: Element) => el.id === "hiddenReviewLink"), false);
  fixture.open = true;
  assert.equal(app.cmpFocusableElements().some((el: Element) => el.id === "hiddenReviewLink"), true);
  const focusable = app.cmpFocusableElements();
  const first = focusable[0]!, last = focusable.at(-1)!;
  last.focus();
  assert.equal((await key(page, last, "Tab")).defaultPrevented, true);
  assert.equal(document.activeElement, first);
  fixture.remove();
  page.healthy();
});

test("额度表空态的模型档提示与下拉选项文字一致", async () => {
  const page = await openPage();
  page.runtime.metricsState.model = "__none__";
  await page.settle();
  const text = page.byId("metricsBody").textContent!;
  assert.match(text, /含轻量模型/);
  assert.doesNotMatch(text, /全部模型档/);
  page.healthy();
});

test("完整权益窗口只在有选购口径时列出相应行，来源与核价来源可直接点击", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.showPlanDetails("plan-0002");
  await page.settle();
  const field = (label: string) => Array.from(page.byId("planDetailsBody").querySelectorAll(".plan-detail-fields > div"))
    .find((row) => row.querySelector("dt")?.textContent === label)?.querySelector("dd") ?? null;
  assert.equal(field("选购支付口径"), null, "未应用选购条件时不列空行");
  assert.equal(field("选购首次付款"), null);
  const source = field("来源")!.querySelector("a")!;
  assert.match(source.getAttribute("href")!, /^https:\/\//);
  assert.equal(source.textContent, "官网页面 ↗");
  assert.equal(source.getAttribute("target"), "_blank");
  assert.equal(source.getAttribute("rel"), "noopener");
  assert.match(field("价格核查来源")!.querySelector("a")!.getAttribute("href")!, /^https:\/\//);
  app.tableState.fromPicker = true;
  await page.settle();
  assert.match(field("选购支付口径")!.textContent!, /^[^—]/);
  assert.deepEqual(app.linkList(["javascript:alert(1)"], "x"), [], "非 http(s) 地址不生成链接");
  page.healthy();
});

test("价格表可按厂商筛选并写入链接，非法厂商被忽略；手机可一次展开全部并保持焦点", async () => {
  const page = await openPage({ url: "/index.html?tvendor=Cursor#table", width: 390 });
  const app = page.runtime;
  const vendor = page.byId<HTMLSelectElement>("selectVendor");
  assert.equal(app.tableState.vendor, "Cursor");
  assert.equal(vendor.value, "Cursor");
  assert.ok(vendor.options.length > 20);
  const cursorRows = app.computeTableRows();
  assert.ok(cursorRows.length > 0 && cursorRows.every((p) => p.vendor === "Cursor"));
  assert.match(location.search, /tvendor=Cursor/);
  await click(page, page.byId("tableResetBtn"));
  assert.equal(app.tableState.vendor, "all");
  assert.equal(vendor.value, "all");
  assert.doesNotMatch(location.search, /tvendor/);
  const all = page.byId("tableAllBtn");
  const total = app.computeTableRows().length;
  assert.equal(all.hidden, false);
  assert.equal(all.textContent, `显示全部 ${total} 条`);
  const firstHidden = app.computeTableRows()[rows(page, "tableBody").length]!.id;
  await click(page, all);
  assert.equal(rows(page, "tableBody").length, total);
  assert.equal(all.hidden, true);
  assert.equal(page.byId("tableMoreBtn").hidden, true);
  assert.equal((document.activeElement as HTMLElement).dataset.planId, firstHidden, "焦点落在新展开的第一条");
  const metricsAll = page.byId("metricsAllBtn");
  const metricsTotal = app.metricsTableRows().shownRows.length;
  assert.equal(metricsAll.hidden, false);
  await click(page, metricsAll);
  assert.equal(rows(page, "metricsBody").length, metricsTotal);
  assert.equal(metricsAll.hidden, true);
  page.healthy();
  const invalid = await openPage({ url: "/index.html?tvendor=NoSuchVendor" });
  assert.equal(invalid.runtime.tableState.vendor, "all");
  invalid.healthy();
});

test("核价来源与推荐卡核查日期显示距今天数，超过复查间隔时标出", async () => {
  let page = await openPage();
  const app = page.runtime;
  assert.equal(app.daysSince("2026-10-04", "2026-10-10"), 6);
  assert.equal(app.daysSince("2026-10-11", "2026-10-10"), null, "时区差导致的未来日期不显示");
  assert.equal(app.daysSince("bad", "2026-10-10"), null);
  assert.equal(app.staleAfterDays(), app.MAINTENANCE_SUMMARY.staleAfterDays);
  assert.equal(app.checkAgeText("2026-10-10", "2026-10-10"), "（今天）");
  assert.equal(app.checkAgeText("2026-09-01", "2026-10-10"), "（39 天前，超过复查间隔）");
  const age = /\d{4}-\d{2}-\d{2}（(?:今天|\d+ 天前)(?:，超过复查间隔)?）/;
  assert.match(page.byId("tableBody").querySelector(".td-trust .sub")!.textContent!, age);
  assert.match(page.byId("quickGrid").querySelector(".quick-card")!.textContent!, new RegExp("本档核查" + age.source));
  page.healthy();
  /* 把一条核查改到很久以前：价格表的核查行标出超期。 */
  page = await openPage({ prepare(runtime) {
    const check = runtime.priceCheckOf(runtime.findPlanReference("plan-0002")!)!;
    runtime.PRICE_CHECKS.rows["plan:plan-0002"] = { ...check, checkedAt: "2020-01-01" };
  } });
  const { default: PriceCheck } = await import("../components/PriceCheck.vue");
  const stale = mount(PriceCheck, { props: { plan: plan(page, "plan-0002") } });
  assert.ok(stale.get(".sub").classes().includes("check-stale"));
  assert.match(stale.get(".sub").text(), /· 2020-01-01（\d+ 天前，超过复查间隔）/);
  stale.unmount();
  const fresh = mount(PriceCheck, { props: { plan: plan(page, "plan-0001") } });
  assert.equal(fresh.get(".sub").classes().includes("check-stale"), false);
  fresh.unmount();
  page.healthy();
});
