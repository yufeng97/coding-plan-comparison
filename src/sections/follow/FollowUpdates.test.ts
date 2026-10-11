import { findPlanReference } from '../../generated/catalog';
/* 我的关注：关注与已读、关注同步、套餐历史、核查概况与逐条记录；整页状态流程见 src/regression/maintenance.test.ts。 */
import { MAINTENANCE_DATA, focusedId, loadBenchmarks, loadMaintenance, unloadOptionalData, useMount } from "../../test/setup";
import { beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as legacy from "@app/runtime";
import FollowUpdates from "./FollowUpdates.vue";
import PlanDetails from "../pricing/PlanDetails.vue";

const view = useMount(FollowUpdates);
const rights = useMount(PlanDetails);

/* 有已确认变更的一档套餐 */
const CHANGED_PLAN = MAINTENANCE_DATA.changes.find((c) => c.kind === "plan")!.id;

beforeEach(() => {
  localStorage.clear();
  Object.assign(legacy.followState, { version: 1, planIds: [], readChangeIds: [] });
  Object.assign(legacy.followView, { importIds: [], storageMessage: "", feedback: "" });
  Object.assign(legacy.maintenanceView, { planId: "", recordFilter: "all", publicDataFeedback: "" });
  loadMaintenance();
});
const text = (selector: string) => view.wrapper.get(selector).text();

test("数据未到达时只提示待加载，不下「没有变更」类结论", async () => {
  unloadOptionalData();
  legacy.toggleFollowPlan("plan-0002");
  await view.render();
  expect(text("#followUnreadCount")).toBe("1 档关注");
  expect(text("#followedChanges")).toContain("将在数据加载后显示");
  expect(text("#maintenanceSummary")).toContain("将在数据加载后显示");
  expect(text("#maintenanceReviews")).toContain("将在数据加载后显示");
  loadMaintenance();
  await flushPromises();
  expect(text("#followUnreadCount")).toMatch(/^1 档关注 · \d+ 条未读变更$/);
  expect(text("#maintenanceSummary")).toMatch(/维护快照 \d{4}-\d{2}-\d{2}/);
});

test("关注后列出未读变更与厂商订阅；标为已读后按钮停用，焦点回到套餐选择", async () => {
  legacy.toggleFollowPlan(CHANGED_PLAN);
  await view.render();
  expect(view.wrapper.findAll("#followedChanges .change-unread").length).toBeGreaterThan(0);
  expect(view.wrapper.get("#followedChanges").text()).toContain("→");
  expect(view.wrapper.get("#followedPlans .follow-feeds a").attributes("href")).toMatch(/^feeds\/[a-z0-9-]+\.xml$/);
  expect(view.wrapper.get(`#followedPlans [data-watch-plan="${CHANGED_PLAN}"]`).attributes("aria-pressed")).toBe("true");
  await view.wrapper.get("#markFollowReadBtn").trigger("click");
  expect(view.wrapper.get<HTMLButtonElement>("#markFollowReadBtn").element.disabled).toBe(true);
  expect(text("#followedChanges")).toContain("没有未读");
  expect(focusedId()).toBe("maintenancePlan");
  expect(text("#followFeedback")).toContain("标为已读");
});

test("没有关注时引导去选套餐，复制同步链接停用", async () => {
  await view.render();
  expect(view.wrapper.get('#followedPlans a[href="#quick"]').text()).toBe("选择套餐并关注");
  expect(view.wrapper.get<HTMLButtonElement>("#copyFollowLinkBtn").element.disabled).toBe(true);
  expect(view.wrapper.get<HTMLButtonElement>("#markFollowReadBtn").element.disabled).toBe(true);
});

test("关注列表和历史面板的完整权益按钮直接打开套餐弹窗并恢复入口焦点", async () => {
  legacy.cmpState.items = [];
  legacy.toggleFollowPlan("plan-0002");
  await view.render(); await rights.render();
  const modal = rights.wrapper.get<HTMLDialogElement>("#planDetailsModal").element;
  const followed = view.wrapper.get<HTMLButtonElement>('#followedPlans [data-view-plan="plan-0002"]');
  followed.element.focus();
  await followed.trigger("click"); await flushPromises();
  expect(modal.open).toBe(true);
  expect(rights.wrapper.get("#planDetailsTitle").text()).toBe(legacy.planTitle(legacy.findPlanReference("plan-0002")!));
  await rights.wrapper.get("#planDetailsCloseBtn").trigger("click"); await flushPromises();
  expect(document.activeElement).toBe(followed.element);

  await view.wrapper.get("#maintenancePlan").setValue(CHANGED_PLAN);
  const history = view.wrapper.get<HTMLButtonElement>(`#maintenanceHistory [data-view-plan="${CHANGED_PLAN}"]`);
  history.element.focus();
  await history.trigger("click"); await flushPromises();
  expect(modal.open).toBe(true);
  expect(rights.wrapper.get("#planDetailsTitle").text()).toBe(legacy.planTitle(legacy.findPlanReference(CHANGED_PLAN)!));
  await rights.wrapper.get("#planDetailsCloseBtn").trigger("click"); await flushPromises();
  expect(document.activeElement).toBe(history.element);
});

test("关注同步链接带来的套餐需确认：合并后写入本机并聚焦复制按钮，忽略后不写入", async () => {
  legacy.followView.importIds = ["plan-0003"];
  await view.render();
  const importPanel = () => view.wrapper.get<HTMLElement>("#followImport").element;
  expect(importPanel().hidden).toBe(false);
  expect(text("#followImport")).toContain("带来 1 档关注套餐，其中 1 档尚未在本机关注");
  await view.wrapper.get('[data-follow-import="merge"]').trigger("click");
  await flushPromises();
  expect(JSON.parse(localStorage.getItem(legacy.FOLLOW_KEY) ?? "{}").planIds).toEqual(["plan-0003"]);
  expect(importPanel().hidden).toBe(true);
  expect(focusedId()).toBe("copyFollowLinkBtn");

  legacy.followView.importIds = ["plan-0004"];
  await flushPromises();
  await view.wrapper.get('[data-follow-import="dismiss"]').trigger("click");
  await flushPromises();
  expect(legacy.followState.planIds).toEqual(["plan-0003"]);
  expect(focusedId()).toBe("maintenancePlan");
});

test("历史面板里关注保留原按钮焦点；在关注列表里取消关注后焦点落到套餐选择", async () => {
  await view.render();
  await view.wrapper.get("#maintenancePlan").setValue("plan-0002");
  const historyWatch = view.wrapper.get<HTMLButtonElement>('#maintenanceHistory [data-watch-plan="plan-0002"]');
  historyWatch.element.focus();
  legacy.toggleFollowPlan("plan-0002");
  await flushPromises();
  expect(document.activeElement).toBe(historyWatch.element);
  expect(historyWatch.attributes("aria-pressed")).toBe("true");

  view.wrapper.get<HTMLButtonElement>('#followedPlans [data-watch-plan="plan-0002"]').element.focus();
  legacy.toggleFollowPlan("plan-0002");
  await flushPromises();
  expect(view.wrapper.find('#followedPlans [data-watch-plan="plan-0002"]').exists()).toBe(false);
  expect(focusedId()).toBe("maintenancePlan");
});

test("存储不可用时说明不会保留，关注操作提示同样带上说明", async () => {
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
  await view.render();
  legacy.toggleFollowPlan("plan-0002");
  await flushPromises();
  expect(text("#followStorageNote")).toContain("不会保留");
  expect(text("#followFeedback")).toContain("关闭后不会保留");
});

test("套餐历史展开时才加载：失败可重新展开，数据到达后原地更新，不重建面板或丢焦点", async () => {
  unloadOptionalData();
  await view.render();
  await view.wrapper.get("#maintenancePlan").setValue(CHANGED_PLAN);
  expect(text("#maintenanceHistory .maintenance-plan-status")).toContain("将在数据加载后显示");
  const details = view.wrapper.get<HTMLDetailsElement>("#maintenanceHistory .plan-history").element;
  const summary = details.querySelector("summary")!;
  expect(summary.textContent).toBe("已确认价格与权益历史");
  summary.focus();
  /* 页面里没有按需数据入口，下载必然失败 */
  details.open = true;
  details.dispatchEvent(new Event("toggle"));
  await flushPromises();
  expect(details.querySelector(".plan-history-body")?.textContent).toContain("加载失败，请关闭后重新展开");
  loadMaintenance();
  await flushPromises();
  expect(view.wrapper.get("#maintenanceHistory .plan-history").element).toBe(details);
  expect(details.querySelector("summary")).toBe(summary);
  expect(details.open).toBe(true);
  expect(document.activeElement).toBe(summary);
  expect(summary.textContent).toMatch(/（\d+ 条）$/);
  expect(details.querySelector(".change-fields")?.textContent).toContain("→");
  expect(text("#maintenanceHistory .maintenance-plan-status")).toMatch(/^核查 \d{4}-\d{2}-\d{2}/);
});

test("逐条记录按范围筛选；变更值按文本显示，非 https 证据不生成链接", async () => {
  const data = structuredClone(MAINTENANCE_DATA);
  const change = data.changes.find((c) => c.id === CHANGED_PLAN)!;
  change.after[change.fields[0]] = "<img src=x onerror=alert(1)>";
  change.sourceUrls = ["javascript:alert(1)", "https://example.com/proof"];
  loadMaintenance(data);
  legacy.toggleFollowPlan(CHANGED_PLAN);
  await view.render();
  const changes = view.wrapper.get("#followedChanges");
  expect(changes.find("img").exists()).toBe(false);
  expect(changes.text()).toContain("<img src=x onerror=alert(1)>");
  expect(changes.html()).not.toContain("javascript:");
  expect(changes.findAll("a").map((a) => a.attributes("href"))).toContain("https://example.com/proof");

  const all = view.wrapper.findAll("#maintenanceRecords li").length;
  await view.wrapper.get("#maintenanceRecordFilter").setValue("unverified");
  const unverified = view.wrapper.findAll("#maintenanceRecords li");
  expect(unverified.length).toBe(MAINTENANCE_DATA.records.filter((r) => r.status === "unverified").length);
  expect(unverified.length).toBeLessThan(all);
  expect(unverified.every((li) => li.text().includes("待核实"))).toBe(true);
});

test("两份按需数据都在时直接下载公开数据 JSON，结果提示显示在按钮下方", async () => {
  loadBenchmarks();
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) blobs.push(blob);
    return "blob:fixture";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await view.render();
  await view.wrapper.get("#downloadPublicDataBtn").trigger("click");
  expect(click).toHaveBeenCalledTimes(1);
  const data = JSON.parse(await blobs[0].text());
  expect(Object.keys(data)).toEqual(["schemaVersion", "meta", "plans", "apiPrices", "paygReferences", "priceChecks", "maintenance", "benchmarks"]);
  expect(text("#publicDataFeedback")).toContain("不含本机关注");
});
