import { isOneTimePlan, findPlanReference } from '@generated/catalog';
import { useMount, focusedId } from "../../test/setup";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import * as runtime from "../../test/runtime";
import PlanTable from "./PlanTable.vue";
import MetricsTable from "./MetricsTable.vue";
import ComparePlans from "../compare/ComparePlans.vue";

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
  await tables.wrapper.get('#planTable th[data-sort="priceM"] button').trigger("click");
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

test.each([".cmp-add", ".watch-plan", 'td[data-column="url"] a'].flatMap(selector => ["body", "other"].map(destination => ({ selector, destination }))))("排序保留行内 $selector 焦点，保留用户其他控件焦点（$destination）", async ({ selector, destination }) => {
  runtime.tableState.search = "Anthropic";
  await tables.render();
  const selected = document.querySelector<HTMLElement>(`#tableBody tr[data-plan-id="plan-0004"] ${selector}`)!;
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

test.each([".watch-plan", 'td[data-column="url"] a'])("搜索筛掉聚焦的 %s 时返回搜索框", async selector => {
  runtime.tableState.search = "Anthropic";
  await tables.render();
  const selected = document.querySelector<HTMLElement>(`#tableBody tr[data-plan-id="plan-0002"] ${selector}`)!;
  vi.useFakeTimers();
  const search = document.getElementById("searchInput") as HTMLInputElement;
  search.value = "Cursor";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  selected.focus();
  await vi.advanceTimersByTimeAsync(151);
  await flushPromises();
  expect(selected.isConnected).toBe(false);
  expect(document.activeElement).toBe(search);
});

test.each([".watch-plan", 'td[data-column="url"] a'])("响应式分页保留第 9 行 %s 的记录与焦点", async selector => {
  await tables.render();
  const selected = plans()[8]!.querySelector<HTMLElement>(selector)!;
  selected.focus();
  window.innerWidth = 375;
  window.dispatchEvent(new Event("resize"));
  await flushPromises();
  expect(plans()).toHaveLength(10);
  expect(selected.isConnected).toBe(true);
  expect(document.activeElement).toBe(selected);
});

test("分页继续浏览会聚焦第一条新增记录；对比已满时仍聚焦新增行的对比按钮并说明已满", async () => {
  await tables.render();
  const reveal = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
  await tables.wrapper.get("#tableMoreBtn").trigger("click");
  await flushPromises();
  expect(plans().length).toBe(40);
  expect(document.activeElement).toBe(compareButtons()[20]);
  expect(reveal.mock.contexts).toContain(compareButtons()[20]);
  for (const button of compareButtons().slice(0, 4)) button.click();
  await flushPromises();
  expect(runtime.cmpState.items.length).toBe(4);
  expect(compareButtons()[5]!.getAttribute("aria-disabled")).toBe("true");
  expect(compareButtons()[5]!.disabled).toBe(false);
  await tables.wrapper.get("#tableMoreBtn").trigger("click");
  await flushPromises();
  expect(document.activeElement).toBe(compareButtons()[40]);
  expect(compareButtons()[40]!.getAttribute("aria-label")).toContain("已满");
  expect(reveal.mock.contexts).toContain(compareButtons()[40]);
  await tables.wrapper.get("#metricsMoreBtn").trigger("click");
  await flushPromises();
  const firstNewMetric = document.querySelectorAll<HTMLTableRowElement>("#metricsBody tr")[20];
  expect(document.activeElement).toBe(firstNewMetric);
  expect(reveal.mock.contexts).toContain(firstNewMetric);
});

test.each(["clipped", "visible", "moved", "detached"])("分页滚动提交后只补齐仍被裁剪的当前焦点（%s）", state => {
  const wrap = document.createElement("div"); wrap.className = "table-wrap";
  const target = document.createElement("button"), other = document.createElement("button");
  wrap.append(target); document.body.append(wrap, other);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
  vi.spyOn(wrap, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 100, width: 1000, height: 600 }));
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 10, y: state === "visible" ? 200 : 1100, width: 50, height: 21 }));
  const scroll = vi.spyOn(target, "scrollIntoView");
  expect(runtime.revealAndFocusTableControl(target)).toBe(true);
  if (state === "moved") other.focus();
  if (state === "detached") target.remove();
  frames.shift()!(0); frames.shift()!(0);
  expect(scroll).toHaveBeenCalledTimes(state === "clipped" ? 2 : 1);
  if (state === "moved") expect(document.activeElement).toBe(other);
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

test("额度表保留 16 列与按量参照，排序和紧凑列提示一致，筛选重置恢复焦点", async () => {
  await tables.render();
  expect(tables.wrapper.findAll("#metricsTable thead th").length).toBe(16);
  expect(tables.wrapper.get("#metricsNote").text()).toContain("官方按量");
  await tables.wrapper.get('#metricsTable th[data-sort="rmo"] button').trigger("click");
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
