/* 2026-10-12 全面审查修复的回归：图表缩放、操作反馈位置、弹窗一致性、章节导航、额度表置信分组、
 * 地址栏补写、轴标签截断与预渲染交接。真实布局与滚动另由 tests/e2e/review-2026-10-12.browser.spec.js 覆盖。 */
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { openPage, type Page } from "../test/page";
import { capturePrerenderState, restorePrerenderInputs, restorePrerenderState } from "../browser/prerender-handoff";
import { fitAxisLabel } from "../browser/charts/host";

const rect = (top: number, width: number, height = 400) => ({ top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top }) as DOMRect;

test("视口变窄后屏幕外的图表也按新宽度缩放，轴标签与布局等滚入阅读区再补齐", async () => {
  const page = await openPage({ url: "/index.html#s4" });
  const app = page.runtime;
  const chart = page.charts.get("chartTeam")!;
  const host = page.byId("chartTeam");
  const resize = vi.spyOn(chart, "resize");
  host.getBoundingClientRect = () => rect(5000, 343);
  app.markChartsForResize(["chartTeam"]);
  app.resizeVisibleCharts();
  assert.equal(resize.mock.calls.length, 1, "屏幕外画布按新宽度缩放，避免旧宽度撑出横向滚动");
  assert.equal(app.pendingChartResizes.has("chartTeam"), true, "轴标签与窄屏布局留待滚入阅读区");
  host.getBoundingClientRect = () => rect(100, 343);
  app.resizeVisibleCharts();
  assert.equal(app.pendingChartResizes.has("chartTeam"), false);
  assert.ok(resize.mock.calls.length >= 2, "滚入阅读区后补齐轴标签并再次缩放");
  page.healthy();
});

test("从推荐卡加入对比的结果显示在对比条上方的浮动提示，不写进数据表的提示行", async () => {
  const page = await openPage();
  const button = document.querySelector<HTMLButtonElement>("#quickGrid .quick-card .cmp-add")!;
  page.fire(button, "click");
  await page.settle();
  const toast = page.byId("cmpToast");
  assert.match(toast.textContent!, /已加入 .+当前选择 1\/4 档/);
  assert.equal(toast.getAttribute("role"), "status");
  assert.doesNotMatch(page.byId("tableFeedback").textContent!, /已加入/);
  await page.flushTimers();
  assert.equal(toast.textContent, "", "提示数秒后自动消失");
  page.fire(page.byId("cmpClearBtn"), "click");
  await page.settle();
  assert.match(page.byId("cmpToast").textContent!, /已清空对比选择/);
  page.healthy();
});

test("对比已满时其他档的按钮可聚焦并说明原因，点按提示先移出一档", async () => {
  const page = await openPage();
  const app = page.runtime;
  for (const plan of app.PLANS.filter(app.isOnSalePlan).slice(0, app.CMP_MAX)) app.cmpAdd(plan.id);
  await page.settle();
  const blocked = Array.from(document.querySelectorAll<HTMLButtonElement>("#tableBody .cmp-add")).find((button) => button.getAttribute("aria-disabled") === "true")!;
  assert.ok(blocked, "已满时其他档标为 aria-disabled");
  assert.equal(blocked.disabled, false, "不使用 disabled，键盘仍能聚焦");
  assert.match(blocked.getAttribute("aria-label")!, /已满 4 档/);
  page.fire(blocked, "click");
  await page.settle();
  assert.equal(app.cmpState.items.length, app.CMP_MAX);
  assert.match(page.byId("cmpToast").textContent!, /最多对比 4 档/);
  page.healthy();
});

