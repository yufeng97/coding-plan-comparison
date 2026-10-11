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

/* ---------- 从 ccusage 导入用量 ---------- */
export const USAGE_IMPORT_MAX = 5 * 1024 * 1024;

/** ccusage 记录中读取的字段（各版本字段不全）。 */
type UsageRecord = { inputTokens?: unknown; outputTokens?: unknown; cacheReadTokens?: unknown; cacheCreationTokens?: unknown; cachedInputTokens?: unknown; date?: unknown; month?: unknown };

/* 兼容 ccusage 不同版本与子命令的 JSON：{daily:[…]}、{monthly:[…]}、{type, data:[…]}、{projects:{名称:[…]}}、直接数组。
   只读取 token 计数和日期 / 月份。Claude 记录的缓存读写与输入分开计；Codex 的缓存输入计在输入之内。 */
export function parseUsageExport(text: string): UsageSummary {
    if (String(text).length > USAGE_IMPORT_MAX)
        throw new Error("文件超过 5MB，请只导出最近的按日用量。");
    let json: unknown;
    try {
        json = JSON.parse(String(text));
    }
    catch (err) {
        throw new Error("不是有效的 JSON，请粘贴 ccusage 的 --json 输出。");
    }
    const record = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : null;
    const rows: unknown[] = Array.isArray(json) ? json
        : !record ? []
            : Array.isArray(record.daily) ? record.daily
                : Array.isArray(record.monthly) ? record.monthly
                    : Array.isArray(record.data) ? record.data
                        : Array.isArray(record.sessions) ? record.sessions
                            : record.projects && typeof record.projects === "object" ? Object.values(record.projects).filter(Array.isArray).flat() : [];
    const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
    const days = new Set<string>(), months = new Set<string>();
    for (const item of rows) {
        if (!item || typeof item !== "object")
            continue;
        const row = item as UsageRecord;
        const rowInput = count(row.inputTokens), rowOutput = count(row.outputTokens);
        const read = count(row.cacheReadTokens), write = count(row.cacheCreationTokens), cached = count(row.cachedInputTokens);
        /* Codex 的 cachedInputTokens 是输入的子集；Claude 的缓存读写不含在 inputTokens 里。 */
        const codexCached = !row.cacheReadTokens && cached > 0 && cached <= rowInput;
        input += codexCached ? rowInput : rowInput + read + write + (cached > rowInput ? cached : 0);
        cacheRead += codexCached ? cached : read + (cached > rowInput ? cached : 0);
        cacheWrite += write;
        output += rowOutput;
        const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(date))
            days.add(date);
        const month = typeof row.month === "string" ? row.month.slice(0, 7) : "";
        if (/^\d{4}-\d{2}$/.test(month))
            months.add(month);
    }
    const total = input + output;
    if (!(total > 0))
        throw new Error("没有读到 token 用量；请确认粘贴的是 ccusage daily 或 monthly 的 --json 输出。");
    const sortedDays = [...days].sort();
    const spanDays = sortedDays.length ? Math.round((Date.parse(sortedDays[sortedDays.length - 1] + "T00:00:00Z") - Date.parse(sortedDays[0] + "T00:00:00Z")) / 86400000) + 1 : 0;
    return { input, output, cacheRead, cacheWrite, total, activeDays: days.size, spanDays, months: months.size,
        inputShare: input / total * 100, cacheRate: input > 0 ? cacheRead / input * 100 : 0 };
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
