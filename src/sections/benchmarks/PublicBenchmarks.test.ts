/* 公开评测组件：渲染、筛选、导出与图表；整页计算与按需数据流程见 src/regression/maintenance.test.ts。 */
import { focusedId, loadBenchmarks, pageGlobals, sleep, unloadOptionalData, useMount } from "../../test/setup";
import { beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as legacy from "@app/runtime";
import PublicBenchmarks from "./PublicBenchmarks.vue";

const view = useMount(PublicBenchmarks, () => {
  /* 页面里组件位于 .section 中；隐藏的区块不画图。 */
  const section = document.createElement("section");
  section.className = "section";
  document.body.append(section);
  return section;
});

const SEARCH_SETTLE_MS = 200;

function fixtureData(): PublicBenchmarkSnapshot {
  const protocol: PublicBenchmarkProtocol = { id: "deepswe-1-1", family: "DeepSWE", name: "Fixture DeepSWE", version: "1.1", category: "coding", metric: "任务通过率", unit: "%", description: "仅测试fixture", configuration: "固定测试配置", scope: "10项fixture", sourceUrl: "https://example.com/protocol", sourceUpdatedAt: null, checkedAt: "2026-10-10" };
  const score: PublicBenchmarkScore = { id: "fixture-a", benchmarkId: protocol.id, model: "Fixture Model A", reasoning: "high", agent: "fixture-agent", score: 80, costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: "https://example.com/scores", checkedAt: "2026-10-10" };
  return {
    schemaVersion: 1, checkedAt: "2026-10-10",
    benchmarks: [protocol, { ...protocol, id: "hle-fixture", family: "HLE", name: "Fixture HLE", version: "no-tools", scope: "20项fixture" }],
    scores: [score, { ...score, id: "fixture-b", model: "Fixture Model B", score: 80, costUSD: 0 },
      { ...score, id: "fixture-c", model: "Fixture Model C", score: 60, reasoning: null, agent: null, tokens: 100, steps: 0 },
      { ...score, id: "fixture-hle", benchmarkId: "hle-fixture", model: "Fixture Other Protocol", score: 99 }],
  };
}
/* 只带公开榜单的按需数据：贡献者任务与记录为空。 */
function loadData(data: PublicBenchmarkSnapshot) {
  loadBenchmarks({ schemaVersion: 1, generatedAt: "", tasks: [], runs: [], methodology: "", public: data });
}

/** 测试读取的图表配置片段 */
interface ChartOption {
  series: { data: number[]; itemStyle: { color(params: { dataIndex: number }): string } }[];
  xAxis: { max?: number };
  yAxis: { data: string[] };
}
/** 替代 ECharts 实例：只记下最后一次设置的配置。 */
class FakeChart {
  option: ChartOption | null = null;
  setOption(option: ChartOption) { this.option = option; }
  getOption() { return this.option; }
  resize() {}
  getWidth() { return 0; }
  getHeight() { return 0; }
  dispatchAction() {}
  on() {}
  off() {}
  dispose() {}
}
const charts = new Map<string, FakeChart>();
const downloads: { blob: Blob; filename?: string }[] = [];

beforeEach(() => {
  pageGlobals.echarts = { init(el: HTMLElement) {
    const chart = new FakeChart();
    charts.set(el.id, chart);
    return chart;
  } };
  charts.clear();
  delete legacy.chartCache.chartPublicBenchmark;
  downloads.length = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) downloads.push({ blob });
    return "blob:fixture";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.at(-1)!.filename = this.download; });
  Object.assign(legacy.publicBenchmarkState, { id: "deepswe-1-1", family: "", search: "", mode: "best" });
  Object.assign(legacy.publicBenchmarkChartState, { metric: "score", limit: "20" });
  loadData(fixtureData());
});

async function search(text: string) {
  await view.wrapper.get("#publicModelSearch").setValue(text);
  await sleep(SEARCH_SETTLE_MS);
  await flushPromises();
}
const cells = (selector: string) => view.wrapper.findAll(`#publicBenchmarkBody ${selector}`).map((cell) => cell.text());
const hidden = (selector: string) => view.wrapper.get<HTMLElement>(selector).element.hidden;
const disabled = (selector: string) => view.wrapper.get<HTMLButtonElement>(selector).element.disabled;
async function renderChart() {
  legacy.renderPublicBenchmarkChart();
  await flushPromises();
  const option = charts.get("chartPublicBenchmark")?.option;
  if (!option) throw new Error("图表尚未绘制");
  return option;
}

