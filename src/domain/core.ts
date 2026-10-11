import { reactive } from 'vue';
import type { EChartsType } from 'echarts/core';
import { ESTIMATES, findPlanReference, hasOwnClient, isFourWeekPlan, isOneTimePlan, isPriceConfirmed, isRelay, isRenewalOnly, isRetiredPlan, isSoldOut, mainlandAccessOf, META, METRICS_RAW, MODEL_ROLES, offerable, PRICE_CHECKS, priceCheckOf, RATE_USD_CNY, resolvedField } from './catalog';
import { toCNY } from './metrics';
import type { ChartPalette } from './model-types';
import { renderApiChart, renderPersonalChart, renderRankChart, renderTeamChart, renderTokensChart } from './charts';
import { renderPublicBenchmarkChart } from './maintenance';

/* 章节导航与历史恢复在 startup 里实现；业务模块经这两个钩子调用，避免反向依赖页面启动代码。 */
export const navigationHooks: {
    navigate?: (hash: string, updateHistory?: boolean, moveFocus?: boolean, allowInitialLayout?: boolean) => void;
    restore?: (search: string | Event, restoreAnchor?: boolean) => void;
} = {};
export function navigateToSection(hash: string, updateHistory?: boolean, moveFocus?: boolean, allowInitialLayout?: boolean) { navigationHooks.navigate?.(hash, updateHistory, moveFocus, allowInitialLayout); }
export function restoreHistoryState(search: string | Event, restoreAnchor?: boolean) { navigationHooks.restore?.(search, restoreAnchor); }

export type Billing = "M" | "Y";
export type PlanCategory = Plan["cat"];
export type PlanRegion = Plan["region"];
/** 价格核查记录的种类：套餐、API 按量单价、额度表按量参照。 */
export type PriceCheckKind = "plan" | "api" | "payg";
/** 可查核价记录的对象：套餐按永久 ID，API 与按量参照按「厂商|型号」。 */
export type PriceSubject = { id?: string; vendor?: string; model?: string };

export const CAT_LABEL: Record<PlanCategory, string> = { official: "模型官方订阅", tool: "第三方工具订阅", cloud: "云厂商/API 套餐", team: "团队 / 企业档" };
export const REGION_LABEL: Record<PlanRegion, string> = { cn: "国内", intl: "国际" };
/* 类别色值以 css/style.css 的 --cat-* 变量为单一数据源：图表、HTML 图例、类别标签共用。
   主题切换时 refreshPalette() 会重读变量（暗色取更亮的一组），图例与图表同步。 */
