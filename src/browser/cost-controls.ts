/** Browser control ids for the workload calculator. Calculation rules only use field names. */
export const COST_CONTROLS = {
    model: 'costModel', requests: 'costRequests', tokens: 'costTokens', days: 'costDays',
    input: 'costInput', cache: 'costCache', cachePrice: 'costCachePrice', budget: 'costBudget',
} as const;
