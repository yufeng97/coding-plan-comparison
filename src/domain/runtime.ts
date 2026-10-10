import { WEEKS_PER_MONTH, SLOTS_PER_WEEK, API_MIX_IN, API_MIX_OUT, CACHE_HIT_RATE, TOKENS_PER_REQ, blendPrice, toCNY, fromCNY, fmtTok, periodRates, windowTokens, METRICS_COMPUTED, computeMetrics, computeMetricsUncached, RANK_MAIN_EXTRA, isFlagshipModelName } from './metrics';
import { reactive, shallowReactive } from 'vue';
import type { MetricsInput, MetricsResult, ChartPalette, FollowState } from './model-types';
import type { WorkloadState, WorkloadApi, WorkloadResult, CostScenarioResult, UsageSummary, UsageCalculatorValues } from './service-types';
export type { WorkloadState, WorkloadApi, WorkloadResult, CostScenarioResult, UsageSummary, UsageCalculatorValues } from './service-types';
export type { MetricsInput, MetricsResult, ChartPalette, FollowState } from './model-types';
const navigationHooks: { navigate?: (...args: any[]) => void; restore?: (...args: any[]) => void } = {};
function navigateToSection(...args: any[]) { navigationHooks.navigate?.(...args); }
function restoreHistoryState(...args: any[]) { navigationHooks.restore?.(...args); }
export { navigationHooks, navigateToSection, restoreHistoryState };
import { RATE_USD_CNY, RATE_INR_CNY, META, MODEL_ROLES, matchModelRoles, isRetiredPlan, isOneTimePlan, isRenewalOnly, isFourWeekPlan, isDuplicateListing, isSoldOut, isPersonalMonthly, isFreeCodingEntry, isOnSalePlan, offerable, hasIncludedModelQuota, isPurchaseCountryAllowed, RELAY_VENDORS, isRelay, OWN_CLIENT_RE, OWN_CLIENT_EXCLUDE_RE, findPlanReference, resolvedField, hasOwnClient, PLANS, MAINLAND_ACCESS, mainlandAccessOf, API_PRICES, CALC_DEFAULT_API, PAYG_REFERENCES, METRICS_RAW, PLAN_TOKENS, ESTIMATES, DYNAMICS, SOURCES, UNCERTAIN, PRICE_CHECKS, priceCheckOf, isPriceConfirmed, displayPriceReason, INTERNAL_TEXT_RE, BENCHMARK_SUMMARY, PUBLIC_PROJECT } from './catalog';
export * from './catalog';




type TokenChartSource = { label: string; model: string; lowM: number; highM: number; priceCNY: number; isOfficial: boolean; url: string; note?: string; method?: string; conf?: string; vendorLowM?: number; vendorHighM?: number; };
type TokenRow = { label: string; model: string; lowM: number; highM: number; priceCNY: number; isOfficial: boolean; url: string; note?: string; method?: string; conf?: string; vendorLowM?: number; vendorHighM?: number; } & { midM: number; };

/* SOURCE: js/app-core.js */
/* ============ Coding Plan 比价中心 渲染逻辑 ============ */
"use strict";
const CAT_LABEL = { official: "模型官方订阅", tool: "第三方工具订阅", cloud: "云厂商/API 套餐", team: "团队 / 企业档" };
const REGION_LABEL = { cn: "国内", intl: "国际" };
/* 类别色值以 css/style.css 的 --cat-* 变量为单一数据源：图表、HTML 图例、类别标签共用。
   主题切换时 refreshPalette() 会重读变量（暗色取更亮的一组），图例与图表同步。 */
let CAT_COLOR = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };
let RELAY_COLOR = "#d4534a";
function refreshCategoryColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: any) => (cs.getPropertyValue(n) || "").trim();
    CAT_COLOR = {
        official: v("--cat-official") || CAT_COLOR.official,
        tool: v("--cat-tool") || CAT_COLOR.tool,
        cloud: v("--cat-cloud") || CAT_COLOR.cloud,
        team: v("--cat-team") || CAT_COLOR.team,
    };
    RELAY_COLOR = v("--cat-relay") || RELAY_COLOR;
}
const VENDOR_SHORT = {
    "Cognition Devin Desktop（原 Windsurf）": "Devin Desktop",
    "Cognition Devin Desktop": "Devin Desktop",
    "Cognition Devin（云 agent）": "Devin 云",
    "Roo Code（Roomote）": "Roomote",
    "智谱 BigModel": "BigModel",
    "月之暗面 Kimi": "月之暗面",
    "阿里云 Qoder CN（原通义灵码）": "Qoder CN（灵码）",
    "腾讯云 CodeBuddy": "腾讯 CodeBuddy",
    "腾讯云（LKEAP 知识引擎）": "腾讯云 LKEAP",
    "字节跳动 Trae（国内版）": "字节 Trae(国内)",
    "字节跳动 Trae（国际版）": "字节 Trae(国际)",
    "百度文心快码 Comate": "百度 Comate",
    "火山引擎方舟（字节）": "火山方舟",
    "小米 MiMo": "小米 MiMo",
    "腾讯云 TokenHub": "腾讯 TokenHub",
    "百度千帆": "百度千帆",
    "七牛云": "七牛云",
    "Factory (Droid)": "Droid",
    "讯飞星辰 MaaS": "讯飞 Astron",
    "Canopy Wave": "Canopy",
    /* API 按量图里的厂商短名 */
    "阿里云百炼": "百炼",
    "火山引擎（豆包/方舟）": "火山方舟",
    "硅基流动 SiliconFlow": "硅基流动",
    "阶跃星辰 StepFun": "阶跃",
};
/* 经典脚本各自独立求值：data.js 缺失或中途出错时给出单一明确报错，
   而不是让后续每个顶层常量各自抛 ReferenceError。 */
if (typeof RATE_USD_CNY !== "number" || typeof PLANS === "undefined" ||
    typeof METRICS_RAW === "undefined" || typeof ESTIMATES === "undefined" ||
    typeof MODEL_ROLES === "undefined" || typeof META === "undefined") {
    throw new Error("js/data.js 未加载或缺少必需的全局数据（RATE_USD_CNY/PLANS/METRICS_RAW/ESTIMATES/MODEL_ROLES/META）");
}
const RATE = RATE_USD_CNY;
/* 「帮我选」模型角色表的归类日期，取自 data.js 的 MODEL_ROLES.asOf */
const MODEL_ROLES_ASOF = (MODEL_ROLES.find((r: { id: string; name: string; re: RegExp; task: string; burn: string; band: string; ceiling: boolean; reason: string; asOf: string; } | { id: string; name: string; re: RegExp; task: string; burn: string; band: string; reason: string; asOf: string; ceiling?: undefined; }) => r.asOf) || {}).asOf || META.updated;
/* ---------- 计划主索引：METRICS_RAW / ESTIMATES / PLAN_TOKENS 经 ref 引用 PLANS 的价格（单一数据源） ---------- */
function resolvePlan(m: any) {
    /* ref 可解析时，身份、名称和价格统一取 PLANS；model 等额度口径仍由该行保留。 */
    if (m.ref != null) {
        const p = findPlanReference(m.ref);
        if (p)
            return { ...m, vendor: p.vendor, plan: p.plan, priceM: p.priceM, cur: p.cur, windowPeriod: m.windowPeriod || p.windowPeriod || "unknown" };
        console.warn("[data] ref 未解析，已跳过:", m.ref);
        return null;
    }
    return m;
}
/* Vue components and domain actions share the same reactive state. */
/**
 * @template {Record<string, any>} T
 * @param {T} value
 * @returns {T}
 */
function appState<T extends Record<string, any>>(value: T): T {
    return reactive(value) as T;
}
function esc(s: any) {
    return String(s ?? "").replace(/[&<>"']/g, (ch: string) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
}
function safeHref(u: any) {
    const s = String(u ?? "").trim();
    return /^https?:\/\//i.test(s) ? esc(s) : "";
}
/* Native Vue bindings escape attributes themselves. Keep the validated URL unescaped. */
export function safeLink(value: unknown): string {
    const href = String(value ?? '').trim();
    return /^https?:\/\//i.test(href) ? href : '';
}
/* 辅助视图的数据脚本在访问时下载。它们是生成的经典脚本（构建时按内容哈希另存），页面虚拟 DOM 与维护脚本直接读取同一文件。 */
const optionalDataLoads = {};
function optionalDataLoaded(kind: any) {
    return kind === "maintenance" ? typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
        : kind === "benchmark" && typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1;
}
function ensureOptionalData(kind: any) {
    if (optionalDataLoaded(kind))
        return Promise.resolve();
    if (optionalDataLoads[kind])
        return optionalDataLoads[kind];
    const descriptor = byId(kind + "DataSource");
    if (!descriptor)
        return Promise.reject(new Error("缺少数据入口"));
    const pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.dataset.optionalData = kind;
        let timer;
        const finish = (error: any) => {
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) {
                script.remove();
                delete optionalDataLoads[kind];
                reject(error);
            }
            else
                resolve();
        };
        script.onload = () => finish(optionalDataLoaded(kind) ? null : new Error("数据文件内容不完整"));
        script.onerror = () => finish(new Error("数据文件下载失败"));
        script.src = descriptor.getAttribute("src");
        timer = setTimeout(() => finish(new Error("数据下载超时，请重试")), 15000);
        document.head.appendChild(script);
    });
    optionalDataLoads[kind] = pending;
    return pending;
}
/* 计划分类（含中转站名单 isRelay）、offerable、resolvedField、hasOwnClient 在 js/data.js，页面与校验器共用。 */
/* Quota and model classification calculations are imported from ./metrics. */
/* 风险标签只读结构化字段：备注里的「支持 BYOK」「季付 $403.2」等文字不能推断为必须自备 Key 或访问异常。 */
function planBadges(p: any) {
    const badges = [];
    const check = priceCheckOf(p);
    if (check && check.status === "unverified")
        badges.push({ t: "价格待核", k: "risk" });
    const tools = resolvedField(p, "tools");
    if (isRelay(p))
        badges.push({ t: "中转", k: "risk" });
    if (p.modelAccess === "byok")
        badges.push({ t: "要自备 Key", k: "risk" });
    else if (p.modelAccess === "metered" || p.includedModelQuota === false)
        badges.push({ t: "推理另计", k: "risk" });
    if (isRenewalOnly(p))
        badges.push({ t: "仅老用户", k: "risk" });
    if (isOneTimePlan(p))
        badges.push({ t: "一次性", k: "risk" });
    if (isSoldOut(p))
        badges.push({ t: "售罄 · 仅候补", k: "risk" });
    const mainland = mainlandAccessOf(p);
    if (mainland)
        badges.push({ t: mainland.status === "unsupported" ? "不服务中国大陆" : "部分模型限地区", k: "risk" });
    if (p.purchaseCountries && p.purchaseCountries.length) {
        const countries = { IN: "印度", CN: "中国", US: "美国" };
        badges.push({ t: "仅限" + p.purchaseCountries.map((c: any) => countries[c] || c).join("/"), k: "risk" });
    }
    if (p.accessUnstable)
        badges.push({ t: "访问不稳", k: "risk" });
    if (/Claude Code/i.test(tools))
        badges.push({ t: "Claude Code", k: "agent" });
    if (/Codex/i.test(tools))
        badges.push({ t: "Codex", k: "agent" });
    if (p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
        badges.push({ t: "Cursor", k: "agent" });
    if (!badges.some((b: { t: string; k: string; }) => b.k === "agent") && !isRelay(p) && hasOwnClient(p))
        badges.push({ t: "自家客户端", k: "agent" });
    return badges;
}
/* 中国大陆可用性的展示文案：国内档为国内服务；国际档只在登记了官方说明时给结论，其余标未核实。 */
function mainlandAccessText(p: any) {
    const access = mainlandAccessOf(p);
    if (access)
        return `${access.status === "unsupported" ? "官方支持地区不含中国大陆" : "服务可用，部分模型受供应商地区限制"}（${access.checkedAt} 核查）：${access.evidence}`;
    return p && p.region === "cn" ? "国内服务" : "未核实官方支持地区";
}
function metricOfferOk(m: any) {
    if (/已停售|已下架|老用户|一次性|预付/.test(m.plan || ""))
        return false;
    if (m.ref != null) {
        const p = findPlanReference(m.ref);
        if (p && (isRetiredPlan(p) || !isPriceConfirmed(p) || isOneTimePlan(p) || isRenewalOnly(p) || !offerable(p)))
            return false;
    }
    return true;
}
function adoptMetric(m: any, isEst: any) {
    const resolved = resolvePlan(m);
    return resolved ? { ...resolved, isEst } : null;
}
const METRICS_ALL = [
    ...METRICS_RAW.map((m: { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; weeklyChart: boolean; wkLowM: number; wkHighM: number; vendorWkLowM: number; vendorWkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; weeklyChart: boolean; reqPer5h: number; reqPerWk: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; vendorWkLowM: number; vendorWkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqPer5h: number; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; creditUSD: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; creditCNY: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; }) => adoptMetric(m, false)),
    ...ESTIMATES.map((m: { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; isEst: boolean; reqPer5h: number; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; confidenceReason: string; source: string; note: string; wkLowM?: undefined; wkHighM?: undefined; reqLowPer5h?: undefined; reqHighPer5h?: undefined; tokensLowPerReq?: undefined; tokensHighPerReq?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; note: string; source: string; isEst?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; confidenceReason?: undefined; reqLowPer5h?: undefined; reqHighPer5h?: undefined; tokensLowPerReq?: undefined; tokensHighPerReq?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqLowPer5h: number; reqHighPer5h: number; tokensLowPerReq: number; tokensHighPerReq: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; note: string; source: string; isEst?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; confidenceReason?: undefined; wkLowM?: undefined; wkHighM?: undefined; }) => adoptMetric(m, true)),
].filter(Boolean);
/* ---------- 工具函数 ---------- */
const shortVendor = (v: any) => VENDOR_SHORT[v] || v;
const fmtCNY = (n: any) => "¥" + (Math.round(n * 10) / 10).toLocaleString("zh-CN");
const trunc = (s: any, n: any) => (!s ? "—" : (s.length > n ? s.slice(0, n) + "…" : s));
/* ---------- 内联 SVG 图标（替代 173KB 的 Remix Icon 字体；stroke 继承 currentColor） ---------- */
const ICON_SVG = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    stack: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    gift: '<rect x="3.5" y="7.5" width="17" height="4.5" rx="1"/><path d="M5.5 12v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-7M12 7.5V21"/><path d="M12 7.5C9 7.5 7.2 6.6 7.2 5.2 7.2 4 8.2 3 9.4 3c1.7 0 2.6 2 2.6 4.5C12 5 12.9 3 14.6 3c1.2 0 2.2 1 2.2 2.2 0 1.4-1.8 2.3-4.8 2.3Z"/>',
    tag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="8" cy="8" r="1.7"/>',
    "arrow-down-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7v10m0 0 4-4m-4 4-4-4"/>',
    "arrow-up-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 17V7m0 0 4 4m-4-4-4 4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
    computer: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20.5h6m-3-4v4"/>',
    "arrow-up": '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
};
function icon(name: any) {
    return `<i class="ric" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_SVG[name] || ""}</svg></i>`;
}
/* ---------- DOM 助手：checkJs 友好的元素类型断言，id↔元素对应关系由页面结构约定保证 ---------- */
function byId(id: any) { return /** @type {any} */ document.getElementById(id) as any; }
function qsa(sel: any) { return /** @type {any} */ document.querySelectorAll(sel) as any; }
function qs(sel: any) { return /** @type {any} */ document.querySelector(sel) as any; }
function evtTarget(e: any) { return /** @type {any} */ e && e.target as any; }
function setChipPressed(chips: any, isOn: any) {
    chips.forEach((chip: any) => {
        const on = !!isOn(chip);
        chip.classList.toggle("active", on);
        chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
}
/* 图表是 canvas，读屏不可见：渲染后写一句文字摘要进容器 */
function describeChart(id: any, text: any) {
    const el = byId(id);
    if (!el)
        return;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", String(text).slice(0, 240));
}
function priceOf(p: any, billing: any) {
    if (billing === "Y")
        return p.priceY ?? null;
    return p.priceM;
}
/* Currency conversion uses the shared ./metrics implementation. */
function cnyOf(p: any, billing: any) {
    const v = priceOf(p, billing);
    return v == null ? null : toCNY(v, p.cur);
}
function priceText(p: any, key: any) {
    const v = p[key];
    if (v == null)
        return "按量/定制";
    if (v === 0)
        return "免费";
    return currencySymbol(p.cur) + Number(v.toFixed(2));
}
function currencySymbol(cur: any) { return cur === "USD" ? "$" : cur === "INR" ? "₹" : "¥"; }
function priceCheckLabel(p: any, kind: string = "plan") {
    const check = priceCheckOf(p, kind);
    if (!check)
        return "未核实";
    return { verified: "价格已核实", changed: "核价信息已校正", unverified: "历史价 · 待核实", retired: "已停售", custom: "需询价" }[check.status];
}
function priceCheckSources(p: any, kind: string = "plan") {
    const check = priceCheckOf(p, kind);
    return check ? check.sourceIds.map((id: string) => PRICE_CHECKS.sources[id] && PRICE_CHECKS.sources[id].url).filter(Boolean) : [];
}
/* 所有表格/对比/导出共用计价单位，不能把充值或席位费用当作个人月费。 */
function priceUnit(p: any) {
    if (isOneTimePlan(p))
        return "一次性";
    if (isFourWeekPlan(p))
        return p.seat ? "席位/4周" : "4周";
    return p.seat ? "席位/月" : "月";
}
function planPriceLabel(p: any, billing: string = "M") {
    const key = billing === "Y" ? "priceY" : "priceM";
    if (p[key] == null)
        return billing === "Y" ? "—" : "按量/定制";
    if (p[key] === 0)
        return p.includedModelQuota === false ? "平台免费；推理另计" : "免费";
    return priceText(p, key) + "/" + priceUnit(p) + (billing === "Y" ? "（年付折月）" : "");
}
/* 宽屏严格限制轴标签占宽，完整名称在 tooltip 和数据表中查看。
   窄屏改为把类别名放在柱子上方整行显示：截成「阶跃 Step Plan Flash…」后几行无法区分。
   公开评测图另有两行标签方案，保持原样。 */
const NARROW_CHART_WIDTH = 480;
const chartNarrowMode = new Map();
function chartHostWidth(hostEl: any, measuredWidth: number = 0) {
    return measuredWidth || hostEl.getBoundingClientRect().width || window.innerWidth - 72;
}
function isNarrowChart(hostEl: any, measuredWidth: number = 0) {
    return hostEl.id !== "chartPublicBenchmark" && chartHostWidth(hostEl, measuredWidth) < NARROW_CHART_WIDTH;
}
/* 名称放到柱子上方后，每行多留一行文字的高度。 */
function chartRowHeight(hostEl: any, per: any) { return isNarrowChart(hostEl) ? per + 16 : per; }
function chartAxisLabel(hostEl: any, fontSize: number = 12.5, measuredWidth: number = 0) {
    const width = chartHostWidth(hostEl, measuredWidth);
    const narrow = isNarrowChart(hostEl, width);
    chartNarrowMode.set(hostEl.id, narrow);
    if (narrow) {
        return { color: PAL.catLabel, fontSize: 11, inside: true, align: "left", verticalAlign: "bottom",
            padding: [0, 0, 11, 2], width: Math.max(120, width - 40), overflow: "truncate", margin: 0 };
    }
    return { color: PAL.catLabel, fontSize,
        width: Math.max(60, Math.min(width < NARROW_CHART_WIDTH ? 110 : 260, width * 0.34)),
        overflow: "truncate", margin: 8 };
}
/* 宽窄布局切换（如手机横竖屏）需要整图重绘：行高与标签位置都要变。 */
function chartRenderer(id: any) {
    return { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart, chartTokens: renderTokensChart,
        chartApi: renderApiChart, chartPower: renderApiChart, chartRank: renderRankChart }[id] || null;
}
/** @type {Record<string, any>} 图表 id → ECharts 实例 */
const chartCache: Record<string, any> = {};
let chartLibraryPromise = null;
const queuedChartRenders = new Map();
function chartLibraryReady() { return typeof echarts !== "undefined" && typeof echarts.init === "function"; }
function ensureChartLibrary() {
    if (chartLibraryReady())
        return Promise.resolve();
    if (chartLibraryPromise)
        return chartLibraryPromise;
    chartLibraryPromise = new Promise<void>((resolve, reject) => {
        const template = byId("chartLibraryTemplate");
        const asset = template && template.content && template.content.querySelector("script[src]");
        if (!asset) {
            reject(new Error("图表资源地址缺失"));
            return;
        }
        const script = document.createElement("script");
        script.src = asset.getAttribute("src");
        let done = false;
        const finish = (error: any) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) {
                script.remove();
                reject(error);
            }
            else
                resolve();
        };
        const timer = setTimeout(() => finish(new Error("图表资源加载超时")), 15000);
        script.onload = () => finish(chartLibraryReady() ? null : new Error("图表资源未正确初始化"));
        script.onerror = () => finish(new Error("图表资源加载失败"));
        document.body.appendChild(script);
    }).catch((err: any) => { chartLibraryPromise = null; throw err; });
    return chartLibraryPromise;
}
function showChartError(id: any, err: any) {
    const ids = id === "chartApi" ? [id, "chartPower"] : [id];
    ids.forEach((chartId: any) => {
        if (chartCache[chartId]) {
            chartCache[chartId].dispose();
            delete chartCache[chartId];
        }
        const el = byId(chartId);
        if (el) {
            el.removeAttribute("aria-busy");
            el.innerHTML = `<p class="render-error" role="alert">图表暂时无法显示，文字明细仍可查看。<button type="button" class="chip" data-retry-chart="${esc(id)}">重试</button></p>`;
        }
    });
    console.error("[chart] " + id, err);
}
function deferChartRender(id: any, render: any) {
    if (chartLibraryReady())
        return false;
    const scheduled = queuedChartRenders.has(id);
    queuedChartRenders.set(id, render);
    const el = byId(id);
    if (el) {
        el.setAttribute("aria-busy", "true");
        el.innerHTML = '<p class="chart-loading" role="status">正在加载图表…</p>';
    }
    if (!scheduled)
        ensureChartLibrary().then(() => {
            const latest = queuedChartRenders.get(id);
            queuedChartRenders.delete(id);
            if (el) {
                el.removeAttribute("aria-busy");
                el.innerHTML = "";
            }
            try {
                if (latest)
                    latest();
                markChartsForResize();
                resizeVisibleCharts();
            }
            catch (err) {
                showChartError(id, err);
            }
        }, (err: any) => { queuedChartRenders.delete(id); showChartError(id, err); });
    return true;
}
function makeChart(id: any) {
    if (!chartCache[id]) {
        const el = byId(id);
        el.innerHTML = "";
        el.removeAttribute("aria-busy");
        chartCache[id] = echarts.init(el, null, { renderer: "canvas" });
    }
    return chartCache[id];
}
let resizeTimer;
const pendingChartResizes = new Set();
const CHART_AXIS_FONT_SIZE = { chartPersonal: 12.5, chartTeam: 12.5, chartTokens: 11.5, chartApi: 11, chartPower: 11, chartRank: 11.5, chartPublicBenchmark: 12 };
/* 缩放只更新实际尺寸变化的可见画布，不重新筛数据或重建图例。
   离屏画布保留待处理标记，滚入阅读区时再补齐尺寸和轴标签宽度。 */
function resizeVisibleCharts() {
    pendingChartResizes.forEach((id: any) => {
        const chart = chartCache[id], el = byId(id);
        if (!chart || !el) {
            pendingChartResizes.delete(id);
            return;
        }
        if (el.hidden)
            return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width <= 0 || rect.height <= 0)
            return;
        pendingChartResizes.delete(id);
        if (Math.abs(chart.getWidth() - rect.width) < 1 && Math.abs(chart.getHeight() - rect.height) < 1)
            return;
        try {
            const render = chartRenderer(id);
            if (render && chartNarrowMode.has(id) && chartNarrowMode.get(id) !== isNarrowChart(el, rect.width)) {
                render();
                chart.resize();
                return;
            }
            chart.setOption({ yAxis: { axisLabel: chartAxisLabel(el, CHART_AXIS_FONT_SIZE[id], rect.width) } }, { lazyUpdate: true });
            chart.resize();
        }
        catch (err) {
            pendingChartResizes.add(id);
            console.error("[chart resize] " + id, err);
        }
    });
}
/* 隐藏视图里重绘的画布会按 100px 默认宽度绘制；重绘、视图切换和缩放后统一标记待测量，
   进入可视区时再按实际尺寸补齐，不依赖窗口缩放事件。 */
