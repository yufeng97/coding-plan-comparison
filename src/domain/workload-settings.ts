import { API_PRICES, CALC_DEFAULT_API, isPriceConfirmed } from '../generated/catalog';
import type { CalcState } from './view-types';

export const CALC_MODELS = new Set(API_PRICES.filter((a) => isPriceConfirmed(a, "api")).map((a) => a.vendor + "|" + a.model));

/* 默认模型按 data.js 的固定身份取；万一被移出已确认价格，才退回第一项（校验器会先报错）。 */
export const CALC_DEFAULT_MODEL = (() => {
    const pinned = CALC_DEFAULT_API.vendor + "|" + CALC_DEFAULT_API.model;
    return CALC_MODELS.has(pinned) ? pinned : [...CALC_MODELS][0] || "";
})();

type CalcNumberKey = Exclude<keyof CalcState, "model" | "scenario">;

/** 数值输入的 [最小值, 最大值, 是否整数]。 */
export const CALC_LIMITS: Record<CalcNumberKey, [number, number, boolean]> = { requests: [0, 100000, true], tokens: [1, 10000000, true], days: [1, 31, true], input: [0, 100, false], cache: [0, 100, false], cachePrice: [0, 1000000, false], budget: [0, 1000000000, false] };

export function validCalcValue(key: string, value: string) {
    if (key === "model")
        return CALC_MODELS.has(value);
    if (key === "scenario")
        return ["conservative", "typical", "optimistic"].includes(value);
    if (key === "cachePrice" && value === "")
        return true;
    if (!Object.hasOwn(CALC_LIMITS, key) || !/^\d+(?:\.\d+)?$/.test(String(value)))
        return false;
    const n = Number(value), [min, max, integer] = CALC_LIMITS[key as CalcNumberKey];
    return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
}
