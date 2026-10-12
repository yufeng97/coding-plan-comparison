import { RATE_INR_CNY, META, isOnSalePlan, isRelay, findPlanReference, resolvedField, PLANS, PAYG_REFERENCES, priceCheckOf, isPriceConfirmed, displayPriceReason } from '../generated/catalog';
import { CAT_LABEL, REGION_LABEL, esc, planPriceLabel, priceUnit, priceCheckLabel, priceCheckSources, mainlandAccessText, RATE, queryHit, planSearchBlob, shortVendor, METRICS_ALL, metricOfferOk, safeLink } from '../domain/core';
import { annualPaymentText } from '../domain/picker/payment';
import { priceLine, pickerFirstPaymentText, matchesPickerPurchase, pickerMonthlyCNY, pickerMetricInput } from '../state/picker';
import { tableState, cmpState, CMP_MAX, metricsState } from '../state/app';
import type { TableState } from '../state/app';
import { toCNY, blendPrice, isFlagshipModelName, computeMetrics } from '../domain/metrics';
import { personalViewHooks } from '../browser/charts/personal';
import { csvCell, rateClass } from '../domain/table-format';
import { downloadCsvText, copyTextToClipboard } from '../browser/interaction';
import { syncUrl } from '../browser/url-state';
import type { MetricRow } from '../domain/core';
import type { MetricsResult } from '../domain/metrics';

/* ============ Coding Plan 比价中心 — 数据表 / 额度表 / 并排对比 ============ */

/* Vue 组件拥有数据表、额度表与对比窗口；它们登记以下入口，导航、历史恢复和业务操作经此调用，不替换组件的 DOM。 */
interface PlanTableView {
    render(): void;
    cancelSearch(): void;
    hasPendingSearch(): boolean;
    more(all?: boolean): void;
    reveal(planId: string): boolean;
    reset(): void;
    feedback(message: string): void;
    flash(id: string, label: string): void;
    buttons: string[];
}

interface CompareView {
    render(): void;
    add(reference: string, plan?: string): void;
    remove(reference: string, plan?: string): void | Promise<void>;
    clear(): void;
    open(): void;
    close(): void;
    finishClose(): void;
    feedback(message: string): void;
    flash(id: string, label: string): void;
    buttons: string[];
}

interface MetricsTableView { render(): void; more(all?: boolean): void; reset(): void; models(): void; }

export interface TableViews { plan?: PlanTableView; compare?: CompareView; metrics?: MetricsTableView; }

export const tableViews: TableViews = {};

export function registerTableView<K extends keyof TableViews>(name: K, view: NonNullable<TableViews[K]>) {
    tableViews[name] = view;
    return () => {
        if (tableViews[name] === view)
            delete tableViews[name];
    };
}

export function tableFeedback(message: string) { tableViews.plan?.feedback(message); }

/** 数据表正文、CSV 与 Markdown 共用的列定义；table/markdown 为 false 的列只出现在导出或只出现在页面。 */
export interface PlanColumn {
    id: string;
    label: string;
    cls?: string;
    table?: boolean;
    markdown?: boolean;
    value: (p: Plan) => string | number;
    markdownValue?: (p: Plan) => string;
    tdClass?: (p: Plan) => string;
    /** 仅在应用选购条件后有值；完整权益窗口跳过空值行，导出保留固定列。 */
    pickerOnly?: boolean;
    /** 完整权益窗口把这一列的网址显示为链接。 */
    detailLinks?: (p: Plan) => DetailLink[];
}

export interface DetailLink { href: string; text: string; }

/* 完整权益窗口里的网址列显示为可点击链接；非 http(s) 地址不生成链接。 */
export function linkList(urls: readonly (string | undefined)[], label: string): DetailLink[] {
    const links = urls.map(safeLink).filter(Boolean);
    return links.map((href, i) => ({ href, text: `${label}${links.length > 1 ? i + 1 : ""} ↗` }));
}

