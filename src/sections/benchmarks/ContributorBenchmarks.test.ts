/* 贡献者工具：筛选、记录与任务；整页筛选和数据边界见 src/regression/maintenance.test.ts。 */
import { BENCHMARK_DATA, loadBenchmarks, unloadOptionalData, useMount } from "../../test/setup";
import { beforeEach, expect, test } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as legacy from "../../test/runtime";
import ContributorBenchmarks from "./ContributorBenchmarks.vue";

const view = useMount(ContributorBenchmarks);

beforeEach(() => {
  Object.assign(legacy.benchmarkFilter, { task: "all", tool: "all", model: "all" });
  loadBenchmarks();
});
const run: BenchmarkRun = { id: "fixture-run", taskId: "csv-export", model: "Model <b>X</b>", tool: "Fixture CLI", measuredAt: "2026-10-08", cost: 0.42, currency: "USD", costBasis: "api-receipt", durationSeconds: 1.5, generationSeconds: null, passed: false, repeats: 2, evidence: "javascript:alert(1)", environment: "" };

test("数据未到达时只提示待加载，到达后说明尚未收录记录并列出全部任务", async () => {
  unloadOptionalData();
  await view.render();
  expect(view.wrapper.get("#benchmarkResults").text()).toContain("将在数据加载后显示");
  expect(view.wrapper.findAll("#benchmarkTasks details")).toHaveLength(0);
  loadBenchmarks();
  await flushPromises();
  expect(view.wrapper.get("#benchmarkResults").text()).toContain("尚未收录贡献者任务记录");
  expect(view.wrapper.findAll("#benchmarkTasks details")).toHaveLength(BENCHMARK_DATA.tasks.length);
  expect(view.wrapper.get("#benchmarkMethodology").text()).toContain("同一解答");
});

test("选择任务只显示该任务，模板与筛选共用同一状态", async () => {
  await view.render();
  await view.wrapper.get("#benchmarkTask").setValue("csv-export");
  expect(view.wrapper.findAll("#benchmarkTasks details")).toHaveLength(1);
  expect(legacy.benchmarkFilter.task).toBe("csv-export");
  expect(legacy.contributionTemplate("benchmark")).toContain("任务：csv-export");
});

test("记录分开显示账单、生成时间与验收次数；模型名按文本显示，非 https 证据不生成链接", async () => {
  loadBenchmarks({ ...BENCHMARK_DATA, runs: [run] });
  await view.render();
  const results = view.wrapper.get("#benchmarkResults");
  expect(results.text()).toContain("符合条件 1 条贡献者解答记录");
  expect(results.text()).toContain("USD 0.42");
  expect(results.text()).toContain("验收未全部通过");
  expect(results.get("dl").text()).toContain("生成时间未记录");
  expect(results.text()).toContain("Model <b>X</b>");
  expect(results.find("b").exists()).toBe(false);
  expect(results.text()).toContain("复现证据未记录");
  expect(results.html()).not.toContain("javascript:");
  /* 工具和模型下拉只列数据里出现过的值 */
  expect(view.wrapper.findAll("#benchmarkTool option").map((o) => o.text())).toEqual(["全部工具", "Fixture CLI"]);
  await view.wrapper.get("#benchmarkTool").setValue("Fixture CLI");
  expect(legacy.benchmarkFilter.tool).toBe("Fixture CLI");
  await view.wrapper.get("#benchmarkTask").setValue("cached-cost");
  expect(view.wrapper.get("#benchmarkResults").text()).toContain("当前筛选没有贡献者记录");
});
