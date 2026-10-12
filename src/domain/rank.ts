import { findPlanReference, isRelay } from '../generated/catalog';
import { type MetricRow, shortVendor, METRICS_ALL, metricOfferOk, resolvePlan } from './core';
import { computeMetrics, type MetricsResult } from './metrics';
import { provenance } from './provenance';

/* 性价比排行的纯规则：哪些额度行算估算、厂商显示名与图上的行数分配。依赖排行与选购条件的筛选见 state/rank.ts。 */

/** 排行的一行：额度行（可能已按选购付款方式改价）与折算出的每百万 tokens 成本。 */
export interface RankRow { m: MetricRow; c: MetricsResult & { costPerM: number }; }

/* 实心柱：依据官方额度规则（中置信及以上）；斜纹柱与 ≈：第三方或请求次数估算。 */
export function rankIsEstimate(m: QuotaRow) { return provenance(m).conf === "低"; }

const RANK_VENDOR_LABELS: Record<string, string> = { Anthropic: "Claude（Anthropic）", OpenAI: "ChatGPT（OpenAI）", "月之暗面 Kimi": "Kimi（月之暗面）" };

export function rankVendorLabel(vendor: string) {
    return RANK_VENDOR_LABELS[vendor] || shortVendor(vendor);
}

export function hasCost(c: MetricsResult | null): c is RankRow["c"] { return !!c && c.costPerM != null; }

/* 图高有限：两组都有时至少给估算 8 个位置，Claude、ChatGPT 等只有估算的厂商仍能在图上看到。 */
export const RANK_CHART_LIMIT = 20;

export function rankChartRows(all: RankRow[]) {
    const official = all.filter((r) => !rankIsEstimate(r.m));
    const estimates = all.filter((r) => rankIsEstimate(r.m));
    if (!official.length || !estimates.length)
        return all.slice(0, RANK_CHART_LIMIT);
    const estimateSlots = Math.min(estimates.length, Math.max(RANK_CHART_LIMIT - official.length, 8));
    return official.slice(0, RANK_CHART_LIMIT - estimateSlots).concat(estimates.slice(0, estimateSlots));
}

export const RANK_ESTIMATE_DIVIDER = "以下为第三方或请求次数估算（置信低）";

/** 有可排行档位的厂商（不含中转站与仅历史档厂商）：分享链接里的厂商筛选按它校验。 */
export function rankVendorValues(): Set<string> {
    return new Set(['all', ...METRICS_ALL.flatMap((raw) => {
        const plan = findPlanReference(raw.ref);
        const row = resolvePlan(raw);
        if ((plan && isRelay(plan)) || !row || !metricOfferOk(row)) return [];
        const result = computeMetrics(row);
        return result?.costPerM != null ? [row.vendor] : [];
    })]);
}