function markChartsForResize(ids: string[] = Object.keys(chartCache)) {
    ids.forEach((id: string) => { if (chartCache[id])
        pendingChartResizes.add(id); });
}
function bindChartResize() {
    window.addEventListener("resize", () => {
        markChartsForResize();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resizeVisibleCharts, 150);
    }, { passive: true });
    let scrollQueued = false;
    window.addEventListener("scroll", () => {
        if (scrollQueued || pendingChartResizes.size === 0)
            return;
        scrollQueued = true;
        const update = () => { scrollQueued = false; resizeVisibleCharts(); };
        if (typeof window.requestAnimationFrame === "function")
            window.requestAnimationFrame(update);
        else
            update();
    }, { passive: true });
}
/* ---------- 主题（暗/亮/跟随系统）与图表调色板 ---------- */
/** @typedef {{ text: string, dim: string, catLabel: string, faint: string, gold: string, green: string, red: string, info: string, axisLine: string, splitLine: string, tipBg: string, tipBorder: string, tipText: string }} ChartPalette */
/** @type {ChartPalette} 随主题由 refreshPalette 重建 */
let PAL: ChartPalette = {} as ChartPalette;
function refreshPalette() {
    const L = document.documentElement.dataset.theme === "light";
    const cs = getComputedStyle(document.documentElement);
    const color = (name: any, fallback: any) => (cs.getPropertyValue(name) || "").trim() || fallback;
    PAL = L ? {
        text: "#10110f", dim: "#6f726b", catLabel: "#3a3d38", faint: color("--faint", "#70746c"),
        gold: color("--gold", "#996100"), green: color("--green", "#287c3e"),
        red: color("--red", "#b52a25"), info: color("--info", "#2458ae"),
        axisLine: "rgba(16,17,15,.22)", splitLine: "rgba(16,17,15,.07)",
        tipBg: "rgba(255,255,255,.98)", tipBorder: "rgba(16,17,15,.18)", tipText: "#10110f",
    } : {
        text: "#eceee8", dim: "#9fa39a", catLabel: "#c8ccc2", faint: color("--faint", "#868a83"),
        gold: color("--gold", "#e9b117"), green: color("--green", "#4cbf6b"),
        red: color("--red", "#ef554f"), info: color("--info", "#6d9bff"),
        axisLine: "rgba(236,238,232,.2)", splitLine: "rgba(236,238,232,.08)",
        tipBg: "rgba(22,24,21,.97)", tipBorder: "rgba(236,238,232,.16)", tipText: "#eceee8",
    };
    refreshCategoryColors();
}
function axisStyle() {
    return {
        axisLine: { lineStyle: { color: PAL.axisLine } },
        axisLabel: { color: PAL.dim, fontSize: 12 },
        splitLine: { lineStyle: { color: PAL.splitLine } },
    };
}
function tipStyle(hostEl: any, viewportFixed: boolean = false) {
    return {
        backgroundColor: PAL.tipBg,
        borderColor: PAL.tipBorder,
        borderWidth: 1,
        textStyle: { color: PAL.tipText, fontSize: 12.5 },
        // 随图表所属标签收起，避免旧提示坐标撑高切换后的页面。
        appendToBody: false,
        extraCssText: "max-width: min(420px, calc(100vw - 24px)); white-space: normal; overflow-wrap: anywhere; z-index: 2000;",
        position(point: any, _params: any, _el: any, _rect: any, size: any) {
            const box = hostEl.getBoundingClientRect();
            const bw = Math.min(size.contentSize[0] || 280, window.innerWidth - 24);
            const bh = size.contentSize[1] || 72;
            let x = box.left + point[0] + 14;
            let y = box.top + point[1] + 12;
            if (x + bw > window.innerWidth - 8)
                x = box.left + point[0] - bw - 14;
            if (x < 8)
                x = 8;
            if (x + bw > window.innerWidth - 8)
                x = Math.max(8, window.innerWidth - bw - 8);
            if (y + bh > window.innerHeight - 8)
                y = box.top + point[1] - bh - 12;
            if (y < 8)
                y = 8;
            if (y + bh > window.innerHeight - 8)
                y = Math.max(8, window.innerHeight - bh - 8);
            return viewportFixed ? [x, y] : [x - box.left, y - box.top];
        },
    };
}
/* 轴上和表里的模型名统一成产品写法：qwen3-coder-next → Qwen3-Coder-Next。计费 ID 仍用原文。 */
function displayModelName(name: any) {
    const raw = String(name || "").trim();
    if (!raw)
        return raw;
    const tailMatch = raw.match(/\s*[\[（(].*$/);
    const head = tailMatch ? raw.slice(0, tailMatch.index) : raw;
    const tail = tailMatch ? tailMatch[0] : "";
    const brands = [
        [/^(gpt)(.*)$/i, "GPT"],
        [/^(glm)(.*)$/i, "GLM"],
        [/^(qwen)(.*)$/i, "Qwen"],
        [/^(deepseek)(.*)$/i, "DeepSeek"],
        [/^(kimi)(.*)$/i, "Kimi"],
        [/^(claude)(.*)$/i, "Claude"],
        [/^(gemini)(.*)$/i, "Gemini"],
        [/^(minimax)(.*)$/i, "MiniMax"],
        [/^(mimo)(.*)$/i, "MiMo"],
        [/^(doubao)(.*)$/i, "Doubao"],
        [/^(step)(.*)$/i, "Step"],
        [/^(grok)(.*)$/i, "Grok"],
        [/^(ernie)(.*)$/i, "ERNIE"],
        [/^(hy)(\d.*)$/i, "Hy"],
    ];
    const cap = (tok: any) => {
        for (const [re, brand] of brands) {
            const m = tok.match(re);
            if (m)
                return brand + (m[2] || "");
        }
        return /^[a-z]/.test(tok) ? tok.charAt(0).toUpperCase() + tok.slice(1) : tok;
    };
    return head.split("-").map(cap).join("-") + tail;
}
function foldSearch(s: any) {
    return String(s || "").toLowerCase().replace(/[\s_\-./·]+/g, "");
}
/* 正则转义（windowSentence 的模型名片段、测试与校验共用的小工具） */
function escRe(s: any) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** @type {Array<[RegExp, string]>} */
const SEARCH_VENDOR_ALIASES: [RegExp, string][] = [
    [/OpenAI|ChatGPT/i, "OpenAI ChatGPT Codex GPT 聊天GPT"],
    [/Anthropic|Claude/i, "Anthropic Claude 克劳德"],
    [/智谱|BigModel|Z\.ai/i, "智谱 BigModel GLM Z.ai"],
    [/月之暗面|Kimi/i, "月之暗面 Kimi Moonshot"],
    [/DeepSeek|深度求索/i, "DeepSeek 深度求索"],
    [/阿里/i, "阿里 Alibaba"],
    [/Qwen|千问/i, "千问 Qwen"],
    [/字节/i, "字节 ByteDance"],
    [/豆包|Doubao/i, "豆包 Doubao"],
    [/GitHub|Copilot/i, "GitHub Copilot"],
    [/Google|Gemini|谷歌/i, "Google 谷歌 Gemini 双子座"],
    [/MiniMax|稀宇/i, "MiniMax 稀宇"],
    [/小米|MiMo/i, "小米 Xiaomi MiMo"],
];
function planSearchBlob(p: any) {
    const identity = [p.vendor, p.plan].join(" ");
    const aliases = SEARCH_VENDOR_ALIASES.filter(([pattern]: [RegExp, string]) => pattern.test(identity)).map(([, words]: [RegExp, string]) => words);
    return foldSearch([p.vendor, p.plan, resolvedField(p, "models"), resolvedField(p, "tools"), resolvedField(p, "quota"), resolvedField(p, "note"), ...aliases].join(" "));
}
function queryHit(blob: any, q: any) {
    const terms = String(q || "").trim().split(/\s+/).map(foldSearch).filter(Boolean);
    return terms.every((term: string) => blob.includes(term));
}
/* ---------- 明暗主题切换（暗 → 亮 → 跟随系统 循环） ---------- */
const THEME_KEY = "cp-theme";
let themeMode = "system";
export const themeView = reactive<{ mode: 'dark' | 'light' | 'system'; effective: 'dark' | 'light' }>({ mode: 'system', effective: 'light' });
function readThemeMode() {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return ["dark", "light", "system"].includes(saved) ? saved : "system";
    }
    catch (e) {
        return "system";
    }
}
function applyTheme(mode: any) {
    mode = ["dark", "light", "system"].includes(mode) ? mode : "system";
    themeMode = mode;
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const eff = mode === "system" ? (sysDark ? "dark" : "light") : mode;
    themeView.mode = mode;
    themeView.effective = eff;
    document.documentElement.dataset.theme = eff;
    document.documentElement.dataset.themeMode = mode;
    try {
        localStorage.setItem(THEME_KEY, mode);
    }
    catch (e) { /* 存储受限只影响回访记忆。 */ }
    refreshPalette();
    const browserColor = (getComputedStyle(document.documentElement).getPropertyValue("--paper") || "").trim()
        || (eff === "dark" ? "#131511" : "#fbfbf8");
    /* 两个带系统 media 的标签都写实际主题色，手动选择主题也能更新浏览器外观。 */
    qsa('meta[name="theme-color"]').forEach((meta: any) => meta.setAttribute("content", browserColor));
}
function rerenderCharts() {
    const renderers = { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart,
        chartTokens: renderTokensChart, chartApi: renderApiChart, chartRank: renderRankChart, chartPublicBenchmark: renderPublicBenchmarkChart };
    Object.entries(renderers).forEach(([id, render]: [string, (() => void) | (() => void) | (() => void) | (() => void) | (() => void) | (() => void)]) => {
        if (!chartCache[id])
            return;
        /* 单图失败不中断其余图的重绘（主题切换/历史恢复会一次重画全部） */
        try {
            render();
        }
        catch (err) {
            console.error("[chart] " + id, err);
        }
    });
    markChartsForResize();
    resizeVisibleCharts();
}
/* 测量固定页头，供锚点间距和当前章节判断共用；不读取或渲染图表内容。 */
let headerHeight = 0;
let navigationInitialized = false;
function syncHeaderHeight() {
    const header = qs(".topbar");
    if (!header || typeof header.getBoundingClientRect !== "function")
        return;
    const height = Math.ceil(header.getBoundingClientRect().height);
    if (!Number.isFinite(height) || height <= 0)
        return;
    headerHeight = height;
    const style = document.documentElement.style;
    if (style && typeof style.setProperty === "function")
        style.setProperty("--header-height", height + "px");
}
function updateActiveNav() {
    const links = Array.from(qsa('.topnav a[href^="#"]'));
    const previous = links.find((link: any) => link.getAttribute("aria-current") === "location");
    const scrollPadding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top"));
    const readingTop = Number.isFinite(scrollPadding) ? scrollPadding : headerHeight;
    let active = null, closestTop = -Infinity;
    links.forEach((link: any) => {
        const target = byId((link.getAttribute("href") || "").slice(1));
        if (!target || target.hidden || typeof target.getBoundingClientRect !== "function")
            return;
        const top = target.getBoundingClientRect().top;
        /* 章节顶部的实际留白进入阅读区即属于本节，容纳字体加载后的轻微布局变化。 */
        const paddingTop = parseFloat(getComputedStyle(target).getPropertyValue("padding-top")) || 0;
        if (Number.isFinite(top) && top <= readingTop + paddingTop && top >= closestTop) {
            closestTop = top;
            active = link;
        }
    });
    links.forEach((link: any) => {
        const on = link === active;
        link.classList.toggle("active", on);
        if (on)
            link.setAttribute("aria-current", "location");
        else
            link.removeAttribute("aria-current");
    });
    /* 窄屏导航横向滚动时让当前章节露出来，只在章节变化时调整。 */
    const nav = qs(".topnav");
    if (active && active !== previous && nav && nav.scrollWidth > nav.clientWidth) {
        const box = /** @type {HTMLElement} */ (active as HTMLElement).getBoundingClientRect(), bounds = nav.getBoundingClientRect();
        if (box.left < bounds.left + 8)
            nav.scrollLeft += box.left - bounds.left - 8;
        else if (box.right > bounds.right - 8)
            nav.scrollLeft += box.right - bounds.right + 8;
    }
}
function initPageNavigation() {
    if (navigationInitialized)
        return;
    navigationInitialized = true;
    let readingPosition = null;
    const rememberReadingPosition = () => {
        const active = qs('.topnav a[aria-current="location"]');
        const target = active && byId((active.getAttribute("href") || "").slice(1));
        const padding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top")) || headerHeight;
        readingPosition = target ? { target, offset: target.getBoundingClientRect().top - padding } : null;
    };
    const refreshHeader = () => { syncHeaderHeight(); updateActiveNav(); rememberReadingPosition(); };
    const refreshLayout = () => {
        const previous = readingPosition;
        syncHeaderHeight();
        if (previous && previous.target.isConnected !== false && window.scrollY > 0) {
            const padding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top")) || headerHeight;
            const delta = previous.target.getBoundingClientRect().top - padding - previous.offset;
            if (Math.abs(delta) > 1)
                window.scrollTo({ top: window.scrollY + delta, behavior: "instant" });
        }
        updateActiveNav();
        rememberReadingPosition();
    };
    refreshHeader();
    const header = qs(".topbar");
    if (header && typeof ResizeObserver === "function")
        new ResizeObserver(refreshLayout).observe(header);
    window.addEventListener("resize", refreshLayout, { passive: true });
    let pending = false;
    window.addEventListener("scroll", () => {
        if (pending)
            return;
        pending = true;
        const update = () => { pending = false; updateActiveNav(); rememberReadingPosition(); };
        if (typeof window.requestAnimationFrame === "function")
            window.requestAnimationFrame(update);
        else
            update();
    }, { passive: true });
    window.addEventListener("hashchange", updateActiveNav);
    /* 加载完成后只更新当前位置；用户已滚动时不重新跳到原分享锚点。 */
    window.addEventListener("load", refreshHeader, { once: true });
    if (document.fonts && document.fonts.ready)
        document.fonts.ready.then(refreshLayout, refreshHeader);
}
function initTheme() {
    applyTheme(readThemeMode());
    initPageNavigation();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
        if (themeMode === "system") {
            applyTheme("system");
            rerenderCharts();
        }
    };
    /* 旧版 Safari（<14）只支持 addListener，此处做回退 */
    if (mq.addEventListener)
        mq.addEventListener("change", onSchemeChange);
    else if (mq.addListener)
        mq.addListener(onSchemeChange);
}
/* ---------- 统计卡 ---------- */
function planLabel(p: any) {
    const sv = shortVendor(p.vendor);
    const words = sv.split(/[\s（(]/).filter(Boolean);
    const first = words[0];
    const last = words[words.length - 1];
    const plan = p.plan;
    if (first && plan.toLowerCase().startsWith(first.toLowerCase()))
        return plan;
    if (last && plan.toLowerCase().startsWith(last.toLowerCase())) {
        return sv.slice(0, sv.lastIndexOf(last)).trim() + " " + plan;
    }
    return sv + " " + plan;
}
/* 每百万 tokens 成本的档位阈值：排行图配色、排行说明与额度表共用（≤0.3 低 / ≤1 中 / >1 高） */
function cpmTier(v: any) {
    return v == null ? "na" : v <= 0.3 ? "lo" : v <= 1 ? "mid" : "hi";
}
function renderStats(){}

/* SOURCE: js/app-state.js */
/* ============ Coding Plan 比价中心 — 状态与 URL ============ */
"use strict";
const DEBUG_MODE = new URLSearchParams(location.search).has("debug");
const PERSONAL_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LENGTH = 200;
function boundedSearch(value: any) { return String(value ?? "").slice(0, SEARCH_MAX_LENGTH); }
const CMP_MAX = 4;
/** @type {{cat:string, region:string, billing:string, q:string, limit:number|null, fromPicker:boolean}} */
const personalState: { cat: string; region: string; billing: string; q: string; limit: number | null; fromPicker: boolean; } = reactive({ cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker: false });
const rankState = reactive({ tier: "flagship", scope: "all", vendor: "all", fromPicker: false });
const pickerState = reactive({ budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
const tableState = reactive({ search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
/** @type {{items: typeof PLANS}} */
const cmpState: { items: typeof PLANS; } = shallowReactive({ items: [] });
const metricsState = reactive({ model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
const CALC_MODELS = new Set(API_PRICES.filter((a: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => isPriceConfirmed(a, "api")).map((a: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => a.vendor + "|" + a.model));
/* 默认模型按 data.js 的固定身份取；万一被移出已确认价格，才退回第一项（校验器会先报错）。 */
const CALC_DEFAULT_MODEL = (() => {
    const pinned = typeof CALC_DEFAULT_API === "object" && CALC_DEFAULT_API ? CALC_DEFAULT_API.vendor + "|" + CALC_DEFAULT_API.model : "";
    return CALC_MODELS.has(pinned) ? pinned : [...CALC_MODELS][0] || "";
})();
const calcState = reactive({ model: CALC_DEFAULT_MODEL, requests: "100", tokens: "20000", days: "22", input: "80", cache: "95", cachePrice: "", budget: "200", scenario: "typical" });
const CALC_LIMITS = { requests: [0, 100000, true], tokens: [1, 10000000, true], days: [1, 31, true], input: [0, 100, false], cache: [0, 100, false], cachePrice: [0, 1000000, false], budget: [0, 1000000000, false] };
function validCalcValue(key: any, value: any) {
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
const APP_DEFAULTS = { personal: { ...personalState }, rank: { ...rankState }, picker: { ...pickerState }, table: { ...tableState }, metrics: { ...metricsState }, calc: { ...calcState } };
/* 额度表模型筛选的合法取值（与 populateModelFilter 的数据源一致），供 URL 白名单校验 */
const MODEL_FILTER_VALUES = new Set([
    ...METRICS_RAW.map((m: { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; weeklyChart: boolean; wkLowM: number; wkHighM: number; vendorWkLowM: number; vendorWkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; weeklyChart: boolean; reqPer5h: number; reqPerWk: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; vendorWkLowM: number; vendorWkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqPer5h: number; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; creditUSD: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; creditUSD?: undefined; creditCNY?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; creditCNY: number; apiIn: number; apiOut: number; apiCache: number; tps: string; source: string; note: string; weeklyChart?: undefined; wkLowM?: undefined; wkHighM?: undefined; vendorWkLowM?: undefined; vendorWkHighM?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; creditUSD?: undefined; }) => m.model),
    ...ESTIMATES.map((m: { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; isEst: boolean; reqPer5h: number; reqPerWk: number; reqPerMo: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; confidenceReason: string; source: string; note: string; wkLowM?: undefined; wkHighM?: undefined; reqLowPer5h?: undefined; reqHighPer5h?: undefined; tokensLowPerReq?: undefined; tokensHighPerReq?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; wkLowM: number; wkHighM: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; note: string; source: string; isEst?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; confidenceReason?: undefined; reqLowPer5h?: undefined; reqHighPer5h?: undefined; tokensLowPerReq?: undefined; tokensHighPerReq?: undefined; } | { vendor: string; plan: string; ver: string; model: string; region: string; ref: string; reqLowPer5h: number; reqHighPer5h: number; tokensLowPerReq: number; tokensHighPerReq: number; apiIn: number; apiOut: number; apiCache: number; tps: string; method: string; confidence: string; note: string; source: string; isEst?: undefined; reqPer5h?: undefined; reqPerWk?: undefined; reqPerMo?: undefined; confidenceReason?: undefined; wkLowM?: undefined; wkHighM?: undefined; }) => m.model),
    ...PAYG_REFERENCES.map((s: { vendor: string; model: string; cur: string; apiIn: number; apiOut: number; apiCache: number; note: string; source: string; url: string; }) => s.model),
]);
let URL_RESTORING = false;
/* Pause URL writes while the startup module restores shared history state. */
function setUrlRestoring(on: any) { URL_RESTORING = on; }
let stateUpdateDepth = 0;
/* 用户操作提交状态并持久化；渲染、主题和窗口缩放不写历史条目。 */
function updateAppState(change: any, render?: any) {
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
const URL_KEYS = {
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
const URL_DEFAULTS = Object.fromEntries(Object.entries(URL_KEYS).map(([k, get]: [string, (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => "1" | "0") | (() => "1" | "0") | (() => "1" | "0") | (() => "1" | "0") | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => "1" | "0") | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string) | (() => string)]) => [k, get()]));
const URL_VALID = {
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
function applyUrlState(search: string = location.search) {
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
function appQueryString() {
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
function syncUrl() {
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
function syncControlsFromState() {
    // Vue bindings observe the restored state; the calculator also retains invalid drafts.
    syncServiceControls();
}

/* SOURCE: js/app-charts.js */
/* ============ Coding Plan 比价中心 — 图表渲染 ============ */
"use strict";
/* 图高随行数增长：n 行 × 每行 per px + 标题/轴留白 base，但不低于 min（空数据也要装下坐标轴） */
function chartHeight(n: any, per: any, base: any, min: any) {
    return Math.max(min, n * per + base);
}
/* 相差多个数量级的数值用真正的对数轴；留出低于最小值的刻度，让最低项也有可点击柱形。
   柱长不代表线性比例，轴标题、读屏摘要及精确 tooltip 均明确这一点。 */
function chartLogAxis(values: any, name: any) {
    const positive = values.filter((v: any) => Number.isFinite(v) && v > 0);
    const lowest = positive.length ? Math.min(...positive) : 1;
    const min = Math.pow(10, Math.floor(Math.log10(lowest) - 0.01));
    return {
        type: "log", logBase: 10,
        min, startValue: min,
        name: name + "（对数刻度）", nameLocation: "middle", nameGap: 30,
        nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: any) => Number(v.toPrecision(5)).toLocaleString("zh-CN", { maximumFractionDigits: 6 }) },
    };
}
function weeklyTokenRange(low: any, high: any) {
    const fmt = (n: any) => Number(n.toFixed(2)).toLocaleString("zh-CN");
    return fmt(low) + (low === high ? "" : "–" + fmt(high)) + "M";
}
/* 套餐身份和名称取自主表，额度行只追加模型名称；不再为图表单独缩写套餐名。 */
function metricChartLabel(m: any) {
    const p = resolvePlan(m) || m;
    return planLabel(p) + " · " + displayModelName(m.model);
}
/* ---------- 个人订阅价格全景 ---------- */
function personalChartPrice(p: any) { return personalState.fromPicker ? pickerMonthlyCNY(p) : cnyOf(p, personalState.billing); }
function resetPersonalFilters() {
    Object.assign(personalState, APP_DEFAULTS.personal);
    renderPersonalChart();
}
/* DOM 图例可用键盘操作；同一名称的区间基柱和上限段一起切换。 */
function bindChartLegend(chart: any, id: any, colors: any) {
    const selections = chartLegendSelections[id] || (chartLegendSelections[id] = {});
    for (const name of Object.keys(colors)) {
      if (selections[name] === false) chart.dispatchAction({ type: "legendUnSelect", name });
    }
    if (typeof chart.off === "function" && typeof chart.on === "function") {
      chart.off("legendselectchanged");
      chart.on("legendselectchanged", (event: { selected: Record<string, boolean> }) => Object.assign(selections, event.selected));
    }
}
/* 图例色块与图表 itemStyle 同源（都读 refreshCategoryColors 取到的 --cat-* 变量） */
function renderLegend() {
    // Text, controls and accessible tables are rendered by Vue.
}
function personalTooltip(p: any) {
    const quote = personalState.fromPicker ? pickerPaymentQuote(p) : null;
    const billing = quote ? quote.mode : personalState.billing;
    const y = p.priceY != null ? `年付：${priceText(p, "priceY")}/月（年付折算）` : "年付：未列公开价";
    const unified = quote ? quote.monthlyNative : priceOf(p, billing);
    const unifiedCNY = quote ? quote.monthlyCNY : cnyOf(p, billing);
    const uni = unified != null ? `${currencySymbol(p.cur) + Number(unified.toFixed(2))} ≈ ${fmtCNY(unifiedCNY)}` : "—";
    const href = safeHref(p.url);
    return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
    ${quote ? `选购口径：${esc(priceLine(p))}<br/>首次付款：${esc(pickerFirstPaymentText(p))}<br/>` : ""}
    ${billing === "Y" ? `折算价：${esc(uni)}<br/>` : ""}
    月付：${p.priceM != null ? esc(priceText(p, "priceM")) : "—"} ｜ ${esc(y)}<br/>
    <span style="color:${PAL.gold}">额度：</span>${esc(trunc(resolvedField(p, "quota"), 120))}<br/>
    <span style="color:${PAL.info}">模型：</span>${esc(trunc(resolvedField(p, "models"), 120))}<br/>
    ${isRelay(p) ? `<span style="color:${RELAY_COLOR}">中转站，不和官方订阅比单价</span><br/>` : ""}
    ${p.note ? `<span style="color:${PAL.dim}">备注：${esc(trunc(p.note, 60))}</span><br/>` : ""}
    ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href} · 数据截至 ${esc(META.updated)}</span>` : ""}`;
}
function renderPersonalChart() {

    if (typeof syncPickerScopeControls === "function")
        syncPickerScopeControls();
    if (deferChartRender("chartPersonal", renderPersonalChart))
        return;
    renderLegend();
    const q1 = foldSearch(personalState.q) ? personalState.q.trim() : "";
    const annualMode = !personalState.fromPicker && personalState.billing === "Y";
    const rows = PLANS.filter((p: Plan) => isPriceConfirmed(p) && isPersonalMonthly(p) &&
        (!annualMode || p.priceY > 0) &&
        (personalState.cat === "all" || p.cat === personalState.cat) &&
        (personalState.region === "all" || p.region === personalState.region) &&
        (!personalState.fromPicker || matchesPickerPurchase(p)) &&
        (!q1 || queryHit(planSearchBlob(p), q1))).sort((a: Plan, b: Plan) => personalChartPrice(a) - personalChartPrice(b));
    // 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开
    const noFilter = !personalState.fromPicker && personalState.cat === "all" && personalState.region === "all" && !q1;
    const limit = noFilter ? personalState.limit : null;
    const shown = limit ? rows.slice(0, limit) : rows;
    const el = byId("chartPersonal");
    /* 初始化/缩放时需要真实容器宽度，空态在完成配置后再隐藏 canvas。 */
    el.hidden = false;
    el.style.height = chartHeight(shown.length, chartRowHeight(el, 30), 130, 420) + "px";
    const chart = makeChart("chartPersonal");
    const labels = shown.map((p: Plan) => (isRelay(p) ? "中转 · " : "") + shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : ""));
    const data = shown.map((p: Plan) => ({
        value: Math.round(personalChartPrice(p) * 10) / 10,
        itemStyle: { color: isRelay(p) ? RELAY_COLOR : CAT_COLOR[p.cat], borderRadius: [0, 4, 4, 0] },
        _p: p,
    }));
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "item", ...tipStyle(el), formatter: (d: any) => personalTooltip(d.data._p) },
        grid: { left: 12, right: 64, top: 24, bottom: 44, containLabel: true },
        xAxis: { type: "value", name: "人民币（元/月）", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
        yAxis: {
            type: "category", data: labels, inverse: true, ...axisStyle(),
            axisLabel: chartAxisLabel(el),
            axisLine: { lineStyle: { color: PAL.axisLine } },
        },
        series: [
            {
                type: "bar", data, barWidth: 16,
                label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d: any) => "¥" + d.value.toLocaleString("zh-CN") },
            },
        ],
    }, true);
    chart.resize();
    el.hidden = shown.length === 0;
    const billingLabel = personalState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : personalState.billing === "Y" ? "年付折月" : "月付";
    /* 应用选购条件时金额来自帮我选的付款口径，说明也按同一口径写。 */
    const priceBasis = (p: any) => personalState.fromPicker
        ? (pickerPaymentQuote(p).inferred ? "（未单列自动续费价，按标价）" : "")
        : "";
    describeChart("chartPersonal", "个人订阅价格全景（" + billingLabel + "，人民币/月）" + shown.length + " 档，最低三档：" + shown.slice(0, 3).map((p: Plan) => shortVendor(p.vendor) + " " + p.plan + " " + fmtCNY(personalChartPrice(p)) + priceBasis(p)).join("、"));

}
/* ---------- 团队 / 企业 / 云厂商（席位价 + 整包价） ---------- */
function renderTeamChart() {
    if (deferChartRender("chartTeam", renderTeamChart))
        return;
    const rows = PLANS.filter((p: Plan) => isPriceConfirmed(p) && !isRetiredPlan(p) && (p.cat === "team" || p.seat) && p.priceM != null && p.priceM > 0).sort((a: Plan, b: Plan) => Number(!a.seat) - Number(!b.seat) || cnyOf(a, "M") - cnyOf(b, "M"));
    const el = byId("chartTeam");
    el.style.height = chartHeight(rows.length, chartRowHeight(el, 30), 130, 380) + "px";
    const chart = makeChart("chartTeam");
    const data = rows.map((p: Plan) => ({
        value: Math.round(cnyOf(p, "M") * 10) / 10,
        itemStyle: { color: p.seat ? CAT_COLOR.team : PAL.info, borderRadius: [0, 4, 4, 0] },
        _p: p,
    }));
    chart.setOption({
        backgroundColor: "transparent",
        /* 数据被筛空时给出占位标题，而不是一块空白画布 */
        ...(rows.length ? {} : { title: { text: "暂无可对比的团队/企业档", left: "center", top: "middle", textStyle: { color: PAL.dim, fontSize: 13, fontWeight: 500 } } }),
        tooltip: {
            trigger: "item", ...tipStyle(el),
            formatter: (d: any) => {
                const p = d.data._p;
                const href = safeHref(p.url);
                return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
            ${p.seat ? "每席位/用户/月" : "整包价/月"}：${esc(priceText(p, "priceM"))} ≈ ${fmtCNY(cnyOf(p, "M"))}${p.priceY != null ? `（年付 ${esc(priceText(p, "priceY"))}/月）` : ""}<br/>
            <span style="color:${PAL.gold}">额度：</span>${esc(trunc(resolvedField(p, "quota"), 120))}<br/>
            ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href}</span>` : ""}`;
            },
        },
        grid: { left: 12, right: 64, top: 20, bottom: 44, containLabel: true },
        xAxis: chartLogAxis(data.map((d: { value: number; itemStyle: { color: string; borderRadius: number[]; }; _p: Plan; }) => d.value), "人民币 · 元/月"),
        yAxis: {
            type: "category", inverse: true,
            data: rows.map((p: Plan) => (p.seat ? "每席/月 · " : "整包/月 · ") + planLabel(p)),
            ...axisStyle(), axisLabel: chartAxisLabel(el),
            axisLine: { lineStyle: { color: PAL.axisLine } },
        },
        series: [{ type: "bar", data, barWidth: 16, label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d: any) => "¥" + d.value.toLocaleString("zh-CN") } }],
    }, true);
    chart.resize();
    describeChart("chartTeam", "团队/企业档 " + rows.length + " 项，先列每席月价，再列整包月价，各组内按价格升序。价格采用对数刻度，相邻主刻度为十倍；不同计价单位不作排名比较。");
}
/* ---------- 每周可用 tokens 对比（官方公布 + 社区推算，厂商中立） ---------- */
const TOKEN_OFFICIAL_COLOR = "#34d399";
const TOKEN_EST_COLOR = "#fbbf24";
const TOKEN_OFFICIAL_SERIES = "官方额度折算";
const TOKEN_EST_SERIES = "折算 / 社区推算";
function renderTokensChart() {

    if (deferChartRender("chartTokens", renderTokensChart))
        return;
    const chart = makeChart("chartTokens");
    const el = byId("chartTokens");
    /** @typedef {{label: string, model: string, lowM: number, highM: number, priceCNY: number, isOfficial: boolean, url: string, note?: string, method?: string, conf?: string, vendorLowM?: number, vendorHighM?: number}} TokenChartSource */
    /** @type {TokenChartSource[]} */
    const official: TokenChartSource[] = PLAN_TOKENS.flatMap((t: { lowM: number; highM: number; vendorLowM: number; vendorHighM: number; note: string; plan: string; model: string; ref: string; url: string; }) => {
        const p = findPlanReference(t.ref);
        if (!p) {
            console.warn("[data] PLAN_TOKENS ref 未解析，已跳过:", t.ref);
            return [];
        }
        if (!isPriceConfirmed(p) || isRetiredPlan(p))
            return [];
        return [{
                label: planLabel(p) + " · " + displayModelName(t.model),
                model: t.model,
                lowM: t.lowM, highM: t.highM, vendorLowM: t.vendorLowM, vendorHighM: t.vendorHighM,
                priceCNY: toCNY(p.priceM, p.cur),
                isOfficial: true, url: t.url, note: t.note, conf: "中",
            }];
    });
    /* 已在 PLAN_TOKENS 里的档不重复。智谱国内 V3 与 Z.ai 每周额度相同，也不再画一遍。
       PLAN_TOKENS 是公布每周额度上限的档位，按官方积分系数与统一假设折算；小米 / 腾讯是月度积分池，
       摊到周并非真实周额度，不进本图。其余带每周 tokens 的行按出处着色：
       高置信且非估算视为官方额度，新厂商不会被默认涂成低置信社区估算。
       官方条数区间按结构化公式折算，其余请求数制只在额度深度对比表里呈现。 */
    const coveredPlan = new Set(PLAN_TOKENS.map((t: { lowM: number; highM: number; vendorLowM: number; vendorHighM: number; note: string; plan: string; model: string; ref: string; url: string; }) => findPlanReference(t.ref)?.id).filter(Boolean));
    const weeklyExtra = METRICS_ALL.filter((m: any) => {
        const p = m.ref != null ? findPlanReference(m.ref) : null;
        if (p && (!isPriceConfirmed(p) || isRetiredPlan(p)))
            return false;
        if (m.wkLowM == null && m.reqLowPer5h == null)
            return false;
        if (m.note && m.note.includes("系数折算"))
            return false;
        /* data.js 用 weeklyChart:false 标注与 PLAN_TOKENS 档位同额度的重复行（如智谱国内版） */
        if (m.weeklyChart === false)
            return false;
        if (coveredPlan.has(findPlanReference(m.ref)?.id))
            return false;
        return true;
    }).flatMap((e: any) => {
        const current = resolvePlan(e) || e;
        const computed = computeMetrics(current);
        if (!computed || computed.wkLowM == null || computed.wkHighM == null)
            return [];
        const prov = provenance(e);
        return [{
                label: metricChartLabel(e),
                model: e.model,
                lowM: computed.wkLowM, highM: computed.wkHighM,
                priceCNY: toCNY(current.priceM, current.cur),
                isOfficial: !e.isEst && prov.conf === "高",
                url: e.source, note: e.note,
                method: e.method || prov.text,
                conf: e.confidence || prov.conf,
            }];
    });
    const community = weeklyExtra.filter((r: { label: string; model: any; lowM: number; highM: number; priceCNY: any; isOfficial: boolean; url: any; note: any; method: any; conf: any; }) => !r.isOfficial);
    const officialBars = official.concat(weeklyExtra.filter((r: { label: string; model: any; lowM: number; highM: number; priceCNY: any; isOfficial: boolean; url: any; note: any; method: any; conf: any; }) => r.isOfficial));
    /** @typedef {TokenChartSource & {midM: number}} TokenRow */
    const rows = /** @type {TokenRow[]} */ [...officialBars, ...community].map((r: TokenChartSource | { label: string; model: any; lowM: number; highM: number; priceCNY: any; isOfficial: boolean; url: any; note: any; method: any; conf: any; }) => ({ ...r, midM: (r.lowM + r.highM) / 2 })) as TokenRow[];
    rows.sort((a: TokenRow, b: TokenRow) => b.midM - a.midM);
    el.style.height = chartHeight(rows.length, chartRowHeight(el, 30), 150, 420) + "px";
    const cats = rows.map((r: TokenRow) => r.label);
    /* 对数轴不堆叠 high-low（差值不能当作单独的 log 值）。先画到上限的淡色柱，
       再叠到下限的实色柱；每段直接使用真实端点，定额的 high=low 也能显示标签。 */
    const series = [true, false].flatMap((isOfficial: boolean) => {
        const name = isOfficial ? TOKEN_OFFICIAL_SERIES : TOKEN_EST_SERIES;
        const color = isOfficial ? TOKEN_OFFICIAL_COLOR : TOKEN_EST_COLOR;
        const data = (upper: any) => rows.map((r: TokenRow) => r.isOfficial === isOfficial && (upper ? r.highM : r.lowM) > 0
            ? { value: upper ? r.highM : r.lowM, _r: r } : null);
        return [
            { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(true),
                itemStyle: { color, opacity: 0.32, borderRadius: [0, 4, 4, 0] },
                label: { show: true, position: "right", opacity: 1, color: PAL.catLabel, fontSize: 11,
                    formatter: (d: any) => d.data && d.data._r ? weeklyTokenRange(d.data._r.lowM, d.data._r.highM) : "" } },
            { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(false),
                itemStyle: { color, borderRadius: [0, 4, 4, 0] } },
        ];
    });
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
            trigger: "item", ...tipStyle(el),
            formatter: (d: any) => {
                const r = d.data && d.data._r;
                if (!r)
                    return "";
                const prov = r.isOfficial
                    ? '<span class="conf conf-hi">官方额度折算</span>'
                    : `<span class="conf conf-${r.conf === "低" ? "lo" : "mid"}">折算/推算·${esc(r.conf || "低")}</span>`;
                const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
                const vendor = r.vendorLowM != null ? `厂商按自身用量假设另给出 ${weeklyTokenRange(r.vendorLowM, r.vendorHighM)}/周，未用于比较<br/>` : "";
                return `<b>${esc(r.label)}</b> ${prov}<br/>
            每周可用：${weeklyTokenRange(r.lowM, r.highM)} tokens（${esc(displayModelName(r.model))}）<br/>
            ${vendor}月费：${fmtCNY(r.priceCNY)} ｜ 每 ¥100/月 ≈ <b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周<br/>
            ${r.note ? `<span style="color:${PAL.dim}">${esc(trunc(r.note, 120))}</span><br/>` : ""}
            ${safeHref(r.url) ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${safeHref(r.url)}</span>` : ""}`;
            },
        },
        grid: { left: 12, right: 88, top: 20, bottom: 44, containLabel: true },
        legend: { data: [TOKEN_OFFICIAL_SERIES, TOKEN_EST_SERIES], show: false },
        xAxis: chartLogAxis(rows.flatMap((r: TokenRow) => [r.lowM, r.highM]), "百万 tokens/周"),
        yAxis: { type: "category", data: cats, inverse: true, ...axisStyle(),
            axisLabel: chartAxisLabel(el, 11.5),
            axisLine: { lineStyle: { color: PAL.axisLine } } },
        series,
    }, true);
    chart.resize();
    bindChartLegend(chart, "tokensLegend", { [TOKEN_OFFICIAL_SERIES]: TOKEN_OFFICIAL_COLOR, [TOKEN_EST_SERIES]: TOKEN_EST_COLOR });
    describeChart("chartTokens", "每周可用 tokens 对比 " + rows.length + " 行：官方额度折算 " + officialBars.length + " 行、折算或社区推算 " + community.length + " 行。采用对数刻度，相邻主刻度为十倍，淡色段表示区间上限，数值见柱尾和提示。");

}
/* ---------- API 按量价格 ---------- */
/* 图表纵轴与明细表共用「厂商 · 模型」：label 里的平台后缀（(Z.ai) / [硅基] 等）由厂商前缀承担，
   厂商名与模型名重复时（DeepSeek · DeepSeek V4-Pro）去掉重复的厂商词。 */
function apiChartLabel(a: any) {
    const vendor = shortVendor(a.vendor);
    let model = displayModelName(String(a.label || a.model).replace(/\s*[(（\[【].*$/, "").trim());
    if (model.toLowerCase().startsWith(vendor.toLowerCase() + " "))
        model = model.slice(vendor.length + 1);
    return vendor + " · " + model;
}
function renderApiChart() {
    if (deferChartRender("chartApi", renderApiChart))
        return;
    const apiEl = byId("chartApi");
    const chart = makeChart("chartApi");
    const detailRows = API_PRICES.map((a: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => {
        const inU = a.cur === "CNY" ? a.inCNY / RATE : a.inUSD;
        const outU = a.cur === "CNY" ? a.outCNY / RATE : a.outUSD;
        return { ...a, inUSD: inU, outUSD: outU };
    })
        .filter((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => a.inUSD != null && a.outUSD != null)
        .sort((x: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }, y: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => x.outUSD - y.outUSD);
    const rows = detailRows.filter((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => isPriceConfirmed(a, "api"));
    const cats = rows.map(apiChartLabel);
    apiEl.style.height = chartHeight(rows.length, chartRowHeight(apiEl, 28), 72, 640) + "px";
    const fmtPrice = (a: any, inU: any, outU: any) => a.cur === "CNY"
        ? `输入：¥${a.inCNY}/1M（≈$${inU.toFixed(2)}） ｜ 输出：¥${a.outCNY}/1M（≈$${outU.toFixed(2)}）`
        : `输入：$${a.inUSD}/1M ｜ 输出：$${a.outUSD}/1M`;
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
            trigger: "axis", ...tipStyle(apiEl), axisPointer: { type: "shadow" },
            formatter: (ps: any) => {
                const a = rows[ps[0].dataIndex];
                const href = safeHref(a.url);
                const shown = displayModelName(a.label || a.model);
                const idLine = a.model && displayModelName(a.model) !== shown ? `<span style="color:${PAL.dim}">计费 ID：${esc(a.model)}</span><br/>` : "";
                return `<b>${esc(apiChartLabel(a))}</b>${a.region === "cn" ? " · 国内" : ""}<br/>${idLine}
            ${fmtPrice(a, a.inUSD, a.outUSD)}<br/>
            ${a.note ? `<span style="color:${PAL.dim}">${esc(trunc(a.note, 120))}</span><br/>` : ""}
            ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href}</span>` : ""}`;
            },
        },
        grid: { left: 8, right: 28, top: 20, bottom: 44, containLabel: true },
        legend: { data: ["输入 / 1M tokens", "输出 / 1M tokens"], show: false },
        xAxis: chartLogAxis(rows.flatMap((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => [a.inUSD, a.outUSD]), "USD / 百万 tokens"),
        yAxis: {
            type: "category", data: cats, inverse: true, ...axisStyle(),
            axisLabel: chartAxisLabel(apiEl, 11),
        },
        series: [
            { name: "输入 / 1M tokens", type: "bar", data: rows.map((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => a.inUSD), barWidth: 7, itemStyle: { color: "#6366f1", borderRadius: [0, 3, 3, 0] } },
            { name: "输出 / 1M tokens", type: "bar", data: rows.map((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => a.outUSD), barWidth: 7, itemStyle: { color: "#f472b6", borderRadius: [0, 3, 3, 0] } },
        ],
    }, true);
    chart.resize();
    bindChartLegend(chart, "apiLegend", { "输入 / 1M tokens": "#6366f1", "输出 / 1M tokens": "#f472b6" });
    /* 购买力：$10 按输出价可购 token 量。按地区拆双系列（barGap -100% 重叠），
       图例可点击过滤国际/国内；axis 触发 + 阴影指示器与左图一致。 */
    const chart2 = makeChart("chartPower");
    const el2 = byId("chartPower");
    el2.style.height = chartHeight(rows.length, chartRowHeight(el2, 26), 120, 420) + "px";
    const power = rows.filter((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => a.outUSD > 0).map((a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }) => ({ name: apiChartLabel(a), m: 10 / a.outUSD, a }));
    power.sort((x: { name: string; m: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }, y: { name: string; m: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }) => y.m - x.m);
    const POWER_COLORS = { intl: "#22d3ee", cn: "#34d399" };
    const powerSeriesData = power.map((p: { name: string; m: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }) => {
        const item = { value: p.m, a: p.a };
        return p.a.region === "cn" ? [null, item] : [item, null];
    });
    const powerLabel = { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (d: any) => (d.value != null ? Number(d.value.toFixed(1)) + "M" : "") };
    chart2.setOption({
        backgroundColor: "transparent",
        title: { text: "$10 可购买的输出 tokens（M）", left: "center", top: 4, textStyle: { color: PAL.dim, fontSize: 12, fontWeight: 500 } },
        tooltip: {
            trigger: "axis", ...tipStyle(el2), axisPointer: { type: "shadow" },
            formatter: (ps: any) => {
                const p = power[ps[0].dataIndex];
                if (!p)
                    return "";
                const price = p.a.cur === "CNY" ? "¥" + p.a.outCNY : "$" + p.a.outUSD;
                return `<b>${esc(p.name)}</b><br/>$10 ≈ <b>${Number(p.m).toFixed(1)}M</b> 输出 tokens<br/>（${price}/1M 输出）`;
            },
        },
        legend: { data: ["国际模型", "国内模型"], show: false },
        grid: { left: 12, right: 56, top: 36, bottom: 44, containLabel: true },
        xAxis: chartLogAxis(power.map((p: { name: string; m: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }) => p.m), "百万输出 tokens"),
        yAxis: { type: "category", inverse: true, data: power.map((p: { name: string; m: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }) => p.name), ...axisStyle(), axisLabel: chartAxisLabel(el2, 11) },
        series: [
            { name: "国际模型", type: "bar", barWidth: 12, barGap: "-100%",
                data: powerSeriesData.map((d: { value: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }[]) => d[0]),
                itemStyle: { color: POWER_COLORS.intl, borderRadius: [0, 4, 4, 0] },
                label: powerLabel },
            { name: "国内模型", type: "bar", barWidth: 12, barGap: "-100%",
                data: powerSeriesData.map((d: { value: number; a: { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; } | { inUSD: number; outUSD: number; vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; apiCache?: undefined; }; }[]) => d[1]),
                itemStyle: { color: POWER_COLORS.cn, borderRadius: [0, 4, 4, 0] },
                label: powerLabel },
        ],
    }, true);
    chart2.resize();
    bindChartLegend(chart2, "powerLegend", { "国际模型": POWER_COLORS.intl, "国内模型": POWER_COLORS.cn });
    /* 明细表只有一个渲染入口：首屏与图表重绘写出同一份标签和核价状态。 */
    renderApiDetails();
    describeChart("chartApi", "API 按量单价对比 " + rows.length + " 款模型（左图）；$10 预算输出 token 购买力 " + power.length + " 行（右图）。两图采用对数刻度，相邻主刻度为十倍，完整价格见提示和下方明细。");
    describeChart("chartPower", "$10 预算输出 token 购买力 " + power.length + " 行；采用对数刻度，相邻主刻度为十倍。使用图例按钮筛选国内或国际模型，完整数值见下方明细。");
}
/* ---------- 免费入口 ---------- */
/* 免费入口按地区和类型筛选（本页内状态，不写入分享链接）；手机上 20 张卡不必整页滚完。 */
const freeState = appState({ region: "all", kind: "all" });
function freeKind(p: any) { return hasIncludedModelQuota(p) ? "included" : "byok"; }
function renderFree() {
    // Text, controls and accessible tables are rendered by Vue.
}
/* ---------- 性价比排行图（每 M tokens 成本） ---------- */
/* scope: credits=官方口径折算（积分系数/credits 面值/官方区间，中置信及以上）；all=含全部估算（低置信）。
   目前没有厂商直接公布可跨家比较的每周 tokens，旧的 official 口径并入 credits。 */
function rankScopeOk(m: any) {
    /* 无牌价的 credits 面值只能按假设单价折算，说明里承诺不进入排行，任何口径都排除。 */
    if ((m.creditCNY != null || m.creditUSD != null) && typeof m.apiIn !== "number")
        return false;
    if (rankState.scope === "all")
        return true;
    return provenance(m).conf !== "低";
}
/* 实心柱：依据官方额度规则（中置信及以上）；斜纹柱与 ≈：第三方或请求次数估算。 */
function rankIsEstimate(m: any) { return provenance(m).conf === "低"; }
/* 排行两组 chip 的高亮与 aria-pressed 以 rankState 为准（URL 恢复与点击共用） */
function syncRankChips() {
    // Text, controls and accessible tables are rendered by Vue.
}
function rankVendorLabel(vendor: any) {
    return { Anthropic: "Claude（Anthropic）", OpenAI: "ChatGPT（OpenAI）", "月之暗面 Kimi": "Kimi（月之暗面）" }[vendor] || shortVendor(vendor);
}
function populateRankVendor() {
    // Text, controls and accessible tables are rendered by Vue.
}
/* 名称和价格每次从主表解析；额度成本按原始指标行缓存，价格或币种变化时重算，
   避免每次重绘对同一行重复计算。中转站不和官方订阅比单价（个人价格图与帮我选同一规则）。 */
const rankCostCache = new WeakMap();
function rankPaymentLabel() { return rankState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : "目录月付标价"; }
function rankRowPaymentLabel(m: any) {
    const p = rankState.fromPicker ? pickerPlanForMetric(m) : null;
    return rankPaymentLabel() + (p && pickerPaymentQuote(p).inferred ? "（未单列续费价，按标价）" : "");
}
function rankCandidateRows(usePicker: boolean = rankState.fromPicker) {
    return METRICS_ALL.flatMap((raw: any) => {
        const plan = raw.ref != null ? findPlanReference(raw.ref) : null;
        if (plan && isRelay(plan))
            return [];
        const listed = resolvePlan(raw);
        const m = listed && usePicker ? pickerMetricInput(listed) : listed;
        if (!m || !metricOfferOk(m))
            return [];
        const key = m.priceM + "|" + m.cur;
        let hit = rankCostCache.get(raw);
        if (!hit || hit.key !== key) {
            hit = { key, c: computeMetrics(m) };
            rankCostCache.set(raw, hit);
        }
        return hit.c && hit.c.costPerM != null ? [{ m, c: hit.c }] : [];
    });
}
/* 先按官方额度规则折算的档位排，再排第三方或请求次数估算；低置信估算不会排在可靠数据之前。 */
function rankRows(vendor: string = rankState.vendor || "all") {
    return rankCandidateRows()
        .filter((r: { m: any; c: any; }) => vendor === "all" || r.m.vendor === vendor)
        .filter((r: { m: any; c: any; }) => rankScopeOk(r.m))
        .filter((r: { m: any; c: any; }) => rankState.tier !== "flagship" || isFlagshipModelName(r.m.model))
        .sort((a: { m: any; c: any; }, b: { m: any; c: any; }) => Number(rankIsEstimate(a.m)) - Number(rankIsEstimate(b.m)) || a.c.costPerM - b.c.costPerM);
}
/* 图高有限：两组都有时至少给估算 8 个位置，Claude、ChatGPT 等只有估算的厂商仍能在图上看到。 */
const RANK_CHART_LIMIT = 20;
function rankChartRows(all: any) {
    const official = all.filter((r: any) => !rankIsEstimate(r.m));
    const estimates = all.filter((r: any) => rankIsEstimate(r.m));
    if (!official.length || !estimates.length)
        return all.slice(0, RANK_CHART_LIMIT);
    const estimateSlots = Math.min(estimates.length, Math.max(RANK_CHART_LIMIT - official.length, 8));
    return official.slice(0, RANK_CHART_LIMIT - estimateSlots).concat(estimates.slice(0, estimateSlots));
}
const RANK_ESTIMATE_DIVIDER = "以下为第三方或请求次数估算（置信低）";
function renderRankDetails() {
    // Text, controls and accessible tables are rendered by Vue.
}
function renderRankChart() {

    if (typeof syncPickerScopeControls === "function")
        syncPickerScopeControls();
    if (deferChartRender("chartRank", renderRankChart))
        return;
    const all = rankRows();
    const rows = rankChartRows(all);
    describeChart("chartRank", "每百万 tokens 成本排行（" + rankPaymentLabel() + " ÷ 参考月量区间中点，¥，越低越划算）前三：" +
        rows.slice(0, 3).map((r: any) => planLabel(r.m) + " ¥" + r.c.costPerM.toFixed(3)).join("、") + "。先列依据官方额度规则折算的档位（实色柱），再列第三方或请求次数估算（斜纹柱），不确定区间见提示及完整明细。");
    const el = byId("chartRank");
    /* 两组之间插入一行分隔标签，柱值为空。 */
    const firstEstimate = rows.findIndex((r: any) => rankIsEstimate(r.m));
    const items = firstEstimate > 0 ? [...rows.slice(0, firstEstimate), null, ...rows.slice(firstEstimate)] : rows;
    el.style.height = chartHeight(items.length, chartRowHeight(el, 30), 130, 420) + "px";
    const chart = makeChart("chartRank");
    const labels = items.map((r: any) => r ? (rankIsEstimate(r.m) ? "≈" : "") + metricChartLabel(r.m) : "— " + RANK_ESTIMATE_DIVIDER + " —");
    const data = items.map((r: any) => {
        if (!r)
            return { value: null };
        const cp = r.c.costPerM;
        const tier = cpmTier(cp);
        const color = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
        const approx = rankIsEstimate(r.m);
        return { value: cp, itemStyle: { color, borderRadius: [0, 4, 4, 0],
                ...(approx ? { decal: { symbol: "rect", symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4,
                        color: "rgba(255,255,255,.65)", backgroundColor: "transparent" } } : {}) }, _r: r };
    });
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
            trigger: "item", ...tipStyle(el),
            formatter: (d: any) => {
                const r = d.data && d.data._r;
                if (!r)
                    return "";
                const prov = provenance(r.m);
                const cp = r.c.costPerM;
                const tier = cpmTier(cp);
                const cpColor = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
                const mo = r.c.moLow == null
                    ? "—"
                    : `约 ${fmtTok(r.c.moLow)}${r.c.moHigh > r.c.moLow ? "–" + fmtTok(r.c.moHigh) : ""}`;
                const rate = r.c.rmo == null ? "—" : `${r.c.rmo.toFixed(1)}×`;
                return `<b>${esc(planLabel(r.m))}</b>（${esc(displayModelName(r.m.model))}）<br/>
            💵每 M tokens：<b style="color:${cpColor}">¥${cp.toFixed(3)}</b><br/>
            ${fullUseCostRangeText(r.c) ? esc(fullUseCostRangeText(r.c)) + "（用尽对应额度）<br/>" : ""}
            ${esc(rankRowPaymentLabel(r.m))}：${fmtCNY(r.c.priceCNY)} ｜ 月倍率：<b>${rate}</b><br/>
            月 tokens：${mo}<br/>
            <span style="color:${PAL.dim}">依据：${esc(prov.text)} · 置信${esc(prov.conf)}${prov.conf !== "高" ? "（tokens 为折算/估算值）" : ""}</span>
            ${r.m.vendorWkLowM != null ? `<br/><span style="color:${PAL.dim}">厂商按自身用量假设另给出 ${weeklyTokenRange(r.m.vendorWkLowM, r.m.vendorWkHighM)}/周，未用于排行</span>` : ""}`;
            },
        },
        grid: { left: 12, right: 76, top: 20, bottom: 44, containLabel: true },
        xAxis: { type: "value", name: "¥ / 百万 tokens", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
        yAxis: {
            type: "category", data: labels, inverse: true, ...axisStyle(),
            axisLabel: chartAxisLabel(el, 11.5),
            axisLine: { lineStyle: { color: PAL.axisLine } },
        },
        series: [{
                type: "bar", data, barWidth: 18,
                label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d: any) => typeof d.value === "number" ? "¥" + d.value.toFixed(3) : "" },
            }],
    }, true);
    chart.resize();

}
/* 文字明细独立于 ECharts；图表库加载失败也能查完整牌价与核查来源。 */
function renderApiDetails() {
    // Text, controls and accessible tables are rendered by Vue.
}

