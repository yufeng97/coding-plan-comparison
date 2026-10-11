import { isOneTimePlan, isFourWeekPlan, isRenewalOnly } from '../../generated/catalog';
import { priceText } from '../core';

/* 「帮我选」的付款口径：月付、自动续费与年付的标价、首次付款与全年金额，金额保留套餐原币。 */

/** 所选付款方式下的价格：金额为套餐原币，monthlyCNY 为折算人民币；未列价格时 available 为 false，金额均为 null。 */
export type PaymentQuote = {
    mode: string;
    label: string;
    cur: Plan["cur"];
    /** 年付全年金额按折月价 ×12 估算。 */
    annualApprox: boolean;
    periodMonths: number;
} & ({
    available: true;
    /** 未单列连续包月价、按月付标价计。 */
    inferred: boolean;
    monthlyNative: number;
    monthlyCNY: number;
    firstNative: number | null;
    renewalNative: number | null;
    annualNative: number | null;
} | {
    available: false;
    inferred: false;
    monthlyNative: null;
    monthlyCNY: null;
    firstNative: null;
    renewalNative: null;
    annualNative: null;
});

/* 预算比较的容差：CNY 价格带小数，浮点相等判断统一加这一点余量 */
export const BUDGET_EPS = 0.05;

export const PICKER_BILLING_LABELS: Record<string, string> = { M: "月付标价", A: "自动续费", Y: "年付" };

/* 普通月订阅本身按标价自动续费；已核价的连续包月价从不高于标价，所以未单列时按标价计，作为预算上限并在卡片注明。
   一次性、预付、每 4 周收费和仅老用户续费不属于此类。 */
export function renewsAtListPrice(p: Plan) {
    return (p.priceM ?? 0) > 0 && !isOneTimePlan(p) && !isFourWeekPlan(p) && !isRenewalOnly(p);
}

/* 未知价格排在已知价格之后；返回有限数，排序比较不会出现 Infinity - Infinity。 */
export const PICKER_UNKNOWN_PRICE = 1e12;

export function pickerAnnualExact(p: Pick<Plan, "annualTotal">) {
    return p.annualTotal != null && Number.isFinite(p.annualTotal) && p.annualTotal > 0 ? p.annualTotal : null;
}

export function pickerAnnualNative(p: Pick<Plan, "annualTotal" | "priceY" | "priceM">) {
    if (!(p.priceY != null && p.priceY > 0))
        return p.priceM === 0 ? 0 : null;
    return pickerAnnualExact(p) ?? p.priceY * 12;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", CNY: "¥", INR: "₹" };

export function pickerMoney(amount: number | null | undefined, cur: string) {
    if (amount == null || !Number.isFinite(amount))
        return "未列公开金额";
    const symbol = CURRENCY_SYMBOLS[cur] || cur + " ";
    return symbol + Number(amount.toFixed(2)).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/* 年付折月价可能已四舍五入；优先结构化全年金额，避免 $200 被算成 $200.04。 */
export function annualPaymentText(p: Plan | null | undefined) {
    if (!p || p.priceY == null || !(p.priceY > 0))
        return "未列公开年付价。";
    const exact = pickerAnnualExact(p);
    const total = exact != null ? exact : p.priceY * 12;
    return `${exact == null ? "约 " : ""}${pickerMoney(total, p.cur)}/年${p.seat ? "，每席位" : ""}，需按年支付；折月 ${priceText(p, "priceY")}/月${exact == null ? "（全年金额按折月价×12估算）" : ""}。`;
}