/* 数据表与两种导出的列定义同源；单位及更新元数据只在导出里单列。 */
export const PLAN_COLUMNS: PlanColumn[] = [
    { id: "vendor", label: "厂商", cls: "td-vendor", value: (p) => p.vendor },
    { id: "plan", label: "计划", cls: "td-plan", value: (p) => p.plan },
    { id: "cat", label: "类别", value: (p) => CAT_LABEL[p.cat] || p.cat },
    { id: "region", label: "地区", value: (p) => REGION_LABEL[p.region] || "", tdClass: (p) => "region-" + esc(p.region) },
    { id: "priceM", label: "价格 / 周期", cls: "td-price", value: (p) => planPriceLabel(p) },
    { id: "priceUnit", label: "计价单位", table: false, value: priceUnit },
    { id: "priceY", label: "年付折月", cls: "td-price", value: (p) => p.priceY == null ? "" : planPriceLabel(p, "Y"),
        markdownValue: (p) => p.priceY == null ? "—" : planPriceLabel(p, "Y") },
    { id: "annualTotal", label: "年付全年金额", table: false, value: annualPaymentText },
    { id: "selectedPayment", label: "选购支付口径", table: false, pickerOnly: true, value: (p) => tableState.fromPicker ? priceLine(p) : "" },
    { id: "selectedFirstPayment", label: "选购首次付款", table: false, pickerOnly: true, value: (p) => tableState.fromPicker ? pickerFirstPaymentText(p) : "" },
    { id: "quota", label: "额度（官方口径）", cls: "td-quota", value: (p) => resolvedField(p, "quota") },
    { id: "models", label: "模型", cls: "td-models col-opt", value: (p) => resolvedField(p, "models") },
    { id: "tools", label: "支持工具", cls: "col-opt", value: (p) => resolvedField(p, "tools") },
    { id: "note", label: "备注", cls: "td-note col-opt", value: (p) => resolvedField(p, "note"),
        markdownValue: (p) => resolvedField(p, "note") || "—" },
    { id: "url", label: "来源", cls: "td-trust", value: (p) => p.url || "", detailLinks: (p) => linkList([p.url], "官网页面") },
    { id: "priceStatus", label: "价格核实状态", table: false, value: (p) => priceCheckLabel(p) },
    { id: "priceCheckedAt", label: "价格核查日期", table: false, value: (p) => priceCheckOf(p)?.checkedAt || "" },
    { id: "priceSources", label: "价格核查来源", table: false, value: (p) => priceCheckSources(p).join(" ; "),
        detailLinks: (p) => linkList(priceCheckSources(p), "核价来源") },
    { id: "priceCheckReason", label: "价格核查说明", table: false, value: (p) => displayPriceReason(priceCheckOf(p)?.reason || "") },
    { id: "mainland", label: "中国大陆可用性", table: false, value: mainlandAccessText },
    { id: "updated", label: "数据更新日期", table: false, markdown: false, value: () => META.updated },
    { id: "rate", label: "参考汇率（USD/CNY）", table: false, markdown: false, value: () => RATE },
    { id: "rateInr", label: "参考汇率（INR/CNY）", table: false, markdown: false, value: () => RATE_INR_CNY },
    { id: "rateAsOf", label: "汇率日期", table: false, markdown: false, value: () => META.rateAsOf },
    { id: "rateSource", label: "汇率来源", table: false, markdown: false, value: () => META.rateSource || "" }
];

export const PLAN_TABLE_COLUMNS = PLAN_COLUMNS.filter((c) => c.table !== false);

/* 中转站和价格待核实的历史价默认不显示，打开「含中转站与待核价格」后与其他筛选叠加；导出与当前显示一致。 */
export function tableExtraHidden(p: Plan) { return isRelay(p) || !isPriceConfirmed(p); }

export function tableFilteredPlans(state: TableState = tableState) {
    const q = state.search.trim().toLowerCase();
    return PLANS.filter(isOnSalePlan).filter((p) => (state.cat === "all" || p.cat === state.cat) &&
        (state.region === "all" || p.region === state.region) &&
        (state.vendor === "all" || p.vendor === state.vendor) &&
        (!state.fromPicker || matchesPickerPurchase(p)) &&
        (!q || queryHit(planSearchBlob(p), q)));
}

