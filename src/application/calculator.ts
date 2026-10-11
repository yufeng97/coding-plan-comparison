import { usageToCalculator as calculateUsageInputs, costModelKey, metricApiCNYPerM } from '../domain/workload';
import type { CalcState, UsageSummary, UsageCalculatorValues, WorkloadState } from '../domain/workload';
import { isPersonalMonthly, findPlanReference, resolvedField, API_PRICES, isPriceConfirmed } from '../generated/catalog';
import { pickerState, calcState } from '../state/app';
import { escRe, METRICS_ALL, metricOfferOk } from '../domain/core';
import type { MetricRow } from '../domain/core';
import { updateAppState } from '../browser/url-state';
import type { PlanProfile } from '../domain/picker/profile';
import type { PaymentQuote } from '../domain/picker/payment';
import { metricForRole, recommendablePlan, matchesTool } from '../domain/picker/profile';
import { chooseMain, eligibleProfiles, pickerPaymentQuote } from '../state/picker';
import { byId } from '../browser/dom';
import { navigateToSection } from './navigation';
import { serviceFeedback } from './service-actions';
import { computeMetrics, isFlagshipModelName, type MetricsResult } from '../domain/metrics';
import { provenance } from '../domain/provenance';

/* 费用计算器与用量导入由 CostCalculator.vue 实现；挂载时登记重算与导入入口，供推荐卡、导航与历史恢复调用。 */
export const calculatorView: { render?: () => void; importUsage?: (text: string) => void } = {};

/* 费用计算器按共享状态重算（其余控件由 Vue 直接绑定）。 */
export function renderCostCalculator() {
    calculatorView.render?.();
}

/* 恢复 URL 状态后，让费用计算器按恢复的条件重算（其余控件由 Vue 直接绑定共享状态）。 */
export function syncControlsFromState() {
    renderCostCalculator();
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

export function importUsageText(text: string) { calculatorView.importUsage?.(String(text)); }

/** 导入的用量折成计算器输入；默认沿用当前计算器的请求数与天数。 */
export function usageToCalculator(usage: UsageSummary, state: WorkloadState = calcState): UsageCalculatorValues {
    return calculateUsageInputs(usage, state);
}