test("榜单只在协议内排名，并列同名次，搜索保留原名次", async () => {
  await view.render();
  expect(cells(".public-score-rank")).toEqual(["1", "1", "3"]);
  await search("Model C");
  expect(cells(".public-score-rank")).toEqual(["3"]);
  expect(disabled("#publicModelClearBtn")).toBe(false);
  expect(view.wrapper.get("#publicBenchmarkBody").text()).not.toContain("Other Protocol");
  await view.wrapper.get("#publicModelClearBtn").trigger("click");
  await view.wrapper.get("#publicBenchmarkFamily").setValue("HLE");
  await flushPromises();
  expect(cells("strong")).toEqual(["Fixture Other Protocol"]);
  expect(view.wrapper.get("#publicBenchmarkMeta").text()).toContain("20项fixture");
});

test("成本缺值显示未公布，零成本与零步骤保留；模型名按文本显示，非 https 来源不生成链接", async () => {
  const data = fixtureData();
  data.scores[0].model = "<script>fixture</script>";
  data.scores[0].sourceUrl = "javascript:alert(1)";
  loadData(data);
  await view.render();
  const body = view.wrapper.get("#publicBenchmarkBody");
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
  await view.render();
  expect(cells("strong").filter((name) => name === "Fixture Model A")).toHaveLength(1);
  await view.wrapper.get("#publicBenchmarkMode").setValue("all");
  expect(cells("strong").filter((name) => name === "Fixture Model A")).toHaveLength(2);
  expect(view.wrapper.get("#publicBenchmarkCount").text()).toContain("全部已公布配置");
});

test("评测用途只列同类协议，切换用途时选用该用途的当前默认协议", async () => {
  const data = fixtureData();
  data.benchmarks.push({ ...data.benchmarks[1], id: "hle-diamond-2026-high-closed-book-multimodal", name: "Fixture Diamond" },
    { ...data.benchmarks[1], id: "osworld-2-25443e96866dc9ce", family: "OSWorld", name: "Fixture OS2 current" });
  loadData(data);
  await view.render();
  await view.wrapper.get("#publicBenchmarkFamily").setValue("HLE");
  expect(legacy.publicBenchmarkState.id).toBe("hle-diamond-2026-high-closed-book-multimodal");
  expect(view.wrapper.get("#publicBenchmarkSelect").html()).not.toContain("deepswe");
  expect(view.wrapper.get<HTMLSelectElement>("#publicBenchmarkSelect").element.value).toBe("hle-diamond-2026-high-closed-book-multimodal");
  await view.wrapper.get("#publicBenchmarkFamily").setValue("OSWorld");
  expect(legacy.publicBenchmarkState.id).toBe("osworld-2-25443e96866dc9ce");
  expect(view.wrapper.get("#publicBenchmarkMeta").text()).toContain("Fixture OS2 current");
});

test("搜索无结果显示空态并禁用导出；清除搜索恢复结果，焦点回到搜索框", async () => {
  await view.render();
  await view.wrapper.get("#publicModelSearch").setValue("missing fixture model");
  /* 输入防抖：停顿前不重新筛选 */
  expect(hidden("#publicBenchmarkWrap")).toBe(false);
  await sleep(SEARCH_SETTLE_MS);
  await flushPromises();
  expect(hidden("#publicBenchmarkWrap")).toBe(true);
  expect(hidden("#publicBenchmarkEmpty")).toBe(false);
  expect(disabled("#downloadPublicBenchmarkCsvBtn")).toBe(true);
  await view.wrapper.get("#publicModelClearBtn").trigger("click");
  expect(hidden("#publicBenchmarkWrap")).toBe(false);
  expect(disabled("#downloadPublicBenchmarkCsvBtn")).toBe(false);
  expect(view.wrapper.get<HTMLInputElement>("#publicModelSearch").element.value).toBe("");
  expect(focusedId()).toBe("publicModelSearch");
});

