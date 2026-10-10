/* 公开评测组件：渲染、筛选、导出与图表。计算逻辑本身另在 scripts/tests/test-app-maintenance.js（页面虚拟 DOM）里测。 */
import "../bootstrap.js"; /* 先注入状态工厂，旧脚本里的 appState() 才返回响应式对象 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import * as legacy from "virtual:legacy-lib";
import PublicBenchmarks from "./PublicBenchmarks.vue";

const SEARCH_SETTLE_MS = 200;
/** 页面里经典脚本声明的全局（按需数据、ECharts）；测试直接放到全局对象上 */
const pageGlobals = /** @type {any} */ (globalThis);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixtureData() {
  const protocol = { id: "deepswe-1-1", family: "DeepSWE", name: "Fixture DeepSWE", version: "1.1", category: "coding", metric: "任务通过率", unit: "%", description: "仅测试fixture", configuration: "固定测试配置", scope: "10项fixture", sourceUrl: "https://example.com/protocol", sourceUpdatedAt: null, checkedAt: "2026-10-10" };
  const score = { id: "fixture-a", benchmarkId: protocol.id, model: "Fixture Model A", reasoning: "high", agent: "fixture-agent", score: 80, costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: "https://example.com/scores", checkedAt: "2026-10-10" };
  return {
    schemaVersion: 1, checkedAt: "2026-10-10",
    benchmarks: [protocol, { ...protocol, id: "hle-fixture", family: "HLE", name: "Fixture HLE", version: "no-tools", scope: "20项fixture" }],
    scores: [score, { ...score, id: "fixture-b", model: "Fixture Model B", score: 80, costUSD: 0 },
      { ...score, id: "fixture-c", model: "Fixture Model C", score: 60, reasoning: null, agent: null, tokens: 100, steps: 0 },
      { ...score, id: "fixture-hle", benchmarkId: "hle-fixture", model: "Fixture Other Protocol", score: 99 }],
  };
}
/* 按需数据是经典脚本定义的全局常量；这里直接放到全局，再像页面加载器一样通知组件。 */
function loadData(data) {
  pageGlobals.BENCHMARKS = { schemaVersion: 1, generatedAt: "", tasks: [], runs: [], methodology: "", public: data };
  legacy.renderPublicBenchmarks();
}

const charts = new Map();
const downloads = [];
let wrapper = null;

