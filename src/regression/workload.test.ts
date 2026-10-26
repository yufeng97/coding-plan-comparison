
/* 工作量费用计算：缓存折扣、币种、边界与非法输入、费用情景。原 scripts/tests/test-app-service.js 的计算部分。 */
import { describe, expect, test } from "vitest";
import * as app from "../test/runtime";

const near = (actual: number | null | undefined, expected: number) => expect(Math.abs((actual ?? NaN) - expected)).toBeLessThan(1e-8);
const usdApi = { cur: "USD", inUSD: 2, outUSD: 10, cacheUSD: 0.2 };
function workload(changes: Partial<typeof app.APP_DEFAULTS.calc> = {}, api: app.WorkloadApi = usdApi) {
  return app.calculateWorkload({ ...app.APP_DEFAULTS.calc, ...changes }, api);
}

test("80%输入的缓存折扣只作用于输入，人民币预算按换算单价计算", () => {
  const c = workload({ cache: "50", cachePrice: "0.2", budget: "100" })!;
  /* 44M总量：17.6M普通输入、17.6M缓存输入、8.8M输出，分别付35.2/3.52/88美元。 */
  near(c.monthlyM, 44);
  near(c.blended, 2.88);
  near(c.costNative, 126.72);
  near(c.costCNY, 126.72 * app.RATE_USD_CNY);
  near(c.noCacheCNY, 158.4 * app.RATE_USD_CNY);
  near(c.monthlyBudgetM, 100 / (2.88 * app.RATE_USD_CNY));
});

test("未填写缓存价时只采用已录入的官方缓存价，未录入时不虚构折扣", () => {
  /* usdApi 只有非结构化的 cacheUSD 字样，等同未录入官方缓存价。 */
  const ordinary = workload({ cache: "0", cachePrice: "" })!;
  const cached = workload({ cache: "100", cachePrice: "" })!;
  near(ordinary.costNative, 158.4);
  near(cached.costNative, 158.4);
  near(cached.costCNY, cached.noCacheCNY);
  expect(cached.cacheBasis).toBe("none");
  expect(workload({ cache: "100", cachePrice: "0.2" })!.costNative).toBeLessThan(cached.costNative);
  /* 官方 apiCache 0.2：80% 输入全部命中缓存 → 0.8×0.2 + 0.2×10 = 2.16 美元/M。 */
  const official = workload({ cache: "100", cachePrice: "" }, { ...usdApi, apiCache: 0.2 })!;
  near(official.blended, 2.16);
  expect(official.cacheBasis).toBe("official");
  expect(workload({ cache: "100", cachePrice: "1" }, { ...usdApi, apiCache: 0.2 })!.cacheBasis, "手填缓存价优先于官方价").toBe("custom");
});

test("人民币模型、纯输入输出、零请求及零单价的边界有明确结果", () => {
  const api = { cur: "CNY", inCNY: 8, outCNY: 28 };
  const c = workload({ cache: "50", cachePrice: "2", budget: "96" }, api)!;
  near(c.blended, 9.6);
  near(c.costNative, 422.4);
  near(c.costCNY, 422.4);
  near(c.monthlyBudgetM, 10);
  near(workload({ input: "0", cache: "100", cachePrice: "2" }, api)!.blended, 28);
  near(workload({ input: "100", cache: "0", cachePrice: "2" }, api)!.blended, 8);
  near(workload({ input: "100", cache: "100", cachePrice: "2" }, api)!.blended, 2);
  const idle = workload({ requests: "0", budget: "0" }, api)!;
  expect([idle.monthlyM, idle.costCNY, idle.monthlyBudgetM]).toEqual([0, 0, 0]);
  const free = workload({ input: "100", cache: "100", cachePrice: "0" }, api)!;
  expect(free.costCNY).toBe(0);
  expect(free.monthlyBudgetM, "零单价不能输出Infinity覆盖量").toBe(null);
});

describe("非法工作量和高于输入价的缓存价拒绝计算，不输出NaN或负费用", () => {
  test.each([
    { model: "unknown|model" }, { requests: "-1" }, { requests: "0.5" }, { requests: "100001" },
    { tokens: "0" }, { tokens: "10000001" }, { days: "0" }, { days: "32" },
    { input: "101" }, { cache: "-1" }, { cache: "101" }, { cachePrice: "2.01" },
    { cachePrice: "NaN" }, { cachePrice: "Infinity" }, { budget: "1e3" }, { budget: "1000000001" },
  ])("%o", (changes) => {
    expect(workload(changes)).toBe(null);
  });
  test("单价非法或缺少输出价", () => {
    expect(workload({}, { ...usdApi, inUSD: -1 })).toBe(null);
    expect(workload({}, { cur: "USD", inUSD: 2 })).toBe(null);
    expect(workload({ requests: "100000", tokens: "10000000", days: "31", input: "27.5", cache: "61.5", budget: "1000000000" })).toBeTruthy();
  });
});

