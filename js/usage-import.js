/* ============================================================
 * 本地用量导入（无 DOM 依赖）：解析 ccusage 报告与 Claude Code / Codex 会话日志，
 * 折算成工作量计算器的输入。只在浏览器内计算，不上传、不保存原始内容。
 * 被 js/app-service.js 与 scripts/tests/test-usage-import.js 共用。
 * ============================================================ */
"use strict";

const USAGE_IMPORT_MAX_CHARS = 60 * 1024 * 1024;
const USAGE_DAYS_PER_MONTH = 30.44;
/* ccusage 报告里可能出现的明细数组；totals 只有合计、没有日期，不能折算月用量。 */
const USAGE_REPORT_KEYS = ["daily", "weekly", "monthly", "sessions", "blocks", "data"];

/** @param {any} value */
function usageNumber(value) {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}
/** @param {any} entry @param {string[]} keys */
function usageField(entry, keys) {
  for (const key of keys) if (entry && Object.prototype.hasOwnProperty.call(entry, key)) return usageNumber(entry[key]);
  return 0;
}
/** 日期统一成 YYYY-MM-DD（UTC）；无法识别返回 null。 @param {any} value */
function usageDay(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}
/**
 * 把一条 token 统计换成统一口径。Anthropic 口径的 input 不含缓存读写；
 * OpenAI / Codex 口径的 cached_input 是 input 的一部分，需要从 input 里扣除。
 * @param {any} usage
 */
function usageTokens(usage) {
  const cachedSubset = usageField(usage, ["cachedInputTokens", "cached_input_tokens"]);
  const input = usageField(usage, ["inputTokens", "input_tokens", "input"]);
  return {
    input: cachedSubset ? Math.max(0, input - cachedSubset) : input,
    cacheRead: cachedSubset || usageField(usage, ["cacheReadTokens", "cache_read_tokens", "cacheReadInputTokens", "cache_read_input_tokens"]),
    cacheWrite: usageField(usage, ["cacheCreationTokens", "cache_creation_tokens", "cacheCreationInputTokens", "cache_creation_input_tokens"]),
    output: usageField(usage, ["outputTokens", "output_tokens", "output"]),
  };
}
function usageTotal(r) { return r.input + r.cacheRead + r.cacheWrite + r.output; }

/** ccusage 报告：daily / monthly / sessions 等数组，每项带 token 字段和日期或月份。 */
function usageFromReport(report) {
  const key = USAGE_REPORT_KEYS.find((name) => Array.isArray(report[name]));
  if (!key) {
    if (report.totals) throw new Error("这份报告只有合计、没有日期，无法折算月用量。请导出按日明细，例如 npx ccusage daily --json。");
    throw new Error("没有识别到用量明细。请粘贴 ccusage 的 --json 输出，或 Claude Code / Codex 的 JSONL 会话日志。");
  }
  /* 周报每条覆盖 7 天（日期为周起始日），活跃天数未知。 */
  const spanUnit = key === "weekly" ? 7 : 1;
  return report[key].map((entry) => {
    const month = typeof entry.month === "string" && /^\d{4}-\d{2}$/.test(entry.month.trim()) ? entry.month.trim() : null;
    const day = month ? null : usageDay(entry.date ?? entry.day ?? entry.week ?? entry.lastActivity ?? entry.startTime ?? entry.timestamp);
    const models = Array.isArray(entry.modelsUsed) ? entry.modelsUsed : Array.isArray(entry.models) ? entry.models : [];
    return { day, month, spanUnit, ...usageTokens(entry), requests: null, model: models.length === 1 && typeof models[0] === "string" ? models[0] : null };
  });
}

/** JSONL 会话日志：Claude Code 的 message.usage，或 Codex 的 token_count 事件。 */
function usageFromLines(lines) {
  const records = [];
  const seenMessages = new Set();
  let previousCodexTotal = "", parsed = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); } catch (err) { continue; }
    parsed++;
    if (!event || typeof event !== "object") continue;
    const day = usageDay(event.timestamp);
    const message = event.message;
    if (message && typeof message === "object" && message.usage && typeof message.usage === "object") {
      /* Claude Code 会把同一次回复按流式片段重复写入；与 ccusage 一样按消息 ID + 请求 ID 去重。 */
      const id = message.id && event.requestId ? message.id + ":" + event.requestId : "";
      if (id && seenMessages.has(id)) continue;
      if (id) seenMessages.add(id);
      records.push({ day, month: null, spanUnit: 1, ...usageTokens(message.usage), requests: 1, model: typeof message.model === "string" ? message.model : null });
      continue;
    }
    const payload = event.payload && typeof event.payload === "object" ? event.payload : event;
    const info = payload && payload.type === "token_count" && payload.info && typeof payload.info === "object" ? payload.info : null;
    if (info && info.last_token_usage) {
      /* Codex 会在限额信息更新时重复发出 token_count；累计用量未变化的事件不重复计入。 */
      const total = JSON.stringify(info.total_token_usage || null);
      if (info.total_token_usage && total === previousCodexTotal) continue;
      previousCodexTotal = total;
      records.push({ day, month: null, spanUnit: 1, ...usageTokens(info.last_token_usage), requests: 1, model: null });
    }
  }
  if (!parsed) throw new Error("内容不是 JSON 或 JSONL。请粘贴 ccusage 的 --json 输出，或会话日志文件的原始内容。");
  if (!records.length) throw new Error("日志里没有找到 token 用量记录。Claude Code 日志在 ~/.claude/projects，Codex 日志在 ~/.codex/sessions。");
  return records;
}

