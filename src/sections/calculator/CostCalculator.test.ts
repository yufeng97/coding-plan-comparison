import { beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as app from "../../test/runtime";
import { useMount } from "../../test/setup";
import CostCalculator from "./CostCalculator.vue";
import * as usageParser from "../../browser/usage-parser";
import { parseUsageExport, type UsageSummary } from "../../domain/usage-import";

/* 费用计算器：预设、情景、非法输入与本地用量导入。计算器在「API 按量」章节内，这里单独挂载。 */
const calculator = useMount(CostCalculator);
beforeEach(() => {
  Object.assign(app.pickerState, app.APP_DEFAULTS.picker);
  Object.assign(app.calcState, app.APP_DEFAULTS.calc);
});

test("工作量与情景使用相同缓存单价，非法数字显示错误且不写入分享状态", async () => {
  await calculator.render();
  await calculator.wrapper.get('[data-cost-preset="heavy"]').trigger("click");
  expect(app.calcState.requests).toBe("300");
  expect(calculator.wrapper.get("#costResult").text()).toContain("312M");
  await calculator.wrapper.get('[data-cost-scenario="conservative"]').trigger("click");
  expect(app.calcState.input).toBe("60"); expect(app.calcState.cache).toBe("50");
  expect(calculator.wrapper.findAll("[data-cost-scenario-result]")).toHaveLength(3);
  const model = app.API_PRICES.find((price) => price.vendor + "|" + price.model === app.calcState.model);
  const result = app.calculateWorkload(app.calcState, model);
  expect(calculator.wrapper.get("#costResult").text()).toContain(app.fmtCalcCNY(result!.costCNY));
  await calculator.wrapper.get("#costDays").setValue("99");
  expect(calculator.wrapper.get("#costResult").text()).toContain("有效数字");
  expect(app.calcState.days).toBe("26");
  await calculator.wrapper.get("#costBudget").setValue("500");
  expect(calculator.wrapper.get<HTMLInputElement>("#costDays").element.value).toBe("99");
  expect(calculator.wrapper.get("#costResult").text()).toContain("有效数字");
  await calculator.wrapper.get("#costResetBtn").trigger("click");
  expect(app.calcState.days).toBe("22");
  expect(calculator.wrapper.get("#costResult").text()).toContain("预计月费");
});

test("真实用量只解析本地 JSON，导入假设更新结果且错误可以纠正", async () => {
  await calculator.render();
  await calculator.wrapper.get("#usageImportText").setValue("invalid json");
  await calculator.wrapper.get("#usageImportBtn").trigger("click");
  expect(calculator.wrapper.get("#usageImportFeedback").text()).not.toBe("");
  await calculator.wrapper.get("#usageImportText").setValue(JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 800000, outputTokens: 200000, cacheReadTokens: 0 }] }));
  await calculator.wrapper.get("#usageImportBtn").trigger("click");
  await flushPromises();
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toContain("已导入 1 个有用量的日子");
  expect(app.calcState.tokens).toBe("10000");
  expect(app.calcState.input).toBe("80");
  expect(app.calcState.cache).toBe("0");
});

test("同值预设、情景和用量导入仍替换被覆盖字段的无效草稿", async () => {
  await calculator.render();
  await calculator.wrapper.get('[data-cost-preset="daily"]').trigger("click");
  const days = app.calcState.days;
  await calculator.wrapper.get("#costDays").setValue("99");
  await calculator.wrapper.get('[data-cost-preset="daily"]').trigger("click");
  expect(calculator.wrapper.get<HTMLInputElement>("#costDays").element.value).toBe(days);
  await calculator.wrapper.get('[data-cost-scenario="typical"]').trigger("click");
  await calculator.wrapper.get("#costCache").setValue("101");
  await calculator.wrapper.get('[data-cost-scenario="typical"]').trigger("click");
  expect(calculator.wrapper.get<HTMLInputElement>("#costCache").element.value).toBe("95");
  const usage = JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 800000, outputTokens: 200000 }] });
  const importUsage = async () => {
    await calculator.wrapper.get("#usageImportText").setValue(usage);
    await calculator.wrapper.get("#usageImportBtn").trigger("click");
    await flushPromises();
  };
  await importUsage();
  await calculator.wrapper.get("#costTokens").setValue("0");
  await importUsage();
  expect(calculator.wrapper.get<HTMLInputElement>("#costTokens").element.value).toBe("10000");
  expect(calculator.wrapper.get("#costResult").text()).toContain("预计月费");
});