export let CAT_COLOR: Record<PlanCategory, string> = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };
export let RELAY_COLOR = "#d4534a";
export function refreshCategoryColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => (cs.getPropertyValue(name) || "").trim();
    CAT_COLOR = {
        official: v("--cat-official") || CAT_COLOR.official,
        tool: v("--cat-tool") || CAT_COLOR.tool,
        cloud: v("--cat-cloud") || CAT_COLOR.cloud,
        team: v("--cat-team") || CAT_COLOR.team,
    };
    RELAY_COLOR = v("--cat-relay") || RELAY_COLOR;
}
const VENDOR_SHORT: Record<string, string> = {
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

export const RATE = RATE_USD_CNY;
/* 「帮我选」模型角色表的归类日期，取自 data.js 的 MODEL_ROLES.asOf */
export const MODEL_ROLES_ASOF = MODEL_ROLES.find((r) => r.asOf)?.asOf || META.updated;
/* ---------- 计划主索引：METRICS_RAW / ESTIMATES / PLAN_TOKENS 经 ref 引用 PLANS 的价格（单一数据源） ---------- */
/** 额度行解析后的完整口径：身份、名称与价格来自引用的套餐，模型与额度口径保留在行内。 */
export interface MetricRow extends QuotaRow {
    priceM: number | null;
    cur: Plan["cur"];
    windowPeriod: NonNullable<Plan["windowPeriod"]>;
    isEst?: boolean;
}
/** 名称、价格与周期取自引用套餐；引用无法解析时返回 null（校验器同样报错）。 */
export function resolvePlan(m: QuotaRow): MetricRow | null {
    const p = findPlanReference(m.ref);
    if (p)
        return { ...m, vendor: p.vendor, plan: p.plan, priceM: p.priceM, cur: p.cur, windowPeriod: m.windowPeriod || p.windowPeriod || "unknown" };
    console.warn("[data] ref 未解析，已跳过:", m.ref);
    return null;
}
/* Vue components and domain actions share the same reactive state. */
export function appState<T extends object>(value: T): T {
    return reactive(value) as T;
}
/** HTML 转义：ECharts 提示框等字符串模板使用。 */
export function esc(s: unknown) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch as "&" | "<" | ">" | '"' | "'"]);
}
/** 只接受 http(s) 链接并转义，供字符串模板使用；其他协议返回空串。 */
export function safeHref(u: unknown) {
    const s = String(u ?? "").trim();
    return /^https?:\/\//i.test(s) ? esc(s) : "";
}
/* Native Vue bindings escape attributes themselves. Keep the validated URL unescaped. */
export function safeLink(value: unknown): string {
    const href = String(value ?? '').trim();
    return /^https?:\/\//i.test(href) ? href : '';
}
/* 辅助视图的数据脚本在访问时下载。它们是生成的经典脚本（构建时按内容哈希另存），维护脚本直接读取同一文件。 */
export type OptionalDataKind = "maintenance" | "benchmark";
export const optionalDataLoads: Partial<Record<OptionalDataKind, Promise<void>>> = {};
export function optionalDataLoaded(kind: OptionalDataKind) {
    return kind === "maintenance" ? typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
        : kind === "benchmark" && typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1;
}
export function ensureOptionalData(kind: OptionalDataKind): Promise<void> {
    if (optionalDataLoaded(kind))
        return Promise.resolve();
    const loading = optionalDataLoads[kind];
    if (loading)
        return loading;
    const descriptor = byId(kind + "DataSource");
    if (!descriptor)
        return Promise.reject(new Error("缺少数据入口"));
    const pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.dataset.optionalData = kind;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (error: Error | null) => {
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
        script.src = descriptor.getAttribute("src") ?? "";
        timer = setTimeout(() => finish(new Error("数据下载超时，请重试")), 15000);
        document.head.appendChild(script);
    });
    optionalDataLoads[kind] = pending;
    return pending;
}
/* 计划分类（含中转站名单 isRelay）、offerable、resolvedField、hasOwnClient 在 js/data.js，页面与校验器共用。 */
export interface PlanBadge { t: string; k: "risk" | "agent"; }
const PURCHASE_COUNTRY_NAMES: Record<string, string> = { IN: "印度", CN: "中国", US: "美国" };
/* 风险标签只读结构化字段：备注里的「支持 BYOK」「季付 $403.2」等文字不能推断为必须自备 Key 或访问异常。 */
export function planBadges(p: Plan): PlanBadge[] {
    const badges: PlanBadge[] = [];
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
    if (p.purchaseCountries && p.purchaseCountries.length)
        badges.push({ t: "仅限" + p.purchaseCountries.map((c) => PURCHASE_COUNTRY_NAMES[c] || c).join("/"), k: "risk" });
    if (p.accessUnstable)
        badges.push({ t: "访问不稳", k: "risk" });
    if (/Claude Code/i.test(tools))
        badges.push({ t: "Claude Code", k: "agent" });
    if (/Codex/i.test(tools))
        badges.push({ t: "Codex", k: "agent" });
    if (p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
        badges.push({ t: "Cursor", k: "agent" });
    if (!badges.some((b) => b.k === "agent") && !isRelay(p) && hasOwnClient(p))
        badges.push({ t: "自家客户端", k: "agent" });
    return badges;
}
/* 中国大陆可用性的展示文案：国内档为国内服务；国际档只在登记了官方说明时给结论，其余标未核实。 */
export function mainlandAccessText(p: Plan | null | undefined) {
    const access = mainlandAccessOf(p);
    if (access)
        return `${access.status === "unsupported" ? "官方支持地区不含中国大陆" : "服务可用，部分模型受供应商地区限制"}（${access.checkedAt} 核查）：${access.evidence}`;
    return p && p.region === "cn" ? "国内服务" : "未核实官方支持地区";
}
/** 额度行对应的档位是否仍可正常购买（排除停售、待核价、一次性、仅老用户与限量）；只传 ref 时只看档位本身。 */
export function metricOfferOk(m: Pick<QuotaRow, "ref"> & { plan?: string }) {
    if (/已停售|已下架|老用户|一次性|预付/.test(m.plan || ""))
        return false;
    const p = findPlanReference(m.ref);
    if (p && (isRetiredPlan(p) || !isPriceConfirmed(p) || isOneTimePlan(p) || isRenewalOnly(p) || !offerable(p)))
        return false;
    return true;
}
function adoptMetric(m: QuotaRow, isEst: boolean): MetricRow | null {
    const resolved = resolvePlan(m);
    return resolved ? { ...resolved, isEst } : null;
}
export const METRICS_ALL: MetricRow[] = [
    ...METRICS_RAW.map((m) => adoptMetric(m, false)),
    ...ESTIMATES.map((m) => adoptMetric(m, true)),
].filter((m): m is MetricRow => m !== null);
/* ---------- 工具函数 ---------- */
export const shortVendor = (v: string) => VENDOR_SHORT[v] || v;
export const fmtCNY = (n: number) => "¥" + (Math.round(n * 10) / 10).toLocaleString("zh-CN");
export const trunc = (s: string | null | undefined, n: number) => (!s ? "—" : (s.length > n ? s.slice(0, n) + "…" : s));
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
export type IconName = keyof typeof ICON_SVG;
export function icon(name: IconName) {
    return `<i class="ric" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_SVG[name] || ""}</svg></i>`;
}
/* ---------- DOM 助手：元素类型由调用处按页面结构约定给出 ---------- */
export function byId<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T | null; }
export function qsa<T extends HTMLElement = HTMLElement>(selector: string) { return document.querySelectorAll<T>(selector); }
export function qs<T extends HTMLElement = HTMLElement>(selector: string) { return document.querySelector<T>(selector); }
/** 事件目标元素（图标 SVG 也算）；文本节点等非元素目标返回 null。 */
export function evtTarget(e: Event) { return e.target instanceof Element ? e.target : null; }
/* 图表是 canvas，读屏不可见：渲染后写一句文字摘要进容器 */
export function describeChart(id: string, text: string) {
    const el = byId(id);
    if (!el)
        return;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", String(text).slice(0, 240));
}
export function priceOf(p: Plan, billing: string) {
    if (billing === "Y")
        return p.priceY ?? null;
    return p.priceM;
}
/* Currency conversion uses the shared ./metrics implementation. */
export function cnyOf(p: Plan, billing: string) {
    const v = priceOf(p, billing);
    return v == null ? null : toCNY(v, p.cur);
}
export function priceText(p: Plan, key: "priceM" | "priceY") {
    const v = p[key];
    if (v == null)
        return "按量/定制";
    if (v === 0)
        return "免费";
    return currencySymbol(p.cur) + Number(v.toFixed(2));
}
export function currencySymbol(cur: string) { return cur === "USD" ? "$" : cur === "INR" ? "₹" : "¥"; }
const PRICE_CHECK_LABELS: Record<PriceVerification["status"], string> = { verified: "价格已核实", changed: "核价信息已校正", unverified: "历史价 · 待核实", retired: "已停售", custom: "需询价" };
export function priceCheckLabel(p: PriceSubject, kind: PriceCheckKind = "plan") {
    const check = priceCheckOf(p, kind);
    return check ? PRICE_CHECK_LABELS[check.status] : "未核实";
}
export function priceCheckSources(p: PriceSubject, kind: PriceCheckKind = "plan") {
    const check = priceCheckOf(p, kind);
    return check ? check.sourceIds.map((id) => PRICE_CHECKS.sources[id]?.url).filter((url): url is string => !!url) : [];
}
/* 所有表格/对比/导出共用计价单位，不能把充值或席位费用当作个人月费。 */
export function priceUnit(p: Plan) {
    if (isOneTimePlan(p))
        return "一次性";
    if (isFourWeekPlan(p))
        return p.seat ? "席位/4周" : "4周";
    return p.seat ? "席位/月" : "月";
}
export function planPriceLabel(p: Plan, billing: string = "M") {
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
const chartNarrowMode = new Map<string, boolean>();
export function chartHostWidth(hostEl: HTMLElement, measuredWidth: number = 0) {
    return measuredWidth || hostEl.getBoundingClientRect().width || window.innerWidth - 72;
}
export function isNarrowChart(hostEl: HTMLElement, measuredWidth: number = 0) {
    return hostEl.id !== "chartPublicBenchmark" && chartHostWidth(hostEl, measuredWidth) < NARROW_CHART_WIDTH;
}
/* 名称放到柱子上方后，每行多留一行文字的高度。 */
export function chartRowHeight(hostEl: HTMLElement, per: number) { return isNarrowChart(hostEl) ? per + 16 : per; }
export function chartAxisLabel(hostEl: HTMLElement, fontSize: number = 12.5, measuredWidth: number = 0) {
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
const CHART_RENDERERS: Record<string, () => void> = { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart, chartTokens: renderTokensChart,
    chartApi: renderApiChart, chartPower: renderApiChart, chartRank: renderRankChart };
/** 图表 id → ECharts 实例。 */
export const chartCache: Record<string, EChartsType> = {};
let chartLibraryPromise: Promise<void> | null = null;
/** 图表库下载期间，各图表最新一次的绘制请求。 */
export const queuedChartRenders = new Map<string, () => void>();
/* A queued render belongs to one host lifetime. A replacement component must not
 * inherit the callbacks of a host that unmounted while the library downloaded. */
const queuedChartRequests = new Map<string, { host: HTMLElement }>();
export function releaseChart(id: string) {
    queuedChartRenders.delete(id);
    queuedChartRequests.delete(id);
    if (chartCache[id]) {
        chartCache[id].dispose();
        delete chartCache[id];
    }
    pendingChartResizes.delete(id);
    chartNarrowMode.delete(id);
}
export function chartLibraryReady() { return typeof echarts !== "undefined" && typeof echarts.init === "function"; }
export function ensureChartLibrary(): Promise<void> {
    if (chartLibraryReady())
        return Promise.resolve();
    if (chartLibraryPromise)
        return chartLibraryPromise;
    chartLibraryPromise = new Promise<void>((resolve, reject) => {
        const template = byId<HTMLTemplateElement>("chartLibraryTemplate");
        const asset = template && template.content && template.content.querySelector("script[src]");
        if (!asset) {
            reject(new Error("图表资源地址缺失"));
            return;
        }
        const script = document.createElement("script");
        script.src = asset.getAttribute("src") ?? "";
        let done = false;
        const finish = (error: Error | null) => {
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
    }).catch((err: unknown) => { chartLibraryPromise = null; throw err; });
    return chartLibraryPromise;
}
export function showChartError(id: string, err: unknown) {
    const ids = id === "chartApi" ? [id, "chartPower"] : [id];
    ids.forEach((chartId) => {
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
/** 图表库未就绪时登记绘制并开始下载，返回 true；就绪时返回 false，由调用方直接绘制。 */
export function deferChartRender(id: string, render: () => void) {
    const el = byId(id);
    if (!el)
        return true;
    if (chartLibraryReady())
        return false;
    const scheduled = queuedChartRequests.has(id);
    queuedChartRenders.set(id, render);
    el.setAttribute("aria-busy", "true");
    el.innerHTML = '<p class="chart-loading" role="status">正在加载图表…</p>';
    if (!scheduled) {
        const request = { host: el };
        queuedChartRequests.set(id, request);
        ensureChartLibrary().then(() => {
            if (queuedChartRequests.get(id) !== request)
                return;
            queuedChartRequests.delete(id);
            const latest = queuedChartRenders.get(id);
            queuedChartRenders.delete(id);
            if (!el.isConnected || byId(id) !== el)
                return;
            el.removeAttribute("aria-busy");
            el.innerHTML = "";
            try {
                if (latest)
                    latest();
                markChartsForResize();
                resizeVisibleCharts();
            }
            catch (err) {
                showChartError(id, err);
            }
        }, (err: unknown) => {
            if (queuedChartRequests.get(id) !== request)
                return;
            queuedChartRequests.delete(id);
            queuedChartRenders.delete(id);
            if (el.isConnected && byId(id) === el)
                showChartError(id, err);
        });
    }
    return true;
}
/** 取得（必要时创建）图表实例；调用前已确认图表库就绪且容器存在。 */
export function makeChart(id: string) {
    if (!chartCache[id]) {
        const el = byId(id)!;
        el.innerHTML = "";
        el.removeAttribute("aria-busy");
        chartCache[id] = echarts!.init(el, null, { renderer: "canvas" });
    }
    return chartCache[id];
}
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
export const pendingChartResizes = new Set<string>();
const CHART_AXIS_FONT_SIZE: Record<string, number> = { chartPersonal: 12.5, chartTeam: 12.5, chartTokens: 11.5, chartApi: 11, chartPower: 11, chartRank: 11.5, chartPublicBenchmark: 12 };
/* 缩放只更新实际尺寸变化的可见画布，不重新筛数据或重建图例。
   离屏画布保留待处理标记，滚入阅读区时再补齐尺寸和轴标签宽度。 */
export function resizeVisibleCharts() {
    pendingChartResizes.forEach((id) => {
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
            const render = CHART_RENDERERS[id];
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
export function markChartsForResize(ids: string[] = Object.keys(chartCache)) {
    ids.forEach((id) => {
        if (chartCache[id])
            pendingChartResizes.add(id);
    });
}
export function bindChartResize() {
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
/** 随主题由 refreshPalette 重建。 */
export let PAL: ChartPalette = {} as ChartPalette;
export function refreshPalette() {
    const light = document.documentElement.dataset.theme === "light";
    const cs = getComputedStyle(document.documentElement);
    const color = (name: string, fallback: string) => (cs.getPropertyValue(name) || "").trim() || fallback;
    PAL = light ? {
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
export function axisStyle() {
    return {
        axisLine: { lineStyle: { color: PAL.axisLine } },
        axisLabel: { color: PAL.dim, fontSize: 12 },
        splitLine: { lineStyle: { color: PAL.splitLine } },
    };
}
export function tipStyle(hostEl: HTMLElement, viewportFixed: boolean = false) {
    return {
        backgroundColor: PAL.tipBg,
        borderColor: PAL.tipBorder,
        borderWidth: 1,
        textStyle: { color: PAL.tipText, fontSize: 12.5 },
        // 随图表所属标签收起，避免旧提示坐标撑高切换后的页面。
        appendToBody: false,
        extraCssText: "max-width: min(420px, calc(100vw - 24px)); white-space: normal; overflow-wrap: anywhere; z-index: 2000;",
        position(point: number[], _params: unknown, _el: unknown, _rect: unknown, size: { contentSize: number[] }) {
            const box = hostEl.getBoundingClientRect();
            const bw = Math.min(size.contentSize[0] || 280, window.innerWidth - 24);
            const bh = size.contentSize[1] || 72;
            let x = box.left + point[0]! + 14;
            let y = box.top + point[1]! + 12;
            if (x + bw > window.innerWidth - 8)
                x = box.left + point[0]! - bw - 14;
            if (x < 8)
                x = 8;
            if (x + bw > window.innerWidth - 8)
                x = Math.max(8, window.innerWidth - bw - 8);
            if (y + bh > window.innerHeight - 8)
                y = box.top + point[1]! - bh - 12;
            if (y < 8)
                y = 8;
            if (y + bh > window.innerHeight - 8)
                y = Math.max(8, window.innerHeight - bh - 8);
            return viewportFixed ? [x, y] : [x - box.left, y - box.top];
        },
    };
}
const MODEL_BRANDS: [RegExp, string][] = [
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
/* 轴上和表里的模型名统一成产品写法：qwen3-coder-next → Qwen3-Coder-Next。计费 ID 仍用原文。 */
export function displayModelName(name: string | null | undefined) {
    const raw = String(name || "").trim();
    if (!raw)
        return raw;
    const tailMatch = raw.match(/\s*[\[（(].*$/);
    const head = tailMatch ? raw.slice(0, tailMatch.index) : raw;
    const tail = tailMatch ? tailMatch[0] : "";
    const cap = (tok: string) => {
        for (const [re, brand] of MODEL_BRANDS) {
            const m = tok.match(re);
            if (m)
                return brand + (m[2] || "");
        }
        return /^[a-z]/.test(tok) ? tok.charAt(0).toUpperCase() + tok.slice(1) : tok;
    };
    return head.split("-").map(cap).join("-") + tail;
}
export function foldSearch(s: unknown) {
    return String(s || "").toLowerCase().replace(/[\s_\-./·]+/g, "");
}
/* 正则转义（windowSentence 的模型名片段、测试与校验共用的小工具） */
export function escRe(s: string) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
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
export function planSearchBlob(p: Plan) {
    const identity = [p.vendor, p.plan].join(" ");
    const aliases = SEARCH_VENDOR_ALIASES.filter(([pattern]) => pattern.test(identity)).map(([, words]) => words);
    return foldSearch([p.vendor, p.plan, resolvedField(p, "models"), resolvedField(p, "tools"), resolvedField(p, "quota"), resolvedField(p, "note"), ...aliases].join(" "));
}
export function queryHit(blob: string, q: string | null | undefined) {
    const terms = String(q || "").trim().split(/\s+/).map(foldSearch).filter(Boolean);
    return terms.every((term) => blob.includes(term));
}
/* ---------- 明暗主题切换（暗 → 亮 → 跟随系统 循环） ---------- */
export type ThemeMode = "dark" | "light" | "system";
const THEME_KEY = "cp-theme";
const isThemeMode = (value: unknown): value is ThemeMode => value === "dark" || value === "light" || value === "system";
export let themeMode: ThemeMode = "system";
export const themeView = reactive<{ mode: ThemeMode; effective: 'dark' | 'light' }>({ mode: 'system', effective: 'light' });
export function readThemeMode(): ThemeMode {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return isThemeMode(saved) ? saved : "system";
    }
    catch (e) {
        return "system";
    }
}
export function applyTheme(requested: string) {
    const mode = isThemeMode(requested) ? requested : "system";
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
    qsa('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", browserColor));
}
export function rerenderCharts() {
    const renderers: Record<string, () => void> = { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart,
        chartTokens: renderTokensChart, chartApi: renderApiChart, chartRank: renderRankChart, chartPublicBenchmark: renderPublicBenchmarkChart };
    Object.entries(renderers).forEach(([id, render]) => {
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
export function syncHeaderHeight() {
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
export function updateActiveNav() {
    const links = Array.from(qsa<HTMLAnchorElement>('.topnav a[href^="#"]'));
    const previous = links.find((link) => link.getAttribute("aria-current") === "location");
    const scrollPadding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top"));
    const readingTop = Number.isFinite(scrollPadding) ? scrollPadding : headerHeight;
    let active: HTMLAnchorElement | null = null, closestTop = -Infinity;
    links.forEach((link) => {
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
    links.forEach((link) => {
        const on = link === active;
        link.classList.toggle("active", on);
        if (on)
            link.setAttribute("aria-current", "location");
        else
            link.removeAttribute("aria-current");
    });
    /* 窄屏导航横向滚动时让当前章节露出来，只在章节变化时调整。 */
    const nav = qs(".topnav");
    const current = active as HTMLAnchorElement | null;
    if (current && current !== previous && nav && nav.scrollWidth > nav.clientWidth) {
        const box = current.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
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
    let readingPosition: { target: HTMLElement; offset: number } | null = null;
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
export function initTheme() {
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
export function planLabel(p: Pick<Plan, "vendor" | "plan">) {
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
export function cpmTier(v: number | null | undefined) {
    return v == null ? "na" : v <= 0.3 ? "lo" : v <= 1 ? "mid" : "hi";
}
