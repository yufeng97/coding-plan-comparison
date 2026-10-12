import { usageToCalculator as calculateUsageInputs, costModelKey, metricApiCNYPerM } from '../domain/workload';
import type { CalcState, UsageSummary, UsageCalculatorValues, WorkloadState } from '../domain/workload';
import { isPersonalMonthly, findPlanReference, resolvedField, API_PRICES, isPriceConfirmed } from '../generated/catalog';
import { pickerState, calcState, calcUiState } from '../state/app';
import { escRe, METRICS_ALL, metricOfferOk } from '../domain/core';
import type { MetricRow } from '../domain/core';
import { updateAppState } from '../browser/url-state';
import type { PlanProfile } from '../domain/picker/profile';
import type { PaymentQuote } from '../domain/picker/payment';
import { metricForRole, recommendablePlan, matchesTool } from '../domain/picker/profile';
import { currentPickerSelection, pickerPaymentQuote } from '../state/picker';
import { byId } from '../browser/dom';
import { navigateToSection } from './navigation';
import { computeMetrics, fromCNY, isFlagshipModelName, toCNY, WEEKS_PER_MONTH, type MetricsResult } from '../domain/metrics';
import { provenance } from '../domain/provenance';

/* 费用计算器与用量导入由 CostCalculator.vue 实现；挂载时登记重算与导入入口，供推荐卡、导航与历史恢复调用。 */
export const calculatorView: { render?: () => void } = {};

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
    const main = currentPickerSelection().main, api = recommendedApi(main);
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
    calcUiState.feedback = ((pickerState.budget === "any" ? "选购预算不限，计算器保留你当前填写的月预算。" : "已带入当前月均预算。") +
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
    quotaBasis: "workload" | "reference";
}

/* 月额度对照：credits 月池按当前输入/缓存比例重算，其余按页面基准的参考下限筛选。
   只用官方或中置信折算（第三方与请求次数估算不作「够用」依据），
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
        const baseline = computeMetrics(m), conf = provenance(m).conf;
        if (!quote.available || !baseline || baseline.moLow == null || !(conf === "高" || conf === "中"))
            continue;
        const credits = m.creditCNY != null || m.creditUSD != null;
        const apiPerM = metricApiCNYPerM(m, p, state);
        const creditCNY = m.creditCNY ?? (m.creditUSD != null ? toCNY(m.creditUSD, "USD") : null);
        const moLow = credits ? creditCNY != null && apiPerM != null ? creditCNY / apiPerM : null : baseline.moLow;
        if (moLow == null || moLow < monthlyM)
            continue;
        const c = credits ? { ...baseline, moLow, moHigh: moLow, moMidM: moLow,
            fLow: null, fHigh: null,
            wkLowM: moLow / WEEKS_PER_MONTH, wkHighM: moLow / WEEKS_PER_MONTH,
            blend: fromCNY(apiPerM!, p.cur), costPerM: baseline.priceCNY / moLow,
        } : { ...baseline, moLow };
        const row = { p, m, c, conf, quote, flagship: isFlagshipModelName(m.model), quotaBasis: credits ? "workload" as const : "reference" as const };
        const previous = byPlan.get(p.id);
        if (!previous || (row.flagship && !previous.flagship) || (row.flagship === previous.flagship && row.c.moLow > previous.c.moLow))
            byPlan.set(p.id, row);
    }
    return [...byPlan.values()].map((row) => {
        const apiPerM = metricApiCNYPerM(row.m, row.p, state);
        return { ...row, apiMonthlyCNY: apiPerM == null ? null : apiPerM * monthlyM, breakEvenM: apiPerM == null ? null : row.quote.monthlyCNY / apiPerM };
    }).sort((a, b) => a.quote.monthlyCNY - b.quote.monthlyCNY || b.c.moLow - a.c.moLow);
}

/** 导入的用量折成计算器输入；默认沿用当前计算器的请求数与天数。 */
export function usageToCalculator(usage: UsageSummary, state: WorkloadState = calcState): UsageCalculatorValues {
    return calculateUsageInputs(usage, state);
}
