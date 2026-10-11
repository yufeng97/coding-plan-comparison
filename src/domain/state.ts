import { reactive, shallowReactive } from 'vue';
import { API_PRICES, CALC_DEFAULT_API, ESTIMATES, findPlanReference, isPriceConfirmed, METRICS_RAW, PAYG_REFERENCES } from './catalog';
import type { WorkloadState } from './service-types';
import { rankCandidateRows } from './charts';
import { renderCostCalculator } from './service';

/* ============ Coding Plan 比价中心 — 状态与 URL ============ */

export const DEBUG_MODE = new URLSearchParams(location.search).has("debug");
export const PERSONAL_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LENGTH = 200;
export function boundedSearch(value: unknown) { return String(value ?? "").slice(0, SEARCH_MAX_LENGTH); }
export const CMP_MAX = 4;

/* 各区块的可分享筛选状态。取值都是经 URL_VALID 白名单校验的字符串，与表单控件直接绑定。 */
export interface PersonalState { cat: string; region: string; billing: string; q: string; limit: number | null; fromPicker: boolean; }
export interface RankState { tier: string; scope: string; vendor: string; fromPicker: boolean; }
export interface PickerState { budget: string; region: string; tool: string; task: string; billing: string; priority: string; }
export interface TableState { search: string; cat: string; region: string; sortKey: string; sortDir: number; fromPicker: boolean; extra: boolean; }
export interface MetricsState { model: string; ver: string; tier: string; offer: string; sortKey: string; sortDir: number; fromPicker: boolean; }
export interface CompareState { items: Plan[]; }
/** 费用计算器：输入保留字符串，校验通过才进入共享状态。 */
export type CalcState = Required<WorkloadState>;

