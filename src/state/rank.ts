import { findPlanReference, isRelay } from '../generated/catalog';
import { rankState, pickerState } from './app';
import { provenance } from '../domain/provenance';
import { type MetricRow, METRICS_ALL, resolvePlan, metricOfferOk } from '../domain/core';
import { type MetricsResult, computeMetrics, isFlagshipModelName } from '../domain/metrics';
import { PICKER_BILLING_LABELS } from '../domain/picker/payment';
import { pickerPlanForMetric } from '../domain/picker/profile';
import { pickerPaymentQuote, pickerMetricInput } from './picker';
import { type RankRow, hasCost, rankIsEstimate } from '../domain/rank';

/* 绑定排行条件（口径、厂商、模型档）与选购付款方式的排行候选与筛选；图表与明细表共用。 */

/* scope: credits=官方口径折算（积分系数/credits 面值/官方区间，中置信及以上）；all=含全部估算（低置信）。
   目前没有厂商直接公布可跨家比较的每周 tokens，旧的 official 口径并入 credits。 */
export function rankScopeOk(m: QuotaRow) {
    /* 无牌价的 credits 面值只能按假设单价折算，说明里承诺不进入排行，任何口径都排除。 */
    if ((m.creditCNY != null || m.creditUSD != null) && typeof m.apiIn !== "number")
        return false;
    if (rankState.scope === "all")
        return true;
    return provenance(m).conf !== "低";
}

/* 名称和价格每次从主表解析；额度成本按原始指标行缓存，价格或币种变化时重算，
   避免每次重绘对同一行重复计算。中转站不和官方订阅比单价（个人价格图与帮我选同一规则）。 */
export const rankCostCache = new WeakMap<MetricRow, { key: string; c: MetricsResult | null }>();

export function rankPaymentLabel() { return rankState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : "目录月付标价"; }

export function rankRowPaymentLabel(m: MetricRow) {
    const p = rankState.fromPicker ? pickerPlanForMetric(m) : null;
    return rankPaymentLabel() + (p && pickerPaymentQuote(p).inferred ? "（未单列续费价，按标价）" : "");
}

export function rankCandidateRows(usePicker: boolean = rankState.fromPicker): RankRow[] {
    return METRICS_ALL.flatMap((raw) => {
        const plan = findPlanReference(raw.ref);
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
        return hasCost(hit.c) ? [{ m, c: hit.c }] : [];
    });
}

/* 先按官方额度规则折算的档位排，再排第三方或请求次数估算；低置信估算不会排在可靠数据之前。 */
export function rankRows(vendor: string = rankState.vendor || "all") {
    return rankCandidateRows()
        .filter((r) => vendor === "all" || r.m.vendor === vendor)
        .filter((r) => rankScopeOk(r.m))
        .filter((r) => rankState.tier !== "flagship" || isFlagshipModelName(r.m.model))
        .sort((a, b) => Number(rankIsEstimate(a.m)) - Number(rankIsEstimate(b.m)) || a.c.costPerM - b.c.costPerM);
}