/* SOURCE: js/app-picker.js */
/* ============ Coding Plan 比价中心 — 帮我选 ============ */
"use strict";
/* 预算比较的容差：CNY 价格带小数，浮点相等判断统一加这一点余量 */
const BUDGET_EPS = 0.05;
const PICKER_BILLING_LABELS = { M: "月付标价", A: "自动续费", Y: "年付" };
/* 普通月订阅本身按标价自动续费；已核价的连续包月价从不高于标价，所以未单列时按标价计，作为预算上限并在卡片注明。
   一次性、预付、每 4 周收费和仅老用户续费不属于此类。 */
function renewsAtListPrice(p: any) {
    return p.priceM > 0 && !isOneTimePlan(p) && !isFourWeekPlan(p) && !isRenewalOnly(p);
}
/* 付款方式是预算与展示的共同口径。缺少年价时保留未知，不挪用月价。 */
function pickerPaymentQuote(p: any, billing: string = pickerState.billing) {
    const mode = Object.prototype.hasOwnProperty.call(PICKER_BILLING_LABELS, billing) ? billing : "M";
    const label = PICKER_BILLING_LABELS[mode];
    let monthlyNative = p.priceM;
    let inferred = false;
    /* 月付标价按不连续续费也能买到的单月价比较；少数档的主标价是连续包月价，另记 singleMonthPrice。 */
    if (p.priceM > 0 && mode === "M" && p.singleMonthPrice > 0)
        monthlyNative = p.singleMonthPrice;
    if (p.priceM > 0 && mode === "A") {
        if (p.autoRenewMonthly != null)
            monthlyNative = p.autoRenewMonthly;
        else if (renewsAtListPrice(p))
            inferred = true;
        else
            monthlyNative = null;
    }
    if (p.priceM > 0 && mode === "Y")
        monthlyNative = p.priceY;
    const available = Number.isFinite(monthlyNative) && (p.priceM === 0 ? monthlyNative === 0 : monthlyNative > 0);
    const annualNative = available ? (mode === "Y" ? pickerAnnualNative(p) : monthlyNative * 12) : null;
    if (available && mode === "Y")
        monthlyNative = annualNative / 12;
    const firstNative = available ? (mode === "Y" ? annualNative : monthlyNative) : null;
    return { mode, label, cur: p.cur, available, inferred: available && inferred, monthlyNative: available ? monthlyNative : null,
        monthlyCNY: available ? toCNY(monthlyNative, p.cur) : null, firstNative,
        renewalNative: firstNative, annualNative, annualApprox: mode === "Y" && p.priceM > 0 && pickerAnnualExact(p) == null,
        periodMonths: mode === "Y" ? 12 : 1 };
}
/* 未知价格排在已知价格之后；返回有限数，排序比较不会出现 Infinity - Infinity。 */
const PICKER_UNKNOWN_PRICE = 1e12;
function pickerMonthlyCNY(p: any) { return pickerPaymentQuote(p).monthlyCNY ?? PICKER_UNKNOWN_PRICE; }
function pickerFirstPaymentText(p: any) {
    const quote = pickerPaymentQuote(p);
    return (quote.annualApprox && quote.available ? "约 " : "") + pickerMoney(quote.firstNative, quote.cur);
}
function pickerAnnualExact(p: any) {
    return Number.isFinite(p.annualTotal) && p.annualTotal > 0 ? p.annualTotal : null;
}
function pickerAnnualNative(p: any) {
    if (!(p.priceY > 0))
        return p.priceM === 0 ? 0 : null;
    return pickerAnnualExact(p) ?? p.priceY * 12;
}
function matchesPickerPurchase(p: any) { return withinBudget(p); }
function pickerPlanForMetric(m: any) {
    return m.ref != null ? findPlanReference(m.ref) : PLANS.find((p: Plan) => p.vendor === m.vendor && p.plan === m.plan) || null;
}
function pickerMetricInput(m: any) {
    const p = pickerPlanForMetric(m);
    if (!p || !matchesPickerPurchase(p))
        return null;
    return { ...m, priceM: pickerPaymentQuote(p).monthlyNative, cur: p.cur };
}
function refreshPickerScopes() {
    if (personalState.fromPicker)
        renderPersonalChart();
    if (tableState.fromPicker)
        renderTable();
    if (metricsState.fromPicker)
        renderMetricsTable();
    if (rankState.fromPicker)
        renderRankChart();
    if (typeof syncPickerScopeControls === "function")
        syncPickerScopeControls();
}
/* 选了具体工具时，该工具自家厂商的订阅单独出一张对照卡（如点 Cursor 给 Cursor Pro）。
   自家订阅不一定赢下主计划（比如 Cursor 的旗舰走按量池），但不该从推荐里消失。 */
