import { findPlanReference, isRelay } from '../generated/catalog';
import { computeMetrics } from './metrics';
import { METRICS_ALL, metricOfferOk, resolvePlan } from './core';

export function rankVendorValues(): Set<string> {
    return new Set(['all', ...METRICS_ALL.flatMap((raw) => {
        const plan = findPlanReference(raw.ref);
        const row = resolvePlan(raw);
        if ((plan && isRelay(plan)) || !row || !metricOfferOk(row)) return [];
        const result = computeMetrics(row);
        return result?.costPerM != null ? [row.vendor] : [];
    })]);
}