export const personalState = reactive<PersonalState>({ cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker: false });
export const rankState = reactive<RankState>({ tier: "flagship", scope: "all", vendor: "all", fromPicker: false });
export const pickerState = reactive<PickerState>({ budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
export const tableState = reactive<TableState>({ search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
/* 对比保存的是目录里的套餐对象，只追踪数组替换，不把套餐对象本身变成响应式代理。 */
export const cmpState = shallowReactive<CompareState>({ items: [] });
export const metricsState = reactive<MetricsState>({ model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
export const CALC_MODELS = new Set(API_PRICES.filter((a) => isPriceConfirmed(a, "api")).map((a) => a.vendor + "|" + a.model));
/* 默认模型按 data.js 的固定身份取；万一被移出已确认价格，才退回第一项（校验器会先报错）。 */
export const CALC_DEFAULT_MODEL = (() => {
    const pinned = CALC_DEFAULT_API.vendor + "|" + CALC_DEFAULT_API.model;
    return CALC_MODELS.has(pinned) ? pinned : [...CALC_MODELS][0] || "";
})();
export const calcState = reactive<CalcState>({ model: CALC_DEFAULT_MODEL, requests: "100", tokens: "20000", days: "22", input: "80", cache: "95", cachePrice: "", budget: "200", scenario: "typical" });
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
export const APP_DEFAULTS = { personal: { ...personalState }, rank: { ...rankState }, picker: { ...pickerState }, table: { ...tableState }, metrics: { ...metricsState }, calc: { ...calcState } };
/* 额度表模型筛选的合法取值（与额度表模型下拉的数据源一致），供 URL 白名单校验 */
export const MODEL_FILTER_VALUES = new Set([
    ...METRICS_RAW.map((m) => m.model),
    ...ESTIMATES.map((m) => m.model),
    ...PAYG_REFERENCES.map((s) => s.model),
]);
export let URL_RESTORING = false;
/* Pause URL writes while the startup module restores shared history state. */
export function setUrlRestoring(on: boolean) { URL_RESTORING = on; }
export let stateUpdateDepth = 0;
/* 用户操作提交状态并持久化；渲染、主题和窗口缩放不写历史条目。 */
export function updateAppState(change: () => void, render?: () => void) {
    stateUpdateDepth++;
    try {
        change();
        if (render)
            render();
    }
    finally {
        stateUpdateDepth--;
        if (stateUpdateDepth === 0)
            syncUrl();
    }
}
/* ---------- URL 状态化：筛选/排序可分享、刷新可恢复 ----------
 * 用户操作通过 updateAppState 写入 URL，渲染函数保持无历史副作用。
 * 每次解析先恢复默认值，再应用带白名单校验的参数。
 * file:// 直开时 history 不可写，降级为仅当前页生效。 */
export const URL_KEYS: Record<string, () => string> = {
    /* 「帮我选」（最常被分享的一组） */
    budget: () => pickerState.budget,
    region: () => pickerState.region,
    tool: () => pickerState.tool,
    task: () => pickerState.task,
    billing: () => pickerState.billing,
    priority: () => pickerState.priority,
    papply: () => personalState.fromPicker ? "1" : "0",
    tapply: () => tableState.fromPicker ? "1" : "0",
    mapply: () => metricsState.fromPicker ? "1" : "0",
    rapply: () => rankState.fromPicker ? "1" : "0",
    /* 个人订阅价格全景 */
    pcat: () => personalState.cat,
    pregion: () => personalState.region,
    pbilling: () => personalState.billing,
    pq: () => personalState.q,
    plimit: () => personalState.limit == null ? "all" : String(personalState.limit),
    /* 性价比排行 */
    rank: () => rankState.tier,
    rscope: () => rankState.scope,
    rvendor: () => rankState.vendor,
    /* 数据表 */
    q: () => tableState.search,
    tcat: () => tableState.cat,
    tregion: () => tableState.region,
    tsort: () => tableState.sortKey + ":" + tableState.sortDir,
    tall: () => tableState.extra ? "1" : "0",
    /* 额度深度对比表 */
    mmodel: () => metricsState.model,
    mver: () => metricsState.ver,
    mtier: () => metricsState.tier,
    moffer: () => metricsState.offer,
    msort: () => metricsState.sortKey + ":" + metricsState.sortDir,
    /* 并排对比（数据表勾选；空集不写入） */
    cmp: () => cmpState.items.map((p) => p.id).join(";"),
    cmodel: () => calcState.model,
    crequests: () => calcState.requests,
    ctokens: () => calcState.tokens,
    cdays: () => calcState.days,
    cinput: () => calcState.input,
    ccache: () => calcState.cache,
    ccacheprice: () => calcState.cachePrice,
    cbudget: () => calcState.budget,
    cscenario: () => calcState.scenario,
};
export const URL_DEFAULTS: Record<string, string> = Object.fromEntries(Object.entries(URL_KEYS).map(([k, get]) => [k, get()]));
export const URL_VALID = {
    budget: new Set(["0", "100", "200", "500", "any"]),
    region: new Set(["all", "cn", "intl"]),
    tool: new Set(["any", "claude", "codex", "cursor", "own"]),
    task: new Set(["hard", "both", "daily"]),
    billing: new Set(["M", "A", "Y"]),
    priority: new Set(["quota", "ability", "price"]),
    pcat: new Set(["all", "official", "tool", "cloud"]),
    pregion: new Set(["all", "cn", "intl"]),
    pbilling: new Set(["M", "Y"]),
    plimit: new Set([String(PERSONAL_DEFAULT_LIMIT), "all"]),
    rank: new Set(["flagship", "all"]),
    rscope: new Set(["credits", "all"]),
    tcat: new Set(["all", "official", "tool", "cloud", "team"]),
    tregion: new Set(["all", "cn", "intl"]),
    tsortKeys: new Set(["priceM", "priceY", "selectedMonthly"]),
    mver: new Set(["all", "V3", "V2"]),
    mtier: new Set(["flagship", "all"]),
    moffer: new Set(["current", "all"]),
    msortKeys: new Set(["price", "cpm", "t5h", "r5h", "twk", "rwk", "tmo", "rmo"]),
};
/** 对象中取值为字符串的字段名。 */
type StringField<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];
export function applyUrlState(search: string = location.search) {
    Object.assign(personalState, APP_DEFAULTS.personal);
    Object.assign(rankState, APP_DEFAULTS.rank);
    Object.assign(pickerState, APP_DEFAULTS.picker);
    Object.assign(tableState, APP_DEFAULTS.table);
    Object.assign(metricsState, APP_DEFAULTS.metrics);
    Object.assign(calcState, APP_DEFAULTS.calc);
    cmpState.items = [];
    const p = new URLSearchParams(search);
    for (const key of Object.keys(calcState) as (keyof CalcState)[]) {
        const v = p.get("c" + key.toLowerCase());
        if (v != null && validCalcValue(key, v))
            calcState[key] = v;
    }
    const pick = <T extends object>(param: string, valid: Set<string>, target: T, key: StringField<T>) => {
        const v = p.get(param);
        if (v != null && valid.has(v))
            (target as Record<StringField<T>, string>)[key] = v;
    };
    pick("budget", URL_VALID.budget, pickerState, "budget");
    pick("region", URL_VALID.region, pickerState, "region");
    pick("tool", URL_VALID.tool, pickerState, "tool");
    pick("task", URL_VALID.task, pickerState, "task");
    pick("billing", URL_VALID.billing, pickerState, "billing");
    pick("priority", URL_VALID.priority, pickerState, "priority");
    personalState.fromPicker = p.get("papply") === "1";
    tableState.fromPicker = p.get("tapply") === "1";
    metricsState.fromPicker = p.get("mapply") === "1";
    rankState.fromPicker = p.get("rapply") === "1";
    pick("pcat", URL_VALID.pcat, personalState, "cat");
    pick("pregion", URL_VALID.pregion, personalState, "region");
    pick("pbilling", URL_VALID.pbilling, personalState, "billing");
    const personalQuery = p.get("pq");
    if (personalQuery != null)
        personalState.q = boundedSearch(personalQuery);
    const plimit = p.get("plimit");
    if (plimit != null && URL_VALID.plimit.has(plimit))
        personalState.limit = plimit === "all" ? null : PERSONAL_DEFAULT_LIMIT;
    pick("rank", URL_VALID.rank, rankState, "tier");
    /* 旧链接的 official 口径已并入官方口径折算。 */
    if (p.get("rscope") === "official")
        rankState.scope = "credits";
    pick("rscope", URL_VALID.rscope, rankState, "scope");
    /* 只接受当前确有可排行档位的厂商（中转站、仅历史档厂商不进下拉）。 */
    const rankVendors = new Set(["all", ...rankCandidateRows(false).map((r) => r.m.vendor)]);
    pick("rvendor", rankVendors, rankState, "vendor");
    const query = p.get("q");
    if (query != null)
        tableState.search = boundedSearch(query);
    pick("tcat", URL_VALID.tcat, tableState, "cat");
    pick("tregion", URL_VALID.tregion, tableState, "region");
    tableState.extra = p.get("tall") === "1";
    const ts = p.get("tsort");
    if (ts) {
        const [key = "", dir] = ts.split(":");
        if (URL_VALID.tsortKeys.has(key)) {
            tableState.sortKey = key;
            tableState.sortDir = dir === "-1" ? -1 : 1;
        }
    }
    if (!tableState.fromPicker && tableState.sortKey === "selectedMonthly") {
        tableState.sortKey = "priceM";
        tableState.sortDir = 1;
    }
    /* 与其他参数一样过白名单：URL 里的垃圾模型值不入库，也就不会经 syncUrl 写回地址栏 */
    const model = p.get("mmodel");
    if (model != null && MODEL_FILTER_VALUES.has(model))
        metricsState.model = model;
    pick("mver", URL_VALID.mver, metricsState, "ver");
    pick("mtier", URL_VALID.mtier, metricsState, "tier");
    pick("moffer", URL_VALID.moffer, metricsState, "offer");
    const ms = p.get("msort");
    if (ms) {
        const [key = "", dir] = ms.split(":");
        if (URL_VALID.msortKeys.has(key)) {
            metricsState.sortKey = key;
            metricsState.sortDir = dir === "-1" ? -1 : 1;
        }
    }
    const cmp = p.get("cmp");
    if (cmp != null) {
        /* 仅保留可解析的档位，去重后按上限截断；支持旧的厂商|计划链接。 */
        cmpState.items = cmp.split(";").map((s) => {
            const [vendor = "", plan] = s.split("|");
            return findPlanReference(plan == null ? s : [vendor, plan]);
        }).filter((x, i, all): x is Plan => !!x && all.indexOf(x) === i).slice(0, CMP_MAX);
    }
}
export function appQueryString() {
    /* 仅写入仍受支持的状态，旧链接中的 country 等退役参数会在首次渲染时清除。 */
    const p = new URLSearchParams();
    if (DEBUG_MODE)
        p.set("debug", "1");
    for (const [k, get] of Object.entries(URL_KEYS)) {
        const v = String(get());
        if (v !== String(URL_DEFAULTS[k]) && v !== "")
            p.set(k, v);
    }
    return p.toString();
}
export function syncUrl() {
    if (URL_RESTORING)
        return;
    const qs = appQueryString();
    const hash = location.hash || "";
    const next = location.pathname + (qs ? "?" + qs : "") + hash;
    if (next === location.pathname + location.search + hash)
        return;
    try {
        history.replaceState(null, "", next);
    }
    catch (e) { /* file:// 直开时地址栏不可写，状态仅在当前页生效 */ }
}
/* 恢复 URL 状态后，让费用计算器按恢复的条件重算（其余控件由 Vue 直接绑定共享状态）。 */
export function syncControlsFromState() {
    renderCostCalculator();
}