const TOOL_OWN_VENDOR = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };
function pickerToolRelationship(p: any) {
    const vendor = TOOL_OWN_VENDOR[pickerState.tool];
    if (!vendor)
        return "";
    const tool = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" }[pickerState.tool];
    if (p.vendor === vendor)
        return `${tool} 自家订阅，模型与额度由 ${vendor} 提供。`;
    const modelNote = pickerState.tool === "claude" ? "；支持 Claude Code 不代表附赠 Claude 模型"
        : pickerState.tool === "codex" ? "；支持 Codex 不代表附赠 OpenAI 模型" : "";
    return `${tool} 兼容接入，模型与额度由 ${shortVendor(p.vendor)} 提供${modelNote}。`;
}
function metricMatchesPlan(m: any, p: any) {
    if (m.ref != null)
        return findPlanReference(m.ref) === p;
    return m.vendor === p.vendor && m.plan === p.plan;
}
function hasCodingSurface(p: any) {
    if (typeof p.codingSurface === "boolean")
        return p.codingSurface;
    const tools = resolvedField(p, "tools");
    if (/Claude Code/i.test(tools) || /\bCodex\b/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
        return true;
    return hasOwnClient(p);
}
/* 通用推荐排除国家限定套餐；工具免费不等于模型推理免费。 */
function recommendablePlan(p: any) {
    return isPriceConfirmed(p) && !isRelay(p) && !isRetiredPlan(p) && offerable(p) && hasCodingSurface(p) &&
        hasIncludedModelQuota(p) && isPurchaseCountryAllowed(p, "");
}
function matchesTool(p: any, tool: any) {
    if (tool === "any")
        return true;
    const tools = resolvedField(p, "tools");
    if (tool === "claude")
        return /Claude Code/i.test(tools);
    if (tool === "codex")
        return /Codex/i.test(tools);
    if (tool === "cursor")
        return p.vendor === "Cursor" || /\bCursor\b/i.test(tools);
    if (tool === "own") {
        if (typeof p.ownClient === "boolean")
            return p.ownClient;
        if (/Claude Code/i.test(tools) || /Codex/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
            return false;
        return hasOwnClient(p);
    }
    return true;
}
function planTitle(p: any) {
    const parts = String(p.vendor || "").split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && String(p.plan || "").startsWith(last))
        return parts.slice(0, -1).concat(p.plan).join(" ");
    return `${p.vendor} ${p.plan}`;
}
function priceLine(p: any) {
    if (p.priceM === 0)
        return "免费";
    const quote = pickerPaymentQuote(p);
    if (!quote.available)
        return "未列公开" + quote.label + "价格";
    return pickerMoney(quote.monthlyNative, p.cur) + "/月" + (quote.mode === "Y" ? "（年付折月）" : "") +
        (p.cur === "CNY" ? "" : "，约 " + fmtCNY(quote.monthlyCNY));
}
function bandRank(band: any) { return band === "A" ? 3 : band === "B" ? 2 : 1; }
function catRank(p: any) { return p.cat === "official" ? 3 : p.cat === "tool" ? 2 : p.cat === "cloud" ? 1 : 0; }
/* 计划名里的 5x / 20x 优先（× 和 x 都算）。额度原文里的「5× Pro」也算加窗；「5× Free」只是入门档基线。
   额度文案统一走 resolvedField，继承行（「同某档」）也能命中倍率写法。 */
function multiplier(p: any) {
    const fromPlan = String(p.plan || "").match(/(\d+)\s*[x×]/i);
    if (fromPlan)
        return Number(fromPlan[1]);
    const q = resolvedField(p, "quota") || "";
    const named = q.match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
    if (named)
        return Number(named[1]);
    if (/(\d+)\s*×\s*Free/i.test(q))
        return 1;
    return 0;
}
function splitModelAccess(text: any) {
    const parts = String(text || "").split(/[；;]/);
    if (parts.length >= 2 && /按(?:\s*M\s*token|牌价|量)/.test(parts[parts.length - 1])) {
        return { included: parts.slice(0, -1).join("；"), metered: parts[parts.length - 1] };
    }
    return { included: String(text || ""), metered: "" };
}
function modelTextForRoles(p: any) {
    const own = resolvedField(p, "models");
    if (matchModelRoles(own).length)
        return own;
    if (!/旗舰|同级|全模型|全系/.test(own))
        return own;
    const idx = PLANS.indexOf(p);
    for (let i = idx - 1; i >= 0; i--) {
        if (PLANS[i].vendor !== p.vendor)
            break;
        const prev = resolvedField(PLANS[i], "models");
        if (matchModelRoles(prev).some((r: { id: string; name: string; re: RegExp; task: string; burn: string; band: string; ceiling: boolean; reason: string; asOf: string; } | { id: string; name: string; re: RegExp; task: string; burn: string; band: string; reason: string; asOf: string; ceiling?: undefined; }) => r.task === "hard"))
            return prev;
    }
    return own;
}
/* 每层先应用自己的排除，再合并上层增补；Pro 的“不含旗舰”不会否定 Pro+ 新增 Opus。 */
function modelRoleAccess(p: any, seen: Set<any> = new Set()) {
    if (!p || seen.has(p))
        return { included: [], metered: [] };
    const stack = new Set(seen);
    stack.add(p);
    const base = p.modelBaseRef != null ? findPlanReference(p.modelBaseRef) : null;
    if (p.modelBaseRef != null && !base)
        return { included: [], metered: [] };
    const inherited = base ? modelRoleAccess(base, stack) : { included: [], metered: [] };
    const local = Array.isArray(p.modelIncludes) ? p.modelIncludes.join("、")
        : p.modelBaseRef != null ? p.models : modelTextForRoles(p);
    const access = splitModelAccess(local);
    const excluded = p.modelExcludes || [];
    const merge = (previous: any, text: any) => [...new Map(previous.concat(matchModelRoles(text)).map((r: any) => [r.id, r])).values()]
        .filter((r: any) => !excluded.some((name: any) => r.re.test(name)));
    return { included: merge(inherited.included, access.included), metered: merge(inherited.metered, access.metered) };
}
/* 重置周期和模型之间的共享关系是两个独立事实。
   不同模型的条数区间并不能证明它们拥有独立额度池；未公开时保留 unknown。 */
function quotaWindowPeriod(p: any) { return p.windowPeriod || "unknown"; }
function quotaSharing(p: any) { return p.quotaSharing || "unknown"; }
function oneSharedWindow(p: any) {
    return quotaWindowPeriod(p) === "5h" && quotaSharing(p) === "shared";
}
function roleUseText(role: any) {
    if (!role)
        return "";
    if (role.ceiling)
        return "复杂任务的高强度选项，实际消耗以套餐说明为准";
    return role.task === "hard" ? "适合复杂编码和重构任务" : "适合日常编码和轻量任务";
}
/* 用途角色按系列匹配；显示版本仍须来自本档权益，不能用角色名称替换旧版模型。 */
function roleDisplayName(p: any, role: any) {
    if (!role)
        return "";
    const text = splitModelAccess(resolvedField(p, "models")).included;
    if (role.id === "glm-5") {
        const listed = [...text.matchAll(/\bGLM[\s-]*(5(?:\.\d+)?)(?![\d.]|[\w.-]*flash)/gi)]
            .map((m: RegExpExecArray) => `GLM-${m[1]}`).filter((name: string) => typeof publicModelIncluded !== "function" || publicModelIncluded(p, name));
        return listed.length ? listed.sort((a: string, b: string) => Number(b.slice(4)) - Number(a.slice(4)))[0] : "GLM-5 系列";
    }
    const gptVariant = { "gpt-sol": "Sol", "luna": "Luna", "gpt-astra": "Astra" }[role.id];
    if (gptVariant) {
        const explicit = new RegExp("\\bGPT[\\s-]*(\\d+(?:\\.\\d+)?)[\\s-]+" + gptVariant + "\\b", "gi");
        const versions = [...text.matchAll(explicit)].map((m: RegExpExecArray) => m[1]);
        /* 现有权益匹配器核对 GPT-6 Sol / Luna / Astra 的共享版本简称。 */
        if (p.vendor === "OpenAI" && typeof publicModelIncluded === "function") {
            versions.push(...[...text.matchAll(/\bGPT[\s-]*(\d+(?:\.\d+)?)[\s-]+(?:Sol|Luna|Astra)\b/gi)].map((m: RegExpExecArray) => m[1]));
        }
        const groups = [...text.matchAll(/\bGPT[\s-]*(\d+(?:\.\d+)?)\s*全系[（(]([^）)]+)[）)]/gi)];
        for (const group of groups) {
            for (const member of group[2].split("/")) {
                const variant = member.trim().match(new RegExp("^(?:(\\d+(?:\\.\\d+)?)\\s+)?" + gptVariant + "$", "i"));
                if (variant)
                    versions.push(variant[1] || group[1]);
            }
        }
        const included = versions.filter((version: string) => typeof publicModelIncluded !== "function" || publicModelIncluded(p, `GPT-${version} ${gptVariant}`));
        if (included.length)
            return `GPT-${included.sort((a: string, b: string) => Number(b) - Number(a))[0]} ${gptVariant}`;
        return `GPT ${gptVariant} 系列`;
    }
    return role.name;
}
function quotaLabel(p: any) {
    const period = quotaWindowPeriod(p);
    return period === "5h" ? "5 小时窗口" : period === "month" ? "月度额度" : "额度规则";
}
function metricForRole(p: any, role: any) {
    if (!role)
        return null;
    const rows = METRICS_ALL
        .filter((m: any) => metricMatchesPlan(m, p) && role.re.test(m.model || ""))
        .map((m: any) => ({ m, c: computeMetrics(m), conf: provenance(m).conf }))
        .filter((r: { m: any; c: MetricsResult; conf: any; }) => r.c);
    const rank = { "高": 3, "中": 2, "低": 1 };
    rows.sort((a: { m: any; c: MetricsResult; conf: any; }, b: { m: any; c: MetricsResult; conf: any; }) => (rank[b.conf] || 0) - (rank[a.conf] || 0) || ((a.m.isEst ? 1 : 0) - (b.m.isEst ? 1 : 0)));
    return rows[0] || null;
}
/* 额度依据：高置信或按官方额度规则（积分系数、credits 面值、官方区间）统一折算的中置信行；
   第三方毛利反推与请求次数折算只作参考，不当作已知额度。推荐按区间下限保守比较，仍不保证实际可用量。 */
function tokenEvidence(p: any, role: any) {
    const met = metricForRole(p, role);
    if (!met || (met.conf !== "高" && met.conf !== "中") || met.c.moLow == null)
        return null;
    return { tokens: met.c.moLow, conf: met.conf, method: met.m.method || provenance(met.m).text };
}
function knownTokens(p: any, role: any) {
    const evidence = tokenEvidence(p, role);
    return evidence ? evidence.tokens : 0;
}
function tokenEvidenceText(p: any, role: any) {
    const evidence = tokenEvidence(p, role);
    return evidence ? `按${evidence.method}，保守参考下限约 ${fmtTok(evidence.tokens)} tokens/月（统一假设，置信${evidence.conf}）` : "";
}
function planProfile(p: any) {
    const access = modelRoleAccess(p);
    const hasQuota = hasIncludedModelQuota(p);
    const included = hasQuota ? access.included : [];
    const metered = hasQuota ? access.metered : access.included.concat(access.metered);
    const hard = included.filter((r: any) => r.task === "hard" && !r.ceiling);
    const ceilings = included.filter((r: any) => r.task === "hard" && r.ceiling);
    hard.sort((a: any, b: any) => bandRank(b.band) - bandRank(a.band));
    ceilings.sort((a: any, b: any) => bandRank(b.band) - bandRank(a.band));
    const headline = hard[0] || ceilings[0] || null;
    const loose = included.filter((r: any) => r.task === "daily" && r.burn === "slow");
    const shared = oneSharedWindow(p);
    const windowPeriod = quotaWindowPeriod(p);
    const sharing = quotaSharing(p);
    return { p, included, metered, headline, ceilings, loose, shared, windowPeriod, sharing,
        internalDaily: sharing === "separate" ? loose : [] };
}
function windowStats(x: any) {
    const role = x.headline || x.loose[0];
    return { tokens: knownTokens(x.p, role), mult: multiplier(x.p), price: pickerMonthlyCNY(x.p) || 0 };
}
function betterWindow(a: any, b: any) {
    const A = windowStats(a);
    const B = windowStats(b);
    if (A.tokens !== B.tokens)
        return A.tokens > B.tokens;
    if (A.mult !== B.mult)
        return A.mult > B.mult;
    /* tokens 与倍率完全打平时取更便宜的：代表档收敛的是「同厂商同角色的性价比之选」 */
    return A.price < B.price;
}
function tokSpan(c: any, keyLow: any, keyHigh: any) {
    const lo = c[keyLow];
    const hi = c[keyHigh];
    if (hi > lo * 1.05)
        return fmtTok(lo) + "–" + fmtTok(hi);
    return fmtTok(lo);
}
/* 满额成本区间与额度上下界反向对应；固定额度不制造额外不确定性。 */
function fullUseCostRange(c: any) {
    if (!(c.priceCNY > 0 && c.moLow > 0 && c.moHigh > c.moLow))
        return null;
    return [c.priceCNY / c.moHigh, c.priceCNY / c.moLow];
}
function fullUseCostRangeText(c: any) {
    const range = fullUseCostRange(c);
    return range ? `参考区间 ¥${range[0].toFixed(3)}–¥${range[1].toFixed(3)}/M` : "";
}
function windowSentence(p: any, role: any) {
    const period = quotaWindowPeriod(p);
    const q = String(resolvedField(p, "quota")).replace(/\s+/g, " ");
    if (period === "none")
        return `目前没有 5 小时上限；总体用量仍以官方仪表盘为准。原文：${trunc(q, 96)}`;
    if (period === "month")
        return `额度按月计量；具体重置和超额规则请核对官网。原文：${trunc(q, 96)}`;
    if (period === "unknown")
        return `额度重置周期或窗口上限未公开。原文：${trunc(q, 96)}`;
    const met = metricForRole(p, role);
    if (met && met.conf === "高" && met.c.fLow != null) {
        return `5 小时窗口按官方每周额度折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens。`;
    }
    if (met && met.conf === "中" && met.c.fLow != null && met.m.wkLowM != null && /系数折算/.test(met.m.note || "")) {
        return `5 小时窗口按官方每周积分与抵扣系数、统一假设折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens，置信度中。`;
    }
    const bit = dailyRoleBit(role);
    if (new RegExp(escRe(bit), "i").test(q) && /5\s*小时|\/5h/i.test(q)) {
        return `5 小时窗口按官方原文：${trunc(q, 96)}`;
    }
    if (met && met.conf === "中" && met.c.fLow != null) {
        return `5 小时窗口按${met.m.method || provenance(met.m).text}大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens，置信度中。`;
    }
    if (/5\s*小时|\/5h/i.test(q))
        return `官方没有公布这个模型的 5 小时 token 数。原文：${trunc(q, 80)}`;
    return `官方没有公布 5 小时窗口。额度原文：${trunc(q, 72)}`;
}
function withinBudget(p: any) {
    if (!recommendablePlan(p))
        return false;
    if (pickerState.region !== "all" && p.region !== pickerState.region)
        return false;
    if (!matchesTool(p, pickerState.tool))
        return false;
    if (pickerState.budget === "0")
        return isFreeCodingEntry(p);
    if (!isPersonalMonthly(p))
        return false;
    if (!pickerPaymentQuote(p).available)
        return false;
    if (pickerState.budget === "any")
        return true;
    return (pickerMonthlyCNY(p) || 0) <= Number(pickerState.budget) + BUDGET_EPS;
}
function eligibleProfiles() {
    return PLANS.filter(withinBudget).map(planProfile);
}
function representatives(list: any, keyOf: any, better?: any) {
    const pick = better || betterWindow;
    const best = new Map();
    list.forEach((x: any) => {
        const key = keyOf(x);
        const prev = best.get(key);
        if (!prev || pick(x, prev))
            best.set(key, x);
    });
    return [...best.values()];
}
function betterDailyTier(a: any, b: any) {
    const sa = hasSeparateDaily(a) ? 1 : 0;
    const sb = hasSeparateDaily(b) ? 1 : 0;
    if (sa !== sb)
        return sa > sb;
    const ta = knownTokens(a.p, a.loose[0]);
    const tb = knownTokens(b.p, b.loose[0]);
    if (ta !== tb)
        return ta > tb;
    const ma = multiplier(a.p);
    const mb = multiplier(b.p);
    if (ma !== mb)
        return ma > mb;
    return (pickerMonthlyCNY(a.p) || 0) < (pickerMonthlyCNY(b.p) || 0);
}
/* 推荐偏好只改变同一候选池里的先后，不改变预算、地区、工具和任务等资格条件。
   额度优先是默认；模型能力只按 DeepSWE v1.1 已公布成绩比较，未上榜的排在后面，不跨评测合成分数；
   价格优先先比所选付款方式的月均价。 */
