import { isOneTimePlan, findPlanReference } from '../../generated/catalog';
import { useMount, focusedId } from "../../test/setup";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import * as runtime from "@app/runtime";
import PlanTable from "./PlanTable.vue";
import MetricsTable from "./MetricsTable.vue";
import ComparePlans from "./ComparePlans.vue";

const tables = useMount(defineComponent({ setup: () => () => [h(PlanTable), h(MetricsTable), h(ComparePlans)] }));
const plans = () => document.querySelectorAll<HTMLTableRowElement>("#tableBody tr:not(:has(.table-empty))");
const compareButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("#tableBody .cmp-add"));
afterEach(() => vi.useRealTimers());

beforeEach(() => {
  Object.assign(runtime.tableState, { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
  Object.assign(runtime.metricsState, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
  Object.assign(runtime.pickerState, { budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
  runtime.cmpState.items = [];
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true, configurable: true });
  history.replaceState(null, "", "/");
});

test("价格表默认隐藏中转站与待核历史价，原生筛选与排序同时更新共享状态和网址", async () => {
  await tables.render();
  expect(plans().length).toBe(20);
  expect(tables.wrapper.get("#tableCount").text()).toContain("未显示");
  expect(compareButtons().every((button) => !runtime.tableExtraHidden(runtime.findPlanReference(button.dataset.planId)!))).toBe(true);
  await tables.wrapper.get("#selectRegion").setValue("cn");
  expect(runtime.tableState.region).toBe("cn");
  expect(location.search).toContain("tregion=cn");
  await tables.wrapper.get('#planTable th[data-sort="priceM"]').trigger("keydown", { key: "Enter" });
  expect(runtime.tableState.sortDir).toBe(-1);
  expect(tables.wrapper.get('#planTable th[data-sort="priceM"]').attributes("aria-sort")).toBe("descending");
  await tables.wrapper.get("#tableExtraToggle").trigger("click");
  expect(runtime.tableState.extra).toBe(true);
  expect(location.search).toContain("tall=1");
  await tables.wrapper.get("#tableResetBtn").trigger("click");
  expect(focusedId()).toBe("searchInput");
  expect(runtime.tableState.region).toBe("all");
});

test("搜索防抖后进入空表，清除筛选保留已选对比并恢复输入焦点", async () => {
  await tables.render();
  await tables.wrapper.get("#tableBody .cmp-add").trigger("click");
  const selected = runtime.cmpState.items[0]!.id;
  vi.useFakeTimers();
  await tables.wrapper.get("#searchInput").setValue("没有这种套餐xyz");
  expect(runtime.tableState.search).toBe("没有这种套餐xyz");
  expect(new URLSearchParams(location.search).get("q")).toBe("没有这种套餐xyz");
  expect(plans().length).toBe(20);
  await vi.advanceTimersByTimeAsync(151);
  await flushPromises();
  expect(tables.wrapper.get("#tableBody").text()).toContain("已选的对比方案仍保留");
  expect(tables.wrapper.get<HTMLButtonElement>("#exportCsvBtn").element.disabled).toBe(true);
  await tables.wrapper.get("#tableEmptyResetBtn").trigger("click");
  expect(runtime.cmpState.items.map((plan: Plan) => plan.id)).toEqual([selected]);
  expect(focusedId()).toBe("searchInput");
  vi.useRealTimers();
});

test("搜索后立即历史恢复会取消延迟结果；保留的套餐按钮在 Vue 更新后继续获得焦点", async () => {
  runtime.tableState.search = "Anthropic";
  await tables.render();
  const selected = document.querySelector<HTMLButtonElement>('#tableBody .cmp-add[data-plan-id="plan-0002"]')!;
  selected.focus();
  vi.useFakeTimers();
  await tables.wrapper.get("#searchInput").setValue("Claude");
  await vi.advanceTimersByTimeAsync(151);
  await flushPromises();
  expect(document.activeElement).toBe(selected);
  await tables.wrapper.get("#searchInput").setValue("没有这种套餐xyz");
  runtime.tableState.search = "Cursor";
  runtime.renderTable();
  await flushPromises();
  await vi.advanceTimersByTimeAsync(151);
  expect(runtime.tableState.search).toBe("Cursor");
  expect(tables.wrapper.get("#searchInput").element.getAttribute("value")).toBe("Cursor");
  expect(plans().length).toBe(Math.min(20, runtime.computeTableRows().length));
  expect(focusedId()).toBe("searchInput");
  vi.useRealTimers();
});

test("输入搜索后在同一事件轮进入对比按钮，延迟筛掉该套餐后回到搜索框", async () => {
  runtime.tableState.search = "Anthropic";
  await tables.render();
  const search = document.getElementById("searchInput") as HTMLInputElement;
  const selected = document.querySelector<HTMLButtonElement>('#tableBody .cmp-add[data-plan-id="plan-0002"]')!;
  vi.useFakeTimers();
  for (const query of ["Claude", "Cursor"]) {
    search.value = query;
    search.dispatchEvent(new Event("input", { bubbles: true }));
    selected.focus();
    expect(document.activeElement).toBe(selected);
    await vi.advanceTimersByTimeAsync(151);
    await flushPromises();
    expect(compareButtons().map(button => button.dataset.planId)).toEqual(runtime.computeTableRows().slice(0, 20).map((plan: Plan) => plan.id));
    if (query === "Claude") expect(document.activeElement).toBe(selected);
    else {
      expect(selected.isConnected).toBe(false);
      expect(document.activeElement).toBe(search);
    }
  }
});

test.each(["body", "other"])("排序保留方案节点时修复页面失焦，保留用户其他控件焦点（%s）", async destination => {
  runtime.tableState.search = "Anthropic";
  await tables.render();
  const selected = document.querySelector<HTMLButtonElement>('#tableBody .cmp-add[data-plan-id="plan-0004"]')!;
  const other = document.getElementById("copyMdBtn") as HTMLButtonElement;
  const body = document.getElementById("tableBody")!;
  const insertBefore = body.insertBefore.bind(body);
  let movedFocusedRow = false;
  /* 浏览器可能在移动 keyed row 时清掉焦点；也可能在更新中已有新的用户焦点。 */
  vi.spyOn(body, "insertBefore").mockImplementation((node, reference) => {
    const result = insertBefore(node, reference);
    if (node.contains(selected)) {
      movedFocusedRow = true;
      if (destination === "body") selected.blur();
      else other.focus();
    }
    return result;
  });
  selected.focus();
  runtime.tableState.sortDir = -1;
  await flushPromises();
  expect(movedFocusedRow).toBe(true);
  expect(selected.isConnected).toBe(true);
  expect(document.activeElement === selected).toBe(destination === "body");
  expect(document.activeElement === other).toBe(destination === "other");
});

test("分页继续浏览会聚焦第一条新增记录；对比已满时聚焦新增行", async () => {
  await tables.render();
  await tables.wrapper.get("#tableMoreBtn").trigger("click");
  await flushPromises();
  expect(plans().length).toBe(40);
  expect(document.activeElement).toBe(compareButtons()[20]);
  for (const button of compareButtons().slice(0, 4)) button.click();
  await flushPromises();
  expect(runtime.cmpState.items.length).toBe(4);
  expect(compareButtons()[5]!.disabled).toBe(true);
  await tables.wrapper.get("#tableMoreBtn").trigger("click");
  await flushPromises();
  expect(document.activeElement).toBe(plans()[40]);
});

test("导出包含全部筛选结果与核价元数据，保留计价单位，超出当前分页", async () => {
  await tables.render();
  let downloaded: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => { downloaded = blob as Blob; return "blob:test"; });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await tables.wrapper.get("#exportCsvBtn").trigger("click");
  const csv = await downloaded!.text();
  const expected = runtime.computeTableRows().length;
  expect(expected).toBeGreaterThan(plans().length);
  expect(csv).toContain("价格核查来源");
  expect(csv).toContain("计价单位");
  expect(csv).toContain("参考汇率");
  expect(tables.wrapper.get("#tableFeedback").text()).toContain(`${expected} 档`);
});

test("并排对比采用原生组件行，识别差异和同周期最低价，关闭恢复来源按钮焦点", async () => {
  await tables.render();
  const current = runtime.computeTableRows().filter((plan: Plan) => !runtime.isOneTimePlan(plan) && !plan.seat && plan.priceM != null && plan.priceM > 0);
  runtime.cmpAdd(current[0]!.id);
  runtime.cmpAdd(current.find((plan: Plan) => runtime.cnyOf(plan, "M") !== runtime.cnyOf(current[0], "M"))!.id);
  await flushPromises();
  const opener = document.getElementById("cmpOpenBtn") as HTMLButtonElement;
  opener.focus(); opener.click();
  await flushPromises();
  expect(runtime.isCmpModalOpen()).toBe(true);
  expect(focusedId()).toBe("cmpCloseBtn");
  expect(document.querySelectorAll("#cmpTable thead .cmp-remove").length).toBe(2);
  expect(document.querySelector("#cmpTable .cmp-diff-row")).not.toBeNull();
  expect(document.querySelectorAll("#cmpTable .cmp-best-price").length).toBe(1);
  (document.getElementById("cmpCloseBtn") as HTMLButtonElement).click();
  expect(runtime.isCmpModalOpen()).toBe(false);
  expect(document.activeElement).toBe(opener);
});

test("对比降级弹窗把背景设为 inert，移除后少于两档自动关闭并恢复背景", async () => {
  await tables.render();
  const modal = document.getElementById("cmpModal") as HTMLDialogElement;
  Object.defineProperty(modal, "showModal", { value: undefined, configurable: true });
  compareButtons()[0]!.click(); compareButtons()[1]!.click();
  await flushPromises();
  (document.getElementById("cmpOpenBtn") as HTMLButtonElement).click();
  expect(modal.classList.contains("cmp-fallback")).toBe(true);
  expect(modal.hasAttribute("inert")).toBe(false);
  expect((document.getElementById("cmpBackdrop") as HTMLElement).hidden).toBe(false);
  (modal.querySelector(".cmp-remove") as HTMLButtonElement).click();
  await flushPromises();
  expect(runtime.isCmpModalOpen()).toBe(false);
  expect((document.getElementById("cmpBackdrop") as HTMLElement).hidden).toBe(true);
  expect(document.querySelectorAll("[inert]").length).toBe(0);
  expect(focusedId()).toBe("searchInput");
});

test("额度表保留 16 列与按量参照，排序和紧凑列提示一致，筛选重置恢复焦点", async () => {
  await tables.render();
  expect(tables.wrapper.findAll("#metricsTable thead th").length).toBe(16);
  expect(tables.wrapper.get("#metricsNote").text()).toContain("官方按量");
  await tables.wrapper.get('#metricsTable th[data-sort="rmo"]').trigger("keydown", { key: " " });
  expect(runtime.metricsState.sortKey).toBe("rmo");
  expect(runtime.metricsState.sortDir).toBe(-1);
  expect(tables.wrapper.get("#metricsSortHint").text()).toContain("明细列，展开查看");
  await tables.wrapper.get("#metricsToggle").trigger("click");
  expect(tables.wrapper.get("#metricsToggle").attributes("aria-expanded")).toBe("true");
  expect(tables.wrapper.get("#metricsSortHint").text()).not.toContain("展开查看");
  await tables.wrapper.get("#metricsVer").setValue("V2");
  expect(tables.wrapper.findAll("#metricsBody .payg-row").length).toBe(0);
  await tables.wrapper.get("#metricsResetBtn").trigger("click");
  expect(focusedId()).toBe("metricsModel");
  expect(runtime.metricsState.ver).toBe("all");
});

test("免费预算共享条件展示专用说明，取消后恢复公开标价和额度", async () => {
  runtime.pickerState.budget = "0";
  runtime.tableState.fromPicker = true;
  runtime.metricsState.fromPicker = true;
  await tables.render();
  expect(tables.wrapper.get("#tableBody").text()).toContain("公开标价表不含免费档");
  expect(tables.wrapper.get("#metricsBody").text()).toContain("额度表只列付费套餐");
  await tables.wrapper.get('#tableBody [data-apply-picker="table"]').trigger("click");
  await tables.wrapper.get('#metricsBody [data-apply-picker="metrics"]').trigger("click");
  expect(plans().length).toBeGreaterThan(0);
  expect(tables.wrapper.findAll("#metricsBody .table-empty").length).toBe(0);
});
