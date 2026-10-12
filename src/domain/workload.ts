import { API_PRICES, CALC_DEFAULT_API, isPriceConfirmed } from '../generated/catalog';
import type { MetricRow } from './core';
import { provenance } from './provenance';
import { toCNY } from './metrics';
import { fmtCNY } from './core';

/** 费用计算器的输入：保留字符串，未改完的输入先校验再进入共享状态。 */
export interface WorkloadState {
  model: string;
  requests: string;
  tokens: string;
  days: string;
  input: string;
  cache: string;
  cachePrice: string;
  budget: string;
  scenario?: string;
}

export interface WorkloadApi {
  cur: string;
  inUSD?: number;
  outUSD?: number;
  inCNY?: number;
  outCNY?: number;
  apiCache?: number;
}

export interface WorkloadResult {
  monthlyM: number;
  blended: number;
  costNative: number;
  costCNY: number;
  noCacheCNY: number;
  monthlyBudgetM: number | null;
  cachePrice: number;
  cacheBasis: "custom" | "official" | "none";
}

export interface CostScenarioResult extends WorkloadResult {
  id: string;
  label: string;
  input: string;
  cache: string;
  lowCNY: number;
  highCNY: number;
}

export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  activeDays: number;
  spanDays: number;
  months: number;
  inputShare: number;
  cacheRate: number;
  /** 用量最多的模型（日志的模型 ID 或 ccusage 只含一个模型的记录）；没有模型名时为空。 */
  model: string;
  /** 该模型占全部 tokens 的比例（0–1）。 */
  modelShare: number;
}

export type UsageCalculatorValues = Pick<WorkloadState, "requests" | "tokens" | "days" | "input" | "cache">;

/** 费用计算器的共享状态：每个输入都有值。 */
export type CalcState = Required<WorkloadState>;

export const CALC_MODELS = new Set(API_PRICES.filter((a) => isPriceConfirmed(a, "api")).map((a) => a.vendor + "|" + a.model));

/* 默认模型按 data.js 的固定身份取；万一被移出已确认价格，才退回第一项（校验器会先报错）。 */
export const CALC_DEFAULT_MODEL = (() => {
    const pinned = CALC_DEFAULT_API.vendor + "|" + CALC_DEFAULT_API.model;
    return CALC_MODELS.has(pinned) ? pinned : [...CALC_MODELS][0] || "";
})();

type CalcNumberKey = Exclude<keyof CalcState, "model" | "scenario">;

/** 数值输入的 [最小值, 最大值, 是否整数]。 */
export const CALC_LIMITS: Record<CalcNumberKey, [number, number, boolean]> = { requests: [0, 100000, true], tokens: [1, 10000000, true], days: [1, 31, true], input: [0, 100, false], cache: [0, 100, false], cachePrice: [0, 1000000, false], budget: [0, 1000000000, false] };

export function validCalcValue(key: string, value: string) {
    if (key === "model")
        return CALC_MODELS.has(value);
    if (key === "scenario")
        return ["conservative", "typical", "optimistic"].includes(value);
    if (key === "cachePrice" && value === "")
        return true;
    if (!Object.hasOwn(CALC_LIMITS, key) || !/^\d+(?:\.\d+)?$/.test(String(value)))
        return false;
    const n = Number(value), [min, max, integer] = CALC_LIMITS[key as CalcNumberKey];
    return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
}

const WORKLOAD_FIELDS = ['model', 'requests', 'tokens', 'days', 'input', 'cache', 'cachePrice', 'budget'] as const;

export const COST_PRESETS: Record<string, { requests: string; tokens: string; days: string }> = {
    light: { requests: "20", tokens: "5000", days: "20" },
    daily: { requests: "100", tokens: "20000", days: "22" },
    heavy: { requests: "300", tokens: "40000", days: "26" },
};

/* 示例情景只改变可见的计费假设；没有缓存单价时仍按普通输入价收费。 */
export const COST_SCENARIOS: Record<string, { label: string; input: string; cache: string }> = {
    conservative: { label: "保守", input: "60", cache: "50" },
    typical: { label: "典型", input: "80", cache: "95" },
    optimistic: { label: "乐观", input: "90", cache: "100" },
};

