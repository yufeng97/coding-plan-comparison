import { reactive, shallowReactive } from 'vue';
import { API_PRICES, CALC_DEFAULT_API, ESTIMATES, findPlanReference, isPriceConfirmed, METRICS_RAW, PAYG_REFERENCES, type PLANS } from './catalog';
import { rankCandidateRows } from './charts';
import { syncServiceControls } from './service';

/* ============ Coding Plan 比价中心 — 状态与 URL ============ */

export const DEBUG_MODE = new URLSearchParams(location.search).has("debug");
export const PERSONAL_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LENGTH = 200;
export function boundedSearch(value: any) { return String(value ?? "").slice(0, SEARCH_MAX_LENGTH); }
export const CMP_MAX = 4;
/** @type {{cat:string, region:string, billing:string, q:string, limit:number|null, fromPicker:boolean}} */
export const personalState: { cat: string; region: string; billing: string; q: string; limit: number | null; fromPicker: boolean; } = reactive({ cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker: false });
export const rankState = reactive({ tier: "flagship", scope: "all", vendor: "all", fromPicker: false });
export const pickerState = reactive({ budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
export const tableState = reactive({ search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
/** @type {{items: typeof PLANS}} */
export const cmpState: { items: typeof PLANS; } = shallowReactive({ items: [] });
export const metricsState = reactive({ model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
export const CALC_MODELS = new Set(API_PRICES.filter((a: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => isPriceConfirmed(a, "api")).map((a: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => a.vendor + "|" + a.model));
/* 默认模型按 data.js 的固定身份取；万一被移出已确认价格，才退回第一项（校验器会先报错）。 */
export const CALC_DEFAULT_MODEL = (() => {
    const pinned = typeof CALC_DEFAULT_API === "object" && CALC_DEFAULT_API ? CALC_DEFAULT_API.vendor + "|" + CALC_DEFAULT_API.model : "";
    return CALC_MODELS.has(pinned) ? pinned : [...CALC_MODELS][0] || "";
})();
export const calcState = reactive({ model: CALC_DEFAULT_MODEL, requests: "100", tokens: "20000", days: "22", input: "80", cache: "95", cachePrice: "", budget: "200", scenario: "typical" });
export const CALC_LIMITS = { requests: [0, 100000, true], tokens: [1, 10000000, true], days: [1, 31, true], input: [0, 100, false], cache: [0, 100, false], cachePrice: [0, 1000000, false], budget: [0, 1000000000, false] };
export function validCalcValue(key: any, value: any) {
    if (key === "model")
        return CALC_MODELS.has(value);
    if (key === "scenario")
        return ["conservative", "typical", "optimistic"].includes(value);
    if (key === "cachePrice" && value === "")
        return true;
    if (!CALC_LIMITS[key] || !/^\d+(?:\.\d+)?$/.test(String(value)))
        return false;
    const n = Number(value), [min, max, integer] = CALC_LIMITS[key];
    return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
}
export const APP_DEFAULTS = { personal: { ...personalState }, rank: { ...rankState }, picker: { ...pickerState }, table: { ...tableState }, metrics: { ...metricsState }, calc: { ...calcState } };
/* 额度表模型筛选的合法取值（与 populateModelFilter 的数据源一致），供 URL 白名单校验 */
export const MODEL_FILTER_VALUES = new Set([
    ...METRICS_RAW.map((m: { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; weeklyChart: boolean; wkLowM: number; wkHighM: number; vendorWkLowM: number; vendorWkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; weeklyChart: boolean; reqPer5h: number; reqPerWk: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; vendorWkLowM: number; vendorWkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqPer5h: number; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; creditUSD: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; creditCNY: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; }) => m.model),
    ...ESTIMATES.map((m: { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; isEst: boolean; reqPer5h: number; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; confidenceReason: string; source: string; note: string; wkLowM?: undefined; wkHighM?: undefined; reqLowPer5h?: undefined; reqHighPer5h?: undefined; tokensLowPerReq?: undefined; tokensHighPerReq?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; note: string; source: string; isEst?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; confidenceReason?: undefined; reqLowPer5h?: undefined; reqHighPer5h?: undefined; tokensLowPerReq?: undefined; tokensHighPerReq?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqLowPer5h: number; reqHighPer5h: number; tokensLowPerReq: number; tokensHighPerReq: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; note: string; source: string; isEst?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; confidenceReason?: undefined; wkLowM?: undefined; wkHighM?: undefined; }) => m.model),
    ...PAYG_REFERENCES.map((s: { vendor: string; model: string; cur: string; apiIn: number; apiOut: number; apiCache: number; note: string; source: string; url: string; }) => s.model),
]);
export let URL_RESTORING = false;
/* Pause URL writes while the startup module restores shared history state. */
export function setUrlRestoring(on: any) { URL_RESTORING = on; }
export let stateUpdateDepth = 0;
/* 用户操作提交状态并持久化；渲染、主题和窗口缩放不写历史条目。 */
export function updateAppState(change: any, render?: any) {
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
export const URL_KEYS = {
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
    cmp: () => cmpState.items.map((p: Plan) => p.id).join(";"),
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
export const URL_DEFAULTS = Object.fromEntries(Object.entries(URL_KEYS).map(([k, get]: [string, (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => "1" | "0") | (() => "1" | "0") | (() => "1" | "0") | (() => "1" | "0") | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => "1" | "0") | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string)]) => [k, get()]));
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
export function applyUrlState(search: string = location.search) {
    Object.assign(personalState, APP_DEFAULTS.personal);
    Object.assign(rankState, APP_DEFAULTS.rank);
    Object.assign(pickerState, APP_DEFAULTS.picker);
    Object.assign(tableState, APP_DEFAULTS.table);
    Object.assign(metricsState, APP_DEFAULTS.metrics);
    Object.assign(calcState, APP_DEFAULTS.calc);
    cmpState.items = [];
    const p = new URLSearchParams(search);
    for (const key of Object.keys(calcState)) {
        const v = p.get("c" + key.toLowerCase());
        if (v != null && validCalcValue(key, v))
            calcState[key] = v;
    }
    const pick = (k: any, valid: any, target: any, key: any) => {
        const v = p.get(k);
        if (v != null && (!valid || valid.has(v)))
            target[key] = v;
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
    if (p.get("pq") != null)
        personalState.q = boundedSearch(p.get("pq"));
    if (URL_VALID.plimit.has(p.get("plimit")))
        personalState.limit = p.get("plimit") === "all" ? null : PERSONAL_DEFAULT_LIMIT;
    pick("rank", URL_VALID.rank, rankState, "tier");
    /* 旧链接的 official 口径已并入官方口径折算。 */
    if (p.get("rscope") === "official")
        rankState.scope = "credits";
    pick("rscope", URL_VALID.rscope, rankState, "scope");
    /* 只接受当前确有可排行档位的厂商（中转站、仅历史档厂商不进下拉）；页面脚本全部加载后才解析。 */
    const rankVendors = new Set(["all", ...rankCandidateRows(false).map((r: { m: any; c: any; }) => r.m.vendor)]);
    pick("rvendor", rankVendors, rankState, "vendor");
    if (p.get("q") != null)
        tableState.search = boundedSearch(p.get("q"));
    pick("tcat", URL_VALID.tcat, tableState, "cat");
    pick("tregion", URL_VALID.tregion, tableState, "region");
    tableState.extra = p.get("tall") === "1";
    const ts = p.get("tsort");
    if (ts) {
        const [key, dir] = ts.split(":");
        if (URL_VALID.tsortKeys.has(key)) {
            tableState.sortKey = key;
            tableState.sortDir = dir === "-1" ? -1 : 1;
        }
    }
    if (!tableState.fromPicker && tableState.sortKey === "selectedMonthly") {
        tableState.sortKey = "priceM";
        tableState.sortDir = 1;
    }
    if (p.get("mmodel") != null) {
        /* 与其他参数一样过白名单：URL 里的垃圾模型值不入库，也就不会经 syncUrl 写回地址栏 */
        const v = p.get("mmodel");
        if (MODEL_FILTER_VALUES.has(v))
            metricsState.model = v;
    }
    pick("mver", URL_VALID.mver, metricsState, "ver");
    pick("mtier", URL_VALID.mtier, metricsState, "tier");
    pick("moffer", URL_VALID.moffer, metricsState, "offer");
    const ms = p.get("msort");
    if (ms) {
        const [key, dir] = ms.split(":");
        if (URL_VALID.msortKeys.has(key)) {
            metricsState.sortKey = key;
            metricsState.sortDir = dir === "-1" ? -1 : 1;
        }
    }
    const cmp = p.get("cmp");
    if (cmp != null) {
        /* 仅保留可解析的档位，去重后按上限截断；支持旧的厂商|计划链接。 */
        cmpState.items = cmp.split(";").map((s: string) => {
            const [vendor, plan] = s.split("|");
            return findPlanReference(plan == null ? s : [vendor, plan]);
        }).filter((x: Plan, i: number, all: Plan[]) => x && all.indexOf(x) === i).slice(0, CMP_MAX);
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
/* 恢复 URL 状态后，把输入框/下拉/chip 的显示值同步到状态 */
export function syncControlsFromState() {
    // Vue bindings observe the restored state; the calculator also retains invalid drafts.
    syncServiceControls();
}
