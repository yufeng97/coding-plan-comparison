import { beforeEach, expect, test } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as app from "../../test/runtime";
import { useMount } from "../../test/setup";
import CostCalculator from "./CostCalculator.vue";

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
  app.importUsageText(calculator.wrapper.get<HTMLTextAreaElement>("#usageImportText").element.value);
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
  app.importUsageText(usage); await flushPromises();
  await calculator.wrapper.get("#costTokens").setValue("0");
  app.importUsageText(usage); await flushPromises();
  expect(calculator.wrapper.get<HTMLInputElement>("#costTokens").element.value).toBe("10000");
  expect(calculator.wrapper.get("#costResult").text()).toContain("预计月费");
});

test("credits 额度按当前输入缓存比例重算，其余套餐明确标为基准参考", async () => {
  Object.assign(app.pickerState, { region: "all", budget: "any" });
  Object.assign(app.calcState, { requests: "100", tokens: "15000", days: "20" });
  await calculator.render();
  expect(app.usageCoverageRows(30).some((row) => row.p.vendor === "Command Code" && row.p.plan === "Go")).toBe(true);
  await calculator.wrapper.get("#costInput").setValue("0");
  await calculator.wrapper.get("#costCache").setValue("0");
  expect(app.usageCoverageRows(30).some((row) => row.p.vendor === "Command Code" && row.p.plan === "Go")).toBe(false);
  const smaller = app.usageCoverageRows(10).find((row) => row.p.vendor === "Command Code" && row.p.plan === "Go")!;
  expect(smaller.c.moLow).toBeCloseTo(10 / 0.528);
  expect(smaller.quotaBasis).toBe("workload");
  expect(smaller.c.moHigh).toBe(smaller.c.moLow);
  expect(smaller.c.moMidM).toBe(smaller.c.moLow);
  expect(smaller.c.wkLowM! * app.WEEKS_PER_MONTH).toBeCloseTo(smaller.c.moLow);
  expect(smaller.c.wkHighM).toBe(smaller.c.wkLowM);
  expect(smaller.c.blend).toBeCloseTo(0.528);
  expect(smaller.c.costPerM).toBeCloseTo(smaller.c.priceCNY / smaller.c.moLow);
  expect(smaller.c.fLow).toBeNull();
  expect(smaller.c.fHigh).toBeNull();
  expect(calculator.wrapper.get("#costResult").text()).toContain("套餐额度对照");
  expect(calculator.wrapper.get("#costResult").text()).toContain("页面基准参考下限");
  expect(calculator.wrapper.get("#costResult").text()).not.toContain("能覆盖这个用量");
  const uncached = app.usageCoverageRows(10, { input: "80", cache: "0" }).find((row) => row.p.vendor === "Command Code" && row.p.plan === "Go")!;
  const cached = app.usageCoverageRows(10, { input: "80", cache: "95" }).find((row) => row.p.vendor === "Command Code" && row.p.plan === "Go")!;
  expect(uncached.c.moLow).toBeLessThan(cached.c.moLow);
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