export function costModelKey(text: string | null | undefined) { return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

/* 官方积分系数区间和 credits 面值不使用请求折算的 20K/次假设。 */
export function quotaUsesRequestTokenAssumption(m: MetricRow) {
    return !(m.creditCNY != null || m.creditUSD != null || (m.wkLowM != null && provenance(m).conf !== "低"));
}

/* 官方缓存命中单价（与牌价同币种）：只读结构化的 apiCache，未录入时返回 null，不从备注猜测。 */
export function officialCachePrice(api?: WorkloadApi | null): number | null {
    return api && typeof api.apiCache === "number" && Number.isFinite(api.apiCache) ? api.apiCache : null;
}

const isPrice = (v: number) => Number.isFinite(v) && v >= 0;

/* 使用总tokens（输入+输出），缓存率只作用于输入。缓存价留空时采用官方缓存命中价；
   该模型未录入官方缓存价时按普通输入计费，不虚构折扣。缓存写入与存储费不在估算内。 */
export function calculateWorkload(state: WorkloadState, api?: WorkloadApi | null): WorkloadResult | null {
    if (!api || !WORKLOAD_FIELDS.every((key) => validCalcValue(key, state[key])))
        return null;
    const inputPrice = api.cur === "CNY" ? api.inCNY : api.inUSD;
    const outputPrice = api.cur === "CNY" ? api.outCNY : api.outUSD;
    if (inputPrice == null || outputPrice == null)
        return null;
    const official = officialCachePrice(api);
    const cacheBasis = state.cachePrice !== "" ? "custom" : official != null ? "official" : "none";
    const cachePrice = cacheBasis === "custom" ? Number(state.cachePrice) : official ?? inputPrice;
    if (![inputPrice, outputPrice, cachePrice].every(isPrice) || cachePrice > inputPrice)
        return null;
    const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
    const blended = inputShare * (cacheShare * cachePrice + (1 - cacheShare) * inputPrice) + (1 - inputShare) * outputPrice;
    const monthlyM = Number(state.requests) * Number(state.tokens) * Number(state.days) / 1e6;
    const costNative = monthlyM * blended, costCNY = toCNY(costNative, api.cur);
    const noCacheCNY = toCNY(monthlyM * (inputShare * inputPrice + (1 - inputShare) * outputPrice), api.cur);
    const monthlyBudgetM = blended > 0 ? Number(state.budget) / toCNY(blended, api.cur) : null;
    return { monthlyM, blended, costNative, costCNY, noCacheCNY, monthlyBudgetM, cachePrice, cacheBasis };
}

export function calculateCostScenarios(state: WorkloadState, api?: WorkloadApi | null): CostScenarioResult[] {
    return Object.entries(COST_SCENARIOS).map(([id, scenario]) => {
        const result = calculateWorkload({ ...state, input: scenario.input, cache: scenario.cache }, api);
        return result ? { id, ...scenario, ...result, lowCNY: result.costCNY * 0.8, highCNY: result.costCNY * 1.2 } : null;
    }).filter((row): row is CostScenarioResult => row !== null);
}

/* 计算器的小额（如每次请求）保留两位有效数字，避免把 ¥0.032 显示成 ¥0；常规金额沿用页面精度。 */
export function fmtCalcCNY(n: number) {
    if (!Number.isFinite(n))
        return "—";
    return n > 0 && n < 1 ? "¥" + Number(n.toPrecision(2)) : fmtCNY(n);
}

/* 输出占比 = 100 - 输入占比；输入可带小数，避免 100 - 97.9 显示成 2.0999999999999943。 */
export function outputSharePct(input: number | string) { return String(Number((100 - Number(input)).toFixed(4))); }

export function fmtCalcNative(n: number) { return n > 0 && n < 1 ? String(Number(n.toPrecision(2))) : String(Number(n.toFixed(2))); }

/* ---------- 按用量反查套餐与订阅回本点 ---------- */
/* 同模型按量单价（每百万 tokens，换算人民币）：使用当前输入占比与缓存命中率，与计算器同一口径。 */
export function metricApiCNYPerM(m: MetricRow, plan: Plan, state: Pick<WorkloadState, "input" | "cache">) {
    if (![m.apiIn, m.apiOut, m.apiCache].every((v) => typeof v === "number" && Number.isFinite(v)))
        return null;
    const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
    const blended = inputShare * (cacheShare * m.apiCache + (1 - cacheShare) * m.apiIn) + (1 - inputShare) * m.apiOut;
    const value = toCNY(blended, m.apiCur || plan.cur);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/* ---------- 从 ccusage 或会话日志导入用量 ---------- */
export const USAGE_IMPORT_MAX = 30 * 1024 * 1024;
export const USAGE_IMPORT_TOO_LARGE = "内容超过 30MB，请改用 ccusage 导出的按日 JSON（npx ccusage daily --json）。";

/** ccusage 记录与会话日志折出的逐条记录中读取的字段（各版本字段不全）。 */
type UsageRecord = { inputTokens?: unknown; outputTokens?: unknown; cacheReadTokens?: unknown; cacheCreationTokens?: unknown; cachedInputTokens?: unknown; date?: unknown; month?: unknown; model?: unknown; modelsUsed?: unknown };

const objectOrNull = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : null;

/* Claude Code（~/.claude/projects）与 Codex（~/.codex/sessions）的 JSONL 会话日志，折成与 ccusage 相同字段的逐条记录。
   Claude Code 会把同一次回复按流式片段重复写入，与 ccusage 一样按消息 ID + 请求 ID 去重；
   Codex 在限额信息更新时会重复发出 token_count，累计用量未变的事件不重复计入。 */
function usageRowsFromLog(text: string, seen: Set<string>): UsageRecord[] {
    const rows: UsageRecord[] = [];
    let parsed = 0, codexTotal = "", codexModel = "", codexSession = "";
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim())
            continue;
        let parsedLine: unknown;
        try {
            parsedLine = JSON.parse(line);
        }
        catch {
            continue;
        }
        parsed++;
        const event = objectOrNull(parsedLine);
        if (!event)
            continue;
        const date = typeof event.timestamp === "string" ? event.timestamp.slice(0, 10) : "";
        const message = objectOrNull(event.message), usage = message ? objectOrNull(message.usage) : null;
        if (message && usage) {
            const id = message.id && event.requestId ? `${message.id}:${event.requestId}` : "";
            if (id && seen.has(id))
                continue;
            if (id)
                seen.add(id);
            rows.push({ date, model: typeof message.model === "string" ? message.model : "", inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
                cacheCreationTokens: usage.cache_creation_input_tokens, cacheReadTokens: usage.cache_read_input_tokens });
            continue;
        }
        const payload = objectOrNull(event.payload) ?? {};
        if (event.type === "session_meta" && typeof payload.id === "string") {
            if (codexSession !== payload.id) {
                codexTotal = "";
                codexModel = "";
            }
            codexSession = payload.id;
        }
        if (event.type === "turn_context" && typeof payload.model === "string")
            codexModel = payload.model;
        const info = payload.type === "token_count" ? objectOrNull(payload.info) : null;
        if (!info || !info.last_token_usage)
            continue;
        const total = JSON.stringify(info.total_token_usage || null);
        if (info.total_token_usage && total === codexTotal)
            continue;
        codexTotal = total;
        /* 同一会话的累计快照可在备份/重叠文件中再次出现；不同会话的相同计数不能合并。
           缺少会话身份时只作文件内去重，不猜测两份日志是否属于同一次会话。 */
        if (codexSession && info.total_token_usage) {
            const id = JSON.stringify(["codex", codexSession, total]);
            if (seen.has(id))
                continue;
            seen.add(id);
        }
        const last = info.last_token_usage as Record<string, unknown>;
        rows.push({ date, model: codexModel, inputTokens: last.input_tokens, cachedInputTokens: last.cached_input_tokens, outputTokens: last.output_tokens });
    }
    if (!parsed)
        throw new Error("不是有效的 JSON 或 JSONL：请粘贴 ccusage 的 --json 输出，或 Claude Code / Codex 的会话日志。");
    return rows;
}

