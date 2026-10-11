import { usageToCalculator as calculateUsageInputs } from '../domain/workload';
import type { UsageSummary, UsageCalculatorValues } from '../domain/service-types';
import { isPersonalMonthly, findPlanReference, resolvedField, API_PRICES, isPriceConfirmed } from '../generated/catalog';
import { serviceUiState } from '../state/service';
import { readPreset, writePreset, clearStoredPreset } from '../browser/presets';
import { pickerState, personalState, metricsState, tableState, rankState, calcState } from '../state/app';
import { fmtCNY, REGION_LABEL, escRe, METRICS_ALL, metricOfferOk } from '../domain/core';
import { renderPersonalChart, renderRankChart } from '../browser/charts';
import { renderMetricsTable, renderTable } from './tables';
import { updateAppState, appQueryString, syncUrl, currentResultsUrl, pushQueryHistory } from '../browser/url-state';
import type { CalcState } from '../domain/view-types';
import type { PlanProfile, PaymentQuote } from '../domain/recommendations';
import { metricForRole, chooseMain, eligibleProfiles, pickerSummaryText, recommendablePlan, matchesTool, pickerPaymentQuote } from '../state/recommendations';
import { costModelKey, metricApiCNYPerM } from '../domain/workload';
import { byId } from '../browser/dom';
import { navigateToSection, restoreHistoryState } from './navigation';
import { copyTextToClipboard } from '../browser/interaction';
import type { MetricRow } from '../domain/core';
import type { MetricsResult } from '../domain/model-types';
import type { WorkloadState } from '../domain/service-types';
import { computeMetrics, isFlagshipModelName } from '../domain/metrics';
import { provenance } from '../domain/provenance';

export const SERVICE_TOOL_LABELS: Record<string, string> = { any: "不限工具", claude: "Claude Code", codex: "Codex", cursor: "Cursor", own: "自家客户端" };

/* 费用计算器、用量导入与完整权益窗口由组件实现，这里登记入口供推荐卡、导航与历史恢复调用。 */
export const serviceViewHooks: {
    renderCost?: () => void;
    importUsage?: (text: string) => void;
    showDetails?: (id: string, trigger?: HTMLElement | null) => void;
    closeDetails?: () => void;
    finishDetails?: () => void;
} = {};

export function serviceFeedback(message: string) {
    serviceUiState.feedback = String(message);
}

export function syncPresetButtons() {
    serviceUiState.presetSaved = !!readPreset();
}

const SCOPE_BILLING_LABELS: Record<string, string> = { M: "月付标价", A: "自动续费", Y: "年付折月" };

export function pickerScopeText() {
    const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "月均预算 ≤" + fmtCNY(Number(pickerState.budget));
    const billing = SCOPE_BILLING_LABELS[pickerState.billing] || "月付标价";
    return `${budget} · ${REGION_LABEL[pickerState.region as keyof typeof REGION_LABEL] || "不限地区"} · ${SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具"} · ${billing}`;
}

/** 在价格图、额度表、数据表与排行上应用或取消「帮我选」的付款与预算条件。 */
export function applyPickerScope(name: string) {
    const scopes: Record<string, { state: { fromPicker: boolean }; render: () => void }> = {
        personal: { state: personalState, render: renderPersonalChart },
        metrics: { state: metricsState, render: renderMetricsTable },
        table: { state: tableState, render: renderTable },
        rank: { state: rankState, render: renderRankChart },
    };
    const scope = scopes[name];
    if (!scope)
        return;
    updateAppState(() => {
        scope.state.fromPicker = !scope.state.fromPicker;
        if (name === "table") {
            tableState.sortKey = tableState.fromPicker ? "selectedMonthly" : "priceM";
            tableState.sortDir = 1;
        }
    }, scope.render);
}

export function setCostInputs(values: Partial<CalcState>) {
    Object.assign(calcState, values);
}

