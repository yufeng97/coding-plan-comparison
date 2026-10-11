import { displayPriceReason, findPlanReference, isOnSalePlan, isPriceConfirmed, isRelay, META, PAYG_REFERENCES, PLANS, PRICE_CHECKS, priceCheckOf, RATE_INR_CNY, resolvedField } from './catalog';
import { blendPrice, computeMetrics, fmtTok, isFlagshipModelName, toCNY } from './metrics';
import type { MetricsResult } from './model-types';
import { byId, CAT_LABEL, cpmTier, esc, mainlandAccessText, metricOfferOk, METRICS_ALL, planPriceLabel, planSearchBlob, priceCheckLabel, priceCheckSources, priceUnit, qsa, queryHit, RATE, REGION_LABEL, shortVendor, type MetricRow } from './core';
import { CMP_MAX, cmpState, metricsState, syncUrl, tableState, type TableState } from './state';
import { personalViewHooks } from './charts';
import { annualPaymentText, matchesPickerPurchase, pickerFirstPaymentText, pickerMetricInput, pickerMonthlyCNY, priceLine } from './picker';

/* ============ Coding Plan 比价中心 — 数据表 / 额度表 / 并排对比 ============ */

/* Vue 组件拥有数据表、额度表与对比窗口；它们登记以下入口，导航、历史恢复和业务操作经此调用，不替换组件的 DOM。 */
interface PlanTableView {
    render(): void;
    cancelSearch(): void;
    hasPendingSearch(): boolean;
    more(): void;
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
interface MetricsTableView { render(): void; more(): void; reset(): void; models(): void; }
export interface TableViews { plan?: PlanTableView; compare?: CompareView; metrics?: MetricsTableView; }
export const tableViews: TableViews = {};
export function registerTableView<K extends keyof TableViews>(name: K, view: NonNullable<TableViews[K]>) {
    tableViews[name] = view;
    return () => {
        if (tableViews[name] === view)
            delete tableViews[name];
    };
}
/* ---------- 数据表 ---------- */
export function focusTableControl(el: Element | null | undefined) {
    const target = el as (HTMLElement & { disabled?: boolean }) | null | undefined;
    if (!target || target.isConnected === false || target.disabled || typeof target.focus !== "function")
        return false;
    target.focus({ preventScroll: true });
    return document.activeElement === target;
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
    { id: "selectedPayment", label: "选购支付口径", table: false, value: (p) => tableState.fromPicker ? priceLine(p) : "" },
    { id: "selectedFirstPayment", label: "选购首次付款", table: false, value: (p) => tableState.fromPicker ? pickerFirstPaymentText(p) : "" },
    { id: "quota", label: "额度（官方口径）", cls: "td-quota", value: (p) => resolvedField(p, "quota") },
    { id: "models", label: "模型", cls: "td-models col-opt", value: (p) => resolvedField(p, "models") },
    { id: "tools", label: "支持工具", cls: "col-opt", value: (p) => resolvedField(p, "tools") },
    { id: "note", label: "备注", cls: "td-note col-opt", value: (p) => resolvedField(p, "note"),
        markdownValue: (p) => resolvedField(p, "note") || "—" },
    { id: "url", label: "来源", cls: "td-trust", value: (p) => p.url || "" },
    { id: "priceStatus", label: "价格核实状态", table: false, value: (p) => priceCheckLabel(p) },
    { id: "priceCheckedAt", label: "价格核查日期", table: false, value: (p) => priceCheckOf(p)?.checkedAt || "" },
    { id: "priceSources", label: "价格核查来源", table: false, value: (p) => priceCheckSources(p).join(" ; ") },
    { id: "priceCheckReason", label: "价格核查说明", table: false, value: (p) => displayPriceReason(priceCheckOf(p)?.reason || "") },
    { id: "mainland", label: "中国大陆可用性", table: false, value: mainlandAccessText },
    { id: "updated", label: "数据更新日期", table: false, markdown: false, value: () => META.updated },
    { id: "rate", label: "参考汇率（USD/CNY）", table: false, markdown: false, value: () => RATE },
    { id: "rateInr", label: "参考汇率（INR/CNY）", table: false, markdown: false, value: () => RATE_INR_CNY },
    { id: "rateAsOf", label: "汇率日期", table: false, markdown: false, value: () => META.rateAsOf },
    { id: "rateSource", label: "汇率来源", table: false, markdown: false, value: () => META.rateSource || "" }
];
export const PLAN_TABLE_COLUMNS = PLAN_COLUMNS.filter((c) => c.table !== false);
export function responsivePageSize() { return window.innerWidth < 768 ? 5 : 20; }
/* 中转站和价格待核实的历史价默认不显示，打开「含中转站与待核价格」后与其他筛选叠加；导出与当前显示一致。 */
export function tableExtraHidden(p: Plan) { return isRelay(p) || !isPriceConfirmed(p); }
export function tableFilteredPlans(state: TableState = tableState) {
    const q = state.search.trim().toLowerCase();
    return PLANS.filter(isOnSalePlan).filter((p) => (state.cat === "all" || p.cat === state.cat) &&
        (state.region === "all" || p.region === state.region) &&
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
export function showMoreTableRows() { tableViews.plan?.more(); }
export function revealTablePlan(planId: string) { return tableViews.plan?.reveal(planId) ?? false; }
export function resetTableFilters() {
    if (tableViews.plan)
        tableViews.plan.reset();
    else
        Object.assign(tableState, { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
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
/* 引号 doubling 之外，还要防 CSV 公式注入：以 = + - @ 开头的单元格加 ' 前缀，Excel 不会当公式执行。所有 CSV 导出共用。 */
export function csvCell(v: unknown) {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s))
        s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}
export function tableRowsCsv(rows: Plan[]) {
    const lines = [PLAN_COLUMNS.map((c) => csvCell(c.label)).join(",")]
        .concat(rows.map((p) => PLAN_COLUMNS.map((c) => csvCell(c.value(p))).join(",")));
    return lines.join("\r\n");
}
export function downloadCsvText(csv: string, filename: string) {
    /* ﻿ 让 Excel 正确识别 UTF-8 */
    downloadTextFile("﻿" + csv, filename, "text/csv;charset=utf-8");
}
export function downloadTextFile(text: string, filename: string, mime: string = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
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
export async function copyTextToClipboard(text: string) {
    let ok = false;
    try {
        await navigator.clipboard.writeText(text);
        ok = true;
    }
    catch (e) {
        /* 剪贴板接口不可用时降级：隐藏 textarea + execCommand */
        const previousFocus = document.activeElement;
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        /* 原生模态窗口会让 body 内其它节点 inert；权益和比较窗口都在当前窗口内选择文本。 */
        const dialogs = [...qsa<HTMLDialogElement>("dialog")].filter((dlg) => dlg.open === true || dlg.getAttribute("open") != null);
        const focusedDialog = previousFocus ? previousFocus.closest("dialog") : null;
        const host = focusedDialog && dialogs.includes(focusedDialog) ? focusedDialog : dialogs[dialogs.length - 1] || document.body;
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
/* ---------- 并排对比：数据表内勾选 2–4 档，URL（cmp=）可分享 ---------- */
let cmpBackgroundState: { el: Element; inert: string | null; ariaHidden: string | null }[] = [];
export function isCmpModalOpen() {
    const dlg = byId<HTMLDialogElement>("cmpModal");
    return !!dlg && (dlg.open === true || dlg.getAttribute("open") != null);
}
export function cmpFocusableElements() {
    return modalFocusableElements(byId("cmpModal"));
}
/** 窗口内当前可用 Tab 到达的控件：跳过停用、隐藏、inert 以及收起的 details 里除 summary 外的内容。 */
export function modalFocusableElements(dlg: Element | null) {
    if (!dlg)
        return [];
    return [...dlg.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")].filter((el) => {
        if ((el as HTMLButtonElement).disabled || el.hidden || el.tabIndex < 0 || el.closest("[hidden], [inert]"))
            return false;
        for (let parent = el.parentElement; parent && parent !== dlg; parent = parent.parentElement) {
            if (parent.tagName === "DETAILS" && !(parent as HTMLDetailsElement).open) {
                const summary = parent.querySelector("summary");
                if (!summary || (el !== summary && !summary.contains(el)))
                    return false;
            }
        }
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && el.getClientRects().length > 0;
    });
}
/* 没有原生 dialog 的浏览器：打开对比时把 body 下其余元素设为 inert，关闭时精确还原原来的属性。 */
export function setCmpBackgroundInert(on: boolean) {
    if (on) {
        if (cmpBackgroundState.length)
            return;
        const dlg = byId("cmpModal"), backdrop = byId("cmpBackdrop");
        cmpBackgroundState = Array.from(document.body.children).filter((el) => el !== dlg && el !== backdrop && !/^(SCRIPT|STYLE)$/.test(el.tagName))
            .map((el) => ({ el, inert: el.getAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden") }));
        cmpBackgroundState.forEach(({ el }) => { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
    }
    else {
        cmpBackgroundState.forEach(({ el, inert, ariaHidden }) => {
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
/* ---------- 动态 / 来源 / 说明 ---------- */
/* 来源证据只增不改：记录改用新来源后，旧证据留在台账里，但不再作为当前依据展示。 */
export function currentPriceSources() {
    const used = new Set(Object.values(PRICE_CHECKS.rows).flatMap((row) => row.sourceIds || []));
    return Object.entries(PRICE_CHECKS.sources).filter(([id]) => used.has(id)).map(([, source]) => source);
}
export function chinaCalendarDay(now: Date = new Date()) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
}
type DynamicDates = Pick<DynamicItem, "date" | "text" | "checked" | "endDate">;
export function dynamicEndDate(d: DynamicDates) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.endDate || ""))
        return d.endDate!;
    /* 旧记录只有文字范围；仅识别活动期限，核对日志保持其当日原文。 */
    if (d.checked || !/活动|促销|畅用/.test(d.text || ""))
        return "";
    const range = String(d.text || "").match(/(\d{2})-(\d{2})\s*[~～–—]\s*(\d{2})-(\d{2})/);
    if (!range || !/^\d{4}-/.test(d.date || ""))
        return "";
    const [, startMonth, startDay, endMonth, endDay] = range as unknown as [string, string, string, string, string];
    const year = Number(d.date.slice(0, 4)) + (endMonth + endDay < startMonth + startDay ? 1 : 0);
    return `${year}-${endMonth}-${endDay}`;
}
export function dynamicStatus(d: DynamicDates, today: string = chinaCalendarDay()) {
    if (!d.checked && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && d.date > today)
        return { key: "upcoming", label: "计划中 · 尚未发生" };
    const endDate = dynamicEndDate(d);
    if (endDate && endDate < today)
        return { key: "ended", label: "已结束 · " + endDate };
    return { key: "", label: "" };
}
/** 动态正文：尚未发生的退役写成「计划于 …」，其余照原文。 */
export function dynamicText(d: DynamicDates, today: string = chinaCalendarDay()) {
    return dynamicStatus(d, today).key === "upcoming" ? String(d.text).replace(/于 (\d{4}-\d{2}-\d{2}) 退役/, "计划于 $1 退役") : d.text;
}
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
/* 无额度（credits 制无牌价）的时段显示占位。与 windowSentence 的 tokSpan 同一规则：
   上下限差 ≤5% 时只显上限值，避免「100–103M」这类噪音区间。 */
export function fTokCell(lo: number | null | undefined, hi: number | null | undefined, emptyLabel: string = "credits制") {
    if (lo == null)
        return emptyLabel;
    const lowText = fmtTok(lo), highText = hi == null ? lowText : fmtTok(hi);
    return hi == null || !(hi > lo * 1.05) || lowText === highText ? lowText : `${lowText}–${highText}`;
}
export function fmtRate(v: number | null | undefined) { return v == null ? "—" : `${v.toFixed(1)}×`; }
export function fmtVal(v: number | null | undefined, cur: string) {
    if (v == null || !Number.isFinite(v))
        return "—";
    if (cur === "CNY")
        return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
    return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}
export function rateClass(r: number | null | undefined) { return r == null || !Number.isFinite(r) ? "" : r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }
export function fmtCpm(v: number | null | undefined) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }
export function fmtUnit(n: number) {
    if (n >= 10)
        return String(Math.round(n * 10) / 10);
    if (n >= 1)
        return String(Math.round(n * 100) / 100);
    return String(Math.round(n * 10000) / 10000);
}
export function listPriceHint(m: Pick<QuotaRow, "apiIn" | "apiOut" | "apiCache"> & { cur: string }) {
    if (typeof m.apiIn !== "number")
        return "";
    const sym = m.cur === "USD" ? "$" : "¥";
    return `输入 ${sym}${fmtUnit(m.apiIn)} / 输出 ${sym}${fmtUnit(m.apiOut)} / 缓存 ${sym}${fmtUnit(m.apiCache)}`;
}
export function cpmColor(v: number | null | undefined) {
    const tier = cpmTier(v);
    return tier === "na" ? "var(--faint)" : tier === "lo" ? "var(--green)" : tier === "mid" ? "var(--gold)" : "var(--red)";
}
/** provenance 读取的额度行字段（额度行与按量参照行都满足）。 */
export interface ProvenanceInput {
    ref?: PlanRef; isEst?: boolean; method?: string; confidence?: string;
    creditCNY?: number; creditUSD?: number; apiIn?: number; note?: string; source?: string;
    reqPerWk?: number; reqPerMo?: number; reqPer5h?: number;
}
/* 数据来源标注：每行额度的出处与置信度 */
export function provenance(m: ProvenanceInput) {
    const plan = m.ref != null ? findPlanReference(m.ref) : null;
    if (plan && !isPriceConfirmed(plan))
        return { text: "历史价折算 · 价格待核", conf: "低" };
    if (m.isEst)
        return { text: m.method ?? "", conf: m.confidence ?? "" };
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
export function showMoreMetricsRows() { tableViews.metrics?.more(); }
/* 模型筛选下拉：从全部数据源动态填充 */
export function populateModelFilter() { tableViews.metrics?.models(); }
