import { isFreeCodingEntry, resolvedField, PLANS, API_PRICES } from '@generated/catalog';
import { focusedId, pageGlobals, sleep, unloadOptionalData, useMount } from "../../test/setup";
import { beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as app from "../../test/runtime";
import FreePlans from "./FreePlans.vue";
import PersonalPrices from "./PersonalPrices.vue";
import RankChart from "./RankChart.vue";
import ApiPrices from "./ApiPrices.vue";
import PlanDetails from "./PlanDetails.vue";

type ChartOption = { series: { data: unknown[] }[]; yAxis: { data: string[] } };
class FakeChart {
  option: ChartOption | undefined;
  actions: { type: string; name: string }[] = [];
  setOption(option: ChartOption) { this.option = option; }
  getOption() { return this.option; }
  resize() {}
  getWidth() { return 0; }
  getHeight() { return 0; }
  dispatchAction(action: { type: string; name: string }) { this.actions.push(action); }
  on() {}
  off() {}
  dispose() {}
}
const charts = new Map<string, FakeChart>();
const free = useMount(FreePlans), personal = useMount(PersonalPrices), rank = useMount(RankChart), api = useMount(ApiPrices), details = useMount(PlanDetails);
beforeEach(() => {
  unloadOptionalData();
  Object.assign(app.personalState, app.APP_DEFAULTS.personal);
  Object.assign(app.pickerState, app.APP_DEFAULTS.picker);
  Object.assign(app.rankState, app.APP_DEFAULTS.rank);
  Object.assign(app.calcState, app.APP_DEFAULTS.calc);
  Object.assign(app.freeState, { region: "all", kind: "all" });
  for (const key of Object.keys(app.chartCache)) delete app.chartCache[key];
  for (const key of Object.keys(app.chartLegendSelections)) delete app.chartLegendSelections[key];
  charts.clear();
  pageGlobals.echarts = { init(element: HTMLElement) { const chart = new FakeChart(); charts.set(element.id, chart); return chart; } };
});

test("免费入口组合地区与类型，卡片保留推理费用和官网来源", async () => {
  await free.render();
  const total = app.PLANS.filter(app.isFreeCodingEntry).length;
  expect(free.wrapper.findAll(".free-card")).toHaveLength(total);
  await free.wrapper.get('[data-free-region="intl"]').trigger("click");
  await free.wrapper.get('[data-free-kind="byok"]').trigger("click");
  const matching = app.PLANS.filter((plan) => app.isFreeCodingEntry(plan) && plan.region === "intl" && app.freeKind(plan) === "byok");
  expect(free.wrapper.findAll(".free-card")).toHaveLength(matching.length);
  expect(free.wrapper.get("#freeCount").text()).toContain(`显示 ${matching.length} / ${total}`);
  expect(free.wrapper.get('[data-free-kind="byok"]').attributes("aria-checked")).toBe("true");
  for (const card of free.wrapper.findAll(".free-card")) {
    expect(card.get(".fc-cost").text()).toContain("推理另计");
    expect(card.get("a.fc-link").attributes("href")).toMatch(/^https:\/\//);
  }
});

test("个人价格搜索立即写分享条件且防抖显示、排除公开年付价缺失档，清除后恢复焦点", async () => {
  await personal.render();
  app.renderPersonalChart(); await flushPromises();
  expect(personal.wrapper.get("#notePersonal").text()).toContain(`显示 ${app.PERSONAL_DEFAULT_LIMIT}`);
  await personal.wrapper.get("#chartSearch").setValue("Claude");
  expect(app.personalState.q).toBe("Claude");
  expect(new URLSearchParams(app.appQueryString()).get("pq")).toBe("Claude");
  expect(charts.get("chartPersonal")?.option?.yAxis.data).toHaveLength(app.PERSONAL_DEFAULT_LIMIT);
  expect(personal.wrapper.find("#showAllPersonal").exists()).toBe(true);
  await sleep(180); await flushPromises();
  expect(app.personalState.q).toBe("Claude");
  expect(charts.get("chartPersonal")?.option?.yAxis.data.length).toBeGreaterThan(0);
  await personal.wrapper.get('[data-billing="Y"]').trigger("click");
  await flushPromises();
  expect(personal.wrapper.get("#notePersonal").text()).toContain("未列公开年付价的档位已排除");
  expect(charts.get("chartPersonal")?.option?.yAxis.data.some((label) => label.includes("Claude Pro"))).toBe(true);
  expect(charts.get("chartPersonal")?.option?.yAxis.data.some((label) => label.includes("Claude Max"))).toBe(false);
  await personal.wrapper.get("#personalResetBtn").trigger("click");
  expect(app.personalState.q).toBe("");
  expect(app.personalState.billing).toBe("M");
  expect(focusedId()).toBe("chartSearch");
});

test("个人图继承帮我选付款方式，免费预算显示可取消空态", async () => {
  await personal.render();
  app.renderPersonalChart(); await flushPromises();
  app.personalState.fromPicker = true;
  app.pickerState.budget = "0";
  await flushPromises();
  expect(personal.wrapper.get<HTMLButtonElement>('[data-billing="Y"]').element.disabled).toBe(true);
  expect(personal.wrapper.get<HTMLElement>("#chartPersonalEmpty").element.hidden).toBe(false);
  expect(personal.wrapper.get("#chartPersonalEmpty").text()).toContain("免费 Coding 入口");
  await personal.wrapper.get('#chartPersonalEmpty [data-apply-picker="personal"]').trigger("click");
  await flushPromises();
  expect(app.personalState.fromPicker).toBe(false);
  expect(personal.wrapper.get<HTMLButtonElement>('[data-billing="Y"]').element.disabled).toBe(false);
});

test("排行厂商与置信度筛选同步图表、完整明细和键盘展开", async () => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  await rank.render();
  app.renderRankChart(); await flushPromises();
  await rank.wrapper.get("#rankVendor").setValue("Anthropic");
  await flushPromises();
  expect(rank.wrapper.get("#rankDetailBody").text()).toContain("Claude");
  const rows = app.rankRows();
  expect(rows.length).toBeGreaterThan(0);
  expect(rank.wrapper.findAll("#rankDetailBody tr")).toHaveLength(rows.length);
  await rank.wrapper.get('[data-rscope="credits"]').trigger("click");
  await flushPromises();
  expect(rank.wrapper.get("#rankDetailBody .table-empty").text()).toContain("没有可比较的套餐");
  await rank.wrapper.get("#openRankDetails").trigger("click");
  expect(rank.wrapper.get<HTMLDetailsElement>("#rankDetails").element.open).toBe(true);
  expect(focusedId()).toBe("rankDetailsSummary");
  await rank.wrapper.get("#rankVendor").setValue("all");
  await rank.wrapper.get('[data-rank="all"]').trigger("click");
  await flushPromises();
  expect(rank.wrapper.findAll("#rankDetailBody tr:not(.rank-divider)")).toHaveLength(app.rankRows().length);
  expect(warnings.mock.calls.flat().some((warning) => String(warning).includes("Duplicate keys"))).toBe(false);
});

test("API 明细独立于画布，键盘图例选择在重绘后保留", async () => {
  await api.render();
  app.renderApiChart(); await flushPromises();
  const tableRows = api.wrapper.findAll("#apiDetailBody tr");
  expect(tableRows.length).toBe(app.API_PRICES.length);
  expect(tableRows[0].text()).toContain("核价来源");
  await api.wrapper.get('#apiLegend [data-series="输出 / 1M tokens"]').trigger("click");
  expect(api.wrapper.get('#apiLegend [data-series="输出 / 1M tokens"]').attributes("aria-pressed")).toBe("false");
  app.renderApiChart();
  expect(charts.get("chartApi")?.actions.at(-1)).toEqual({ type: "legendUnSelect", name: "输出 / 1M tokens" });
});

test("尚未进入图表区时只渲染原生文字明细，不触发图表库下载", async () => {
  delete pageGlobals.echarts;
  await api.render();
  expect(api.wrapper.findAll("#apiDetailBody tr")).toHaveLength(app.API_PRICES.length);
  expect(api.wrapper.get("#costResult").text()).toContain("预计月费");
  expect(app.queuedChartRenders.size).toBe(0);
  expect(api.wrapper.findAll(".chart-loading")).toHaveLength(0);
});

test("历史恢复取消个人图待显示的搜索，不启动尚未初始化的图表", async () => {
  await personal.render();
  await personal.wrapper.get("#chartSearch").setValue("尚未提交的新搜索");
  app.cancelPersonalSearch();
  app.personalState.q = "已恢复的条件";
  await sleep(180); await flushPromises();
  expect(app.personalState.q).toBe("已恢复的条件");
  expect(personal.wrapper.get<HTMLInputElement>("#chartSearch").element.value).toBe("已恢复的条件");
  expect(app.queuedChartRenders.size).toBe(0);
  expect(charts.size).toBe(0);
});

test.each([false, true])("完整权益备用模式在 open 属性缺失=%s 时可关闭与重开，并精确恢复背景", async missingOpen => {
  await details.render();
  const trigger = document.createElement("button"); trigger.id = "detailsTrigger"; document.body.appendChild(trigger); trigger.focus();
  const modal = details.wrapper.get<HTMLDialogElement>("#planDetailsModal").element;
  Object.defineProperty(modal, "showModal", { value: undefined, configurable: true });
  Object.defineProperty(modal, "close", { value: undefined, configurable: true });
  if (missingOpen) Object.defineProperty(modal, "open", { get: () => undefined, configurable: true });
  const preserved = document.createElement("aside");
  preserved.setAttribute("inert", "existing"); preserved.setAttribute("aria-hidden", "false"); document.body.append(preserved);
  const plan = app.PLANS[0];
  app.showPlanDetails(plan.id, trigger); await flushPromises();
  expect(modal.hasAttribute("open")).toBe(true);
  expect(modal.getAttribute("aria-modal")).toBe("true");
  expect(modal.parentElement?.hasAttribute("inert")).toBe(false);
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(details.wrapper.get("#planDetailsTitle").text()).toBe(app.planTitle(plan));
  expect(details.wrapper.get("#planDetailsBody").text()).toContain(app.resolvedField(plan, "quota"));
  expect(focusedId()).toBe("planDetailsCloseBtn");
  app.showPlanDetails(app.PLANS[1]!.id); await flushPromises();
  expect(details.wrapper.get("#planDetailsTitle").text()).toBe(app.planTitle(app.PLANS[1]!));
  const feedback = `关注操作已在窗口更新 ${missingOpen}`;
  app.followView.feedback = feedback;
  await flushPromises();
  expect(details.wrapper.get("#planFollowFeedback").text()).toBe(feedback);
  await details.wrapper.get("#planDetailsCloseBtn").trigger("click");
  expect(modal.hasAttribute("open")).toBe(false);
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(preserved.getAttribute("inert")).toBe("existing");
  expect(preserved.getAttribute("aria-hidden")).toBe("false");
  expect(document.body.classList.contains("has-plan-details")).toBe(false);
  expect(focusedId()).toBe("detailsTrigger");
  app.showPlanDetails(plan.id, trigger); await flushPromises();
  expect(modal.hasAttribute("open")).toBe(true);
  await details.wrapper.get("#planDetailsModal").trigger("keydown", { key: "Escape" });
  expect(modal.hasAttribute("open")).toBe(false);
  expect(details.wrapper.get<HTMLElement>("#planDetailsBackdrop").element.hidden).toBe(true);
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(focusedId()).toBe("detailsTrigger");
});