test("credits 额度按当前输入缓存比例重算，其余套餐明确标为基准参考", async () => {
  Object.assign(app.pickerState, { region: "all", budget: "any" });
  Object.assign(app.calcState, { requests: "100", tokens: "7500", days: "20" });
  await calculator.render();
  expect(app.usageCoverageRows(15).some((row) => row.p.id === "plan-0091")).toBe(true);
  await calculator.wrapper.get("#costInput").setValue("0");
  await calculator.wrapper.get("#costCache").setValue("0");
  expect(app.usageCoverageRows(15).some((row) => row.p.id === "plan-0091")).toBe(false);
  const smaller = app.usageCoverageRows(1).find((row) => row.p.id === "plan-0091")!;
  expect(smaller.m.model).toBe("Claude Sonnet 5");
  expect(smaller.c.moLow).toBeCloseTo(15 / 10);
  expect(smaller.quotaBasis).toBe("workload");
  expect(smaller.c.moHigh).toBe(smaller.c.moLow);
  expect(smaller.c.moMidM).toBe(smaller.c.moLow);
  expect(smaller.c.wkLowM! * app.WEEKS_PER_MONTH).toBeCloseTo(smaller.c.moLow);
  expect(smaller.c.wkHighM).toBe(smaller.c.wkLowM);
  expect(smaller.c.blend).toBeCloseTo(10);
  expect(smaller.c.costPerM).toBeCloseTo(smaller.c.priceCNY / smaller.c.moLow);
  expect(smaller.c.fLow).toBeNull();
  expect(smaller.c.fHigh).toBeNull();
  expect(calculator.wrapper.get("#costResult").text()).toContain("套餐额度对照");
  expect(calculator.wrapper.get("#costResult").text()).toContain("页面基准参考下限");
  expect(calculator.wrapper.get("#costResult").text()).not.toContain("能覆盖这个用量");
  const uncached = app.usageCoverageRows(1, { input: "80", cache: "0" }).find((row) => row.p.id === "plan-0091")!;
  const cached = app.usageCoverageRows(1, { input: "80", cache: "95" }).find((row) => row.p.id === "plan-0091")!;
  expect(uncached.c.moLow).toBeLessThan(cached.c.moLow);
});

test("模拟整池与跨模型参照保留明细但不产生覆盖、节省或回本结论", async () => {
  Object.assign(app.pickerState, { region: "all", budget: "any" });
  Object.assign(app.calcState, { requests: "1000", tokens: "20000", days: "30" });
  await calculator.render();
  const references = app.METRICS_ALL.filter((row) => row.referenceOnly);
  expect(references).toHaveLength(13);
  for (const row of references) {
    expect(app.computeMetrics(row)?.moLow).toBeGreaterThan(0);
    expect(app.provenance(row)).toEqual({ text: "模拟对照 · 非套餐额度", conf: "低" });
  }
  /* GOAT 的 Qwen Flash 只是另一模型的牌价代理；Pro 的 Hy3 虽在权益内，但整池上限未经确认。 */
  const rows = app.usageCoverageRows(600);
  expect(rows.some((row) => ["plan-0069", "plan-0070"].includes(row.p.id))).toBe(false);
  expect(calculator.wrapper.get(".usage-coverage").text()).not.toContain("Command Code GOAT");
  expect(calculator.wrapper.get(".usage-coverage").text()).not.toContain("Command Code Pro");
  /* 已明确点名 Hy3 的 GOAT 逐模型上限继续可用，不按厂商整体封锁。 */
  expect(app.usageCoverageRows(30).find((row) => row.p.id === "plan-0069")?.m.model).toBe("hy3");
  expect(app.usageCoverageRows(10).some((row) => row.p.id === "plan-0068")).toBe(false);
  for (const row of app.usageCoverageRows(10)) {
    expect(row.m.referenceOnly).not.toBe(true);
    expect(app.publicModelIncluded(row.p, row.m.model)).toBe(true);
  }
});