/* 筛选 + 排序集中在这里：渲染与 CSV/Markdown 导出共用同一份结果 */
export function computeTableRows(state: TableState = tableState) {
    const rows = tableFilteredPlans(state).filter((p) => state.extra || !tableExtraHidden(p));
    const k = state.sortKey;
    const sortVal = (p: Plan) => {
        if (k === "selectedMonthly" && state.fromPicker)
            return pickerMonthlyCNY(p);
        const value = k === "priceM" ? p.priceM : k === "priceY" ? p.priceY : null;
        return value == null ? NaN : toCNY(value, p.cur);
    };
    return rows.slice().sort((a, b) => {
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

export function renderTable() { tableViews.plan?.render(); }

/** 显示下一批记录；all 为真时一次展开全部。 */
export function showMoreTableRows(all = false) { tableViews.plan?.more(all); }

export function revealTablePlan(planId: string) { return tableViews.plan?.reveal(planId) ?? false; }

export function resetTableFilters() {
    if (tableViews.plan)
        tableViews.plan.reset();
    else
        Object.assign(tableState, { search: "", cat: "all", region: "all", vendor: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
}

/* 数据表的搜索防抖由组件登记：历史恢复时取消待执行的搜索。 */
export function cancelTableSearch() { tableViews.plan?.cancelSearch(); }

/* 价格图或数据表还有未生效的搜索输入：历史恢复时即使地址状态相同也要重绘。 */
export function hasPendingSearch() {
    return !!personalViewHooks.hasPendingSearch?.() || !!tableViews.plan?.hasPendingSearch();
}

/* ---------- 导出：当前筛选 + 排序结果 ---------- */
export function tableExportName(ext: string, description: string | null = null) {
    const desc = description == null ? [tableState.search.trim(), tableState.cat, tableState.region].filter((x) => x && x !== "all").join("-") : description;
    const safe = (desc || "all").replace(/[\\/:*?"<>|]+/g, "");
    const d = new Date();
    const day = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    return `coding-plans-${safe}-${day}.${ext}`;
}

export function tableRowsCsv(rows: Plan[]) {
    const lines = [PLAN_COLUMNS.map((c) => csvCell(c.label)).join(",")]
        .concat(rows.map((p) => PLAN_COLUMNS.map((c) => csvCell(c.value(p))).join(",")));
    return lines.join("\r\n");
}

export function exportTableCsv() {
    const rows = computeTableRows();
    if (!rows.length) {
        tableFeedback("没有可导出的方案，请先调整筛选。");
        return;
    }
    downloadCsvText(tableRowsCsv(rows), tableExportName("csv"));
    flashBtn("exportCsvBtn", `✓ 已导出 ${rows.length} 档`);
    tableFeedback(`已生成包含 ${rows.length} 档方案的 CSV，计价单位、数据日期和汇率已保留。`);
}

export function tableRowsMarkdown(rows: Plan[]) {
    const escMd = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const columns = PLAN_COLUMNS.filter((c) => c.markdown !== false);
    const head = "| " + columns.map((c) => c.label).join(" | ") + " |";
    const sep = "|" + columns.map(() => "---").join("|") + "|";
    const body = rows.map((p) => "| " + columns.map((c) => escMd(c.markdownValue ? c.markdownValue(p) : c.value(p))).join(" | ") + " |");
    const meta = `数据更新日期：${META.updated}；参考汇率：1 USD ≈ ${RATE} CNY，1 INR ≈ ${RATE_INR_CNY} CNY（${META.rateAsOf}；来源：${META.rateSource || "未提供"}）。金额包含计价单位；一次性、席位及每 4 周价格不能直接视为个人月费。`;
    return [meta, "", head, sep].concat(body).join("\n");
}

export async function copyTableMarkdown() {
    const rows = computeTableRows();
    if (!rows.length) {
        tableFeedback("没有可复制的方案，请先调整筛选。");
        return;
    }
    const ok = await copyTextToClipboard(tableRowsMarkdown(rows));
    flashBtn("copyMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制失败");
    tableFeedback(ok ? `已复制 ${rows.length} 档方案的 Markdown 表格。` : "浏览器限制了剪贴板访问，可以使用 CSV 下载当前结果。");
}

/** 在登记了该按钮的视图里短暂改写按钮文字。 */
export function flashBtn(id: string, text: string) {
    for (const view of [tableViews.plan, tableViews.compare]) {
        if (view?.buttons.includes(id)) {
            view.flash(id, text);
            return;
        }
    }
}

/* 对比窗口与比较条由 ComparePlans.vue 渲染；组件未挂载时（如只测某个区块）这里只维护共享的选择与链接。 */
export function cmpAdd(reference: string, plan?: string) {
    if (tableViews.compare) {
        tableViews.compare.add(reference, plan);
        return;
    }
    const p = findPlanReference(plan == null ? reference : [reference, plan]);
    if (!p || cmpState.items.some((x) => x.id === p.id))
        return;
    if (cmpState.items.length >= CMP_MAX) {
        tableFeedback(`最多对比 ${CMP_MAX} 档，请先移出一档再添加。`);
        return;
    }
    cmpState.items = [...cmpState.items, p];
    syncUrl();
    tableFeedback(`已加入 ${shortVendor(p.vendor)} ${p.plan}。当前选择 ${cmpState.items.length}/${CMP_MAX} 档${cmpState.items.length === 1 ? "，再选一档即可比较" : ""}。`);
}

export function cmpRemove(reference: string, plan?: string) {
    if (tableViews.compare) {
        void tableViews.compare.remove(reference, plan);
        return;
    }
    const removed = cmpState.items.find((x) => plan == null ? x.id === reference : x.vendor === reference && x.plan === plan);
    if (!removed)
        return;
    cmpState.items = cmpState.items.filter((x) => x.id !== removed.id);
    syncUrl();
    tableFeedback(`已移出 ${shortVendor(removed.vendor)} ${removed.plan}。当前选择 ${cmpState.items.length}/${CMP_MAX} 档。`);
}

export function cmpClear() {
    if (tableViews.compare) {
        tableViews.compare.clear();
        return;
    }
    if (!cmpState.items.length)
        return;
    cmpState.items = [];
    syncUrl();
    tableFeedback("已清空对比选择。");
}

/** 比较条与对比窗口按当前选择重绘（清除上一次操作的提示）。 */
export function renderCmpBar() { tableViews.compare?.render(); }

export function cmpFeedback(message: string) { tableViews.compare?.feedback(message); }

export function exportCmpCsv() {
    const rows = cmpState.items.slice();
    if (rows.length < 2) {
        cmpFeedback("请至少选择 2 档方案后导出对比。");
        return;
    }
    downloadCsvText(tableRowsCsv(rows), tableExportName("csv", "compare"));
    flashBtn("exportCmpCsvBtn", `✓ 已导出 ${rows.length} 档`);
    cmpFeedback(`已导出 ${rows.length} 档对比方案，完整权益、计价单位、核价来源、数据日期和汇率已保留。`);
}

export async function copyCmpMarkdown() {
    const rows = cmpState.items.slice();
    if (rows.length < 2) {
        cmpFeedback("请至少选择 2 档方案后复制对比。");
        return;
    }
    const ok = await copyTextToClipboard(`并排对比（${rows.length} 档方案）\n\n` + tableRowsMarkdown(rows));
    flashBtn("copyCmpMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制失败");
    cmpFeedback(ok ? `已复制 ${rows.length} 档方案的完整对比与核价元数据。` : "浏览器限制了剪贴板访问，可以导出对比 CSV。");
}

export function openCmpModal() { tableViews.compare?.open(); }

export function closeCmpModal() { tableViews.compare?.close(); }

/* ---------- 额度深度对比表 ---------- */
export function resetMetricsFilters() {
    if (tableViews.metrics)
        tableViews.metrics.reset();
    else
        Object.assign(metricsState, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
}

/** 官方 API 按量参照行的口径：没有月费与额度，只有按牌价折算的每百万 tokens 成本。 */
export interface PaygMetricModel {
    vendor: string; plan: string; ver: string; model: string; cur: string;
    apiIn: number; apiOut: number; apiCache: number; tps: string;
    note: string; source: string; isEst: false; payg: true; url: string;
}

export interface PaygMetrics {
    priceCNY: null; costPerM: number;
    fLow: null; moLow: null; r5h: null; rwk: null; rmo: null;
    val5h: null; valWk: null; valMo: null; wkLowM: null;
}

/** 额度表的一行：套餐额度行（可能已按选购付款方式改价）或官方按量参照行。 */
export type MetricsTableRow = { m: MetricRow; c: MetricsResult; payg: false } | { m: PaygMetricModel; c: PaygMetrics; payg: true };

/** 列配置函数收到的单元格上下文。 */
export interface MetricsCellContext { m: MetricsTableRow["m"]; c: MetricsTableRow["c"]; isPayg: boolean; }

export interface MetricsColumn {
    id: string;
    label: string;
    cls?: string;
    sortKey?: string;
    /** 首次点击按升序排列。 */
    asc?: boolean;
    title?: (context: MetricsCellContext) => string;
    tdClass?: (context: MetricsCellContext) => string;
}

/* 表的 16 列在这里集中定义：表头（含排序键与紧凑模式折叠类）、排序取值、单元格渲染同源。
   加列只改这个数组；.col-more 控制该列在紧凑模式下是否隐藏。 */
export const METRICS_COLUMNS: MetricsColumn[] = [
    { id: "plan", label: "厂商·计划", cls: "sticky-col", title: ({ m }) => m.vendor + " · " + m.plan },
    { id: "ver", label: "版本", cls: "col-more" },
    { id: "model", label: "模型", cls: "model-cell" },
    { id: "price", label: "月费", sortKey: "price", asc: true, cls: "td-price" },
    { id: "tps", label: "TPS", cls: "col-more tps-cell" },
    { id: "cpm", label: "💵每M tokens", sortKey: "cpm", asc: true },
    { id: "t5h", label: "Tokens/5h", sortKey: "t5h", cls: "col-more tok-cell" },
    { id: "val5h", label: "💰价值/5h", cls: "col-more val-cell" },
    { id: "r5h", label: "⏫倍率/5h", sortKey: "r5h", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }) => (isPayg ? "" : " " + rateClass(c.r5h)) },
    { id: "twk", label: "Tokens/周", sortKey: "twk", cls: "col-more tok-cell" },
    { id: "valWk", label: "💰价值/周", cls: "col-more val-cell" },
    { id: "rwk", label: "⏫倍率/周", sortKey: "rwk", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }) => (isPayg ? "" : " " + rateClass(c.rwk)) },
    { id: "tmo", label: "每月 tokens", sortKey: "tmo", cls: "tok-cell" },
    { id: "valMo", label: "💰价值/月", cls: "col-more val-cell" },
    { id: "rmo", label: "⏫倍率/月", sortKey: "rmo", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }) => (isPayg ? "" : " " + rateClass(c.rmo)) },
    { id: "prov", label: "依据", cls: "prov-cell",
        title: ({ m }) => [m.note, m.source].filter(Boolean).join(" · ") }
];

/* 排序键 → 行取值。null/NaN 恒排末尾（按量无月费、credits 制等）。 */
const METRICS_SORT_GET: Record<string, (r: MetricsTableRow) => number | null> = {
    price: (r) => r.c.priceCNY,
    cpm: (r) => r.c.costPerM ?? NaN,
    t5h: (r) => r.c.fLow,
    r5h: (r) => r.c.r5h,
    twk: (r) => r.c.wkLowM,
    rwk: (r) => r.c.rwk,
    tmo: (r) => r.c.moLow,
    rmo: (r) => r.c.rmo,
};

export function paygReferenceRows(): Extract<MetricsTableRow, { payg: true }>[] {
    /* 刊例在 data.js 的 PAYG_REFERENCES。每M = 低峰牌价按 95% 缓存、80/20 折成人民币。不进套餐倍率，也不进排行图。 */
    return PAYG_REFERENCES.map((s) => {
        const m: PaygMetricModel = {
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

function metricsTierOk(m: { model: string }) {
    return metricsState.tier === "all" || isFlagshipModelName(m.model);
}

export function metricsTableRows() {
    let rows = METRICS_ALL.map((original) => {
        const m = metricsState.fromPicker ? pickerMetricInput(original) : original;
        return { m: m || original, c: m ? computeMetrics(m) : null, payg: false as const };
    }).filter((r): r is Extract<MetricsTableRow, { payg: false }> => r.c != null);
    rows = rows.filter((r) => metricsTierOk(r.m) && (metricsState.offer === "all" || metricOfferOk(r.m)));
    if (metricsState.model !== "all")
        rows = rows.filter((r) => r.m.model === metricsState.model);
    if (metricsState.ver !== "all")
        rows = rows.filter((r) => r.m.ver === metricsState.ver);
    const payg = metricsState.ver === "all" && !metricsState.fromPicker
        ? paygReferenceRows().filter((r) => metricsTierOk(r.m) && (metricsState.offer === "all" || isPriceConfirmed(r.m, "payg")) && (metricsState.model === "all" || r.m.model === metricsState.model))
        : [];
    const shownRows: MetricsTableRow[] = [...payg, ...rows];
    const sv = METRICS_SORT_GET[metricsState.sortKey];
    shownRows.sort((a, b) => {
        const va = sv ? sv(a) : 0, vb = sv ? sv(b) : 0;
        const aN = va == null || Number.isNaN(va), bN = vb == null || Number.isNaN(vb);
        if (va == null || vb == null || aN || bN) {
            if (aN && bN)
                return 0;
            return aN ? 1 : -1;
        } /* 无对应额度（按量无月费、credits 制等）恒排末尾 */
        return (va - vb) * metricsState.sortDir;
    });
    return { rows, payg, shownRows };
}

export function renderMetricsTable() { tableViews.metrics?.render(); }

export function showMoreMetricsRows(all = false) { tableViews.metrics?.more(all); }

/* 模型筛选下拉：从全部数据源动态填充 */
export function populateModelFilter() { tableViews.metrics?.models(); }