/**
 * 解析粘贴或读取的文本，返回逐条用量记录。
 * @param {string} text
 * @returns {{day:string|null, month:string|null, spanUnit:number, input:number, cacheRead:number, cacheWrite:number, output:number, requests:number|null, model:string|null}[]}
 */
function parseUsageText(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("请先粘贴用量数据或选择文件。");
  if (source.length > USAGE_IMPORT_MAX_CHARS) throw new Error("内容超过 60 MB。请改用 ccusage 导出的按日 JSON（npx ccusage daily --json）。");
  if (source.startsWith("{") || source.startsWith("[")) {
    let whole;
    try { whole = JSON.parse(source); } catch (err) { whole = undefined; }
    if (Array.isArray(whole)) return usageFromReport({ data: whole }).filter((r) => usageTotal(r) > 0);
    if (whole && typeof whole === "object" && !whole.message && !whole.payload) return usageFromReport(whole).filter((r) => usageTotal(r) > 0);
  }
  return usageFromLines(source.split(/\r?\n/));
}

/**
 * 汇总用量并按日历折算到每月。按日记录用首末日期之间的天数折算；按月记录取月平均。
 * @param {ReturnType<typeof parseUsageText>} records
 */
function summarizeUsage(records) {
  if (!records.length) throw new Error("没有可用的 token 用量记录。");
  const sum = (key) => records.reduce((total, r) => total + r[key], 0);
  const totals = { input: sum("input"), cacheRead: sum("cacheRead"), cacheWrite: sum("cacheWrite"), output: sum("output") };
  const total = totals.input + totals.cacheRead + totals.cacheWrite + totals.output;
  if (!(total > 0)) throw new Error("用量合计为 0，无法折算。");
  const inputAll = totals.input + totals.cacheRead + totals.cacheWrite;
  const byModel = new Map();
  for (const r of records) if (r.model) byModel.set(r.model, (byModel.get(r.model) || 0) + usageTotal(r));
  const model = [...byModel].sort((a, b) => b[1] - a[1])[0];
  const base = {
    ...totals, total, inputShare: inputAll / total * 100, cacheHit: inputAll > 0 ? totals.cacheRead / inputAll * 100 : 0,
    requests: records.every((r) => r.requests != null) ? records.reduce((n, r) => n + (r.requests || 0), 0) : null,
    model: model ? model[0] : null, modelShare: model ? model[1] / total : 0,
  };
  if (records.every((r) => r.day)) {
    const days = [...new Set(records.filter((r) => usageTotal(r) > 0).map((r) => r.day))].sort();
    const first = days[0], last = days[days.length - 1];
    const unit = Math.max(...records.map((r) => r.spanUnit || 1));
    const spanDays = Math.round((Date.parse(last + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86400000) + unit;
    const activeDays = unit === 1 ? days.length : null;
    return { ...base, mode: unit === 1 ? "daily" : "weekly", first, last, spanDays, activeDays, months: null,
      monthlyTokens: total / spanDays * USAGE_DAYS_PER_MONTH,
      activeDaysPerMonth: activeDays ? Math.min(31, Math.max(1, Math.round(activeDays / spanDays * USAGE_DAYS_PER_MONTH))) : null };
  }
  if (records.every((r) => r.month || r.day)) {
    const months = [...new Set(records.map((r) => r.month || String(r.day).slice(0, 7)))].sort();
    return { ...base, mode: "monthly", first: months[0], last: months[months.length - 1], spanDays: null, activeDays: null, months: months.length,
      monthlyTokens: total / months.length, activeDaysPerMonth: null };
  }
  throw new Error("部分记录缺少日期，无法折算月用量。请导出按日明细。");
}

/**
 * 把汇总折成计算器输入（字符串，符合 CALC_LIMITS）。请求数已知时用实际请求数；
 * 否则保留计算器当前的每天请求数，只调整每次 tokens。
 * @param {ReturnType<typeof summarizeUsage>} summary
 * @param {{requests:string, days:string}} current
 */
function usageCalcValues(summary, current) {
  const days = summary.activeDaysPerMonth || Math.min(31, Math.max(1, Math.round(Number(current.days)) || 22));
  const perDay = summary.monthlyTokens / days;
  let requests = summary.requests != null && summary.activeDays
    ? Math.max(1, Math.round(summary.requests / summary.activeDays))
    : Math.max(1, Math.round(Number(current.requests)) || 100);
  /* 单次 tokens 上限 1000 万；超出时增加每天请求数，保持月总量不变。 */
  if (perDay / requests > 10000000) requests = Math.ceil(perDay / 10000000);
  requests = Math.min(100000, requests);
  const tokens = Math.min(10000000, Math.max(1, Math.round(perDay / requests)));
  const pct = (n) => String(Math.round(Math.min(100, Math.max(0, n)) * 10) / 10);
  return { requests: String(requests), tokens: String(tokens), days: String(days), input: pct(summary.inputShare), cache: pct(summary.cacheHit) };
}
