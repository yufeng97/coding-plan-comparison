import { loadBenchmarks, pageGlobals, unloadOptionalData } from "../test/setup";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { Component } from "vue";
import * as app from "@domain/runtime";
import PersonalPrices from "./PersonalPrices.vue";
import RankChart from "./RankChart.vue";
import WeeklyTokens from "./WeeklyTokens.vue";
import TeamPrices from "./TeamPrices.vue";
import ApiPrices from "./ApiPrices.vue";
import PublicBenchmarks from "./PublicBenchmarks.vue";
import PlanTable from "./PlanTable.vue";

class Chart {
  disposed = false;
  constructor(readonly host: HTMLElement) {}
  setOption() {}
  resize() {}
  getWidth() { return 0; }
  getHeight() { return 0; }
  dispatchAction() {}
  on() {}
  off() {}
  dispose() { this.disposed = true; }
}
const instances: Chart[] = [];
const views: VueWrapper[] = [];
const ids = ["chartPersonal", "chartRank", "chartTokens", "chartTeam", "chartApi", "chartPower", "chartPublicBenchmark"];
function installCharts() {
  const init = vi.fn((host: HTMLElement) => {
    const chart = new Chart(host);
    instances.push(chart);
    return chart;
  });
  pageGlobals.echarts = { init };
  return init;
}
async function renderView(component: Component) {
  const view = mount(component, { attachTo: document.body });
  views.push(view);
  await flushPromises();
  return view;
}
beforeEach(() => {
  for (const id of ids) app.releaseChart(id);
  instances.length = 0;
  unloadOptionalData();
  Object.assign(app.personalState, app.APP_DEFAULTS.personal);
  Object.assign(app.rankState, app.APP_DEFAULTS.rank);
  Object.assign(app.pickerState, app.APP_DEFAULTS.picker);
  Object.assign(app.tableState, app.APP_DEFAULTS.table);
  app.refreshPalette();
  installCharts();
});
afterEach(() => {
  views.splice(0).forEach((view) => view.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const chartViews = [
  { name: "个人价格", component: PersonalPrices, render: app.renderPersonalChart, ids: ["chartPersonal"] },
  { name: "成本排行", component: RankChart, render: app.renderRankChart, ids: ["chartRank"] },
  { name: "每周额度", component: WeeklyTokens, render: app.renderTokensChart, ids: ["chartTokens"] },
  { name: "团队价格", component: TeamPrices, render: app.renderTeamChart, ids: ["chartTeam"] },
  { name: "API 两张图", component: ApiPrices, render: app.renderApiChart, ids: ["chartApi", "chartPower"] },
  { name: "公开评测", component: PublicBenchmarks, render: app.renderPublicBenchmarkChart, ids: ["chartPublicBenchmark"] },
];
test.each(chartViews)("$name 卸载释放画布，重新挂载使用当前 DOM", async ({ component, render, ids: owned }) => {
  if (component === PublicBenchmarks) loadBenchmarks();
  const first = await renderView(component);
  render();
  await flushPromises();
  const previous = owned.map((id) => app.chartCache[id] as Chart);
  expect(previous.every(Boolean)).toBe(true);
  for (const id of owned) app.pendingChartResizes.add(id);
  first.unmount();
  for (const [index, id] of owned.entries()) {
    expect(previous[index]!.disposed).toBe(true);
    expect(app.chartCache[id]).toBeUndefined();
    expect(app.pendingChartResizes.has(id)).toBe(false);
  }
  await renderView(component);
  render();
  await flushPromises();
  for (const [index, id] of owned.entries()) {
    const current = app.chartCache[id] as Chart;
    expect(current).not.toBe(previous[index]);
    expect(current.host).toBe(document.getElementById(id));
    expect(current.host.isConnected).toBe(true);
    expect(current.disposed).toBe(false);
  }
});

test("表格取消真实组件的搜索防抖时立即显示当前筛选，卸载清除待搜索标记", async () => {
  const view = await renderView(PlanTable);
  await view.get("#searchInput").setValue("Cursor");
  expect(app.hasPendingSearch()).toBe(true);
  app.cancelTableSearch();
  await flushPromises();
  expect(app.hasPendingSearch()).toBe(false);
  expect(view.findAll("#tableBody tr")).toHaveLength(Math.min(20, app.computeTableRows().length));
  expect(view.get("#tableBody").text()).toContain("Cursor");
  await view.get("#searchInput").setValue("Claude");
  expect(app.hasPendingSearch()).toBe(true);
  view.unmount();
  expect(app.hasPendingSearch()).toBe(false);
});

test("个人搜索取消真实防抖时立即更新文字，卸载清除待搜索标记", async () => {
  const view = await renderView(PersonalPrices);
  await view.get("#chartSearch").setValue("Claude");
  expect(app.hasPendingSearch()).toBe(true);
  app.cancelPersonalSearch();
  await flushPromises();
  expect(app.hasPendingSearch()).toBe(false);
  expect(view.get("#notePersonal").text()).toContain(`当前筛选：${app.PLANS.filter((plan) => app.isPriceConfirmed(plan) && app.isPersonalMonthly(plan) && app.queryHit(app.planSearchBlob(plan), "Claude")).length} 个档位`);
  await view.get("#chartSearch").setValue("Cursor");
  view.unmount();
  expect(app.hasPendingSearch()).toBe(false);
});

test("图表下载期间卸载取消旧请求，失败与重试只处理重新挂载的容器", async () => {
  delete pageGlobals.echarts;
  const template = document.createElement("template");
  template.id = "chartLibraryTemplate";
  template.innerHTML = '<script src="/fixture-echarts.js"></script>';
  document.body.append(template);
  const downloads: HTMLScriptElement[] = [];
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) downloads.push(node);
    else append(node);
    return node;
  });
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const first = await renderView(PersonalPrices);
  app.renderPersonalChart();
  const oldHost = first.get<HTMLElement>("#chartPersonal").element;
  const oldContents = oldHost.innerHTML;
  expect(app.queuedChartRenders.has("chartPersonal")).toBe(true);
  first.unmount();
  expect(app.queuedChartRenders.has("chartPersonal")).toBe(false);

  const second = await renderView(PersonalPrices);
  app.renderPersonalChart();
  expect(downloads).toHaveLength(1);
  downloads[0]!.onerror?.(new Event("error"));
  await flushPromises();
  expect(oldHost.innerHTML).toBe(oldContents);
  expect(second.get("#chartPersonal .render-error").text()).toContain("重试");
  expect(errors).toHaveBeenCalledTimes(1);

  app.renderPersonalChart();
  expect(downloads).toHaveLength(2);
  const init = installCharts();
  downloads[1]!.onload?.(new Event("load"));
  await flushPromises();
  expect(init).toHaveBeenCalledTimes(1);
  expect(instances[0]!.host).toBe(second.get("#chartPersonal").element);
  expect(oldHost.innerHTML).toBe(oldContents);
  expect(app.queuedChartRenders.size).toBe(0);
});