test("完整权益窗口点遮罩关闭（与对比窗口一致），窗口内可直接加入对比", async () => {
  const page = await openPage();
  const trigger = document.querySelector<HTMLElement>("#quickGrid [data-view-plan]")!;
  page.fire(trigger, "click");
  await page.settle();
  const dialog = page.byId<HTMLDialogElement>("planDetailsModal");
  assert.equal(dialog.open, true);
  const compare = dialog.querySelector<HTMLButtonElement>(".cmp-add");
  assert.ok(compare, "完整权益里有加入对比按钮");
  assert.equal(compare.dataset.planId, trigger.dataset.viewPlan);
  dialog.getBoundingClientRect = () => rect(100, 600);
  page.fire(dialog, "click", { clientX: 5, clientY: 5 });
  await page.settle();
  assert.equal(dialog.open, false, "点在窗口框外关闭");
  page.healthy();
});

test("页头章节下拉列出选套餐视图的全部章节，只在该视图显示，选中后收起", async () => {
  const page = await openPage();
  const jump = page.byId<HTMLDetailsElement>("sectionJump");
  const links = Array.from(jump.querySelectorAll<HTMLAnchorElement>(".section-jump-list a"));
  assert.deepEqual(links.map((link) => link.getAttribute("href")), ["#quick", "#s1", "#free", "#table", "#rank", "#s3b", "#s3", "#s2", "#s4", "#dynamics"]);
  assert.equal(jump.hidden, false);
  jump.open = true;
  page.fire(links.find((link) => link.getAttribute("href") === "#table")!, "click");
  await page.settle();
  assert.equal(location.hash, "#table");
  assert.equal(jump.open, false, "选中章节后收起下拉");
  page.fire(document.querySelector('.primary-nav a[href="#benchmarks"]')!, "click");
  await page.settle();
  assert.equal(jump.hidden, true, "其他视图隐藏章节下拉");
  page.healthy();
});

test("额度表按额度折算排序时低置信估算排在官方与中置信之后，按月费排序不分组", async () => {
  const page = await openPage();
  const app = page.runtime;
  const lowFlags = () => app.metricsTableRows().shownRows.filter((row) => row.c.costPerM != null).map(app.metricsRowLowConfidence);
  const flags = lowFlags();
  assert.ok(flags.includes(true) && flags.includes(false), "默认数据同时有两类行");
  assert.equal(flags.indexOf(true) > flags.lastIndexOf(false), true, "每M成本排序：所有低置信行都在后面");
  assert.match(page.byId("metricsNote").textContent!, /低置信估算排在官方与中置信之后/);
  /* 分组线可能在第一页之后：先展开全部行。 */
  page.fire(page.byId("metricsAllBtn"), "click");
  await page.settle();
  const first = document.querySelector("#metricsBody tr.confidence-break");
  assert.ok(first, "第一条低置信行画分组线");
  Object.assign(app.metricsState, { sortKey: "price", sortDir: 1 });
  await page.settle();
  const prices = app.metricsTableRows().shownRows.map((row) => row.c.priceCNY).filter((price): price is number => price != null);
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i]! >= prices[i - 1]!, "按月费排序只看价格");
  assert.equal(document.querySelector("#metricsBody tr.confidence-break"), null);
  page.healthy();
});

test("地址栏写入被浏览器限流拒绝时，稍后按最新状态补写", async () => {
  const page = await openPage();
  const app = page.runtime;
  const original = history.replaceState;
  let failures = 2;
  history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
    if (failures-- > 0) throw new DOMException("Attempt to use history.replaceState() too often", "SecurityError");
    return original.apply(this, args);
  };
  try {
    app.tableState.cat = "cloud";
    app.syncUrl();
    assert.equal(new URLSearchParams(location.search).get("tcat"), null, "被拒绝的写入不改地址");
    app.tableState.region = "cn";
    await page.flushTimers();
    await page.flushTimers();
    const params = new URLSearchParams(location.search);
    assert.equal(params.get("tcat"), "cloud");
    assert.equal(params.get("tregion"), "cn", "补写的是最新状态");
  }
  finally {
    history.replaceState = original;
  }
  page.healthy();
});