test("三种费用情景按明确示例假设计算，各自保留工作量区间，缓存缺价不虚构折扣", () => {
  const rows = app.calculateCostScenarios({ ...app.APP_DEFAULTS.calc, cachePrice: "0.2" }, usdApi);
  const rate = app.RATE_USD_CNY;
  for (const [i, usd] of [205.04, 98.208, 51.92].entries()) {
    near(rows[i].costNative, usd);
    near(rows[i].lowCNY, usd * rate * 0.8);
    near(rows[i].highCNY, usd * rate * 1.2);
    expect(rows[i].monthlyM).toBe(44);
  }
  const noCache = app.calculateCostScenarios({ ...app.APP_DEFAULTS.calc, cachePrice: "" }, usdApi);
  for (const [i, usd] of [228.8, 158.4, 123.2].entries()) near(noCache[i].costNative, usd);
  expect(app.calculateCostScenarios({ ...app.APP_DEFAULTS.calc, requests: "0" }, usdApi).map((r) => r.costCNY)).toEqual([0, 0, 0]);
});

function codexUsageLog(session: string, extended = false) {
  const usage = (input: number, output: number) => ({ input_tokens: input, cached_input_tokens: input * 0.8, output_tokens: output, total_tokens: input + output });
  const event = (minute: string, total: ReturnType<typeof usage>, last: ReturnType<typeof usage>) => JSON.stringify({
    timestamp: `2026-10-01T10:${minute}:00Z`, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total, last_token_usage: last } },
  });
  const first = usage(5000, 300);
  return [JSON.stringify({ type: "session_meta", payload: { id: session } }), event("02", first, first),
    ...(extended ? [event("05", usage(12000, 700), usage(7000, 400))] : [])].join("\n");
}

test("Codex 相同会话的重复和重叠文件只计一次，不同会话相同用量分别计入", () => {
  const first = codexUsageLog("session-a"), extended = codexUsageLog("session-a", true);
  expect(app.parseUsageExport([first, first]).total).toBe(5300);
  expect(app.parseUsageExport([first, extended]).total).toBe(12700);
  expect(app.parseUsageExport([extended, first]).total).toBe(12700);
  expect(app.parseUsageExport([first, codexUsageLog("session-b")]).total).toBe(10600);
  expect(app.parseUsageExport(first + "\n" + codexUsageLog("session-b")).total).toBe(10600);
});

test("多文件用量保留同粒度导入，拒绝混合日记录与月记录", () => {
  const daily = JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 800000, outputTokens: 200000 }] });
  const nextDay = JSON.stringify({ daily: [{ date: "2026-10-02", inputTokens: 800000, outputTokens: 200000 }] });
  const monthly = JSON.stringify({ monthly: [{ month: "2026-09", inputTokens: 24000000, outputTokens: 6000000 }] });
  const nextMonth = JSON.stringify({ monthly: [{ month: "2026-10", inputTokens: 24000000, outputTokens: 6000000 }] });
  const dayUsage = app.parseUsageExport([daily, nextDay]);
  expect(dayUsage.total).toBe(2000000);
  expect(dayUsage.activeDays).toBe(2);
  const monthUsage = app.parseUsageExport([monthly, nextMonth]);
  expect(monthUsage.total).toBe(60000000);
  expect(monthUsage.months).toBe(2);
  const values = app.usageToCalculator(monthUsage);
  expect(Math.abs(Number(values.requests) * Number(values.tokens) * Number(values.days) - 30000000)).toBeLessThanOrEqual(1100);
  expect(() => app.parseUsageExport([daily, monthly])).toThrow(/不能混合按日记录与按月记录/);
  expect(() => app.parseUsageExport([monthly, daily])).toThrow(/统一导出/);
});

test("ccusage unified period 导入按日均或月均换算，不能把全部历史当一个月", () => {
  const monthlyM = (source: unknown) => {
    const values = app.usageToCalculator(app.parseUsageExport(JSON.stringify(source)), app.APP_DEFAULTS.calc);
    return Number(values.requests) * Number(values.tokens) * Number(values.days) / 1e6;
  };
  const row = { inputTokens: 800000, outputTokens: 200000 };
  expect(monthlyM({ daily: [{ period: "2026-10-01", ...row }, { period: "2026-10-02", ...row }] })).toBe(22);
  expect(monthlyM({ monthly: [{ period: "2026-09", ...row }, { period: "2026-10", ...row }] })).toBeCloseTo(1, 2);
});