test("CSV 带 BOM 并保留协议与缺失成本，JSON 只导出公共榜单", async () => {
  const data = fixtureData();
  loadData(data);
  await view.render();
  await search("Model A");
  await view.wrapper.get("#downloadPublicBenchmarkCsvBtn").trigger("click");
  await view.wrapper.get("#downloadPublicBenchmarkJsonBtn").trigger("click");
  expect(downloads.map((d) => d.filename)).toEqual(["coding-plan-benchmark-deepswe-1-1.csv", "coding-plan-public-benchmarks.json"]);
  const csv = await downloads[0].blob.text();
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"80","%","",""');
  expect(csv).not.toContain("Other Protocol");
  expect(JSON.parse(await downloads[1].blob.text())).toEqual(data);
  expect(view.wrapper.get("#publicBenchmarkFeedback").text()).toContain("未包含本机关注");
});

test("排名图保留协议原名次；成本图跳过缺值、保留零成本；无成本数据时回到分数", async () => {
  await view.render();
  let option = await renderChart();
  expect(option.series[0].data).toEqual([80, 80, 60]);
  expect(option.yAxis.data[2]).toMatch(/^#3 Fixture Model C/);
  expect(option.xAxis.max).toBe(100);
  await view.wrapper.get('[data-public-chart="cost"]').trigger("click");
  option = await renderChart();
  expect(option.series[0].data).toEqual([0]);
  expect(option.yAxis.data[0]).toMatch(/^#1 Fixture Model B/);
  expect(option.xAxis.max).toBeUndefined();
  expect(view.wrapper.get("#publicBenchmarkChartNote").text()).toContain("1 / 3");
  await search("Model C");
  expect(legacy.publicBenchmarkChartState.metric).toBe("score");
  expect(disabled('[data-public-chart="cost"]')).toBe(true);
  option = await renderChart();
  expect(option.series[0].data).toEqual([60]);
  await search("__no_match__");
  expect(hidden("#publicBenchmarkChartWrap")).toBe(true);
});

test("图例随搜索更新、按模型族取色，成本图隐藏图例", async () => {
  /* 取色读 CSS 变量：返回变量名本身，便于断言 */
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({ getPropertyValue: (key: string) => key }) as CSSStyleDeclaration);
  const data = fixtureData();
  data.scores.push({ ...data.scores[0], id: "fixture-glm", model: "GLM-5.3", score: 70, costUSD: 0.2 },
    { ...data.scores[0], id: "fixture-claude", model: "Claude-Opus-5.5", score: 75 });
  loadData(data);
  await view.render();
  await search("GLM");
  const option = await renderChart();
  expect(view.wrapper.get("#publicBenchmarkChartLegend").text()).toContain("GLM");
  expect(view.wrapper.get("#publicBenchmarkChartLegend").text()).not.toContain("Claude");
  expect(option.series[0].itemStyle.color({ dataIndex: 0 })).toBe("--bench-glm");
  await view.wrapper.get('[data-public-chart="cost"]').trigger("click");
  expect(hidden("#publicBenchmarkChartLegend")).toBe(true);
});

test("数据未到达时只提示待加载，不下「没有记录」类结论", async () => {
  unloadOptionalData();
  await view.render();
  expect(view.wrapper.get("#publicBenchmarkMeta").text()).toContain("将在数据加载后显示");
  expect(hidden("#publicBenchmarkEmpty")).toBe(true);
  expect(view.wrapper.get("#publicBenchmarkCount").text()).toBe("");
  loadData(fixtureData());
  await flushPromises();
  expect(cells(".public-score-rank")).toEqual(["1", "1", "3"]);
});

test("同一协议内筛选不收起已展开的说明，换协议时收起", async () => {
  await view.render();
  const protocolDetails = () => view.wrapper.get<HTMLDetailsElement>(".public-protocol-details").element;
  const scoreDetails = () => view.wrapper.get<HTMLDetailsElement>("#publicBenchmarkBody details.public-score-more").element;
  protocolDetails().open = true;
  scoreDetails().open = true;
  await search("Model");
  expect(protocolDetails().open).toBe(true);
  expect(scoreDetails().open).toBe(true);
  await view.wrapper.get("#publicBenchmarkFamily").setValue("HLE");
  expect(protocolDetails().open).toBe(false);
});

test("挂载时登记图表重绘入口，卸载后注销", async () => {
  await view.render();
  expect(legacy.publicBenchmarkHooks.renderChart).toBeTypeOf("function");
  view.unmount();
  expect(legacy.publicBenchmarkHooks.renderChart).toBe(null);
});