test("混合日月记录导入失败说明原因，并保留已有计算条件", async () => {
  await calculator.render();
  const before = { ...app.calcState };
  const daily = JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 800000, outputTokens: 200000 }] });
  const monthly = JSON.stringify({ monthly: [{ month: "2026-09", inputTokens: 24000000, outputTokens: 6000000 }] });
  const file = calculator.wrapper.get<HTMLInputElement>("#usageImportFile");
  Object.defineProperty(file.element, "files", { configurable: true, value: [
    { size: daily.length, text: async () => daily }, { size: monthly.length, text: async () => monthly },
  ] });
  await file.trigger("change");
  await flushPromises();
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toContain("不能混合按日记录与按月记录");
  expect(app.calcState).toEqual(before);
  expect(calculator.wrapper.get("#costResult").text()).toContain("预计月费");
});

test("选择日志文件夹只读取其中的 JSON / JSONL，其他文件忽略", async () => {
  await calculator.render();
  const usage = JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 800000, outputTokens: 200000 }] });
  const folder = calculator.wrapper.get<HTMLInputElement>("#usageImportFolder");
  expect(folder.attributes("webkitdirectory")).toBeDefined();
  Object.defineProperty(folder.element, "files", { configurable: true, value: [
    { name: "notes.txt", size: 5, text: async () => "hello" },
    { name: "session.jsonl", size: usage.length, text: async () => usage },
  ] });
  await folder.trigger("change");
  await flushPromises();
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toContain("已导入 1 个有用量的日子");
  Object.defineProperty(folder.element, "files", { configurable: true, value: [{ name: "readme.md", size: 3, text: async () => "abc" }] });
  await folder.trigger("change");
  await flushPromises();
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toContain("没有 .json 或 .jsonl 文件");
});

test("无效输入逐项标出：说明点名字段与范围，aria-invalid 指向对应输入框", async () => {
  await calculator.render();
  await calculator.wrapper.get("#costDays").setValue("99");
  expect(calculator.wrapper.get("#costDays").attributes("aria-invalid")).toBe("true");
  expect(calculator.wrapper.get("#costTokens").attributes("aria-invalid")).toBeUndefined();
  expect(calculator.wrapper.get("#costResult").text()).toContain("每月使用天数（1–31 的整数）");
  expect(calculator.wrapper.get("#costSummaryLive").text()).toContain("每月使用天数");
  expect(calculator.wrapper.get("#costResult").attributes("aria-live")).toBeUndefined();
  await calculator.wrapper.get("#costDays").setValue("20");
  expect(calculator.wrapper.get("#costSummaryLive").text()).toMatch(/预计月费约 .*月预算/);
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const usageJson = (input: number, output: number) => JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: input, outputTokens: output }] });
type ImportFile = { name?: string; size: number; text: () => Promise<string> };
async function selectUsageFiles(files: ImportFile[]) {
  const input = calculator.wrapper.get<HTMLInputElement>("#usageImportFile");
  Object.defineProperty(input.element, "files", { configurable: true, value: files });
  await input.trigger("change");
  await flushPromises();
}