const PICKER_PRIORITY_LABELS = { quota: "额度优先", ability: "模型能力优先", price: "价格优先" };
function pickerPriority() { return Object.prototype.hasOwnProperty.call(PICKER_PRIORITY_LABELS, pickerState.priority) ? pickerState.priority : "quota"; }
/* 同一轮渲染里反复比较同一档位，评测匹配要跑多个正则；按「套餐 + 角色」缓存，renderPicker 每轮清空。 */
let pickerAbilityCache = new Map();
function abilityHit(p: any, role: any) {
    if (!p || !role || typeof planProtocolScore !== "function")
        return null;
    const key = p.id + "|" + role.id;
    if (!pickerAbilityCache.has(key))
        pickerAbilityCache.set(key, planProtocolScore(p, role));
    return pickerAbilityCache.get(key);
}
function abilityValue(p: any, role: any) {
    const hit = abilityHit(p, role);
    return hit ? hit.row.score : -1;
}
/* 价格优先时同厂商同角色保留月费最低的一档，月费相同再按原规则比较额度。 */
function cheaperThen(better: any) {
    return (a: any, b: any) => {
        const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
        return Math.abs(diff) > BUDGET_EPS ? diff < 0 : better(a, b);
    };
}
/* 复杂任务主计划的排序（额度优先）：模型档位 → 可折算额度 → 倍率 → 套餐类别 → 编程入口 → 月费。 */
function hardMainOrder(a: any, b: any, withPrice: boolean = true) {
    const priority = pickerPriority();
    if (priority === "price" && withPrice) {
        const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
        if (Math.abs(diff) > BUDGET_EPS)
            return diff;
    }
    if (priority === "ability") {
        const diff = abilityValue(b.p, b.headline) - abilityValue(a.p, a.headline);
        if (diff)
            return diff;
    }
    return bandRank(b.headline.band) - bandRank(a.headline.band)
        || knownTokens(b.p, b.headline) - knownTokens(a.p, a.headline)
        || multiplier(b.p) - multiplier(a.p)
        || catRank(b.p) - catRank(a.p)
        || (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0)
        || (withPrice ? (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0) : 0);
}
/* 同厂商同主力模型只保留一档代表：价格优先保留最便宜的一档，其余偏好保留额度最大的一档。 */
function hardRepresentatives(pool: any) {
    return representatives(pool.filter((x: any) => x.headline), (x: any) => x.p.vendor + "|" + x.headline.id, pickerPriority() === "price" ? cheaperThen(betterWindow) : betterWindow);
}
function chooseHardMain(pool: any) {
    const reps = hardRepresentatives(pool);
    reps.sort((a: any, b: any) => hardMainOrder(a, b));
    return reps[0] || null;
}
/* 额度都无法折算、其余条件也打平时，实际由月费决定；主卡要直说，避免把「更便宜」读成能力或额度更好。 */
function priceDecidedMain(main: any, pool: any) {
    if (pickerState.task === "daily" || !main.headline || knownTokens(main.p, main.headline) > 0)
        return false;
    return hardRepresentatives(pool).some((x: any) => x.p !== main.p && hardMainOrder(main, x, false) === 0 &&
        (pickerMonthlyCNY(x.p) || 0) > (pickerMonthlyCNY(main.p) || 0) + BUDGET_EPS);
}
function dailyRepresentatives(pool: any) {
    return representatives(pool.filter((x: any) => x.loose.length), (x: any) => x.p.vendor + "|" + x.loose[0].id, pickerPriority() === "price" ? cheaperThen(betterDailyTier) : betterDailyTier);
}
function dailyOrder(a: any, b: any) {
    const priority = pickerPriority();
    if (priority === "price") {
        const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
        if (Math.abs(diff) > BUDGET_EPS)
            return diff;
    }
    if (priority === "ability") {
        const diff = abilityValue(b.p, b.loose[0]) - abilityValue(a.p, a.loose[0]);
        if (diff)
            return diff;
    }
    return 0;
}
/* 日常主计划的排序（额度优先）：独立日常池 → 纯日常档 → 可折算额度 → 月费。 */
function dailyMainOrder(a: any, b: any) {
    const preferred = dailyOrder(a, b);
    if (preferred)
        return preferred;
    const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
    if (sep)
        return sep;
    const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
    if (pure)
        return pure;
    const tok = knownTokens(b.p, b.loose[0]) - knownTokens(a.p, a.loose[0]);
    if (tok)
        return tok;
    return (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
}
function chooseDailyMain(pool: any) {
    const reps = dailyRepresentatives(pool);
    reps.sort(dailyMainOrder);
    return reps[0] || null;
}
function chooseMain(pool: any) {
    if (pickerState.task === "daily")
        return chooseDailyMain(pool);
    return chooseHardMain(pool) || (pickerState.task === "both" ? chooseDailyMain(pool) : null);
}
/* 当前偏好下排在最前的几档（主计划居首），对比表与推荐摘要共用同一顺序。 */
function rankedCandidates(pool: any, main: any, limit: number = 3) {
    if (!main)
        return [];
    const hard = pickerState.task === "daily" ? [] : hardRepresentatives(pool).sort((a: any, b: any) => hardMainOrder(a, b));
    const daily = pickerState.task === "hard" ? [] : dailyRepresentatives(pool).filter((x: any) => pickerState.task === "daily" || !x.headline).sort(dailyMainOrder);
    const list = [main];
    for (const x of pickerState.task === "daily" ? daily : hard.concat(daily)) {
        if (list.length >= limit)
            break;
        if (!list.some((y: any) => y.p === x.p))
            list.push(x);
    }
    return list;
}
function candidateRole(x: any) { return pickerState.task === "daily" || !x.headline ? x.loose[0] : x.headline; }
function abilityText(x: any) {
    const hit = abilityHit(x.p, candidateRole(x));
    return hit ? `第 ${hit.row.rank}/${hit.protocol.total} 名 · ${publicScoreText(hit.row.score, hit.protocol.unit)}` : "未上榜";
}
function quotaEvidenceText(x: any) {
    const evidence = tokenEvidence(x.p, candidateRole(x));
    return evidence ? `约 ${fmtTok(evidence.tokens)}/月 · 置信${evidence.conf}` : "未公开";
}
/* 纯文本摘要便于转发到聊天工具；金额与额度沿用页面同一口径，链接带上当前条件。 */
function pickerSummaryText(url: any) {
    const pool = eligibleProfiles();
    const main = chooseMain(pool);
    const tool = { any: "不限工具", claude: "Claude Code", codex: "Codex", cursor: "Cursor", own: "自家工具" }[pickerState.tool] || "不限工具";
    const task = { hard: "复杂为主", both: "复杂和日常", daily: "日常为主" }[pickerState.task] || "";
    const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "≤¥" + pickerState.budget;
    const region = { cn: "国内", intl: "国际", all: "不限地区" }[pickerState.region] || "";
    const lines = [`Coding Plan 比价中心 · 推荐摘要（数据版本 ${META.updated}）`,
        `条件：${budget} · ${region} · ${tool} · ${task} · ${PICKER_BILLING_LABELS[pickerState.billing]} · ${PICKER_PRIORITY_LABELS[pickerPriority()]}`];
    if (!main)
        lines.push("当前条件没有匹配的套餐：" + pickerEmptyReason(pool));
    else
        rankedCandidates(pool, main).forEach((x: any, i: number) => {
            const role = candidateRole(x);
            lines.push(`${i === 0 ? "主计划" : "候选 " + (i + 1)}：${planTitle(x.p)} — ${priceLine(x.p)}；${role ? roleDisplayName(x.p, role) : "附赠模型"}；额度参考下限 ${quotaEvidenceText(x)}；DeepSWE v1.1 ${abilityText(x)}`);
        });
    lines.push("价格、额度与购买资格以官网为准。", url);
    return lines.join("\n");
}
/* 同厂商、同一主力模型、更便宜的个人档。主计划按「窗口最大」选档时会跳过中档（如不限预算直接选 Max），
   这里把被跳过的档（如 GLM Coding V3 Pro）补回可见，不然用户会以为厂商只有这一档。 */
function cheaperTiers(main: any) {
    if (!main.headline)
        return [];
    const roleId = main.headline.id;
    const mainPrice = pickerMonthlyCNY(main.p) || 0;
    const rows = [];
    PLANS.forEach((p: Plan) => {
        if (p.vendor !== main.p.vendor || !isPersonalMonthly(p) || !recommendablePlan(p))
            return;
        if (pickerState.region !== "all" && p.region !== pickerState.region)
            return;
        if (!matchesTool(p, pickerState.tool))
            return;
        if ((pickerMonthlyCNY(p) || 0) >= mainPrice - BUDGET_EPS)
            return;
        const prof = planProfile(p);
        if (prof.headline && prof.headline.id === roleId)
            rows.push(prof);
    });
    rows.sort((a: any, b: any) => (pickerMonthlyCNY(b.p) || 0) - (pickerMonthlyCNY(a.p) || 0));
    return rows;
}
function peerNote(main: any, pool: any) {
    if (!main.headline || knownTokens(main.p, main.headline) <= 0)
        return "";
    const peers = representatives(pool.filter((x: any) => x.headline && x.p.vendor !== main.p.vendor && x.headline.band === main.headline.band), (x: any) => x.p.vendor);
    const quiet = peers.filter((x: any) => knownTokens(x.p, x.headline) <= 0);
    quiet.sort((a: any, b: any) => {
        const code = (/code/i.test(b.p.plan) ? 1 : 0) - (/code/i.test(a.p.plan) ? 1 : 0);
        if (code)
            return code;
        const cat = catRank(b.p) - catRank(a.p);
        if (cat)
            return cat;
        return (pickerMonthlyCNY(b.p) || 0) - (pickerMonthlyCNY(a.p) || 0) || a.p.vendor.localeCompare(b.p.vendor, "zh");
    });
    const top = quiet[0];
    if (!top)
        return "";
    return `同预算还能买 ${planTitle(top.p)}（${roleDisplayName(top.p, top.headline)}）。它的额度没有可按官方规则折算的依据，所以主计划用了能估出额度的这一档。`;
}
/* 升级只跨到紧邻的预算档，避免 ≤200 元直接推到 538 元。
   500 元和不限预算后没有更高的有限档，才允许查看所有价格。 */
function upgradeBudgetCeiling() {
    return { "0": 100, "100": 200, "200": 500 }[pickerState.budget] || Infinity;
}
function nextTier(current: any): ReturnType<typeof planProfile> | null {
    const dailyLead = pickerState.task === "daily" || !current.headline;
    const roleId = dailyLead ? current.loose[0] && current.loose[0].id : current.headline.id;
    let best = null;
    PLANS.forEach((p: Plan) => {
        if (p.vendor !== current.p.vendor || !isPersonalMonthly(p) || !recommendablePlan(p))
            return;
        if (!pickerPaymentQuote(p).available)
            return;
        if (pickerState.region !== "all" && p.region !== pickerState.region)
            return;
        if (!matchesTool(p, pickerState.tool))
            return;
        const price = pickerMonthlyCNY(p) || 0;
        if (price <= (pickerMonthlyCNY(current.p) || 0) + BUDGET_EPS)
            return;
        if (price > upgradeBudgetCeiling() + BUDGET_EPS)
            return;
        const prof = planProfile(p);
        if (dailyLead) {
            if (!prof.loose.some((r: any) => r.id === roleId))
                return;
        }
        else if (roleId) {
            if (!prof.headline || prof.headline.id !== roleId)
                return;
        }
        else if (!prof.loose.length)
            return;
        if (!best || price < (pickerMonthlyCNY(best.p) || 0))
            best = prof;
    });
    return best;
}
function unlockText(cur: any, next: any) {
    const dailyLead = pickerState.task === "daily" || !cur.headline;
    const role = dailyLead ? cur.loose[0] : cur.headline;
    const nextRole = dailyLead ? next.loose.find((r: any) => role && r.id === role.id) : next.headline;
    if (role && nextRole && role.id === nextRole.id) {
        const currentModel = roleDisplayName(cur.p, role), nextModel = roleDisplayName(next.p, nextRole);
        const models = currentModel === nextModel ? `模型仍是 ${nextModel}。` : `当前 ${currentModel}；升级档列出 ${nextModel}。`;
        const a = metricForRole(cur.p, role);
        const b = metricForRole(next.p, nextRole);
        const known = (x: any) => x && (x.conf === "高" || x.conf === "中") && x.c.fLow != null;
        if (cur.windowPeriod === "5h" && next.windowPeriod === "5h" && known(a) && known(b)) {
            const conf = a.conf === "高" && b.conf === "高" ? "" : "（按官方额度规则统一折算，置信中）";
            return `${models}5 小时窗口从大约 ${tokSpan(a.c, "fLow", "fHigh")} tokens 提到 ${tokSpan(b.c, "fLow", "fHigh")} tokens${conf}，加的钱换来更大的窗口。`;
        }
        if (known(a) && known(b) && a.c.moLow > 0) {
            return `${models}每月可用额度约从 ${tokSpan(a.c, "moLow", "moHigh")} 提到 ${tokSpan(b.c, "moLow", "moHigh")} tokens（统一假设折算），约 ${(b.c.moLow / a.c.moLow).toFixed(1)} 倍。`;
        }
        const mult = resolvedField(next.p, "quota").match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
        if (mult)
            return `${models}官方额度是 ${mult[1]}× ${mult[2]}，具体重置周期以官方说明为准。`;
        return `${models}未公开的额度差不能按价格推算；请核对官网。额度原文：${trunc(resolvedField(next.p, "quota"), 72)}`;
    }
    if (dailyLead && next.loose.length)
        return `这档带日常模型 ${next.loose.map((r: any) => roleDisplayName(next.p, r)).join("、")}。额度原文：${trunc(resolvedField(next.p, "quota"), 80)}`;
    if (next.headline && (!cur.headline || bandRank(next.headline.band) > bandRank(cur.headline.band))) {
        return `这档才能把复杂任务模型换成 ${roleDisplayName(next.p, next.headline)}。${roleUseText(next.headline)}。`;
    }
    if (next.loose.length)
        return `这档带日常模型 ${next.loose.map((r: any) => roleDisplayName(next.p, r)).join("、")}。${roleUseText(next.loose[0])}。`;
    return `额度原文：${trunc(resolvedField(next.p, "quota"), 80)}`;
}
function dailyEntries(pool: any, main: any) {
    /* 主计划候选可以只看月付档，补充池还须包含真正免费且附赠推理的入口。
       免费工具/BYOK、团队与国家限定档仍按同一资格规则排除。 */
    const seen = new Set(pool.map((x: any) => x.p));
    const free = PLANS.filter((p: Plan) => !seen.has(p) && !p.seat && p.cat !== "team" &&
        isFreeCodingEntry(p) && recommendablePlan(p) &&
        (pickerState.region === "all" || p.region === pickerState.region) && matchesTool(p, pickerState.tool)).map(planProfile);
    return pool.concat(free).filter((x: any) => x.p !== main.p && x.p.vendor !== main.p.vendor && (x.internalDaily.length || (!x.headline && x.loose.length)));
}
/* 官方在额度原文里给日常模型点名条数的（如 Luna 350–3,000 条/5h），折成每 5h 的 M tokens 作排序信号 */
function dailyRoleBit(role: any) {
    const words = String(role.name).split(/\s+/);
    const last = words[words.length - 1];
    return /^[A-Za-z][A-Za-z0-9.-]{2,}$/.test(last) ? last : role.name;
}
function dailyQuotaSignal(p: any, role: any) {
    if (!role)
        return 0;
    const q = String(resolvedField(p, "quota") || "").replace(/\s+/g, " ");
    const bit = escRe(dailyRoleBit(role));
    const range = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*[–—-]\\s*(\\d[\\d,]*)\\s*条", "i"));
    if (range)
        return (Number(range[2].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
    const single = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*条", "i"));
    if (single)
        return (Number(single[1].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
    return 0;
}
/* 只有明确标注模型之间分池的套餐才算独立日常池。 */
function hasSeparateDaily(x: any) {
    return x.internalDaily.length > 0;
}
function pickSupplement(main: any, pool: any) {
    const list = dailyEntries(pool, main).slice().sort((a: any, b: any) => {
        const free = (isFreeCodingEntry(b.p) ? 1 : 0) - (isFreeCodingEntry(a.p) ? 1 : 0);
        if (free)
            return free;
        const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
        if (sep)
            return sep;
        const sig = dailyQuotaSignal(b.p, b.loose[0]) - dailyQuotaSignal(a.p, a.loose[0]);
        if (sig)
            return sig;
        const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
        if (pure)
            return pure;
        const coding = (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0);
        if (coding)
            return coding;
        const ta = knownTokens(a.p, a.loose[0]), tb = knownTokens(b.p, b.loose[0]);
        if (ta !== tb)
            return tb - ta;
        const ma = multiplier(a.p), mb = multiplier(b.p);
        if (ma !== mb)
            return mb - ma;
        return (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
    });
    const cap = pickerState.budget === "any" ? Infinity : pickerState.budget === "0" ? 0 : Number(pickerState.budget);
    const remain = cap - (pickerMonthlyCNY(main.p) || 0);
    const fit = list.filter((x: any) => (pickerMonthlyCNY(x.p) || 0) <= remain + BUDGET_EPS);
    const dreamed = list.find((x: any) => hasSeparateDaily(x) && (pickerMonthlyCNY(x.p) || 0) > remain + BUDGET_EPS);
    return { chosen: fit[0] || null, dreamed: dreamed || null, remain };
}
function sameWindowText(profile: any) {
    const names = profile.included.filter((r: any) => r.task === "daily").map((r: any) => roleDisplayName(profile.p, r));
    if (!profile.headline)
        return "";
    if (!names.length)
        return `${roleDisplayName(profile.p, profile.headline)} 这档没有另外的慢烧模型。`;
    if (profile.shared)
        return `${names.join("、")} 和 ${roleDisplayName(profile.p, profile.headline)} 共用同一个 5 小时窗口。日常使用会消耗这一窗口的额度。`;
    return windowNoteShort(profile);
}
function meteredText(profile: any) {
    if (!profile.metered.some((r: any) => r.id === "claude-opus"))
        return "";
    return "Claude Opus 在另一池，按百万 tokens 计价，不在这档送的慢烧额度里。";
}
function pickerMoney(amount: any, cur: any) {
    if (!Number.isFinite(amount))
        return "未列公开金额";
    const symbol = { USD: "$", CNY: "¥", INR: "₹" }[cur] || cur + " ";
    return symbol + Number(amount.toFixed(2)).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
/* 年付折月价可能已四舍五入；优先结构化全年金额，避免 $200 被算成 $200.04。 */
function annualPaymentText(p: any) {
    if (!p || !(p.priceY > 0))
        return "未列公开年付价。";
    const exact = pickerAnnualExact(p);
    const total = exact != null ? exact : p.priceY * 12;
    return `${exact == null ? "约 " : ""}${pickerMoney(total, p.cur)}/年${p.seat ? "，每席位" : ""}，需按年支付；折月 ${priceText(p, "priceY")}/月${exact == null ? "（全年金额按折月价×12估算）" : ""}。`;
}
/* 公开编程评测默认只作模型能力参考；选「模型能力优先」时按 DeepSWE v1.1 参与排序。成绩对应评测时的推理与 Agent 配置。 */
function benchmarkRankingNote() {
    return pickerPriority() === "ability" ? "本次按 DeepSWE v1.1 参与排序" : "不参与推荐排序";
}
/* 自家订阅与主计划共用任务/额度选档规则；有限预算先在预算内选。
   地区内没有时提供国际参考；预算连入门档也放不下时只展示最便宜的任务适配档并提示。 */
function ownVendorPlan(vendor: any) {
    const all = PLANS.filter((p: Plan) => p.vendor === vendor && isPersonalMonthly(p) && recommendablePlan(p) && matchesTool(p, pickerState.tool));
    if (!all.length)
        return null;
    const inRegion = all.filter((p: Plan) => pickerState.region === "all" || p.region === pickerState.region);
    const cap = pickerState.budget === "any" ? Infinity : pickerState.budget === "0" ? 0 : Number(pickerState.budget);
    const profiles = (inRegion.length ? inRegion : all).map(planProfile);
    const suitable = profiles.filter((x: { p: any; included: any; metered: any; headline: any; ceilings: any; loose: any; shared: boolean; windowPeriod: any; sharing: any; internalDaily: any; }) => pickerState.task === "daily" ? x.loose.length
        : pickerState.task === "hard" ? x.headline : x.headline || x.loose.length);
    const taskPool = suitable.length ? suitable : profiles;
    const priced = taskPool.filter((x: { p: any; included: any; metered: any; headline: any; ceilings: any; loose: any; shared: boolean; windowPeriod: any; sharing: any; internalDaily: any; }) => pickerPaymentQuote(x.p).available);
    const fit = priced.filter((x: { p: any; included: any; metered: any; headline: any; ceilings: any; loose: any; shared: boolean; windowPeriod: any; sharing: any; internalDaily: any; }) => pickerMonthlyCNY(x.p) <= cap + BUDGET_EPS);
    const cheapest = (priced.length ? priced : taskPool).slice().sort((a: { p: any; included: any; metered: any; headline: any; ceilings: any; loose: any; shared: boolean; windowPeriod: any; sharing: any; internalDaily: any; }, b: { p: any; included: any; metered: any; headline: any; ceilings: any; loose: any; shared: boolean; windowPeriod: any; sharing: any; internalDaily: any; }) => pickerMonthlyCNY(a.p) - pickerMonthlyCNY(b.p))[0];
    const picked = fit.length ? chooseMain(fit) || fit[0] : cheapest;
    return { plan: picked.p, regionMiss: !inRegion.length, withinBudget: fit.length > 0 };
}
function windowNoteShort(prof: any) {
    if (prof.windowPeriod === "none")
        return "目前没有 5 小时上限；总体用量仍需查看官方仪表盘。";
    if (prof.sharing === "separate")
        return "官方说明日常模型与复杂任务模型分池计算额度。";
    if (prof.shared)
        return "日常模型和复杂任务模型共用同一个 5 小时窗口，日常使用会消耗这份额度。";
    if (prof.windowPeriod === "month" && prof.sharing === "shared")
        return "日常模型和复杂任务模型共用月度额度池。";
    if (prof.sharing === "shared")
        return "日常模型和复杂任务模型共用同一额度池；重置周期或窗口上限未公开。";
    return "模型之间的额度共享情况未公开，无法确认日常使用是否会挤占复杂任务额度。";
}
/* 供卡片里的按钮一键放宽筛选（data-set-picker="region=all"） */
function setPicker(rowKey: keyof typeof pickerState, value: string) {
    pickerState[rowKey] = value;
    updateAppState(() => {}, renderPicker);
}
/* 帮我选四行 chips 的高亮以 pickerState 为准（渲染时自愈，程序化改状态也不会脱钩） */
function syncPickerChips() { /* Chip selection is rendered by PickerControls.vue. */ }
function pickerEmptyReason(pool: any) {
    if (pool.length) {
        const task = pickerState.task === "daily" ? "日常" : "复杂任务";
        return `有 ${pool.length} 档符合购买条件，但没有匹配到附赠的${task}模型。可以调整任务选择，或在数据表核对完整模型列表。`;
    }
    const base = PLANS.filter((p: Plan) => recommendablePlan(p) &&
        (pickerState.budget === "0" ? isFreeCodingEntry(p) : isPersonalMonthly(p)));
    const region = base.filter((p: Plan) => pickerState.region === "all" || p.region === pickerState.region);
    if (!region.length)
        return "所选地区没有包含编程推理额度的通用个人档。可以调整地区；国家限定套餐可在完整数据表查看。";
    const tool = region.filter((p: Plan) => matchesTool(p, pickerState.tool));
    if (!tool.length)
        return "所选地区没有匹配这个工具的通用个人档。可以改选工具或地区；自备 Key 的免费平台不等于免费推理。";
    if (!tool.some((p: Plan) => pickerPaymentQuote(p).available))
        return "符合地区与工具的套餐未列所选支付方式的明确价格。可以切换月付标价；未公开的年付价不会用于预算推荐。";
    return "当前预算没有匹配的通用套餐。可以提高预算或查看免费入口；国家限定套餐可在完整数据表查看。";
}
function pickerChoiceReason(profile: any) {
    const daily = pickerState.task === "daily" || !profile.headline;
    const role = daily ? profile.loose[0] : profile.headline;
    const parts = [`${role ? roleDisplayName(profile.p, role) : "附赠模型"} 符合所选任务，月费 ${priceLine(profile.p)}，满足当前预算、地区与工具条件`];
    if (daily && hasSeparateDaily(profile))
        parts.push("日常模型与复杂任务模型明确分池，日常选择优先考虑这类额度");
    const evidence = tokenEvidenceText(profile.p, role);
    if (evidence)
        parts.push(`额度可按官方规则折算：${evidence}，可核对用量`);
    else
        parts.push("可用 token 总量没有可按官方规则折算的依据，主要按模型用途、公开额度规则和月费比较");
    if (pickerPriority() === "ability")
        parts.push(abilityHit(profile.p, role) ? "已按 DeepSWE v1.1 已公布成绩优先排序" : "主力模型未进入 DeepSWE v1.1，按额度与月费比较");
    else if (typeof planCodingBenchmarks === "function" && planCodingBenchmarks(profile.p, role).length)
        parts.push("卡片上的公开编程评测只作模型能力参考，不参与排序");
    if (pickerPriority() === "price")
        parts.push("已按所选付款方式的月均价优先选档");
    return parts.join("；") + "。";
}
/* 先给省钱候选，再给排序中的另一选择；尽量来自不同厂商，单厂商筛选仍可比较不同档位。 */
function alternativeProfiles(pool: any, main: any, shownIds: Set<any> = new Set()) {
    if (!main)
        return [];
    /* 已在补充、升级或自家订阅卡出现的档位不再重复列为候选。 */
    const suitable = pool.filter((x: any) => x.p !== main.p && !shownIds.has(x.p.id) && (pickerState.task === "daily" ? x.loose.length
        : pickerState.task === "hard" ? x.headline : x.headline || x.loose.length));
    const selected = [];
    const cheapest = suitable.slice().sort((a: any, b: any) => (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0));
    const first = cheapest.find((x: any) => x.p.vendor !== main.p.vendor) || cheapest[0];
    if (first)
        selected.push(first);
    const remaining = suitable.filter((x: any) => !selected.includes(x));
    const vendors = new Set([main.p.vendor, ...selected.map((x: any) => x.p.vendor)]);
    const different = remaining.filter((x: any) => !vendors.has(x.p.vendor));
    const second = chooseMain(different.length ? different : remaining);
    if (second)
        selected.push(second);
    return selected;
}
function renderPicker() {
    /* Vue derives recommendation cards from shared reactive state. Only notify applied scopes. */
    pickerAbilityCache.clear();
    syncServiceControls();
    refreshPickerScopes();
}
function auditProfiles() {
    /* 断言隐含「国内 + 不限预算 + 不限工具」的筛选前提（如智谱省钱档），先锁定状态，
       结束后还原，避免 ?debug=1 时污染页面正在展示的推荐。 */
    const saved = { ...pickerState };
    Object.assign(pickerState, { budget: "any", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
    try {
        const by = (vendor: any, plan: any) => PLANS.find((p: Plan) => p.vendor === vendor && p.plan === plan);
        const idOf = (p: any) => { const h = planProfile(p).headline; return h ? h.id : ""; };
        const expect = (vendor: any, plan: any, id: any) => {
            const got = idOf(by(vendor, plan));
            if (got !== id)
                console.error("[picker]", vendor, plan, "headline", got || "(none)", "expected", id || "(none)");
        };
        expect("Anthropic", "Claude Pro", "claude-opus");
        expect("Anthropic", "Claude Free", "");
        expect("Anthropic", "Claude Max 5x", "claude-opus");
        expect("Cursor", "Pro", "");
        expect("OpenAI", "ChatGPT Plus", "gpt-sol");
        expect("智谱 BigModel", "GLM Coding V3 Lite", "glm-5");
        expect("智谱 BigModel", "GLM Coding V3 Pro", "glm-5");
        expect("智谱 BigModel", "GLM Coding V3 Max", "glm-5");
        /* 不限预算时主计划会跳过中档，「省钱档」行必须能把 GLM V3 Pro 补回来 */
        const maxProfile = planProfile(by("智谱 BigModel", "GLM Coding V3 Max"));
        if (!cheaperTiers(maxProfile).some((x: any) => x.p.plan === "GLM Coding V3 Pro")) {
            console.error("[picker] GLM V3 Max 的省钱档应列出 GLM Coding V3 Pro");
        }
        const cursor = planProfile(by("Cursor", "Pro"));
        if (!cursor.internalDaily.some((r: any) => r.id === "grok"))
            console.error("[picker] Cursor Pro 应把 Grok 当成分开的日常额度");
        if (cursor.metered.every((r: any) => r.id !== "claude-opus"))
            console.error("[picker] Cursor Pro 的 Opus 应在按量池");
    }
    finally {
        Object.assign(pickerState, saved);
    }
}

/* SOURCE: js/app-tables.js */
/* ============ Coding Plan 比价中心 — 数据表 / 额度表 / 并排对比 ============ */
"use strict";
/* Vue owns the mounted tables. The classic harness still exercises the same domain
 * helpers; these callbacks let navigation/history invoke the mounted views without
 * replacing component DOM. */
/** @type {Record<string, Record<string, any>>} */
const tableViews: Record<string, Record<string, any>> = {};
function registerTableView(name: any, view: any) {
    tableViews[name] = view;
    return () => { if (tableViews[name] === view)
        delete tableViews[name]; };
}
/* ---------- 数据表 ---------- */
function focusTableControl(el: any) {
    if (!el || el.isConnected === false || el.disabled || typeof el.focus !== "function")
        return false;
    el.focus({ preventScroll: true });
    return document.activeElement === el;
}
function tableFeedback(message: any) { tableViews.plan?.feedback?.(message); }
function syncSortHeader(th: any, label: any, key: any, dir: any, firstDir: number = 1) {  }
function planMonthlyPriceCell(p: any) { return planPriceLabel(p); }
function planAnnualPriceCell(p: any) { return p.priceY == null ? "—" : planPriceLabel(p, "Y"); }
/* 数据表与两种导出的列定义同源；单位及更新元数据只在导出里单列。 */
const PLAN_COLUMNS = [
    { id: "vendor", label: "厂商", cls: "td-vendor", value: (p: any) => p.vendor },
    { id: "plan", label: "计划", cls: "td-plan", value: (p: any) => p.plan },
    { id: "cat", label: "类别", value: (p: any) => CAT_LABEL[p.cat] || p.cat },
    { id: "region", label: "地区", value: (p: any) => REGION_LABEL[p.region] || "", tdClass: (p: any) => "region-" + esc(p.region) },
    { id: "priceM", label: "价格 / 周期", cls: "td-price", value: (p: any) => planPriceLabel(p) },
    { id: "priceUnit", label: "计价单位", table: false, value: priceUnit },
    { id: "priceY", label: "年付折月", cls: "td-price", value: (p: any) => p.priceY == null ? "" : planPriceLabel(p, "Y"),
        markdownValue: (p: any) => p.priceY == null ? "—" : planPriceLabel(p, "Y") },
    { id: "annualTotal", label: "年付全年金额", table: false, value: annualPaymentText },
    { id: "selectedPayment", label: "选购支付口径", table: false, value: (p: any) => tableState.fromPicker ? priceLine(p) : "" },
    { id: "selectedFirstPayment", label: "选购首次付款", table: false, value: (p: any) => tableState.fromPicker ? pickerFirstPaymentText(p) : "" },
    { id: "quota", label: "额度（官方口径）", cls: "td-quota", value: (p: any) => resolvedField(p, "quota") },
    { id: "models", label: "模型", cls: "td-models col-opt", value: (p: any) => resolvedField(p, "models") },
    { id: "tools", label: "支持工具", cls: "col-opt", value: (p: any) => resolvedField(p, "tools") },
    { id: "note", label: "备注", cls: "td-note col-opt", value: (p: any) => resolvedField(p, "note"),
        markdownValue: (p: any) => resolvedField(p, "note") || "—" },
    { id: "url", label: "来源", cls: "td-trust", value: (p: any) => p.url || "" },
    { id: "priceStatus", label: "价格核实状态", table: false, value: (p: any) => priceCheckLabel(p) },
    { id: "priceCheckedAt", label: "价格核查日期", table: false, value: (p: any) => (priceCheckOf(p) || {}).checkedAt || "" },
    { id: "priceSources", label: "价格核查来源", table: false, value: (p: any) => priceCheckSources(p).join(" ; ") },
    { id: "priceCheckReason", label: "价格核查说明", table: false, value: (p: any) => displayPriceReason((priceCheckOf(p) || {}).reason || "") },
    { id: "mainland", label: "中国大陆可用性", table: false, value: mainlandAccessText },
    { id: "updated", label: "数据更新日期", table: false, markdown: false, value: () => META.updated },
    { id: "rate", label: "参考汇率（USD/CNY）", table: false, markdown: false, value: () => RATE },
    { id: "rateInr", label: "参考汇率（INR/CNY）", table: false, markdown: false, value: () => RATE_INR_CNY },
    { id: "rateAsOf", label: "汇率日期", table: false, markdown: false, value: () => META.rateAsOf },
    { id: "rateSource", label: "汇率来源", table: false, markdown: false, value: () => META.rateSource || "" }
];
const PLAN_TABLE_COLUMNS = PLAN_COLUMNS.filter((c: { id: string; label: string; cls: string; value: (p: any) => any; cell?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; cell: (p: any) => string; cls?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; tdClass: (p: any) => string; cls?: undefined; cell?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; value: (p: any) => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; markdownValue: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => number; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; }) => c.table !== false);
function responsivePageSize() { return window.innerWidth < 768 ? 5 : 20; }
let tableVisibleLimit = responsivePageSize();
let tableViewFingerprint = "";
/* 中转站和价格待核实的历史价默认不显示，打开「含中转站与待核价格」后与其他筛选叠加；导出与当前显示一致。 */
function tableExtraHidden(p: any) { return isRelay(p) || !isPriceConfirmed(p); }
function tableFilteredPlans(state = tableState) {
    const q = state.search.trim().toLowerCase();
    return PLANS.filter(isOnSalePlan).filter((p: Plan) => (state.cat === "all" || p.cat === state.cat) &&
        (state.region === "all" || p.region === state.region) &&
        (!state.fromPicker || matchesPickerPurchase(p)) &&
        (!q || queryHit(planSearchBlob(p), q)));
}
/* 筛选 + 排序集中在这里：渲染与 CSV/Markdown 导出共用同一份结果 */
function computeTableRows(state = tableState) {
    const rows = tableFilteredPlans(state).filter((p: Plan) => state.extra || !tableExtraHidden(p));
    const k = state.sortKey;
    const sortVal = (p: any) => k === "selectedMonthly" && state.fromPicker ? pickerMonthlyCNY(p) : (p[k] == null ? NaN : toCNY(p[k], p.cur));
    return rows.slice().sort((a: Plan, b: Plan) => {
        const va = sortVal(a), vb = sortVal(b);
        const aN = Number.isNaN(va), bN = Number.isNaN(vb);
        if (aN || bN) {
            if (aN && bN)
                return 0;
            return aN ? 1 : -1;
        } /* 「定制」（无公开价）恒排末尾 */
        return (va - vb) * state.sortDir;
    });
}
function tableFingerprint(pageSize: number = responsivePageSize()) {
    return JSON.stringify([tableState, pageSize, tableState.fromPicker ? pickerState : null]);
}
function syncTablePriceSort() {  }
function renderTable() { tableViews.plan?.render?.(); }
function syncTableExtraToggle(hiddenExtra: any) {  }
function showMoreTableRows() { tableViews.plan?.more?.(); }
function revealTablePlan(planId: any) { return tableViews.plan?.reveal?.(planId) ?? false; }
function resetTableFilters() { if (tableViews.plan?.reset) tableViews.plan.reset(); else Object.assign(tableState, { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false }); }
/* ---------- 导出：当前筛选 + 排序结果 ---------- */
function tableExportName(ext: any, description: any = null) {
    const desc = description == null ? [tableState.search.trim(), tableState.cat, tableState.region].filter((x: string) => x && x !== "all").join("-") : description;
    const safe = (desc || "all").replace(/[\\/:*?"<>|]+/g, "");
    const d = new Date();
    const day = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    return `coding-plans-${safe}-${day}.${ext}`;
}
/* 引号 doubling 之外，还要防 CSV 公式注入：以 = + - @ 开头的单元格加 ' 前缀，Excel 不会当公式执行。所有 CSV 导出共用。 */
function csvCell(v: any) {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s))
        s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}
function tableRowsCsv(rows: any) {
    const lines = [PLAN_COLUMNS.map((c: { id: string; label: string; cls: string; value: (p: any) => any; cell?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; cell: (p: any) => string; cls?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; tdClass: (p: any) => string; cls?: undefined; cell?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; value: (p: any) => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; markdownValue: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => number; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; }) => csvCell(c.label)).join(",")]
        .concat(rows.map((p: any) => PLAN_COLUMNS.map((c: { id: string; label: string; cls: string; value: (p: any) => any; cell?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; cell: (p: any) => string; cls?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; tdClass: (p: any) => string; cls?: undefined; cell?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; value: (p: any) => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; markdownValue: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => number; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; }) => csvCell(c.value(p))).join(",")));
    return lines.join("\r\n");
}
function downloadCsvText(csv: any, filename: any) {
    /* \uFEFF 让 Excel 正确识别 UTF-8 */
    downloadTextFile("\uFEFF" + csv, filename, "text/csv;charset=utf-8");
}
function downloadTextFile(text: any, filename: any, mime: string = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function exportTableCsv() {
    const rows = computeTableRows();
    if (!rows.length) {
        tableFeedback("没有可导出的方案，请先调整筛选。");
        return;
    }
    downloadCsvText(tableRowsCsv(rows), tableExportName("csv"));
    flashBtn("exportCsvBtn", `✓ 已导出 ${rows.length} 档`);
    tableFeedback(`已生成包含 ${rows.length} 档方案的 CSV，计价单位、数据日期和汇率已保留。`);
}
function tableRowsMarkdown(rows: any) {
    const escMd = (v: any) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const columns = PLAN_COLUMNS.filter((c: { id: string; label: string; cls: string; value: (p: any) => any; cell?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; cell: (p: any) => string; cls?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; tdClass: (p: any) => string; cls?: undefined; cell?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; value: (p: any) => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; markdownValue: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => number; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; }) => c.markdown !== false);
    const head = "| " + columns.map((c: { id: string; label: string; cls: string; value: (p: any) => any; cell?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; cell: (p: any) => string; cls?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; tdClass: (p: any) => string; cls?: undefined; cell?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; value: (p: any) => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; markdownValue: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => number; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; }) => c.label).join(" | ") + " |";
    const sep = "|" + columns.map(() => "---").join("|") + "|";
    const body = rows.map((p: any) => "| " + columns.map((c: { id: string; label: string; cls: string; value: (p: any) => any; cell?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; cell: (p: any) => string; cls?: undefined; tdClass?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; value: (p: any) => any; tdClass: (p: any) => string; cls?: undefined; cell?: undefined; table?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; value: (p: any) => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; markdown?: undefined; } | { id: string; label: string; cls: string; value: (p: any) => any; markdownValue: (p: any) => any; cell: (p: any) => string; tdClass?: undefined; table?: undefined; markdown?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => string; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; } | { id: string; label: string; table: boolean; markdown: boolean; value: () => number; cls?: undefined; cell?: undefined; tdClass?: undefined; markdownValue?: undefined; }) => escMd(c.markdownValue ? c.markdownValue(p) : c.value(p))).join(" | ") + " |");
    const meta = `数据更新日期：${META.updated}；参考汇率：1 USD ≈ ${RATE} CNY，1 INR ≈ ${RATE_INR_CNY} CNY（${META.rateAsOf}；来源：${META.rateSource || "未提供"}）。金额包含计价单位；一次性、席位及每 4 周价格不能直接视为个人月费。`;
    return [meta, "", head, sep].concat(body).join("\n");
}
async function copyTextToClipboard(text: any) {
    let ok = false;
    try {
        await navigator.clipboard.writeText(text);
        ok = true;
    }
    catch (e) {
        /* file:// 或旧浏览器降级：隐藏 textarea + execCommand */
        const previousFocus = document.activeElement;
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        /* 原生模态窗口会让 body 内其它节点 inert；权益和比较窗口都在当前窗口内选择文本。 */
        const dialogs = [...qsa("dialog")].filter((dlg: any) => dlg.open === true || dlg.getAttribute("open") != null);
        const focusedDialog = previousFocus && previousFocus.closest ? previousFocus.closest("dialog") : null;
        const host = dialogs.includes(focusedDialog) ? focusedDialog : dialogs[dialogs.length - 1] || document.body;
        host.appendChild(ta);
        ta.select();
        try {
            ok = document.execCommand("copy");
        }
        catch (e2) {
            ok = false;
        }
        ta.remove();
        focusTableControl(previousFocus);
    }
    return ok;
}
async function copyTableMarkdown() {
    const rows = computeTableRows();
    if (!rows.length) {
        tableFeedback("没有可复制的方案，请先调整筛选。");
        return;
    }
    const ok = await copyTextToClipboard(tableRowsMarkdown(rows));
    flashBtn("copyMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制失败");
    tableFeedback(ok ? `已复制 ${rows.length} 档方案的 Markdown 表格。` : "浏览器限制了剪贴板访问，可以使用 CSV 下载当前结果。");
}
function flashBtn(id: any, text: any) { const mounted = Object.values(tableViews).find(view => view.flash && view.buttons?.includes(id)); mounted?.flash?.(id, text); }
/* ---------- 并排对比：数据表内勾选 2–4 档，URL（cmp=）可分享 ---------- */
let cmpReturnFocus = null;
let cmpNeedsFocusRestore = false;
let cmpBackgroundState = [];
function isCmpModalOpen() {
    const dlg = byId("cmpModal");
    return !!dlg && (dlg.open === true || dlg.getAttribute("open") != null);
}
function cmpFocusableElements() {
    const dlg = byId("cmpModal");
    return modalFocusableElements(dlg);
}
function modalFocusableElements(dlg: any) {
    if (!dlg)
        return [];
    return [...dlg.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")].filter((el: any) => {
        if (el.disabled || el.hidden || el.tabIndex < 0 || el.closest("[hidden], [inert]"))
            return false;
        for (let parent = el.parentNode; parent && parent !== dlg; parent = parent.parentNode) {
            if (parent.tagName === "DETAILS" && !parent.open) {
                const summary = parent.querySelector("summary");
                if (!summary || (el !== summary && !summary.contains(el)))
                    return false;
            }
        }
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && el.getClientRects().length > 0;
    });
}
function setCmpBackgroundInert(on: any) {
    if (on) {
        if (cmpBackgroundState.length)
            return;
        const dlg = byId("cmpModal"), backdrop = byId("cmpBackdrop");
        cmpBackgroundState = Array.from(document.body.children).filter((el: Element) => el !== dlg && el !== backdrop && !/^(SCRIPT|STYLE)$/.test(el.tagName))
            .map((el: Element) => ({ el, inert: el.getAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden") }));
        cmpBackgroundState.forEach(({ el }: { el: Element; inert: string; ariaHidden: string; }) => { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
    }
    else {
        cmpBackgroundState.forEach(({ el, inert, ariaHidden }: any) => {
            if (inert == null)
                el.removeAttribute("inert");
            else
                el.setAttribute("inert", inert);
            if (ariaHidden == null)
                el.removeAttribute("aria-hidden");
            else
                el.setAttribute("aria-hidden", ariaHidden);
        });
        cmpBackgroundState = [];
    }
}
function finishCmpModalClose() {
    if (tableViews.compare?.finishClose) {
        tableViews.compare.finishClose();
        return;
    }
    const backdrop = byId("cmpBackdrop");
    if (backdrop)
        backdrop.hidden = true;
    const dlg = byId("cmpModal");
    if (dlg)
        dlg.removeAttribute("aria-modal");
    document.body.classList.remove("has-cmp-modal");
    setCmpBackgroundInert(false);
    restoreCmpFocus();
}
function restoreCmpFocus() {
    if (!cmpNeedsFocusRestore)
        return;
    cmpNeedsFocusRestore = false;
    const previous = cmpReturnFocus;
    cmpReturnFocus = null;
    if (!focusTableControl(previous) && !focusTableControl(byId("cmpOpenBtn")))
        focusTableControl(byId("searchInput"));
}
function cmpAdd(vendor: any, plan?: any) {
    if (tableViews.compare?.add) {
        tableViews.compare.add(vendor, plan);
        return;
    }
    const p = findPlanReference(plan == null ? vendor : [vendor, plan]);
    if (!p)
        return;
    if (cmpState.items.some((x: Plan) => x.id === p.id))
        return;
    if (cmpState.items.length >= CMP_MAX) {
        flashBtn("cmpOpenBtn", `最多对比 ${CMP_MAX} 档`);
        tableFeedback(`最多对比 ${CMP_MAX} 档，请先移出一档再添加。`);
        return;
    }
    cmpState.items.push(p);
    renderCmpBar();
    syncTableCmpButtons();
    syncUrl();
    tableFeedback(`已加入 ${shortVendor(p.vendor)} ${p.plan}。当前选择 ${cmpState.items.length}/${CMP_MAX} 档${cmpState.items.length === 1 ? "，再选一档即可比较" : ""}。`);
}
function cmpRemove(vendor: any, plan?: any) {
    if (tableViews.compare?.remove) {
        tableViews.compare.remove(vendor, plan);
        return;
    }
    const index = cmpState.items.findIndex((x: Plan) => plan == null ? x.id === vendor : x.vendor === vendor && x.plan === plan);
    if (index < 0)
        return;
    const removed = cmpState.items[index];
    const modalOpen = isCmpModalOpen();
    cmpState.items = cmpState.items.filter((x: Plan) => x.id !== removed.id);
    renderCmpBar();
    syncTableCmpButtons();
    syncUrl();
    tableFeedback(`已移出 ${shortVendor(removed.vendor)} ${removed.plan}。当前选择 ${cmpState.items.length}/${CMP_MAX} 档。`);
    if (modalOpen) {
        if (cmpState.items.length < 2)
            closeCmpModal();
        else {
            renderCmpModal();
            const remaining = qsa("#cmpTable .cmp-remove");
            if (!focusTableControl(remaining[Math.min(index, remaining.length - 1)]))
                focusTableControl(byId("cmpCloseBtn"));
        }
    }
}
function cmpClear() {
    if (tableViews.compare?.clear) {
        tableViews.compare.clear();
        return;
    }
    if (!cmpState.items.length)
        return;
    const focused = document.activeElement;
    const focusInBar = focused && byId("cmpBar").contains(focused);
    cmpState.items = [];
    renderCmpBar();
    syncTableCmpButtons();
    syncUrl();
    closeCmpModal();
    /* 比较条清空后消失；弹窗未打开时也要给键盘用户保留一个可继续操作的位置。 */
    if (focusInBar)
        focusTableControl(byId("searchInput"));
    tableFeedback("已清空对比选择。");
}
function renderCmpBar() { tableViews.compare?.render?.(); }
function syncTableCmpButtons(previousFocus: any = null) {  }
function cmpFeedback(message: any) { tableViews.compare?.feedback?.(message); }
function exportCmpCsv() {
    const rows = cmpState.items.slice();
    if (rows.length < 2) {
        cmpFeedback("请至少选择 2 档方案后导出对比。");
        return;
    }
    downloadCsvText(tableRowsCsv(rows), tableExportName("csv", "compare"));
    flashBtn("exportCmpCsvBtn", `✓ 已导出 ${rows.length} 档`);
    cmpFeedback(`已导出 ${rows.length} 档对比方案，完整权益、计价单位、核价来源、数据日期和汇率已保留。`);
}
async function copyCmpMarkdown() {
    const rows = cmpState.items.slice();
    if (rows.length < 2) {
        cmpFeedback("请至少选择 2 档方案后复制对比。");
        return;
    }
    const ok = await copyTextToClipboard(`并排对比（${rows.length} 档方案）\n\n` + tableRowsMarkdown(rows));
    flashBtn("copyCmpMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制失败");
    cmpFeedback(ok ? `已复制 ${rows.length} 档方案的完整对比与核价元数据。` : "浏览器限制了剪贴板访问，可以导出对比 CSV。");
}
function renderCmpModal() { tableViews.compare?.render?.(); }
function openCmpModal() {
    if (tableViews.compare?.open) {
        tableViews.compare.open();
        return;
    }
    if (cmpState.items.length < 2)
        return;
    const dlg = byId("cmpModal");
    if (!dlg)
        return;
    renderCmpModal();
    if (isCmpModalOpen())
        return;
    const active = document.activeElement;
    cmpReturnFocus = active && active !== document.body && !dlg.contains(active) ? active : null;
    cmpNeedsFocusRestore = true;
    const fallback = typeof dlg.showModal !== "function";
    dlg.classList.toggle("cmp-fallback", fallback);
    dlg.setAttribute("aria-modal", "true");
    document.body.classList.add("has-cmp-modal");
    if (!fallback)
        dlg.showModal();
    else {
        dlg.setAttribute("open", "");
        const backdrop = byId("cmpBackdrop");
        if (backdrop)
            backdrop.hidden = false;
        setCmpBackgroundInert(true);
    }
    focusTableControl(byId("cmpCloseBtn"));
}
function closeCmpModal() {
    if (tableViews.compare?.close) {
        tableViews.compare.close();
        return;
    }
    const dlg = byId("cmpModal");
    if (!dlg || !isCmpModalOpen())
        return;
    if (!dlg.classList.contains("cmp-fallback") && typeof dlg.close === "function")
        dlg.close();
    else
        dlg.removeAttribute("open");
    finishCmpModalClose();
}
/* ---------- 动态 / 来源 / 说明 ---------- */
/* 来源证据只增不改：记录改用新来源后，旧证据留在台账里，但不再作为当前依据展示。 */
function currentPriceSources() {
    const used = new Set(Object.values(PRICE_CHECKS.rows).flatMap((row: PriceVerification) => row.sourceIds || []));
    return Object.entries(PRICE_CHECKS.sources).filter(([id]: [string, { url: string; evidence: string; checkedAt?: string; }]) => used.has(id)).map(([, source]: [string, { url: string; evidence: string; checkedAt?: string; }]) => source);
}
function chinaCalendarDay(now: Date = new Date()) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const value = (type: any) => parts.find((part: Intl.DateTimeFormatPart) => part.type === type).value;
    return `${value("year")}-${value("month")}-${value("day")}`;
}
function dynamicEndDate(d: any) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.endDate || ""))
        return d.endDate;
    /* 旧记录只有文字范围；仅识别活动期限，核对日志保持其当日原文。 */
    if (d.checked || !/活动|促销|畅用/.test(d.text || ""))
        return "";
    const range = String(d.text || "").match(/(\d{2})-(\d{2})\s*[~～–—]\s*(\d{2})-(\d{2})/);
    if (!range || !/^\d{4}-/.test(d.date || ""))
        return "";
    const year = Number(d.date.slice(0, 4)) + (range[3] + range[4] < range[1] + range[2] ? 1 : 0);
    return `${year}-${range[3]}-${range[4]}`;
}
function dynamicStatus(d: any, today: string = chinaCalendarDay()) {
    if (!d.checked && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && d.date > today)
        return { key: "upcoming", label: "计划中 · 尚未发生" };
    const endDate = dynamicEndDate(d);
    if (endDate && endDate < today)
        return { key: "ended", label: "已结束 · " + endDate };
    return { key: "", label: "" };
}
function dynItem(d: any, today: string = chinaCalendarDay()) { return d.text; }
function renderMisc() {  }
/* ---------- 额度深度对比表 ---------- */
/* Quota constants and formulas are imported from ./metrics. */
function resetMetricsFilters() { if (tableViews.metrics?.reset) tableViews.metrics.reset(); else Object.assign(metricsState, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false }); }
/* 表的 16 列在这里集中定义：表头（含排序键与紧凑模式折叠类）、排序取值、单元格渲染同源。
   加列只改这个数组；.col-more 控制该列在紧凑模式下是否隐藏。 */
const METRICS_COLUMNS = [
    { id: "plan", label: "厂商·计划", cls: "sticky-col",
        title: ({ m }: {
            m: any;
        }) => m.vendor + " · " + m.plan },
    { id: "ver", label: "版本", cls: "col-more" },
    { id: "model", label: "模型", cls: "model-cell" },
    { id: "price", label: "月费", sortKey: "price", asc: true, cls: "td-price" },
    { id: "tps", label: "TPS", cls: "col-more tps-cell" },
    { id: "cpm", label: "💵每M tokens", sortKey: "cpm", asc: true },
    { id: "t5h", label: "Tokens/5h", sortKey: "t5h", cls: "col-more tok-cell" },
    { id: "val5h", label: "💰价值/5h", cls: "col-more val-cell" },
    { id: "r5h", label: "⏫倍率/5h", sortKey: "r5h", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }: {
            c: any;
            isPayg: any;
        }) => (isPayg ? "" : " " + rateClass(c.r5h)) },
    { id: "twk", label: "Tokens/周", sortKey: "twk", cls: "col-more tok-cell" },
    { id: "valWk", label: "💰价值/周", cls: "col-more val-cell" },
    { id: "rwk", label: "⏫倍率/周", sortKey: "rwk", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }: {
            c: any;
            isPayg: any;
        }) => (isPayg ? "" : " " + rateClass(c.rwk)) },
    { id: "tmo", label: "每月 tokens", sortKey: "tmo", cls: "tok-cell" },
    { id: "valMo", label: "💰价值/月", cls: "col-more val-cell" },
    { id: "rmo", label: "⏫倍率/月", sortKey: "rmo", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }: {
            c: any;
            isPayg: any;
        }) => (isPayg ? "" : " " + rateClass(c.rmo)) },
    { id: "prov", label: "依据", cls: "prov-cell",
        title: ({ m }: {
            m: any;
        }) => [m.note, m.source].filter(Boolean).join(" · ") }
];
/* 表头由列配置生成（boot 时跑一次，先于 renderMetricsTable） */
function renderMetricsHead() {  }
/* 排序键 → 行取值。null/NaN 恒排末尾（按量无月费、credits 制等）。 */
const METRICS_SORT_GET = {
    price: (r: any) => r.c.priceCNY,
    cpm: (r: any) => r.c.costPerM ?? NaN,
    t5h: (r: any) => r.c.fLow,
    r5h: (r: any) => r.c.r5h,
    twk: (r: any) => r.c.wkLowM,
    rwk: (r: any) => r.c.rwk,
    tmo: (r: any) => r.c.moLow,
    rmo: (r: any) => r.c.rmo,
};
/* 无额度（credits 制无牌价）的时段显示占位。与 windowSentence 的 tokSpan 同一规则：
   上下限差 ≤5% 时只显上限值，避免「100–103M」这类噪音区间。 */
function fTokCell(lo: any, hi: any, emptyLabel: string = "credits制") { if (lo == null) return emptyLabel; const lowText = fmtTok(lo), highText = hi == null ? lowText : fmtTok(hi); return hi == null || !(hi > lo * 1.05) || lowText === highText ? lowText : `${lowText}–${highText}`; }
function fmtRate(v: any) { return v == null ? "—" : `${v.toFixed(1)}×`; }
function fmtVal(v: any, cur: any) {
    if (v == null || !Number.isFinite(v))
        return "—";
    if (cur === "CNY")
        return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
    return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}
function rateClass(r: any) { return r == null || !Number.isFinite(r) ? "" : r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }
function fmtCpm(v: any) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }
function fmtUnit(n: any) {
    if (n >= 10)
        return String(Math.round(n * 10) / 10);
    if (n >= 1)
        return String(Math.round(n * 100) / 100);
    return String(Math.round(n * 10000) / 10000);
}
function listPriceHint(m: any) { if (typeof m.apiIn !== "number") return ""; const sym = m.cur === "USD" ? "$" : "¥"; return `输入 ${sym}${fmtUnit(m.apiIn)} / 输出 ${sym}${fmtUnit(m.apiOut)} / 缓存 ${sym}${fmtUnit(m.apiCache)}`; }
function cpmColor(v: any) {
    const tier = cpmTier(v);
    return tier === "na" ? "var(--faint)" : tier === "lo" ? "var(--green)" : tier === "mid" ? "var(--gold)" : "var(--red)";
}
/* 数据来源标注：每行额度的出处与置信度 */
function provenance(m: any) {
    const plan = m.ref != null ? findPlanReference(m.ref) : null;
    if (plan && !isPriceConfirmed(plan))
        return { text: "历史价折算 · 价格待核", conf: "低" };
    if (m.isEst)
        return { text: m.method, conf: m.confidence };
    if (m.creditCNY != null || m.creditUSD != null) {
        if (typeof m.apiIn === "number")
            return { text: "牌价折算", conf: "中" };
        return { text: "官方credits", conf: "高" };
    }
    if (m.note && m.note.includes("系数折算"))
        return { text: "官方系数", conf: "中" };
    if ((m.note && m.note.includes("第三方")) || (m.source && m.source.includes("第三方")))
        return { text: "第三方估算", conf: "低" };
    if (m.reqPerWk != null || m.reqPerMo != null || m.reqPer5h != null)
        return { text: "请求折算", conf: "低" };
    return { text: "官方估算", conf: "高" };
}
function paygReferenceRows() {
    /* 刊例在 data.js 的 PAYG_REFERENCES。每M = 低峰牌价按 95% 缓存、80/20 折成人民币。不进套餐倍率，也不进排行图。 */
    return PAYG_REFERENCES.map((s: { vendor: string; model: string; cur: string; apiIn: number; apiOut: number; apiCache: number; note: string; source: string; url: string; }) => {
        const m = {
            vendor: s.vendor, plan: "官方 API 按量", ver: "—", model: s.model, cur: s.cur,
            apiIn: s.apiIn, apiOut: s.apiOut, apiCache: s.apiCache, tps: "—",
            note: s.note, source: s.source, isEst: false, payg: true, url: s.url,
        };
        return {
            payg: true, m,
            c: {
                priceCNY: null, costPerM: toCNY(blendPrice(m), s.cur),
                fLow: null, moLow: null, r5h: null, rwk: null, rmo: null,
                val5h: null, valWk: null, valMo: null, wkLowM: null,
            },
        };
    });
}
/* 额度表脚注的固定说明：口径、假设与置信度图例变更时只改这里；行数与排序描述在渲染时拼接 */
const METRICS_NOTE_LEGEND = "";
function metricsTierOk(m: any) {
    return metricsState.tier === "all" || isFlagshipModelName(m.model);
}
let metricsVisibleLimit = responsivePageSize();
let metricsViewFingerprint = "";
function metricsTableRows() {
    let rows = METRICS_ALL.map((original: any) => {
        const m = metricsState.fromPicker ? pickerMetricInput(original) : original;
        return { m: m || original, c: m ? computeMetrics(m) : null, payg: false };
    }).filter((r: { m: any; c: MetricsResult; payg: boolean; }) => r.c);
    rows = rows.filter((r: { m: any; c: MetricsResult; payg: boolean; }) => metricsTierOk(r.m) && (metricsState.offer === "all" || metricOfferOk(r.m)));
    if (metricsState.model !== "all")
        rows = rows.filter((r: { m: any; c: MetricsResult; payg: boolean; }) => r.m.model === metricsState.model);
    if (metricsState.ver !== "all")
        rows = rows.filter((r: { m: any; c: MetricsResult; payg: boolean; }) => r.m.ver === metricsState.ver);
    const payg = metricsState.ver === "all" && !metricsState.fromPicker
        ? paygReferenceRows().filter((r: { payg: boolean; m: { vendor: string; plan: string; ver: string; model: string; cur: string; apiIn: number; apiOut: number; apiCache: number; tps: string; note: string; source: string; isEst: boolean; payg: boolean; url: string; }; c: { priceCNY: any; costPerM: any; fLow: any; moLow: any; r5h: any; rwk: any; rmo: any; val5h: any; valWk: any; valMo: any; wkLowM: any; }; }) => metricsTierOk(r.m) && (metricsState.offer === "all" || isPriceConfirmed(r.m, "payg")) && (metricsState.model === "all" || r.m.model === metricsState.model))
        : [];
    const shownRows = [...payg, ...rows];
    const sv = METRICS_SORT_GET[metricsState.sortKey];
    shownRows.sort((a: { payg: boolean; m: { vendor: string; plan: string; ver: string; model: string; cur: string; apiIn: number; apiOut: number; apiCache: number; tps: string; note: string; source: string; isEst: boolean; payg: boolean; url: string; }; c: { priceCNY: any; costPerM: any; fLow: any; moLow: any; r5h: any; rwk: any; rmo: any; val5h: any; valWk: any; valMo: any; wkLowM: any; }; } | { m: any; c: MetricsResult; payg: boolean; }, b: { payg: boolean; m: { vendor: string; plan: string; ver: string; model: string; cur: string; apiIn: number; apiOut: number; apiCache: number; tps: string; note: string; source: string; isEst: boolean; payg: boolean; url: string; }; c: { priceCNY: any; costPerM: any; fLow: any; moLow: any; r5h: any; rwk: any; rmo: any; val5h: any; valWk: any; valMo: any; wkLowM: any; }; } | { m: any; c: MetricsResult; payg: boolean; }) => {
        const va = sv ? sv(a) : 0, vb = sv ? sv(b) : 0;
        const aN = va == null || Number.isNaN(va), bN = vb == null || Number.isNaN(vb);
        if (aN || bN) {
            if (aN && bN)
                return 0;
            return aN ? 1 : -1;
        } /* 无对应额度（按量无月费、credits 制等）恒排末尾 */
        return (va - vb) * metricsState.sortDir;
    });
    return { rows, payg, shownRows };
}
function renderMetricsTable() { tableViews.metrics?.render?.(); }
function showMoreMetricsRows() { tableViews.metrics?.more?.(); }
function renderMetricsSortHint() {  }
/* 模型筛选下拉：从全部数据源动态填充 */
function populateModelFilter() { tableViews.metrics?.models?.(); }

/* SOURCE: js/app-service.js */
/* 分享、常用条件、完整权益与工作量计算；纯静态运行，不发送或上传用户输入。 */
"use strict";
const PRESET_KEY = "cp-filter-preset-v1";
const COST_CONTROLS = { model: "costModel", requests: "costRequests", tokens: "costTokens", days: "costDays", input: "costInput", cache: "costCache", cachePrice: "costCachePrice", budget: "costBudget" };
const SERVICE_TOOL_LABELS: Record<string, string> = { any: "不限工具", claude: "Claude Code", codex: "Codex", cursor: "Cursor", own: "自家客户端" };
const COST_PRESETS: Record<string, { requests: string; tokens: string; days: string }> = {
    light: { requests: "20", tokens: "5000", days: "20" },
    daily: { requests: "100", tokens: "20000", days: "22" },
    heavy: { requests: "300", tokens: "40000", days: "26" },
};
/* 示例情景只改变可见的计费假设；没有缓存单价时仍按普通输入价收费。 */
const COST_SCENARIOS: Record<string, { label: string; input: string; cache: string }> = {
    conservative: { label: "保守", input: "60", cache: "50" },
    typical: { label: "典型", input: "80", cache: "95" },
    optimistic: { label: "乐观", input: "90", cache: "100" },
};
function serviceFeedback(message: any) {
    serviceUiState.feedback = String(message);
}
function readPreset() {
    try {
        const p = JSON.parse(localStorage.getItem(PRESET_KEY) || "null");
        return p && p.version === 1 && typeof p.query === "string" && p.query.length <= 16000 ? p : null;
    }
    catch (err) {
        return null;
    }
}
function syncPresetButtons() {
    serviceUiState.presetSaved = !!readPreset();
}
function syncServiceControls() {
    serviceViewHooks.renderCost?.();
    syncPickerScopeControls();
}
function syncCostChips() {
    // Text, controls and accessible tables are rendered by Vue.
}
function pickerScopeText() {
    const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "月均预算 ≤" + fmtCNY(Number(pickerState.budget));
    const billing = { M: "月付标价", A: "自动续费", Y: "年付折月" }[pickerState.billing] || "月付标价";
    return `${budget} · ${REGION_LABEL[pickerState.region] || "不限地区"} · ${SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具"} · ${billing}`;
}
function syncPickerScopeControls() {
    // Vue reads scope state, billing constraints and budget availability directly.
}
function applyPickerScope(name: any) {
    const scopes = { personal: { state: personalState, render: renderPersonalChart }, metrics: { state: metricsState, render: renderMetricsTable }, table: { state: tableState, render: renderTable }, rank: { state: rankState, render: renderRankChart } };
    const scope = scopes[name];
    if (!scope)
        return;
    updateAppState(() => {
        scope.state.fromPicker = !scope.state.fromPicker;
        if (name === "table") {
            tableState.sortKey = tableState.fromPicker ? "selectedMonthly" : "priceM";
            tableState.sortDir = 1;
        }
    }, () => {
        scope.render();
        syncPickerScopeControls();
    });
}
function costModelKey(text: any) { return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
/* 官方积分系数区间和 credits 面值不使用请求折算的 20K/次假设。 */
function quotaUsesRequestTokenAssumption(m: any) {
    return !(m.creditCNY != null || m.creditUSD != null || (m.wkLowM != null && provenance(m).conf !== "低"));
}
function setCostInputs(values: any) {
    Object.assign(calcState, values);
}
function recommendedApi(main: any) {
    if (!main)
        return null;
    const role = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
    const metric = metricForRole(main.p, role);
    const models = resolvedField(main.p, "models");
    const exact = API_PRICES.filter((api: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => {
        if (!isPriceConfirmed(api, "api"))
            return false;
        if (metric && costModelKey(api.model) === costModelKey(metric.m.model))
            return true;
        if (!role || !role.re.test(api.model))
            return false;
        /* 没有逐模型额度也可按完整模型名匹配牌价；不把只有家族名称的记录推断成某一版本。 */
        const name = String(api.model).split(/[\s-]+/).map(escRe).join("[\\s-]*");
        return new RegExp("(^|[^\\w.-])" + name + "(?=$|[^\\w.-])", "i").test(models);
    });
    return exact.find((api: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => api.vendor === main.p.vendor) || exact.find((api: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => api.region === main.p.region) || exact[0] || null;
}
function openWorkloadCalculator() {
    const main = chooseMain(eligibleProfiles()), api = recommendedApi(main);
    updateAppState(() => {
        if (pickerState.budget !== "any")
            setCostInputs({ budget: pickerState.budget });
        if (api && calcState.model !== api.vendor + "|" + api.model) {
            setCostInputs({ model: api.vendor + "|" + api.model, cachePrice: "" });
        }
    }, renderCostCalculator);
    const calculator = byId("costCalculator");
    if (calculator)
        calculator.setAttribute("open", "");
    serviceFeedback((pickerState.budget === "any" ? "选购预算不限，计算器保留你当前填写的月预算。" : "已带入当前月均预算。") +
        (api ? "已选择与推荐同名的 API 模型；缓存单价请按计费规则填写。" : "推荐模型没有可精确匹配的 API 报价，保留计算器当前模型；两者额度不能直接互相抵扣。"));
    navigateToSection("#s4");
}
/* 推荐摘要是纯文本，方便贴到聊天或文档；链接带上当前条件并回到「帮我选」。 */
async function copyPickerSummary() {
    const query = appQueryString();
    const url = location.href.split(/[?#]/)[0] + (query ? "?" + query : "") + "#quick";
    const ok = await copyTextToClipboard(pickerSummaryText(url));
    serviceFeedback(ok ? "已复制推荐摘要，可直接粘贴到聊天或文档；价格以官网为准。" : "复制失败，请改用「复制当前方案链接」。");
}
async function shareCurrentResults() {
    const query = appQueryString();
    const url = location.href.split(/[?#]/)[0] + (query ? "?" + query : "") + (location.hash || "");
    const ok = await copyTextToClipboard(url);
    serviceFeedback(ok ? "已复制当前方案链接，包含筛选、对比与费用计算条件。" : "复制失败，请从地址栏复制当前链接。");
}
function savePreset() {
    const query = appQueryString();
    if (query.length > 16000) {
        serviceFeedback("筛选条件过长，请缩短搜索词后再保存。");
        return;
    }
    try {
        localStorage.setItem(PRESET_KEY, JSON.stringify({ version: 1, query }));
        syncPresetButtons();
        serviceFeedback("已在本机保存当前筛选、对比和计算条件。");
    }
    catch (err) {
        serviceFeedback("浏览器无法保存本地条件，仍可复制方案链接。");
    }
}
function restorePreset() {
    const preset = readPreset();
    if (!preset) {
        syncPresetButtons();
        serviceFeedback("没有可恢复的条件，请先保存。");
        return;
    }
    const query = preset.query ? "?" + preset.query : "";
    try {
        history.pushState(null, "", location.pathname + query + (location.hash || ""));
    }
    catch (err) { /* 文件直开仍能在本页恢复条件。 */ }
    restoreHistoryState(query, false);
    syncUrl();
    serviceFeedback("已恢复常用条件。");
}
function clearPreset() {
    try {
        /* 空值与删除等效，兼容受限存储和页面测试替身。 */
        localStorage.setItem(PRESET_KEY, "null");
        syncPresetButtons();
        serviceFeedback("已删除本机保存的条件。");
    }
    catch (err) {
        serviceFeedback("浏览器不允许修改本地保存的条件。");
    }
}
/* 官方缓存命中单价（与牌价同币种）：只读结构化的 apiCache，未录入时返回 null，不从备注猜测。 */
function officialCachePrice(api?: WorkloadApi | null): number | null {
    return api && typeof api.apiCache === "number" && Number.isFinite(api.apiCache) ? api.apiCache : null;
}
/* 使用总tokens（输入+输出），缓存率只作用于输入。缓存价留空时采用官方缓存命中价；
   该模型未录入官方缓存价时按普通输入计费，不虚构折扣。缓存写入与存储费不在估算内。 */
function calculateWorkload(state: WorkloadState, api?: WorkloadApi | null): WorkloadResult | null {
    if (!api || !Object.keys(COST_CONTROLS).every((key: string) => validCalcValue(key, state[key])))
        return null;
    const inputPrice = api.cur === "CNY" ? api.inCNY : api.inUSD;
    const outputPrice = api.cur === "CNY" ? api.outCNY : api.outUSD;
    const official = officialCachePrice(api);
    const cacheBasis = state.cachePrice !== "" ? "custom" : official != null ? "official" : "none";
    const cachePrice = cacheBasis === "custom" ? Number(state.cachePrice) : official ?? inputPrice;
    if (![inputPrice, outputPrice, cachePrice].every((v: any) => Number.isFinite(v) && v >= 0) || cachePrice > inputPrice)
        return null;
    const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
    const blended = inputShare * (cacheShare * cachePrice + (1 - cacheShare) * inputPrice) + (1 - inputShare) * outputPrice;
    const monthlyM = Number(state.requests) * Number(state.tokens) * Number(state.days) / 1e6;
    const costNative = monthlyM * blended, costCNY = toCNY(costNative, api.cur);
    const noCacheCNY = toCNY(monthlyM * (inputShare * inputPrice + (1 - inputShare) * outputPrice), api.cur);
    const monthlyBudgetM = blended > 0 ? Number(state.budget) / toCNY(blended, api.cur) : null;
    return { monthlyM, blended, costNative, costCNY, noCacheCNY, monthlyBudgetM, cachePrice, cacheBasis };
}
function calculateCostScenarios(state: WorkloadState, api?: WorkloadApi | null): CostScenarioResult[] {
    return Object.entries(COST_SCENARIOS).map(([id, scenario]: [string, { label: string; input: string; cache: string; } | { label: string; input: string; cache: string; } | { label: string; input: string; cache: string; }]) => {
        const result = calculateWorkload({ ...state, input: scenario.input, cache: scenario.cache }, api);
        return result ? { id, ...scenario, ...result, lowCNY: result.costCNY * 0.8, highCNY: result.costCNY * 1.2 } : null;
    }).filter(Boolean);
}
/* 缓存单价输入框标明原币，并提示留空时采用的官方价，避免把人民币价填进美元模型。 */
function syncCachePriceHint(api: any) {
    // The cache unit and placeholder follow the selected API model in Vue.
}
/* 计算器的小额（如每次请求）保留两位有效数字，避免把 ¥0.032 显示成 ¥0；常规金额沿用页面精度。 */
function fmtCalcCNY(n: any) {
    if (!Number.isFinite(n))
        return "—";
    return n > 0 && n < 1 ? "¥" + Number(n.toPrecision(2)) : fmtCNY(n);
}
function fmtCalcNative(n: any) { return n > 0 && n < 1 ? String(Number(n.toPrecision(2))) : String(Number(n.toFixed(2))); }
function renderCostCalculator() {
    serviceViewHooks.renderCost?.();
}
let planDetailsReturnFocus = null;
let planDetailsBackground = [];
function closePlanDetails() {
    serviceViewHooks.closeDetails?.();
}
function finishPlanDetailsClose() {
    serviceViewHooks.finishDetails?.();
}
function showPlanDetails(id: any, trigger: any = null) {
    serviceViewHooks.showDetails?.(String(id), trigger);
}
/* ---------- 按用量反查套餐与订阅回本点 ---------- */
/* 同模型按量单价（每百万 tokens，换算人民币）：使用当前输入占比与缓存命中率，与计算器同一口径。 */
function metricApiCNYPerM(m: any, plan: any, state: any) {
    if (![m.apiIn, m.apiOut, m.apiCache].every((v: any) => typeof v === "number" && Number.isFinite(v)))
        return null;
    const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
    const blended = inputShare * (cacheShare * m.apiCache + (1 - cacheShare) * m.apiIn) + (1 - inputShare) * m.apiOut;
    const value = toCNY(blended, m.apiCur || plan.cur);
    return Number.isFinite(value) && value > 0 ? value : null;
}
/* 参考月额度下限覆盖本月用量的套餐：只用官方或中置信折算（第三方与请求次数估算不作「够用」依据），
   沿用帮我选的地区、工具与付款方式，按月均价从低到高。每档只保留一行：优先能覆盖的主力模型。 */
function usageCoverageRows(monthlyM: any, state: { model: string; requests: string; tokens: string; days: string; input: string; cache: string; cachePrice: string; budget: string; scenario: string; } = calcState) {
    const byPlan = new Map();
    for (const m of METRICS_ALL) {
        const p = m.ref != null ? findPlanReference(m.ref) : null;
        if (!p || !metricOfferOk(m) || !recommendablePlan(p) || !isPersonalMonthly(p))
            continue;
        if ((pickerState.region !== "all" && p.region !== pickerState.region) || !matchesTool(p, pickerState.tool))
            continue;
        const quote = pickerPaymentQuote(p);
        const c = computeMetrics(m), conf = provenance(m).conf;
        if (!quote.available || !c || c.moLow == null || !(conf === "高" || conf === "中") || c.moLow < monthlyM)
            continue;
        const row = { p, m, c, conf, quote, flagship: isFlagshipModelName(m.model) };
        const previous = byPlan.get(p.id);
        if (!previous || (row.flagship && !previous.flagship) || (row.flagship === previous.flagship && row.c.moLow > previous.c.moLow))
            byPlan.set(p.id, row);
    }
    return [...byPlan.values()].map((row: any) => {
        const apiPerM = metricApiCNYPerM(row.m, row.p, state);
        return { ...row, apiMonthlyCNY: apiPerM == null ? null : apiPerM * monthlyM, breakEvenM: apiPerM == null ? null : row.quote.monthlyCNY / apiPerM };
    }).sort((a: any, b: any) => a.quote.monthlyCNY - b.quote.monthlyCNY || b.c.moLow - a.c.moLow);
}
/* ---------- 从 ccusage 导入用量 ---------- */
const USAGE_IMPORT_MAX = 5 * 1024 * 1024;
/* 兼容 ccusage 不同版本与子命令的 JSON：{daily:[…]}、{monthly:[…]}、{type, data:[…]}、{projects:{名称:[…]}}、直接数组。
   只读取 token 计数和日期 / 月份。Claude 记录的缓存读写与输入分开计；Codex 的缓存输入计在输入之内。 */
function parseUsageExport(text: string): UsageSummary {
    if (String(text).length > USAGE_IMPORT_MAX)
        throw new Error("文件超过 5MB，请只导出最近的按日用量。");
    let json;
    try {
        json = JSON.parse(String(text));
    }
    catch (err) {
        throw new Error("不是有效的 JSON，请粘贴 ccusage 的 --json 输出。");
    }
    const rows = Array.isArray(json) ? json
        : !json || typeof json !== "object" ? []
            : Array.isArray(json.daily) ? json.daily
                : Array.isArray(json.monthly) ? json.monthly
                    : Array.isArray(json.data) ? json.data
                        : Array.isArray(json.sessions) ? json.sessions
                            : json.projects && typeof json.projects === "object" ? Object.values(json.projects).filter(Array.isArray).flat() : [];
    const count = (v: any) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
    const days = new Set(), months = new Set();
    for (const row of rows) {
        if (!row || typeof row !== "object")
            continue;
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
function usageToCalculator(usage: UsageSummary, state: WorkloadState = calcState): UsageCalculatorValues {
    const round1 = (n: any) => String(Math.round(n * 10) / 10);
    let days = Math.max(1, Math.min(31, Number(state.days) || 22)), daily;
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
function importUsageText(text: any) { serviceViewHooks.importUsage?.(String(text)); }
function bindUsageImport() {
    // Text, controls and accessible tables are rendered by Vue.
}
function bindServiceEvents() {
    syncServiceControls(); syncPresetButtons();
}

/* SOURCE: js/app-maintenance.js */
/* ============ 数据可信、关注变更、真实任务测评与贡献 ============ */
"use strict";
const FOLLOW_KEY = "cp-followed-plans-v1";
/* 我的关注、维护记录、贡献者测评、帮助补全与公开评测由 Vue 组件渲染（src/sections/）。本文件保留它们的状态、数据与计算，
   组件读写共享状态，按需数据是经典脚本定义的全局常量，
   不在响应式系统里，数据到达时递增 dataRevision，组件据此重新读取。 */
/** @typedef {{ version: number, planIds: string[], readChangeIds: string[] }} FollowState */
const followState = appState({ version: 1, planIds: [], readChangeIds: [] } as FollowState);
/* 关注同步链接 ?follow=plan-0002,plan-0031：只在打开页面时读取一次（启动后地址栏会规范化去掉该参数），
   由用户确认后才合并进本机关注；链接不含已读记录。 */
function readFollowImport() {
    try {
        const raw = new URLSearchParams(location.search).get("follow") || "";
        return [...new Set(raw.split(",").map((id: string) => id.trim()).filter((id: string) => /^plan-[a-z0-9-]{1,40}$/.test(id)))].slice(0, 500);
    }
    catch (e) {
        return [];
    }
}
/* importIds：待用户确认的关注同步；storageMessage：本机存储不可用时的说明；feedback：最近一次关注操作的提示。 */
const followView = appState({ importIds: readFollowImport(), storageMessage: "", feedback: "" });
const maintenanceView = appState({ planId: "", recordFilter: "all", publicDataFeedback: "" });
const benchmarkFilter = appState({ task: "all", tool: "all", model: "all" });
const dataRevision = appState({ maintenance: 0, benchmark: 0 });
const publicBenchmarkState = appState({ id: "deepswe-v1-1", family: "", search: "", mode: "best" });
const publicBenchmarkChartState = appState({ metric: "score", limit: "20" });
/** @type {{ renderChart: (() => void) | null }} 公开评测组件挂载后登记图表重绘，供懒加载、主题与尺寸变化时调用 */
const publicBenchmarkHooks: { renderChart: (() => void) | null; } = { renderChart: null };
function renderPublicBenchmarks() { dataRevision.benchmark++; }
function renderPublicBenchmarkChart() { if (publicBenchmarkHooks.renderChart)
    publicBenchmarkHooks.renderChart(); }
/** @returns {MaintenanceSnapshot} */
function maintenanceData(): MaintenanceSnapshot {
    return typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
        ? /** @type {MaintenanceSnapshot} */ MAINTENANCE as MaintenanceSnapshot : { schemaVersion: 1, generatedAt: "", checkedThrough: "", summary: { total: 0, verified: 0, unverified: 0, stale: 0 }, records: [], reviews: [], changes: [] };
}
/** @returns {BenchmarkSnapshot} */
function benchmarkData(): BenchmarkSnapshot {
    return typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1
        ? /** @type {BenchmarkSnapshot} */ BENCHMARKS as BenchmarkSnapshot : { schemaVersion: 1, generatedAt: "", tasks: [], runs: [], methodology: "" };
}
/* 按需数据未就绪（加载中或下载失败）时只说明待加载，不显示「没有记录」一类结论；进度与重试见标签顶部状态行。 */
function optionalPendingText(what: any) { return `${what}将在数据加载后显示。`; }
/** @returns {PublicBenchmarkSnapshot} */
function publicBenchmarkData(): PublicBenchmarkSnapshot {
    const data = benchmarkData().public;
    return data && data.schemaVersion === 1 ? data : { schemaVersion: 1, checkedAt: "", benchmarks: [], scores: [] };
}
function selectedPublicBenchmark() {
    const all = publicBenchmarkData().benchmarks;
    const rows = publicBenchmarkState.family ? all.filter((b: PublicBenchmarkProtocol) => b.family === publicBenchmarkState.family) : all;
    return rows.find((b: PublicBenchmarkProtocol) => b.id === publicBenchmarkState.id) || defaultPublicBenchmarkForFamily(publicBenchmarkState.family, rows);
}
function defaultPublicBenchmarkForFamily(family: any, rows: any) {
    const preferred = { osworld: "osworld-2-25443e96866dc9ce", hle: "hle-diamond-2026-high-closed-book-multimodal", deepswe: "deepswe-v1-1" }[String(family || "deepswe").toLowerCase()];
    return rows.find((b: any) => b.id === preferred) || rows[0] || null;
}
function publicBenchmarkFamilyLabel(family: any) {
    return { deepswe: "DeepSWE · 编程", cursorbench: "CursorBench · 编程", "swe-bench": "SWE-bench · 编程", osworld: "OSWorld · GUI 操作", hle: "HLE · 综合学术" }[family.toLowerCase()] || family;
}
const PUBLIC_BENCHMARK_FAMILY_ORDER = ["deepswe", "cursorbench", "swe-bench", "osworld", "hle"];
function publicBenchmarkFamilies() {
    return [...new Set(publicBenchmarkData().benchmarks.map((b: PublicBenchmarkProtocol) => b.family))]
        .sort((a: string, b: string) => PUBLIC_BENCHMARK_FAMILY_ORDER.indexOf(a.toLowerCase()) - PUBLIC_BENCHMARK_FAMILY_ORDER.indexOf(b.toLowerCase()));
}
/* 名称与版本相同的协议补上各自不同的配置项（如 a11y、coding action），仍相同时加官方更新日期或序号。 */
function publicBenchmarkLabels(list: any) {
    const base = (b: any) => b.name.toLowerCase().includes(b.version.toLowerCase()) ? b.name : `${b.name} · ${b.version}`;
    const groups = new Map();
    list.forEach((b: any) => groups.set(base(b), [...(groups.get(base(b)) || []), b]));
    const labels = new Map();
    groups.forEach((group: any, key: any) => {
        if (group.length === 1) {
            labels.set(group[0], key);
            return;
        }
        const tokens = group.map((b: any) => String(b.configuration || "").split(/[；;]/).map((t: string) => t.trim()).filter(Boolean));
        const common = tokens[0].filter((t: any) => tokens.every((list: any) => list.includes(t)));
        group.forEach((b: any, i: any) => {
            const diff = tokens[i].filter((t: any) => !common.includes(t));
            labels.set(b, diff.length ? `${key} · ${diff.join(" · ")}` : key);
        });
        const seen = new Map();
        group.forEach((b: any) => seen.set(labels.get(b), (seen.get(labels.get(b)) || 0) + 1));
        group.forEach((b: any, i: any) => { if (seen.get(labels.get(b)) > 1)
            labels.set(b, `${labels.get(b)} · 官方更新 ${publicBenchmarkDate(b.sourceUpdatedAt)} · #${i + 1}`); });
    });
    return list.map((b: any) => [b, labels.get(b)]);
}
function publicBenchmarkRows() {
    const benchmark = selectedPublicBenchmark();
    if (!benchmark)
        return [];
    /* 同一评测协议中的名次固定；搜索只筛行，不把第十名显示成第一名。 */
    let sorted = publicBenchmarkData().scores.filter((r: PublicBenchmarkScore) => r.benchmarkId === benchmark.id && typeof r.score === "number" && Number.isFinite(r.score))
        .slice().sort((a: PublicBenchmarkScore, b: PublicBenchmarkScore) => b.score - a.score || a.model.localeCompare(b.model));
    if (publicBenchmarkState.mode !== "all") {
        const seen = new Set();
        sorted = sorted.filter((r: PublicBenchmarkScore) => { if (seen.has(r.model))
            return false; seen.add(r.model); return true; });
    }
    let rank = 0, previousScore = null;
    const ranked = sorted.map((r: PublicBenchmarkScore, i: number) => { if (previousScore !== r.score)
        rank = i + 1; previousScore = r.score; return { ...r, rank }; });
    const q = publicBenchmarkState.search.trim();
    return q ? ranked.filter((r: { rank: number; id: string; benchmarkId: string; model: string; reasoning: string | null; agent: string | null; score: number; costUSD: number | null; costNote: string | null; uncertainty: string | null; tokens: number | null; steps: number | null; sourceUrl: string; checkedAt: string; }) => queryHit(foldSearch([r.model, r.reasoning, r.agent].filter(Boolean).join(" ")), q)) : ranked;
}
/** 只接受 https 来源链接；其他协议（含 javascript:）一律视为未公布。 */
function publicBenchmarkSourceUrl(url: any) {
    return typeof url === "string" && /^https:\/\//i.test(url.trim()) ? url.trim() : "";
}
function publicScoreText(score: any, unit: any) { return Number(score.toFixed(1)) + unit; }
function publicCostText(cost: any) {
    return cost == null ? "未公布" : cost > 0 && cost < 0.01 ? "小于 $0.01" : "$" + Number(cost.toFixed(2));
}
function publicModelDisplayName(model: any) {
    const name = displayModelName(String(model).replace(/(\d)-(\d)(?=-|$)/g, "$1.$2"));
    return name.replace(/^Claude-(Opus|Sonnet|Haiku|Fable)-/i, "Claude $1 ")
        .replace(/^(GPT|GLM|Gemini|Qwen|DeepSeek|MiniMax|MiMo|Grok)-([\d.]+)-/i, "$1-$2 ")
        .replace(/^(Opus|Sonnet|Haiku|Fable)[\s-]+(\d)/i, "Claude $1 $2");
}
/* 模式只取决于名称本身（无 g 标志、无 lastIndex 状态），可安全复用；搜索重绘不再逐行逐套餐重新编译正则。 */
const publicPatternCache = new Map();
function publicModelExactPattern(name: any) {
    let re = publicPatternCache.get(name);
    if (!re) {
        const pattern = name.split(/[\s-]+/).map(escRe).join("[\\s-]*");
        re = new RegExp("(^|[^a-z0-9])" + pattern + "(?![a-z0-9.-]|\\s+(?:pro|flash|lite|mini|nano|preview|exp|plus|ultra|max|fast|turbo|thinking)\\b)", "i");
        publicPatternCache.set(name, re);
    }
    return re;
}
function publicModelClauseIncludes(part: any, label: any) {
    const match = publicModelExactPattern(label).exec(part);
    if (!match)
        return false;
    /* 冒号不截断否定语境：「本档不支持：Kimi-K3」整句仍是否定。 */
    const prefix = part.slice(0, match.index + match[1].length).split(/[）)，,；;]/).pop();
    const suffix = part.slice(match.index + match[0].length);
    return !/不含|不支持|不可用/.test(prefix) &&
        !/^[\s（(]*(?:需\s*(?:usage\s*credits|按量|额外付费)|(?:不支持|不可用|未包含)(?=[）),，;；]|$))/i.test(suffix);
}
function publicModelIncluded(p: any, name: any) {
    /* 结构化排除优先于文本匹配。 */
    if (Array.isArray(p.modelExcludes) && p.modelExcludes.some((x: any) => publicModelExactPattern(name).test(String(x)) || publicModelExactPattern(String(x)).test(name)))
        return false;
    const included = splitModelAccess(resolvedField(p, "models")).included;
    const parts = included.split(/[/、；]/);
    const names = [name];
    /* Claude 的共享品牌前缀及官方 GPT 全系括号内的精确版本，均来自套餐明确列出的文本。 */
    if (/^Claude (?:Opus|Sonnet|Haiku|Fable)\b/i.test(name))
        names.push(name.replace(/^Claude /i, ""));
    if (names.some((label: any) => parts.some((part: string) => publicModelClauseIncludes(part, label))))
        return true;
    const gpt = name.match(/^GPT-(\d+(?:\.\d+)?)\s+(.+)$/i);
    if (p.vendor === "OpenAI" && gpt) {
        const group = included.match(new RegExp("\\bGPT[\\s-]*" + escRe(gpt[1].split(".")[0]) + "(?![\\d.])\\s*全系[（(]([^）)]+)[）)]", "i"));
        const short = (gpt[1].includes(".") ? gpt[1] + " " : "") + gpt[2];
        if (group && !/不含|不支持|不可用/.test(included.split(/[、；]/).find((part: string) => part.includes(group[0])) || "") &&
            group[1].split("/").some((part: string) => part.trim().toLowerCase() === short.toLowerCase()))
            return true;
        /* 如 GPT-6 Sol / Luna / Astra，简称仅继承前一个明确模型的版本，遇到新系列即重置。 */
        return included.split(/[、；;]/).some((segment: string) => {
            if (/不含|不支持|不可用|需\s*(?:usage\s*credits|按量|额外付费)/i.test(segment))
                return false;
            let version = "";
            return segment.split("/").some((part: string) => {
                const explicit = part.trim().match(/^GPT[\s-]*(\d+(?:\.\d+)?)[\s-]+(?:Astra|Sol|Luna)$/i);
                if (explicit) {
                    version = explicit[1];
                    return false;
                }
                if (!/^(?:Astra|Sol|Luna)$/i.test(part.trim())) {
                    version = "";
                    return false;
                }
                return version === gpt[1] && publicModelClauseIncludes(part, gpt[2]);
            });
        });
    }
    return false;
}
/* 模型出品方的官方订阅排在前面，再按月费；第三方工具与云厂商随后。 */
/** @type {[RegExp, string[]][]} */
const PUBLIC_MODEL_MAKERS: [RegExp, string[]][] = [
    [/^claude/i, ["Anthropic"]], [/^gpt/i, ["OpenAI"]], [/^gemini/i, ["Google"]], [/^glm/i, ["智谱 BigModel", "Z.ai"]],
    [/^kimi/i, ["月之暗面 Kimi"]], [/^minimax/i, ["MiniMax"]], [/^mimo/i, ["小米 MiMo"]], [/^qwen/i, ["阿里云百炼"]],
    [/^deepseek/i, ["DeepSeek"]], [/^grok/i, ["xAI"]], [/^step/i, ["阶跃星辰 StepFun"]],
];
function publicModelMakers(name: any) { return (PUBLIC_MODEL_MAKERS.find(([re]: [RegExp, string[]]) => re.test(name)) || [null, []])[1]; }
function publicPlanEligible(p: any) {
    return metricOfferOk({ ref: p.id }) && !isRelay(p) && (p.priceM > 0 || isFreeCodingEntry(p)) && p.includedModelQuota !== false && p.modelAccess !== "byok" && p.modelAccess !== "metered";
}
function publicModelPlans(model: any) {
    const name = publicModelDisplayName(model), makers = publicModelMakers(name);
    return PLANS.filter((p: Plan) => publicPlanEligible(p) && publicModelIncluded(p, name))
        .sort((a: Plan, b: Plan) => Number(!makers.includes(a.vendor)) - Number(!makers.includes(b.vendor)) || (cnyOf(a, "M") || 0) - (cnyOf(b, "M") || 0));
}
/* 套餐只列出同系列较新版本时（如 Opus 5.5 之于 Opus 5），提示出品方官方套餐，避免误以为只有第三方能用该系列。 */
/** @returns {{ family: string, version: number, plans: Plan[] } | null} */
function publicNewerVersion(model: any, plans: any): { family: string; version: number; plans: Plan[]; } {
    const name = publicModelDisplayName(model), makers = publicModelMakers(name);
    if (!makers.length || plans.some((p: any) => makers.includes(p.vendor)))
        return null;
    const m = name.match(/^(.*?)[\s-]*(\d+(?:\.\d+)?)$/);
    if (!m)
        return null;
    const family = m[1].replace(/^Claude\s+/i, ""), current = Number(m[2]);
    const re = new RegExp("(?:^|[^a-z0-9])" + family.split(/[\s-]+/).map(escRe).join("[\\s-]*") + "[\\s-]*(\\d+(?:\\.\\d+)?)(?![\\d.])", "gi");
    const newer = PLANS.filter((p: Plan) => makers.includes(p.vendor) && publicPlanEligible(p)).map((p: Plan) => {
        /* 与精确匹配同一条款判断：被否定或「需 usage credits / 按量」的版本不算包含。 */
        const versions = splitModelAccess(resolvedField(p, "models")).included.split(/[/、；;]/).flatMap((part: string) => [...part.matchAll(re)].map((x: RegExpExecArray) => Number(x[1]))
            .filter((v: number) => v > current && Math.floor(v) === Math.floor(current) && publicModelClauseIncludes(part, `${family} ${v}`)));
        return versions.length ? { p, version: Math.max(...versions) } : null;
    }).filter(Boolean);
    if (!newer.length)
        return null;
    const version = Math.max(...newer.map((x: { p: Plan; version: number; }) => x.version));
    return { family, version, plans: newer.filter((x: { p: Plan; version: number; }) => x.version === version).slice(0, 3).map((x: { p: Plan; version: number; }) => x.p) };
}
/** 评测行里的套餐链接：免费入口默认跳到免费区，其余跳到数据表。 */
function publicPlanLink(p: any, section: string = isFreeCodingEntry(p) ? "free" : "table") {
    return `?q=${encodeURIComponent(p.vendor + " " + p.plan)}#${section}`;
}
/* 帮我选卡片：本档明确列出的模型在各编程协议中的最佳名次，读首屏摘要，不依赖完整榜单。
   与「可用套餐」同一精确版本匹配；协议分别列出，不合成总分。摘要行已按分数降序，find 即本档最佳。 */
function planCodingBenchmarks(p: any, role: any = null) {
    if (typeof BENCHMARK_SUMMARY === "undefined" || BENCHMARK_SUMMARY.schemaVersion !== 1 || !p || !publicPlanEligible(p))
        return [];
    const families = new Set();
    return BENCHMARK_SUMMARY.protocols.map((protocol: BenchmarkSummaryProtocol) => {
        if (families.has(protocol.family))
            return null;
        const row = protocol.rows.find((r: BenchmarkSummaryRow) => {
            const name = publicModelDisplayName(r.model);
            return (!role || role.re.test(name)) && publicModelIncluded(p, name);
        });
        if (row)
            families.add(protocol.family);
        return row ? { protocol, row } : null;
    }).filter(Boolean);
}
/* 「模型能力优先」只读一个协议，避免把不同评测的分数混排；摘要行已按分数降序，find 即本档最佳。 */
const ABILITY_PROTOCOL_ID = "deepswe-v1-1";
function planProtocolScore(p: any, role: any = null, protocolId: string = ABILITY_PROTOCOL_ID) {
    if (typeof BENCHMARK_SUMMARY === "undefined" || BENCHMARK_SUMMARY.schemaVersion !== 1 || !p || !publicPlanEligible(p))
        return null;
    const protocol = BENCHMARK_SUMMARY.protocols.find((x: BenchmarkSummaryProtocol) => x.id === protocolId);
    if (!protocol)
        return null;
    const row = protocol.rows.find((r: BenchmarkSummaryRow) => {
        const name = publicModelDisplayName(r.model);
        return (!role || role.re.test(name)) && publicModelIncluded(p, name);
    });
    return row ? { protocol, row } : null;
}
function publicUncertaintyLabel(row: any) {
    if (!row.uncertainty)
        return "置信区间未公布";
    const range = String(row.uncertainty).match(/([\d.]+)%?\s*[–—-]\s*([\d.]+)%/);
    return range ? `来源区间 ${Number(Number(range[1]).toFixed(1))}–${Number(Number(range[2]).toFixed(1))}%` : String(row.uncertainty);
}
function publicBenchmarkDate(value: any) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value || "未公布";
}
function publicBenchmarkConfiguration(row: any) {
    return [row.reasoning ? "推理：" + row.reasoning : "推理配置未公布", row.agent ? "Agent：" + row.agent : "Agent 配置未公布", "Tokens：" + (row.tokens == null ? "未公布" : row.tokens), "Steps：" + (row.steps == null ? "未公布" : row.steps)].join("；");
}
function publicBenchmarkChartRows() {
    const rows = publicBenchmarkRows();
    const ranked = publicBenchmarkChartState.metric === "cost" ? rows.filter((r: { rank: number; id: string; benchmarkId: string; model: string; reasoning: string | null; agent: string | null; score: number; costUSD: number | null; costNote: string | null; uncertainty: string | null; tokens: number | null; steps: number | null; sourceUrl: string; checkedAt: string; }) => r.costUSD != null) : rows;
    return publicBenchmarkChartState.limit === "all" ? ranked : ranked.slice(0, Number(publicBenchmarkChartState.limit));
}
const PUBLIC_CHART_FAMILIES = [
    { id: "gpt", label: "GPT / o 系列", re: /^(?:gpt|o[134](?:\b|-))/i },
    { id: "claude", label: "Claude", re: /^claude/i },
    { id: "gemini", label: "Gemini", re: /^gemini/i },
    { id: "glm", label: "GLM", re: /^glm/i },
    { id: "kimi", label: "Kimi", re: /^kimi/i },
    { id: "deepseek", label: "DeepSeek", re: /^deepseek/i },
    { id: "qwen", label: "Qwen", re: /^qwen/i },
    { id: "minimax", label: "MiniMax", re: /^minimax/i },
    { id: "grok", label: "Grok", re: /^grok/i },
    { id: "composer", label: "Composer", re: /^composer/i },
    { id: "mimo", label: "MiMo", re: /^mimo/i },
    { id: "other", label: "其他系列", re: /./ },
];
function publicChartFamily(model: any) {
    return PUBLIC_CHART_FAMILIES.find((family: { id: string; label: string; re: RegExp; }) => family.re.test(publicModelDisplayName(model))) || PUBLIC_CHART_FAMILIES[PUBLIC_CHART_FAMILIES.length - 1];
}
function publicChartColors() {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(PUBLIC_CHART_FAMILIES.map((family: { id: string; label: string; re: RegExp; }) => [family.id, style.getPropertyValue("--bench-" + family.id).trim() || PAL.info]));
}
function publicChartAxisName(label: any, narrow: any) {
    const name = label.replace(/^(#\d+ )Claude /, "$1");
    if (!narrow)
        return name;
    return name.split(" · ")[0].replace(/^(#\d+ \S+) (.+)$/, "$1\n$2")
        .replace(/^(#\d+ Qwen[\d.]+)-(.+)$/, "$1\n$2")
        .replace(/^(#\d+ (?:DeepSeek|Muse-Spark|MiniMax|MiMo))-(.+)$/, "$1\n$2");
}
function publicBenchmarkCsv() {
    const benchmark = selectedPublicBenchmark();
    if (!benchmark)
        return "";
    const columns = ["协议 ID", "评测", "版本", "范围", "协议配置", "展示模式", "名次", "模型", "推理配置", "Agent", "分数", "单位", "官方评测每任务成本 USD", "成本说明", "不确定性", "Tokens", "Steps", "成绩来源", "核查日期", "协议来源", "官方标注日期"];
    return [columns.map(csvCell).join(","), ...publicBenchmarkRows().map((r: { rank: number; id: string; benchmarkId: string; model: string; reasoning: string | null; agent: string | null; score: number; costUSD: number | null; costNote: string | null; uncertainty: string | null; tokens: number | null; steps: number | null; sourceUrl: string; checkedAt: string; }) => [benchmark.id, benchmark.name, benchmark.version, benchmark.scope, benchmark.configuration, publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置", r.rank, r.model, r.reasoning, r.agent, r.score, benchmark.unit, r.costUSD, r.costNote, r.uncertainty, r.tokens, r.steps, r.sourceUrl, r.checkedAt, benchmark.sourceUrl, benchmark.sourceUpdatedAt].map(csvCell).join(","))].join("\r\n");
}
function cleanFollowState(value: any) {
    const planIds = new Set(PLANS.map((p: Plan) => p.id));
    /* 未下载历史时保留已读ID，避免首屏把上次访问的标记清空。 */
    const changeIds = optionalDataLoaded("maintenance") ? new Set(maintenanceData().changes.map((c: MaintenanceChange) => c.changeId)) : null;
    const clean = (values: any, allowed: any, max: any) => Array.isArray(values)
        ? [...new Set(values.filter((v: any) => typeof v === "string" && (allowed ? allowed.has(v) : /^change-[\w-]{1,100}$/.test(v))))].slice(0, max) : [];
    return { version: 1, planIds: clean(value && value.planIds, planIds, 500), readChangeIds: clean(value && value.readChangeIds, changeIds, 10000) };
}
function loadFollowState() {
    try {
        const raw = localStorage.getItem(FOLLOW_KEY);
        Object.assign(followState, cleanFollowState(raw ? JSON.parse(raw) : null));
    }
    catch (e) {
        followView.storageMessage = "本机关注存储不可用或已损坏；本页仍可关注，关闭后不会保留。";
    }
}
function persistFollowState() {
    try {
        localStorage.setItem(FOLLOW_KEY, JSON.stringify(followState));
        followView.storageMessage = "";
    }
    catch (e) {
        followView.storageMessage = "本机关注存储不可用；本页操作已生效，关闭后不会保留。";
    }
}
function isPlanFollowed(id: any) { return followState.planIds.includes(id); }
/** @returns {Plan[]} */
function followedPlans(): Plan[] {
    return followState.planIds.map((id: string) => PLANS.find((p: Plan) => p.id === id)).filter(Boolean);
}
function followedChanges() {
    return maintenanceData().changes.filter((c: MaintenanceChange) => followState.planIds.includes(c.id));
}
function unreadFollowedChanges() {
    return followedChanges().filter((c: MaintenanceChange) => !followState.readChangeIds.includes(c.changeId));
}
function followFeedback(text: any) {
    const message = text + (followView.storageMessage ? " " + followView.storageMessage : "");
    followView.feedback = message;
}
function toggleFollowPlan(id: any) {
    const p = PLANS.find((plan: Plan) => plan.id === id);
    if (!p)
        return false;
    const on = isPlanFollowed(id);
    followState.planIds = on ? followState.planIds.filter((v: string) => v !== id) : [...followState.planIds, id];
    persistFollowState();
    followFeedback(`${on ? "已取消关注" : "已关注"} ${planTitle(p)}。关注与已读记录仅保存在本机，不上传，也不包含在分享链接中。`);
    return true;
}
function markFollowedChangesRead() {
    followState.readChangeIds = [...new Set([...followState.readChangeIds, ...followedChanges().map((c: MaintenanceChange) => c.changeId)])];
    persistFollowState();
    followFeedback("已将当前关注套餐的已确认变更标为已读；之后新收录的变更仍会提示。");
}
/**
 * 只保留 https 证据链接。
 * @param {unknown[] | null | undefined} urls
 * @returns {string[]}
 */
function maintenanceSourceUrls(urls: unknown[]): string[] {
    return (urls || []).flatMap((url: unknown) => typeof url === "string" && /^https:\/\//i.test(url.trim()) ? [url.trim()] : []);
}
function changeValue(value: any) {
    if (value == null)
        return "未记录";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}
const CHANGE_FIELD_LABELS = { priceM: "月付价", priceY: "年付折月价", annualTotal: "年付全年金额", quota: "额度", models: "模型", tools: "工具", note: "备注", status: "核查状态", inUSD: "输入 USD/M", outUSD: "输出 USD/M", inCNY: "输入 CNY/M", outCNY: "输出 CNY/M", cacheUSD: "缓存 USD/M", cacheCNY: "缓存 CNY/M" };
function changeKindLabel(kind: any) { return kind === "plan" ? "套餐" : kind === "api" ? "API" : "按量参考"; }
/** @returns {{ label: string, before: string, after: string }[]} */
function changeFields(change: any): { label: string; before: string; after: string; }[] {
    return change.fields.map((field: any) => ({ label: CHANGE_FIELD_LABELS[field] || field, before: changeValue(change.before[field]), after: changeValue(change.after[field]) }));
}
function planChanges(id: any) { return maintenanceData().changes.filter((c: MaintenanceChange) => c.id === id); }
const PLAN_HISTORY_EMPTY = "尚未收录本档的已确认变更；当前值与核查日期见完整权益。首次收录是基线，不代表曾经涨价或降价。";
function planHistorySummary(id: any) {
    return optionalDataLoaded("maintenance") ? `已确认价格与权益历史（${planChanges(id).length} 条）` : "已确认价格与权益历史";
}
function followSyncUrl() {
    return location.href.split(/[?#]/)[0] + "?follow=" + followState.planIds.join(",") + "#updates";
}
async function copyFollowLink() {
    if (!followState.planIds.length)
        return;
    const ok = await copyTextToClipboard(followSyncUrl());
    followFeedback(ok ? "已复制关注同步链接。在另一台设备或浏览器打开后，选择「合并到本机关注」即可；链接只含套餐 ID，不含已读记录。"
        : "复制失败，请改用该设备手动关注。");
}
/** 链接带来的、尚未在本机关注的套餐。 @returns {{ plans: Plan[], fresh: Plan[] }} */
function followImportPlans(): { plans: Plan[]; fresh: Plan[]; } {
    const plans = followView.importIds.map((id: string) => PLANS.find((p: Plan) => p.id === id)).filter(Boolean);
    return { plans, fresh: plans.filter((p: Plan) => !isPlanFollowed(p.id)) };
}
function applyFollowImport(merge: any) {
    const valid = followView.importIds.filter((id: string) => PLANS.some((p: Plan) => p.id === id));
    if (merge) {
        followState.planIds = [...new Set([...followState.planIds, ...valid])].slice(0, 500);
        persistFollowState();
    }
    followView.importIds = [];
    followFeedback(merge ? `已合并链接里的 ${valid.length} 档关注，本机现关注 ${followState.planIds.length} 档。` : "已忽略链接里的关注套餐。");
}
/* 只为关注的厂商列出订阅地址；路径来自维护摘要，格式固定为 feeds/<slug>.xml。 */
function followFeeds(plans: any) {
    if (!optionalDataLoaded("maintenance"))
        return [];
    return [...new Set(plans.map((p: any) => p.vendor))]
        .map((vendor: any) => (maintenanceData().feeds || []).find((feed: { vendor: string; path: string; changes: number; }) => feed.vendor === vendor))
        .filter((feed: { vendor: string; path: string; changes: number; }) => feed && /^feeds\/[a-z0-9-]+\.xml$/.test(feed.path))
        .map((feed: { vendor: string; path: string; changes: number; }) => ({ path: feed.path, label: shortVendor(feed.vendor) }));
}
function maintenanceStatusLabel(status: any) {
    return { verified: "已核实", changed: "核价信息已校正", unverified: "待核实", custom: "定制询价", retired: "已停售" }[status] || status || "待核实";
}
function maintenancePlanStatus(p: any) {
    const record = maintenanceData().records.find((r: { id: string; kind: string; vendor: string; name: string; checkedAt: string; status: string; sourceUrls: string[]; ageDays: number | null; stale: boolean; }) => r.id === p.id);
    return record ? `核查 ${record.checkedAt || "日期未记录"} · ${maintenanceStatusLabel(record.status)}${record.stale ? " · 已超过复查间隔" : ""}。日期为本站核查日。`
        : optionalDataLoaded("maintenance") ? "暂无逐条维护记录。" : optionalPendingText("核查日期与状态");
}
function maintenanceRecords(filter: string = maintenanceView.recordFilter) {
    return maintenanceData().records.filter((r: { id: string; kind: string; vendor: string; name: string; checkedAt: string; status: string; sourceUrls: string[]; ageDays: number | null; stale: boolean; }) => filter === "all" || (filter === "stale" ? r.stale : r.status === "unverified"));
}
function todayLocalIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/* 复查提示按本机日期计算，不代表已重新核验。 */
function dueReviews() {
    const today = todayLocalIso();
    return maintenanceData().reviews.filter((r: { id: string; title: string; planIds?: string[]; vendor?: string; reviewOn: string; source: string; note?: string; }) => /^\d{4}-\d{2}-\d{2}$/.test(r.reviewOn) && r.reviewOn <= today)
        .map((r: { id: string; title: string; planIds?: string[]; vendor?: string; reviewOn: string; source: string; note?: string; }) => ({ ...r, overdue: r.reviewOn < today }));
}
function benchmarkFilterOptions(key: any) {
    return [...new Set(benchmarkData().runs.map((r: BenchmarkRun) => r[key]).filter((v: any) => typeof v === "string" && v))].sort();
}
function benchmarkText(value: any) { return Array.isArray(value) ? value.join("；") : String(value || ""); }
/** 贡献者实测记录的展示值：真实账单、生成时间与验收运行时间分开，未知不补零。 */
function benchmarkRunView(run: any) {
    const task = benchmarkData().tasks.find((t: BenchmarkTask) => t.id === run.taskId);
    const seconds = (value: any) => typeof value === "number" && Number.isFinite(value) ? `${value} 秒` : "未记录";
    return {
        title: `${task ? task.title : run.taskId} · ${run.model}`,
        meta: `${run.tool} · ${run.measuredAt} · ${run.passed === true ? "全部验收通过" : run.passed === false ? "验收未全部通过" : "验收状态未记录"}`,
        cost: run.costBasis === "api-receipt" && typeof run.cost === "number" && Number.isFinite(run.cost) && run.cost >= 0 ? `${run.currency} ${run.cost}`
            : run.costBasis === "included-subscription" ? "订阅内使用，未分摊单次费用" : "费用未记录",
        generation: seconds(run.generationSeconds),
        duration: seconds(run.durationSeconds),
        repeats: String(run.repeats),
        environment: run.environment || "未记录",
        evidenceUrl: maintenanceSourceUrls([run.evidence])[0] || "",
    };
}
function benchmarkRuns() {
    return benchmarkData().runs.filter((r: BenchmarkRun) => (benchmarkFilter.task === "all" || r.taskId === benchmarkFilter.task)
        && (benchmarkFilter.tool === "all" || r.tool === benchmarkFilter.tool) && (benchmarkFilter.model === "all" || r.model === benchmarkFilter.model));
}
/* 数据更新后，筛选值不在新数据里时回到「全部」。 */
function normalizeBenchmarkFilter() {
    if (!benchmarkData().tasks.some((t: BenchmarkTask) => t.id === benchmarkFilter.task))
        benchmarkFilter.task = "all";
    for (const key of ["tool", "model"])
        if (!benchmarkFilterOptions(key).includes(benchmarkFilter[key]))
            benchmarkFilter[key] = "all";
}
const CONTRIBUTION_TITLES = { correction: "套餐纠错与更新", vendor: "收录新厂商 / 套餐", benchmark: "真实任务测评" };
function contributionTemplate(type: any) {
    const p = PLANS.find((plan: Plan) => plan.id === maintenanceView.planId);
    const common = `\n\n## 官方证据\n- HTTPS 来源链接：\n- 核对日期（YYYY-MM-DD）：\n- 官方原文/截图链接：\n- 适用国家、账号资格与活动限制：\n\n## 变更内容\n- 当前页面显示：\n- 应修正/补充为：\n- 价格币种、计费周期与全年总额：\n- 模型、工具、共享额度与重置窗口：\n\n不要填写账号、API Key、付款隐私或未获许可的内容。\n`;
    if (type === "benchmark") {
        const taskId = benchmarkFilter.task === "all" ? (benchmarkData().tasks[0] || {}).id || "" : benchmarkFilter.task;
        return `# 提交可复现真实任务测评\n\n任务：${taskId}\n模型及精确版本：\n工具及版本：\n生成日期（YYYY-MM-DD）：\n实际生成时间 generationSeconds（秒，未记录填 null）：\n实际 API 账单 cost / currency：\n费用依据 costBasis（api-receipt / included-subscription / unknown）：\n同一解答重复验收次数 repeats：\n平均验收运行时间 durationSeconds（秒）：\n该解答是否全部验收通过 passed：\n操作系统、运行时与环境 environment：\nHTTPS 可公开证据 evidence：\n\n请附原始提示、模型原始解答、验收输出与费用凭证。订阅内使用或费用未知时 cost=null；repeats 是同一解答验收次数，不是模型独立尝试次数。durationSeconds 不能作为模型生成时间。不要上传 API Key 或付费账号信息。\n`;
    }
    return `# ${type === "vendor" ? "申请收录新厂商 / 套餐" : "套餐纠错 / 更新证据"}\n\n厂商：${p ? p.vendor : ""}\n套餐：${p ? p.plan : ""}\n永久套餐 ID：${p ? p.id : ""}${common}`;
}
/** 预填标题与证据模板的 Issues 地址；未配置公开仓库时为空。 */
function contributionIssueUrl(type: any, body: any) {
    const base = typeof PUBLIC_PROJECT !== "undefined" ? PUBLIC_PROJECT.githubIssuesBase : null;
    return typeof base === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/?$/.test(base)
        ? base.replace(/\/$/, "") + "/new?title=" + encodeURIComponent(CONTRIBUTION_TITLES[type] || "套餐反馈") + "&body=" + encodeURIComponent(body) : "";
}
function downloadPublicData() {
    if (!optionalDataLoaded("maintenance") || !optionalDataLoaded("benchmark")) {
        maintenanceView.publicDataFeedback = "正在加载完整公开数据…";
        Promise.all([ensureOptionalData("maintenance"), ensureOptionalData("benchmark")]).then(downloadPublicData, () => {
            maintenanceView.publicDataFeedback = "公开数据加载失败，请重试下载。";
        });
        return;
    }
    const data = { schemaVersion: 1, meta: META, plans: PLANS, apiPrices: API_PRICES, paygReferences: PAYG_REFERENCES, priceChecks: PRICE_CHECKS, maintenance: maintenanceData(), benchmarks: benchmarkData() };
    downloadTextFile(JSON.stringify(data, null, 2) + "\n", `coding-plan-public-data-${META.updated}.json`, "application/json;charset=utf-8");
    maintenanceView.publicDataFeedback = "已生成公开数据 JSON；不含本机关注、已读记录或待审队列。";
}
/* 按需数据到达后清理关注状态、规范筛选，并通知 Vue 组件重新读取。 */
function refreshOptionalViews(kind: any) {
    if (kind === "maintenance") {
        Object.assign(followState, cleanFollowState(followState));
        dataRevision.maintenance++;
    }
    else {
        normalizeBenchmarkFilter();
        dataRevision.benchmark++;
    }
}
/* 打开辅助标签或需要按需数据时调用：状态行显示加载中、失败与重试入口（贡献页的测评模板也依赖评测数据）。 */
export type OptionalViewKind = "maintenance" | "benchmark";
export const optionalViewState = appState<Record<OptionalViewKind, { message: string; failed: boolean; loading: boolean }>>({
    maintenance: { message: "", failed: false, loading: false },
    benchmark: { message: "", failed: false, loading: false },
});
function loadViewData(kind: OptionalViewKind) {
    const status = optionalViewState[kind];
    Object.assign(status, { message: optionalDataLoaded(kind) ? "" : "正在加载本标签的数据…", failed: false, loading: !optionalDataLoaded(kind) });
    return ensureOptionalData(kind).then(() => {
        Object.assign(status, { message: "", failed: false, loading: false });
        refreshOptionalViews(kind);
    }, (err: any) => {
        Object.assign(status, { message: `${err.message}。`, failed: true, loading: false });
    });
}
function bindMaintenanceEvents() {
    loadFollowState();
}

/* SOURCE: js/app-events.js */
/* ============ Coding Plan 比价中心 — 用户操作 ============ */
"use strict";
let personalSearchTimer = null, tableSearchTimer = null;
function cancelPersonalSearch() { clearTimeout(personalSearchTimer); personalSearchTimer = null; personalViewHooks.cancelSearch?.(); }
function cancelTableSearch() { clearTimeout(tableSearchTimer); tableSearchTimer = null; }
/* 用户操作持久化一次；图表重绘不写 URL。 */
function onState(target: any, type: any, handler: any) {
    target.addEventListener(type, (event: any) => updateAppState(() => handler(event)));
}
/* 排序表头共用绑定：点击/键盘翻转同列方向，换列时按 firstDir 起排（数据表从低到高，额度表按列定义） */
function bindSortableHeader(th: any, state: any, render: any, firstDir: number = 1) {
    th.tabIndex = 0;
    const sort = () => {
        if (state.sortKey === th.dataset.sort)
            state.sortDir *= -1;
        else {
            state.sortKey = th.dataset.sort;
            state.sortDir = firstDir;
        }
        render();
    };
    onState(th, "click", sort);
    onState(th, "keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sort();
    } });
}
/* ---------- 事件绑定 ---------- */
function bindEvents() { /* Vue components bind their controls directly. */ }
function bindMetricsEvents(){}

export { WEEKS_PER_MONTH, SLOTS_PER_WEEK, API_MIX_IN, API_MIX_OUT, CACHE_HIT_RATE, TOKENS_PER_REQ, blendPrice, toCNY, fromCNY, fmtTok, periodRates, windowTokens, METRICS_COMPUTED, computeMetrics, computeMetricsUncached, RANK_MAIN_EXTRA, isFlagshipModelName, CAT_LABEL, REGION_LABEL, CAT_COLOR, RELAY_COLOR, refreshCategoryColors, VENDOR_SHORT, RATE, MODEL_ROLES_ASOF, resolvePlan, appState, esc, safeHref, optionalDataLoads, optionalDataLoaded, ensureOptionalData, planBadges, mainlandAccessText, metricOfferOk, adoptMetric, METRICS_ALL, shortVendor, fmtCNY, trunc, ICON_SVG, icon, byId, qsa, qs, evtTarget, setChipPressed, describeChart, priceOf, cnyOf, priceText, currencySymbol, priceCheckLabel, priceCheckSources, priceUnit, planPriceLabel, NARROW_CHART_WIDTH, chartNarrowMode, chartHostWidth, isNarrowChart, chartRowHeight, chartAxisLabel, chartRenderer, chartCache, chartLibraryPromise, queuedChartRenders, chartLibraryReady, ensureChartLibrary, showChartError, deferChartRender, makeChart, resizeTimer, pendingChartResizes, CHART_AXIS_FONT_SIZE, resizeVisibleCharts, markChartsForResize, bindChartResize, PAL, refreshPalette, axisStyle, tipStyle, displayModelName, foldSearch, escRe, SEARCH_VENDOR_ALIASES, planSearchBlob, queryHit, THEME_KEY, themeMode, readThemeMode, applyTheme, rerenderCharts, headerHeight, navigationInitialized, syncHeaderHeight, updateActiveNav, initPageNavigation, initTheme, planLabel, cpmTier, renderStats, DEBUG_MODE, PERSONAL_DEFAULT_LIMIT, SEARCH_MAX_LENGTH, boundedSearch, CMP_MAX, personalState, rankState, pickerState, tableState, cmpState, metricsState, CALC_MODELS, CALC_DEFAULT_MODEL, calcState, CALC_LIMITS, validCalcValue, APP_DEFAULTS, MODEL_FILTER_VALUES, URL_RESTORING, setUrlRestoring, stateUpdateDepth, updateAppState, URL_KEYS, URL_DEFAULTS, URL_VALID, applyUrlState, appQueryString, syncUrl, syncControlsFromState, chartHeight, chartLogAxis, weeklyTokenRange, metricChartLabel, personalChartPrice, resetPersonalFilters, bindChartLegend, renderLegend, personalTooltip, renderPersonalChart, renderTeamChart, TOKEN_OFFICIAL_COLOR, TOKEN_EST_COLOR, TOKEN_OFFICIAL_SERIES, TOKEN_EST_SERIES, renderTokensChart, apiChartLabel, renderApiChart, freeState, freeKind, renderFree, rankScopeOk, rankIsEstimate, syncRankChips, rankVendorLabel, populateRankVendor, rankCostCache, rankPaymentLabel, rankRowPaymentLabel, rankCandidateRows, rankRows, RANK_CHART_LIMIT, rankChartRows, RANK_ESTIMATE_DIVIDER, renderRankDetails, renderRankChart, renderApiDetails, BUDGET_EPS, PICKER_BILLING_LABELS, renewsAtListPrice, pickerPaymentQuote, PICKER_UNKNOWN_PRICE, pickerMonthlyCNY, pickerFirstPaymentText, pickerAnnualExact, pickerAnnualNative, matchesPickerPurchase, pickerPlanForMetric, pickerMetricInput, refreshPickerScopes, TOOL_OWN_VENDOR, pickerToolRelationship, metricMatchesPlan, hasCodingSurface, recommendablePlan, matchesTool, planTitle, priceLine, bandRank, catRank, multiplier, splitModelAccess, modelTextForRoles, modelRoleAccess, quotaWindowPeriod, quotaSharing, oneSharedWindow, roleUseText, roleDisplayName, quotaLabel, metricForRole, tokenEvidence, knownTokens, tokenEvidenceText, planProfile, windowStats, betterWindow, tokSpan, fullUseCostRange, fullUseCostRangeText, windowSentence, withinBudget, eligibleProfiles, representatives, betterDailyTier, PICKER_PRIORITY_LABELS, pickerPriority, pickerAbilityCache, abilityHit, abilityValue, cheaperThen, hardMainOrder, hardRepresentatives, chooseHardMain, priceDecidedMain, dailyRepresentatives, dailyOrder, dailyMainOrder, chooseDailyMain, chooseMain, rankedCandidates, candidateRole, abilityText, quotaEvidenceText, pickerSummaryText, cheaperTiers, peerNote, upgradeBudgetCeiling, nextTier, unlockText, dailyEntries, dailyRoleBit, dailyQuotaSignal, hasSeparateDaily, pickSupplement, sameWindowText, meteredText, pickerMoney, annualPaymentText, benchmarkRankingNote, ownVendorPlan, windowNoteShort, setPicker, syncPickerChips, pickerEmptyReason, pickerChoiceReason, alternativeProfiles, renderPicker, auditProfiles, tableViews, registerTableView, focusTableControl, tableFeedback, syncSortHeader, planMonthlyPriceCell, planAnnualPriceCell, PLAN_COLUMNS, PLAN_TABLE_COLUMNS, responsivePageSize, tableVisibleLimit, tableViewFingerprint, tableExtraHidden, tableFilteredPlans, computeTableRows, tableFingerprint, syncTablePriceSort, renderTable, syncTableExtraToggle, showMoreTableRows, revealTablePlan, resetTableFilters, tableExportName, csvCell, tableRowsCsv, downloadCsvText, downloadTextFile, exportTableCsv, tableRowsMarkdown, copyTextToClipboard, copyTableMarkdown, flashBtn, cmpReturnFocus, cmpNeedsFocusRestore, cmpBackgroundState, isCmpModalOpen, cmpFocusableElements, modalFocusableElements, setCmpBackgroundInert, finishCmpModalClose, restoreCmpFocus, cmpAdd, cmpRemove, cmpClear, renderCmpBar, syncTableCmpButtons, cmpFeedback, exportCmpCsv, copyCmpMarkdown, renderCmpModal, openCmpModal, closeCmpModal, currentPriceSources, chinaCalendarDay, dynamicEndDate, dynamicStatus, dynItem, renderMisc, resetMetricsFilters, METRICS_COLUMNS, renderMetricsHead, METRICS_SORT_GET, fTokCell, fmtRate, fmtVal, rateClass, fmtCpm, fmtUnit, listPriceHint, cpmColor, provenance, paygReferenceRows, METRICS_NOTE_LEGEND, metricsTierOk, metricsVisibleLimit, metricsViewFingerprint, metricsTableRows, renderMetricsTable, showMoreMetricsRows, renderMetricsSortHint, populateModelFilter, PRESET_KEY, COST_CONTROLS, SERVICE_TOOL_LABELS, COST_PRESETS, COST_SCENARIOS, serviceFeedback, readPreset, syncPresetButtons, syncServiceControls, syncCostChips, pickerScopeText, syncPickerScopeControls, applyPickerScope, costModelKey, quotaUsesRequestTokenAssumption, setCostInputs, recommendedApi, openWorkloadCalculator, copyPickerSummary, shareCurrentResults, savePreset, restorePreset, clearPreset, officialCachePrice, calculateWorkload, calculateCostScenarios, syncCachePriceHint, fmtCalcCNY, fmtCalcNative, renderCostCalculator, planDetailsReturnFocus, planDetailsBackground, closePlanDetails, finishPlanDetailsClose, showPlanDetails, metricApiCNYPerM, usageCoverageRows, USAGE_IMPORT_MAX, parseUsageExport, usageToCalculator, importUsageText, bindUsageImport, bindServiceEvents, FOLLOW_KEY, followState, readFollowImport, followView, maintenanceView, benchmarkFilter, dataRevision, publicBenchmarkState, publicBenchmarkChartState, publicBenchmarkHooks, renderPublicBenchmarks, renderPublicBenchmarkChart, maintenanceData, benchmarkData, optionalPendingText, publicBenchmarkData, selectedPublicBenchmark, defaultPublicBenchmarkForFamily, publicBenchmarkFamilyLabel, PUBLIC_BENCHMARK_FAMILY_ORDER, publicBenchmarkFamilies, publicBenchmarkLabels, publicBenchmarkRows, publicBenchmarkSourceUrl, publicScoreText, publicCostText, publicModelDisplayName, publicPatternCache, publicModelExactPattern, publicModelClauseIncludes, publicModelIncluded, PUBLIC_MODEL_MAKERS, publicModelMakers, publicPlanEligible, publicModelPlans, publicNewerVersion, publicPlanLink, planCodingBenchmarks, ABILITY_PROTOCOL_ID, planProtocolScore, publicUncertaintyLabel, publicBenchmarkDate, publicBenchmarkConfiguration, publicBenchmarkChartRows, PUBLIC_CHART_FAMILIES, publicChartFamily, publicChartColors, publicChartAxisName, publicBenchmarkCsv, cleanFollowState, loadFollowState, persistFollowState, isPlanFollowed, followedPlans, followedChanges, unreadFollowedChanges, followFeedback, toggleFollowPlan, markFollowedChangesRead, maintenanceSourceUrls, changeValue, CHANGE_FIELD_LABELS, changeKindLabel, changeFields, planChanges, PLAN_HISTORY_EMPTY, planHistorySummary, followSyncUrl, copyFollowLink, followImportPlans, applyFollowImport, followFeeds, maintenanceStatusLabel, maintenancePlanStatus, maintenanceRecords, todayLocalIso, dueReviews, benchmarkFilterOptions, benchmarkText, benchmarkRunView, benchmarkRuns, normalizeBenchmarkFilter, CONTRIBUTION_TITLES, contributionTemplate, contributionIssueUrl, downloadPublicData, refreshOptionalViews, loadViewData, bindMaintenanceEvents, personalSearchTimer, tableSearchTimer, cancelPersonalSearch, cancelTableSearch, onState, bindSortableHeader, bindEvents, bindMetricsEvents };

// Vue components own chart controls and service dialogs; ECharts owns only the canvas.
export const chartLegendSelections = appState<Record<string, Record<string, boolean>>>({});
export const serviceUiState = reactive({ feedback: '', presetSaved: false });
export const personalViewHooks: { cancelSearch?: () => void } = {};
export const serviceViewHooks: { renderCost?: () => void; importUsage?: (text: string) => void; showDetails?: (id: string, trigger?: HTMLElement | null) => void; closeDetails?: () => void; finishDetails?: () => void } = {};
