import { beforeEach, expect, test } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import * as runtime from "../../test/runtime";
import { focusedId, useMount } from "../../test/setup";
import PlanTable from "../pricing/PlanTable.vue";
import ComparePlans from "./ComparePlans.vue";

/* 并排对比：从数据表加入方案，比较条与对比窗口（含无原生 dialog 的降级窗口）。 */
const tables = useMount(defineComponent({ setup: () => () => [h(PlanTable), h(ComparePlans)] }));
const compareButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("#tableBody .cmp-add"));

beforeEach(() => {
  Object.assign(runtime.tableState, { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
  Object.assign(runtime.pickerState, { budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
  runtime.cmpState.items = [];
  Object.defineProperty(window, "innerWidth", { value: 1280, writable: true, configurable: true });
  history.replaceState(null, "", "/");
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