beforeEach(() => {
  pageGlobals.echarts = { init(el) {
    const chart = { option: null, setOption(option) { this.option = option; }, getOption() { return this.option; },
      resize() {}, getWidth: () => 0, getHeight: () => 0, dispatchAction() {}, on() {}, off() {} };
    charts.set(el.id, chart);
    return chart;
  } };
  charts.clear();
  delete legacy.chartCache.chartPublicBenchmark;
  downloads.length = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { downloads.push({ blob }); return "blob:fixture"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { downloads.at(-1).filename = this.download; });
  Object.assign(legacy.publicBenchmarkState, { id: "deepswe-1-1", family: "", search: "", mode: "best" });
  Object.assign(legacy.publicBenchmarkChartState, { metric: "score", limit: "20" });
  loadData(fixtureData());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/* 页面里组件位于 .section 中；隐藏的区块不画图。 */
async function render() {
  const section = document.createElement("section");
  section.className = "section";
  document.body.append(section);
  wrapper = mount(PublicBenchmarks, { attachTo: section });
  await flushPromises();
  return wrapper;
}
async function search(text) {
  await wrapper.get("#publicModelSearch").setValue(text);
  await sleep(SEARCH_SETTLE_MS);
  await flushPromises();
}
const cells = (selector) => wrapper.findAll(`#publicBenchmarkBody ${selector}`).map((cell) => cell.text());
async function renderChart() {
  legacy.renderPublicBenchmarkChart();
  await flushPromises();
  return charts.get("chartPublicBenchmark").option;
}

test("榜单只在协议内排名，并列同名次，搜索保留原名次", async () => {
  await render();
  expect(cells(".public-score-rank")).toEqual(["1", "1", "3"]);
  await search("Model C");
  expect(cells(".public-score-rank")).toEqual(["3"]);
  expect(wrapper.get("#publicModelClearBtn").element.disabled).toBe(false);
  expect(wrapper.get("#publicBenchmarkBody").text()).not.toContain("Other Protocol");
  await wrapper.get("#publicModelClearBtn").trigger("click");
  await wrapper.get("#publicBenchmarkFamily").setValue("HLE");
  await flushPromises();
  expect(cells("strong")).toEqual(["Fixture Other Protocol"]);
  expect(wrapper.get("#publicBenchmarkMeta").text()).toContain("20项fixture");
});

test("成本缺值显示未公布，零成本与零步骤保留；模型名按文本显示，非 https 来源不生成链接", async () => {
  const data = fixtureData();
  data.scores[0].model = "<script>fixture</script>";
  data.scores[0].sourceUrl = "javascript:alert(1)";
  loadData(data);
  await render();
  const body = wrapper.get("#publicBenchmarkBody");
  expect(body.text()).toContain("未公布");
  expect(body.text()).toContain("$0");
  expect(body.text()).toContain("Steps：0");
  expect(body.html()).toContain("&lt;script&gt;fixture&lt;/script&gt;");
  expect(body.find("script").exists()).toBe(false);
  expect(body.html()).not.toContain("javascript:");
  expect(body.text()).toContain("来源未公布");
});

test("默认每模型取最高分配置，全部模式列出各推理配置", async () => {
  const data = fixtureData();
  data.scores.push({ ...data.scores[0], id: "fixture-a-low", reasoning: "low", score: 70, costUSD: 0.1 });
  loadData(data);
  await render();
  expect(cells("strong").filter((name) => name === "Fixture Model A")).toHaveLength(1);
  await wrapper.get("#publicBenchmarkMode").setValue("all");
  expect(cells("strong").filter((name) => name === "Fixture Model A")).toHaveLength(2);
  expect(wrapper.get("#publicBenchmarkCount").text()).toContain("全部已公布配置");
});

test("评测用途只列同类协议，切换用途时选用该用途的当前默认协议", async () => {
  const data = fixtureData();
  data.benchmarks.push({ ...data.benchmarks[1], id: "hle-diamond-2026-high-closed-book-multimodal", name: "Fixture Diamond" },
    { ...data.benchmarks[1], id: "osworld-2-25443e96866dc9ce", family: "OSWorld", name: "Fixture OS2 current" });
  loadData(data);
  await render();
  await wrapper.get("#publicBenchmarkFamily").setValue("HLE");
  expect(legacy.publicBenchmarkState.id).toBe("hle-diamond-2026-high-closed-book-multimodal");
  expect(wrapper.get("#publicBenchmarkSelect").html()).not.toContain("deepswe");
  expect(wrapper.get("#publicBenchmarkSelect").element.value).toBe("hle-diamond-2026-high-closed-book-multimodal");
  await wrapper.get("#publicBenchmarkFamily").setValue("OSWorld");
  expect(legacy.publicBenchmarkState.id).toBe("osworld-2-25443e96866dc9ce");
  expect(wrapper.get("#publicBenchmarkMeta").text()).toContain("Fixture OS2 current");
});

test("搜索无结果显示空态并禁用导出；清除搜索恢复结果，焦点回到搜索框", async () => {
  await render();
  await wrapper.get("#publicModelSearch").setValue("missing fixture model");
  /* 输入防抖：停顿前不重新筛选 */
  expect(wrapper.get("#publicBenchmarkWrap").element.hidden).toBe(false);
  await sleep(SEARCH_SETTLE_MS);
  await flushPromises();
  expect(wrapper.get("#publicBenchmarkWrap").element.hidden).toBe(true);
  expect(wrapper.get("#publicBenchmarkEmpty").element.hidden).toBe(false);
  expect(wrapper.get("#downloadPublicBenchmarkCsvBtn").element.disabled).toBe(true);
  await wrapper.get("#publicModelClearBtn").trigger("click");
  expect(wrapper.get("#publicBenchmarkWrap").element.hidden).toBe(false);
  expect(wrapper.get("#downloadPublicBenchmarkCsvBtn").element.disabled).toBe(false);
  expect(wrapper.get("#publicModelSearch").element.value).toBe("");
  expect(document.activeElement.id).toBe("publicModelSearch");
});

test("CSV 带 BOM 并保留协议与缺失成本，JSON 只导出公共榜单", async () => {
  const data = fixtureData();
  loadData(data);
  await render();
  await search("Model A");
  await wrapper.get("#downloadPublicBenchmarkCsvBtn").trigger("click");
  await wrapper.get("#downloadPublicBenchmarkJsonBtn").trigger("click");
  expect(downloads.map((d) => d.filename)).toEqual(["coding-plan-benchmark-deepswe-1-1.csv", "coding-plan-public-benchmarks.json"]);
  const csv = await downloads[0].blob.text();
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain('"80","%","",""');
  expect(csv).not.toContain("Other Protocol");
  expect(JSON.parse(await downloads[1].blob.text())).toEqual(data);
  expect(wrapper.get("#publicBenchmarkFeedback").text()).toContain("未包含本机关注");
});

test("排名图保留协议原名次；成本图跳过缺值、保留零成本；无成本数据时回到分数", async () => {
  await render();
  let option = await renderChart();
  expect(option.series[0].data).toEqual([80, 80, 60]);
  expect(option.yAxis.data[2]).toMatch(/^#3 Fixture Model C/);
  expect(option.xAxis.max).toBe(100);
  await wrapper.get('[data-public-chart="cost"]').trigger("click");
  option = await renderChart();
  expect(option.series[0].data).toEqual([0]);
  expect(option.yAxis.data[0]).toMatch(/^#1 Fixture Model B/);
  expect(option.xAxis.max).toBeUndefined();
  expect(wrapper.get("#publicBenchmarkChartNote").text()).toContain("1 / 3");
  await search("Model C");
  expect(legacy.publicBenchmarkChartState.metric).toBe("score");
  expect(wrapper.get('[data-public-chart="cost"]').element.disabled).toBe(true);
  option = await renderChart();
  expect(option.series[0].data).toEqual([60]);
  await search("__no_match__");
  expect(wrapper.get("#publicBenchmarkChartWrap").element.hidden).toBe(true);
});

test("图例随搜索更新、按模型族取色，成本图隐藏图例", async () => {
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => /** @type {any} */ ({ getPropertyValue: (key) => key }));
  const data = fixtureData();
  data.scores.push({ ...data.scores[0], id: "fixture-glm", model: "GLM-5.3", score: 70, costUSD: 0.2 },
    { ...data.scores[0], id: "fixture-claude", model: "Claude-Opus-5.5", score: 75 });
  loadData(data);
  await render();
  await search("GLM");
  const option = await renderChart();
  expect(wrapper.get("#publicBenchmarkChartLegend").text()).toContain("GLM");
  expect(wrapper.get("#publicBenchmarkChartLegend").text()).not.toContain("Claude");
  expect(option.series[0].itemStyle.color({ dataIndex: 0 })).toBe("--bench-glm");
  await wrapper.get('[data-public-chart="cost"]').trigger("click");
  expect(wrapper.get("#publicBenchmarkChartLegend").element.hidden).toBe(true);
});

test("数据未到达时只提示待加载，不下「没有记录」类结论", async () => {
  delete pageGlobals.BENCHMARKS;
  legacy.renderPublicBenchmarks();
  await render();
  expect(wrapper.get("#publicBenchmarkMeta").text()).toContain("将在数据加载后显示");
  expect(wrapper.get("#publicBenchmarkEmpty").element.hidden).toBe(true);
  expect(wrapper.get("#publicBenchmarkCount").text()).toBe("");
  loadData(fixtureData());
  await flushPromises();
  expect(cells(".public-score-rank")).toEqual(["1", "1", "3"]);
});

test("同一协议内筛选不收起已展开的说明，换协议时收起", async () => {
  await render();
  const protocolDetails = () => wrapper.get(".public-protocol-details").element;
  protocolDetails().open = true;
  wrapper.get("#publicBenchmarkBody details.public-score-more").element.open = true;
  await search("Model");
  expect(protocolDetails().open).toBe(true);
  expect(wrapper.get("#publicBenchmarkBody details.public-score-more").element.open).toBe(true);
  await wrapper.get("#publicBenchmarkFamily").setValue("HLE");
  expect(protocolDetails().open).toBe(false);
});

test("挂载时登记图表重绘入口，卸载后注销", async () => {
  await render();
  expect(legacy.publicBenchmarkHooks.renderChart).toBeTypeOf("function");
  wrapper.unmount();
  wrapper = null;
  expect(legacy.publicBenchmarkHooks.renderChart).toBe(null);
});
