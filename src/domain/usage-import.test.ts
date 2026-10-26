import { expect, test } from "vitest";
import { parseUsageExport } from "./usage-import";

function claudeRecord(output: number, message = "msg-1", request = "req-1") {
  return JSON.stringify({
    type: "assistant", timestamp: "2026-10-01T10:00:00Z", requestId: request,
    message: { id: message, model: "claude-opus-5-5", usage: {
      input_tokens: 100, output_tokens: output, cache_read_input_tokens: 300, cache_creation_input_tokens: 40,
    } },
  });
}

test.each([
  ["递增", [10, 1000]],
  ["逆序", [1000, 10]],
  ["完整记录后又有较短片段", [10, 1000, 20]],
] as const)("Claude 同文件流式快照保留最完整用量：%s", (_, outputs) => {
  const usage = parseUsageExport(outputs.map((output) => claudeRecord(output)).join("\n"));
  expect(usage).toMatchObject({ input: 440, output: 1000, cacheRead: 300, cacheWrite: 40, total: 1440, activeDays: 1, model: "claude-opus-5-5", modelShare: 1 });
  expect(usage.inputShare).toBeCloseTo(440 / 1440 * 100);
  expect(usage.cacheRate).toBeCloseTo(300 / 440 * 100);
});

const partial = claudeRecord(10), complete = claudeRecord(1000);
test.each([
  ["较短文件在前", [partial, complete]],
  ["完整文件在前", [complete, partial]],
  ["重叠文件在后补齐", [partial, partial + "\n" + complete]],
  ["重叠文件在前已补齐", [partial + "\n" + complete, partial]],
])("Claude 跨文件重叠快照不受文件顺序影响：%s", (_, files) => {
  expect(parseUsageExport(files)).toEqual(parseUsageExport(complete));
});

test("Claude 完全相同记录在同文件及跨文件都只计一次", () => {
  expect(parseUsageExport([complete + "\n" + complete, complete])).toEqual(parseUsageExport(complete));
});

test("Claude 相同消息的不同请求、相同请求的不同消息分别计入", () => {
  const files = [
    claudeRecord(10) + "\n" + claudeRecord(1000),
    claudeRecord(1000, "msg-1", "req-2"),
    claudeRecord(1000, "msg-2", "req-1"),
  ];
  expect(parseUsageExport(files)).toMatchObject({ input: 1320, output: 3000, cacheRead: 900, cacheWrite: 120, total: 4320 });
});

const dailyUsage = ["2026-10-01", "2026-10-02"].map((period) => ({ period, inputTokens: 800000, outputTokens: 200000 }));
const monthlyUsage = ["2026-09", "2026-10"].map((period) => ({ period, inputTokens: 800000, outputTokens: 200000 }));

test("ccusage unified period 与旧版 date/month 导出保持相同日月统计", () => {
  const oldDaily = dailyUsage.map(({ period, ...row }) => ({ date: period, ...row }));
  const oldMonthly = monthlyUsage.map(({ period, ...row }) => ({ month: period, ...row }));
  expect(parseUsageExport(JSON.stringify({ daily: dailyUsage }))).toEqual(parseUsageExport(JSON.stringify({ daily: oldDaily })));
  expect(parseUsageExport(JSON.stringify({ monthly: monthlyUsage }))).toEqual(parseUsageExport(JSON.stringify({ monthly: oldMonthly })));
  /* unified 多章节输出只读取优先的 daily，不能把 monthly 再相加。 */
  expect(parseUsageExport(JSON.stringify({ daily: dailyUsage, monthly: monthlyUsage }))).toMatchObject({ total: 2000000, activeDays: 2, spanDays: 2, months: 0 });
});

test("period 支持类型包装、直接数组和分项目数据，但会话 ID 不算日历日期", () => {
  for (const source of [{ type: "daily", data: dailyUsage }, dailyUsage, { projects: { project: dailyUsage } }])
    expect(parseUsageExport(JSON.stringify(source))).toMatchObject({ activeDays: 2, spanDays: 2, months: 0 });
  expect(parseUsageExport(JSON.stringify({ type: "monthly", data: monthlyUsage }))).toMatchObject({ activeDays: 0, months: 2 });
  expect(parseUsageExport(JSON.stringify({ sessions: dailyUsage }))).toMatchObject({ activeDays: 0, months: 0 });
  expect(parseUsageExport(JSON.stringify({ type: "session", data: dailyUsage }))).toMatchObject({ activeDays: 0, months: 0 });
});

test("period 日月文件也拒绝混合粒度，旧版日期字段保留优先级", () => {
  expect(() => parseUsageExport([
    JSON.stringify({ daily: dailyUsage }), JSON.stringify({ monthly: monthlyUsage }),
  ])).toThrow(/不能混合按日记录与按月记录/);
  const dated = dailyUsage.map((row) => ({ ...row, date: "2026-10-03" }));
  expect(parseUsageExport(JSON.stringify({ daily: dated }))).toMatchObject({ activeDays: 1, spanDays: 1 });
});
