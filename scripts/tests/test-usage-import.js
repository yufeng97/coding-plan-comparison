#!/usr/bin/env node
/* 本地用量导入的解析与折算：node scripts/tests/test-usage-import.js
 * 载入 js/usage-import.js（无 DOM），覆盖 ccusage 报告、Claude Code 与 Codex 日志及失败提示。 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/usage-import.js"), "utf8") +
  "\n;globalThis.api={parseUsageText,summarizeUsage,usageCalcValues};", sandbox, { filename: "js/usage-import.js" });
const { parseUsageText, summarizeUsage, usageCalcValues } = sandbox.api;
const plain = (value) => JSON.parse(JSON.stringify(value));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (error) { failed++; console.log("  ✗ " + name); console.error(error); }
}

const dailyEntry = (date) => ({ date, inputTokens: 1000, outputTokens: 2000, cacheCreationTokens: 3000, cacheReadTokens: 94000, totalTokens: 100000, totalCost: 1.2, modelsUsed: ["claude-opus-5-5"] });

test("ccusage 按日报告按首末日期折算月用量，活跃天数与缓存口径正确", () => {
  const summary = summarizeUsage(parseUsageText(JSON.stringify({ daily: [dailyEntry("2026-10-01"), dailyEntry("2026-10-03")], totals: { totalTokens: 200000 } })));
  assert.equal(summary.mode, "daily");
  assert.equal(summary.total, 200000);
  assert.equal(summary.spanDays, 3);
  assert.equal(summary.activeDays, 2);
  near(summary.monthlyTokens, 200000 / 3 * 30.44);
  near(summary.inputShare, 98);
  near(summary.cacheHit, 94000 / 98000 * 100);
  assert.equal(summary.model, "claude-opus-5-5");
  assert.equal(summary.requests, null);
  const values = plain(usageCalcValues(summary, { requests: "100", days: "22" }));
  assert.deepEqual(values, { requests: "100", tokens: String(Math.round(summary.monthlyTokens / 20 / 100)), days: "20", input: "98", cache: "95.9" });
});

test("ccusage 按月与按周报告使用各自的时间跨度", () => {
  const month = (m, n) => ({ month: m, inputTokens: n, outputTokens: n, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const monthly = summarizeUsage(parseUsageText(JSON.stringify({ monthly: [month("2026-08", 1000), month("2026-09", 3000)] })));
  assert.equal(monthly.mode, "monthly");
  assert.equal(monthly.months, 2);
  near(monthly.monthlyTokens, 4000);
  assert.equal(usageCalcValues(monthly, { requests: "10", days: "20" }).days, "20", "按月报告没有活跃天数时保留当前天数");
  const week = (w) => ({ week: w, inputTokens: 700, outputTokens: 700 });
  const weekly = summarizeUsage(parseUsageText(JSON.stringify({ weekly: [week("2026-09-28"), week("2026-10-05")] })));
  assert.equal(weekly.mode, "weekly");
  assert.equal(weekly.spanDays, 14);
  near(weekly.monthlyTokens, 2800 / 14 * 30.44);
  assert.equal(weekly.activeDaysPerMonth, null);
});

test("Claude Code 日志按消息与请求 ID 去重，跳过非用量行并保留请求数和模型", () => {
  const line = (id, day) => JSON.stringify({ type: "assistant", timestamp: `2026-10-0${day}T10:00:00.000Z`, requestId: "req_" + id,
    message: { id: "msg_" + id, model: "claude-opus-5-5-20260901", usage: { input_tokens: 10, output_tokens: 500, cache_creation_input_tokens: 1000, cache_read_input_tokens: 20000 } } });
  const text = [line(1, 1), line(1, 1), line(2, 2), JSON.stringify({ type: "user", timestamp: "2026-10-02T09:00:00Z", message: { role: "user", content: "hi" } }), "not json", ""].join("\n");
  const records = parseUsageText(text);
  assert.equal(records.length, 2, "流式重复写入的同一回复只计一次");
  const summary = summarizeUsage(records);
  assert.equal(summary.requests, 2);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.model, "claude-opus-5-5-20260901");
  assert.equal(summary.total, 2 * 21510);
  assert.equal(usageCalcValues(summary, { requests: "100", days: "22" }).requests, "1", "已知请求数时按每天实际请求数填写");
});

test("Codex 日志扣除包含在输入里的缓存，累计未变的重复 token_count 不重复计入", () => {
  const usage = (input, cached, output) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 100, total_tokens: input + output });
  const event = (time, total, last) => JSON.stringify({ timestamp: time, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total, last_token_usage: last } } });
  const text = [
    JSON.stringify({ timestamp: "2026-10-01T10:00:00Z", type: "session_meta", payload: { id: "s1" } }),
    JSON.stringify({ timestamp: "2026-10-01T10:01:00Z", type: "event_msg", payload: { type: "token_count", info: null } }),
    event("2026-10-01T10:02:00Z", usage(5000, 4000, 300), usage(5000, 4000, 300)),
    event("2026-10-01T10:02:01Z", usage(5000, 4000, 300), usage(5000, 4000, 300)),
    event("2026-10-01T10:05:00Z", usage(12000, 10000, 700), usage(7000, 6000, 400)),
  ].join("\n");
  const summary = summarizeUsage(parseUsageText(text));
  assert.equal(summary.requests, 2);
  assert.deepEqual([summary.input, summary.cacheRead, summary.cacheWrite, summary.output], [2000, 10000, 0, 700]);
  near(summary.inputShare, 12000 / 12700 * 100);
  near(summary.cacheHit, 10000 / 12000 * 100);
});

test("无法折算的输入给出可操作的中文提示", () => {
  /** @type {Array<[string, RegExp]>} */
  const cases = [
    ["", /请先粘贴/],
    ["hello world", /不是 JSON 或 JSONL/],
    [JSON.stringify({ totals: { totalTokens: 10 } }), /只有合计、没有日期/],
    [JSON.stringify({ foo: 1 }), /没有识别到用量明细/],
    [JSON.stringify({ type: "user", message: { role: "user" } }), /没有找到 token 用量记录/],
    [JSON.stringify({ daily: [{ inputTokens: 10, outputTokens: 10 }] }), /缺少日期/],
    [JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 0, outputTokens: 0 }] }), /没有可用的 token 用量记录/],
  ];
  for (const [text, pattern] of cases) assert.throws(() => summarizeUsage(parseUsageText(text)), pattern, text);
});

test("单日用量很大时提高每天请求数，保持月总量且不超出计算器上限", () => {
  const huge = summarizeUsage(parseUsageText(JSON.stringify({ daily: [{ date: "2026-10-01", inputTokens: 4e9, outputTokens: 1e9 }] })));
  const values = usageCalcValues(huge, { requests: "10", days: "22" });
  assert.ok(Number(values.tokens) <= 10000000 && Number(values.requests) <= 100000);
  const monthly = Number(values.requests) * Number(values.tokens) * Number(values.days);
  assert.ok(Math.abs(monthly - huge.monthlyTokens) / huge.monthlyTokens < 0.01, "折算后的月总量与原始数据一致");
  for (const key of ["requests", "tokens", "days", "input", "cache"]) assert.match(values[key], /^\d+(?:\.\d+)?$/);
});

console.log(`本地用量导入：${passed} 通过，${failed} 失败`);
if (failed) process.exitCode = 1;