/** 与推荐主计划同名、且价格已核实的 API 报价；同厂商优先，其次同地区。 */
export function recommendedApi(main: PlanProfile | null) {
    if (!main)
        return null;
    const role = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
    const metric = metricForRole(main.p, role);
    const models = resolvedField(main.p, "models");
    const exact = API_PRICES.filter((api) => {
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
    return exact.find((api) => api.vendor === main.p.vendor) || exact.find((api) => api.region === main.p.region) || exact[0] || null;
}

export function openWorkloadCalculator() {
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
export async function copyPickerSummary() {
    const query = appQueryString();
    const url = currentResultsUrl(query, "#quick");
    const ok = await copyTextToClipboard(pickerSummaryText(url));
    serviceFeedback(ok ? "已复制推荐摘要，可直接粘贴到聊天或文档；价格以官网为准。" : "复制失败，请改用「复制当前方案链接」。");
}

export async function shareCurrentResults() {
    const query = appQueryString();
    const url = currentResultsUrl(query);
    const ok = await copyTextToClipboard(url);
    serviceFeedback(ok ? "已复制当前方案链接，包含筛选、对比与费用计算条件。" : "复制失败，请从地址栏复制当前链接。");
}

export function savePreset() {
    const query = appQueryString();
    if (query.length > 16000) {
        serviceFeedback("筛选条件过长，请缩短搜索词后再保存。");
        return;
    }
    try {
        writePreset(query);
        syncPresetButtons();
        serviceFeedback("已在本机保存当前筛选、对比和计算条件。");
    }
    catch (err) {
        serviceFeedback("浏览器无法保存本地条件，仍可复制方案链接。");
    }
}

export function restorePreset() {
    const preset = readPreset();
    if (!preset) {
        syncPresetButtons();
        serviceFeedback("没有可恢复的条件，请先保存。");
        return;
    }
    const query = preset.query ? "?" + preset.query : "";
    try {
        pushQueryHistory(query);
    }
    catch (err) { /* 地址栏不可写时仍在本页恢复条件。 */ }
    restoreHistoryState(query, false);
    syncUrl();
    serviceFeedback("已恢复常用条件。");
}

export function clearPreset() {
    try {
        /* 空值与删除等效，兼容受限存储和页面测试替身。 */
        clearStoredPreset();
        syncPresetButtons();
        serviceFeedback("已删除本机保存的条件。");
    }
    catch (err) {
        serviceFeedback("浏览器不允许修改本地保存的条件。");
    }
}

/* 费用计算器按共享状态重算（其余控件由 Vue 直接绑定）。 */
export function renderCostCalculator() {
    serviceViewHooks.renderCost?.();
}

export function showPlanDetails(id: string, trigger: HTMLElement | null = null) {
    serviceViewHooks.showDetails?.(String(id), trigger);
}

/** 用量反查的一行：能覆盖本月用量的套餐额度，以及同模型按量费用与回本点。 */
export interface UsageCoverageRow {
    p: Plan;
    m: MetricRow;
    c: MetricsResult & { moLow: number };
    conf: string;
    quote: Extract<PaymentQuote, { available: true }>;
    flagship: boolean;
    apiMonthlyCNY: number | null;
    breakEvenM: number | null;
}

/* 参考月额度下限覆盖本月用量的套餐：只用官方或中置信折算（第三方与请求次数估算不作「够用」依据），
   沿用帮我选的地区、工具与付款方式，按月均价从低到高。每档只保留一行：优先能覆盖的主力模型。 */
export function usageCoverageRows(monthlyM: number, state: Pick<WorkloadState, "input" | "cache"> = calcState): UsageCoverageRow[] {
    const byPlan = new Map<string, Omit<UsageCoverageRow, "apiMonthlyCNY" | "breakEvenM">>();
    for (const m of METRICS_ALL) {
        const p = findPlanReference(m.ref);
        if (!p || !metricOfferOk(m) || !recommendablePlan(p) || !isPersonalMonthly(p))
            continue;
        if ((pickerState.region !== "all" && p.region !== pickerState.region) || !matchesTool(p, pickerState.tool))
            continue;
        const quote = pickerPaymentQuote(p);
        const c = computeMetrics(m), conf = provenance(m).conf;
        if (!quote.available || !c || c.moLow == null || !(conf === "高" || conf === "中") || c.moLow < monthlyM)
            continue;
        const row = { p, m, c: { ...c, moLow: c.moLow }, conf, quote, flagship: isFlagshipModelName(m.model) };
        const previous = byPlan.get(p.id);
        if (!previous || (row.flagship && !previous.flagship) || (row.flagship === previous.flagship && row.c.moLow > previous.c.moLow))
            byPlan.set(p.id, row);
    }
    return [...byPlan.values()].map((row) => {
        const apiPerM = metricApiCNYPerM(row.m, row.p, state);
        return { ...row, apiMonthlyCNY: apiPerM == null ? null : apiPerM * monthlyM, breakEvenM: apiPerM == null ? null : row.quote.monthlyCNY / apiPerM };
    }).sort((a, b) => a.quote.monthlyCNY - b.quote.monthlyCNY || b.c.moLow - a.c.moLow);
}

export function importUsageText(text: string) { serviceViewHooks.importUsage?.(String(text)); }

export { usageToCalculatorWithState as usageToCalculator };
function usageToCalculatorWithState(usage: UsageSummary, state: WorkloadState = calcState): UsageCalculatorValues {
    return calculateUsageInputs(usage, state);
}