/* 兼容 ccusage 不同版本与子命令的 JSON：{daily:[…]}、{monthly:[…]}、{type, data:[…]}、{projects:{名称:[…]}}、直接数组；
   其余内容按 JSONL 会话日志解析。可传入多份文件的文本，合并统计。
   只读取 token 计数、日期 / 月份和模型名。Claude 记录的缓存读写与输入分开计；Codex 的缓存输入计在输入之内。 */
export function parseUsageExport(texts: string | readonly string[]): UsageSummary {
    const sources = (typeof texts === "string" ? [texts] : texts).map(String);
    if (sources.reduce((n, text) => n + text.length, 0) > USAGE_IMPORT_MAX)
        throw new Error(USAGE_IMPORT_TOO_LARGE);
    const seen = new Set<string>();
    const rows = sources.flatMap((source): unknown[] => {
        let json: unknown;
        try {
            json = JSON.parse(source);
        }
        catch {
            return usageRowsFromLog(source, seen);
        }
        const record = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : null;
        /* 只有一行的会话日志本身就是合法 JSON。 */
        if (record && (record.message || record.payload || record.type === "turn_context"))
            return usageRowsFromLog(source, seen);
        return Array.isArray(json) ? json
            : !record ? []
                : Array.isArray(record.daily) ? record.daily
                    : Array.isArray(record.monthly) ? record.monthly
                        : Array.isArray(record.data) ? record.data
                            : Array.isArray(record.sessions) ? record.sessions
                                : record.projects && typeof record.projects === "object" ? Object.values(record.projects).filter(Array.isArray).flat() : [];
    });
    const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
    const days = new Set<string>(), months = new Set<string>(), byModel = new Map<string, number>();
    for (const item of rows) {
        if (!item || typeof item !== "object")
            continue;
        const row = item as UsageRecord;
        const rowInput = count(row.inputTokens), rowOutput = count(row.outputTokens);
        const read = count(row.cacheReadTokens), write = count(row.cacheCreationTokens), cached = count(row.cachedInputTokens);
        /* Codex 的 cachedInputTokens 是输入的子集；Claude 的缓存读写不含在 inputTokens 里。 */
        const codexCached = !row.cacheReadTokens && cached > 0 && cached <= rowInput;
        const rowAll = (codexCached ? rowInput : rowInput + read + write + (cached > rowInput ? cached : 0)) + rowOutput;
        input += rowAll - rowOutput;
        cacheRead += codexCached ? cached : read + (cached > rowInput ? cached : 0);
        cacheWrite += write;
        output += rowOutput;
        /* ccusage 的 modelsUsed 只有一项时才能归到单一模型。 */
        const models = Array.isArray(row.modelsUsed) ? row.modelsUsed : [];
        const model = typeof row.model === "string" && row.model ? row.model : models.length === 1 && typeof models[0] === "string" ? models[0] : "";
        if (model && rowAll > 0)
            byModel.set(model, (byModel.get(model) || 0) + rowAll);
        const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(date))
            days.add(date);
        const month = typeof row.month === "string" ? row.month.slice(0, 7) : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}-\d{2}$/.test(month))
            months.add(month);
    }
    if (days.size && months.size)
        throw new Error("不能混合按日记录与按月记录：请分别导入，或将所有文件统一导出为 ccusage daily --json 后再合并。");
    const total = input + output;
    if (!(total > 0))
        throw new Error("没有读到 token 用量；请确认粘贴的是 ccusage daily 或 monthly 的 --json 输出，或含 token 记录的会话日志。");
    const sortedDays = [...days].sort();
    const spanDays = sortedDays.length ? Math.round((Date.parse(sortedDays[sortedDays.length - 1] + "T00:00:00Z") - Date.parse(sortedDays[0] + "T00:00:00Z")) / 86400000) + 1 : 0;
    const top = [...byModel].sort((a, b) => b[1] - a[1])[0];
    return { input, output, cacheRead, cacheWrite, total, activeDays: days.size, spanDays, months: months.size,
        inputShare: input / total * 100, cacheRate: input > 0 ? cacheRead / input * 100 : 0,
        model: top ? top[0] : "", modelShare: top ? top[1] / total : 0 };
}

