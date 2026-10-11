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
