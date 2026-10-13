import { API_PRICES, CALC_DEFAULT_API, isPriceConfirmed } from '../generated/catalog';
import type { MetricRow } from './core';
import { provenance } from './provenance';
import { toCNY } from './metrics';
import { fmtCNY } from './core';
import type { UsageSummary } from './usage-import';

/* 用量解析在独立模块里（不依赖价格目录，可在 Worker 中运行）；这里保留原有导出名。 */
export { parseUsageExport, USAGE_IMPORT_MAX, USAGE_IMPORT_TOO_LARGE, type UsageSummary } from './usage-import';

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