export function usageModelKey(name: string | null | undefined) { return costModelKey(String(name || "").replace(/\s*[（(\[【].*$/, "")); }

/* 日志里的模型 ID 只接受与牌价完全一致或带日期 / latest 后缀，避免把新版本对到旧版本的牌价。
   有多个匹配时优先计算器当前模型（current 为「厂商|模型」）。 */
export function apiForUsageModel(model: string, current = "") {
    const key = costModelKey(model);
    if (!key)
        return null;
    const matches = API_PRICES.filter((api) => isPriceConfirmed(api, "api") && [api.model, api.label].some((name) => {
        const base = usageModelKey(name);
        if (!base || !key.startsWith(base))
            return false;
        const rest = key.slice(base.length);
        return rest === "" || /^\d{8}$/.test(rest) || rest === "latest";
    }));
    return matches.find((api) => api.vendor + "|" + api.model === current) || matches[0] || null;
}

/* 把导入结果折成计算器的「每天请求数 × 每次 tokens × 每月天数」：保留当前请求数，只换算每次 tokens。
   按日记录用有用量的天数占比推算每月使用天数（不足一周的记录沿用当前天数）；按月记录取月均。 */
export function usageToCalculator(usage: UsageSummary, state: WorkloadState): UsageCalculatorValues {
    const round1 = (n: number) => String(Math.round(n * 10) / 10);
    let days = Math.max(1, Math.min(31, Number(state.days) || 22));
    let daily: number;
    if (usage.activeDays) {
        if (usage.spanDays >= 7)
            days = Math.max(1, Math.min(31, Math.round(usage.activeDays / usage.spanDays * 30.44)));
        daily = usage.total / usage.activeDays;
    }
    else
        daily = usage.total / Math.max(1, usage.months) / days;
    let requests = Math.max(1, Number(state.requests) || 100);
    if (daily / requests > 10000000)
        requests = Math.min(100000, Math.ceil(daily / 10000000));
    const tokens = Math.max(1, Math.min(10000000, Math.round(daily / requests)));
    return { requests: String(requests), tokens: String(tokens), days: String(days),
        input: round1(Math.min(100, usage.inputShare)), cache: round1(Math.min(100, usage.cacheRate)) };
}