test("轴标签超宽时保留「 · 」后的模型名，只截前面的套餐名", () => {
  const label = "Z.ai GLM Coding V3 Max · GLM-5.3-Flash";
  const fitted = fitAxisLabel(label, 180, 11);
  assert.ok(fitted.endsWith(" · GLM-5.3-Flash"), fitted);
  assert.ok(fitted.includes("…"), fitted);
  assert.ok(fitted.length < label.length);
  assert.equal(fitAxisLabel("短标签 · 模型", 260, 11), "短标签 · 模型", "放得下时原样返回");
});

test("预渲染交接：挂载前展开的折叠、聚焦控件与改过的输入在重建后找回，带页面状态参数时不处理", () => {
  const app = document.createElement("div");
  app.id = "app";
  app.setAttribute("data-prerendered", "");
  const markup = '<details><summary>一</summary></details><details><summary>二</summary></details><input id="handoffInput">'
    + '<input id="handoffSearch" type="search" value=""><input id="handoffUntouched" value="默认"><input id="handoffCheck" type="checkbox">'
    + '<select id="handoffSelect"><option value="a" selected>A</option><option value="b">B</option></select>';
  app.innerHTML = markup;
  document.body.append(app);
  app.querySelectorAll("details")[1]!.open = true;
  document.getElementById("handoffInput")!.focus();
  document.querySelector<HTMLInputElement>("#handoffSearch")!.value = "Claude Pro";
  document.querySelector<HTMLInputElement>("#handoffCheck")!.checked = true;
  document.querySelector<HTMLSelectElement>("#handoffSelect")!.value = "b";
  const handoff = capturePrerenderState(app);
  assert.deepEqual(handoff, { open: [1], total: 2, focusId: "handoffInput", values: [["handoffSearch", "Claude Pro"], ["handoffCheck", true], ["handoffSelect", "b"]] }, "未改动的输入不记");
  app.innerHTML = markup;
  const events: string[] = [];
  app.addEventListener("input", (event) => events.push("input:" + (event.target as HTMLElement).id));
  app.addEventListener("change", (event) => events.push("change:" + (event.target as HTMLElement).id));
  restorePrerenderState(handoff, app);
  assert.equal(app.querySelectorAll("details")[1]!.open, true);
  assert.equal(document.activeElement?.id, "handoffInput");
  restorePrerenderInputs(handoff, app);
  assert.equal(document.querySelector<HTMLInputElement>("#handoffSearch")!.value, "Claude Pro");
  assert.equal(document.querySelector<HTMLInputElement>("#handoffCheck")!.checked, true);
  assert.equal(document.querySelector<HTMLSelectElement>("#handoffSelect")!.value, "b");
  assert.deepEqual(events, ["input:handoffSearch", "change:handoffCheck", "change:handoffSelect"], "派发与用户操作相同的事件，组件据此更新状态");
  document.documentElement.classList.add("has-query");
  assert.equal(capturePrerenderState(app), null);
  document.documentElement.classList.remove("has-query");
  app.remove();
});

test("每周 tokens 图的区间上限段用半透明填充加同色描边，颜色取主题变量", async () => {
  const page: Page = await openPage({ url: "/index.html#s3" });
  const option = page.charts.get("chartTokens")!.option;
  const upper = option.series.filter((series: { itemStyle: { borderWidth?: number } }) => series.itemStyle.borderWidth === 1);
  assert.equal(upper.length, 2, "官方与估算各有一组上限段");
  for (const series of upper) {
    assert.match(series.itemStyle.color, /^rgba\(/, "填充半透明");
    assert.doesNotMatch(String(series.itemStyle.opacity ?? ""), /\d/, "不用 opacity（会连描边一起变淡）");
    assert.ok(series.itemStyle.borderColor, "描边保持实色");
  }
  assert.equal(page.runtime.PAL.chartOfficial.length > 0, true);
  page.healthy();
});