test("较早文件慢读完成后不会覆盖后来文件的文本、反馈与计算条件", async () => {
  await calculator.render();
  const old = deferred<string>(), latest = usageJson(200000, 1800000);
  await selectUsageFiles([{ size: 100, text: () => old.promise }]);
  await selectUsageFiles([{ size: latest.length, text: async () => latest }]);
  expect(app.calcState.input).toBe("10");
  const state = { ...app.calcState }, feedback = calculator.wrapper.get("#usageImportFeedback").text();
  old.resolve(usageJson(800000, 200000));
  await flushPromises();
  expect(app.calcState).toEqual(state);
  expect(calculator.wrapper.get<HTMLTextAreaElement>("#usageImportText").element.value).toBe(latest);
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toBe(feedback);
});

test("旧文件读取失败不会盖掉后来粘贴导入的成功反馈", async () => {
  await calculator.render();
  const old = deferred<string>(), latest = usageJson(200000, 1800000);
  await selectUsageFiles([{ size: 100, text: () => old.promise }]);
  await calculator.wrapper.get("#usageImportText").setValue(latest);
  await calculator.wrapper.get("#usageImportBtn").trigger("click");
  await flushPromises();
  const feedback = calculator.wrapper.get("#usageImportFeedback").text();
  expect(feedback).toContain("已导入");
  old.reject(new Error("old read failed"));
  await flushPromises();
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toBe(feedback);
  expect(app.calcState.input).toBe("10");
});

test("新文件尚在读取时，上一份后台解析已失效", async () => {
  await calculator.render();
  const old = deferred<UsageSummary>(), latest = deferred<string>();
  const oldContent = usageJson(800000, 200000);
  vi.spyOn(usageParser, "parseUsageInBackground").mockReturnValueOnce(old.promise);
  await calculator.wrapper.get("#usageImportText").setValue(oldContent);
  await calculator.wrapper.get("#usageImportBtn").trigger("click");
  await selectUsageFiles([{ size: 100, text: () => latest.promise }]);
  const state = { ...app.calcState };
  old.resolve(parseUsageExport([oldContent]));
  await flushPromises();
  expect(app.calcState).toEqual(state);
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toContain("正在读取");
  latest.resolve(usageJson(200000, 1800000));
  await flushPromises();
  expect(app.calcState.input).toBe("10");
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toContain("共 2M tokens");
});

test.each(["empty", "oversized", "failed", "reset"] as const)("新的 %s 操作使读取中的旧文件失效", async (action) => {
  await calculator.render();
  const old = deferred<string>();
  await selectUsageFiles([{ size: 100, text: () => old.promise }]);
  if (action === "reset") await calculator.wrapper.get("#costResetBtn").trigger("click");
  else await selectUsageFiles(action === "empty" ? [] : [{
    size: action === "oversized" ? app.USAGE_IMPORT_MAX + 1 : 100,
    text: async () => { throw new Error("latest read failed"); },
  }]);
  const state = { ...app.calcState }, feedback = calculator.wrapper.get("#usageImportFeedback").text();
  old.resolve(usageJson(200000, 1800000));
  await flushPromises();
  expect(app.calcState).toEqual(state);
  expect(calculator.wrapper.get("#usageImportFeedback").text()).toBe(feedback);
  expect(calculator.wrapper.get<HTMLTextAreaElement>("#usageImportText").element.value).toBe("");
});

test.each(["reset", "edit", "unmount"] as const)("后台解析期间 %s 后不会再提交旧导入结果", async (action) => {
  await calculator.render();
  const pending = deferred<UsageSummary>(), content = usageJson(200000, 1800000);
  vi.spyOn(usageParser, "parseUsageInBackground").mockReturnValueOnce(pending.promise);
  await calculator.wrapper.get("#usageImportText").setValue(content);
  await calculator.wrapper.get("#usageImportBtn").trigger("click");
  if (action === "unmount") calculator.unmount();
  else if (action === "edit") await calculator.wrapper.get("#costInput").setValue("70");
  else await calculator.wrapper.get("#costResetBtn").trigger("click");
  const state = { ...app.calcState };
  pending.resolve(parseUsageExport([content]));
  await flushPromises();
  expect(app.calcState).toEqual(state);
});
