import { findPlanReference, hasIncludedModelQuota, hasOwnClient, isFourWeekPlan, isFreeCodingEntry, isOneTimePlan, isPersonalMonthly, isPriceConfirmed, isPurchaseCountryAllowed, isRelay, isRenewalOnly, isRetiredPlan, matchModelRoles, META, offerable, PLANS, resolvedField } from './catalog';
import { computeMetrics, fmtTok, toCNY, TOKENS_PER_REQ } from './metrics';
import type { MetricsResult } from './model-types';
import { escRe, fmtCNY, METRICS_ALL, priceText, shortVendor, trunc, type MetricRow } from './core';
import { metricsState, personalState, pickerState, rankState, tableState, updateAppState, type PickerState } from './state';
import { renderPersonalChart, renderRankChart } from './charts';
import { provenance, renderMetricsTable, renderTable } from './tables';
import { renderCostCalculator } from './service';
import { planCodingBenchmarks, planProtocolScore, publicModelIncluded, publicScoreText } from './maintenance';

/* ============ Coding Plan 比价中心 — 帮我选 ============ */

/** 一档套餐在「帮我选」里的模型用途画像。 */
export interface PlanProfile {
    p: Plan;
    /** 附赠额度内的模型用途与按量计费的模型用途。 */
    included: ModelRole[];
    metered: ModelRole[];
    /** 复杂任务主力（不含上限模型）；没有时为 null。 */
    headline: ModelRole | null;
    ceilings: ModelRole[];
    /** 慢烧的日常模型。 */
    loose: ModelRole[];
    shared: boolean;
    windowPeriod: string;
    sharing: string;
    /** 明确分池的日常模型。 */
    internalDaily: ModelRole[];
}
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
/** 套餐中某个模型用途对应的额度行与折算结果。 */
export interface RoleMetric { m: MetricRow; c: MetricsResult; conf: string; }

/* 预算比较的容差：CNY 价格带小数，浮点相等判断统一加这一点余量 */
export const BUDGET_EPS = 0.05;
export const PICKER_BILLING_LABELS: Record<string, string> = { M: "月付标价", A: "自动续费", Y: "年付" };
/* 普通月订阅本身按标价自动续费；已核价的连续包月价从不高于标价，所以未单列时按标价计，作为预算上限并在卡片注明。
   一次性、预付、每 4 周收费和仅老用户续费不属于此类。 */
export function renewsAtListPrice(p: Plan) {
    return (p.priceM ?? 0) > 0 && !isOneTimePlan(p) && !isFourWeekPlan(p) && !isRenewalOnly(p);
}
/* 付款方式是预算与展示的共同口径。缺少年价时保留未知，不挪用月价。 */
export function pickerPaymentQuote(p: Plan, billing: string = pickerState.billing): PaymentQuote {
    const mode = Object.hasOwn(PICKER_BILLING_LABELS, billing) ? billing : "M";
    const label = PICKER_BILLING_LABELS[mode]!;
    const listed = (p.priceM ?? 0) > 0;
    let monthly: number | null = p.priceM;
    let inferred = false;
    /* 月付标价按不连续续费也能买到的单月价比较；少数档的主标价是连续包月价，另记 singleMonthPrice。 */
    if (listed && mode === "M" && p.singleMonthPrice != null && p.singleMonthPrice > 0)
        monthly = p.singleMonthPrice;
    if (listed && mode === "A") {
        if (p.autoRenewMonthly != null)
            monthly = p.autoRenewMonthly;
        else if (renewsAtListPrice(p))
            inferred = true;
        else
            monthly = null;
    }
    if (listed && mode === "Y")
        monthly = p.priceY;
    const annualApprox = mode === "Y" && listed && pickerAnnualExact(p) == null;
    const periodMonths = mode === "Y" ? 12 : 1;
    const available = monthly != null && Number.isFinite(monthly) && (p.priceM === 0 ? monthly === 0 : monthly > 0);
    if (!available || monthly == null)
        return { mode, label, cur: p.cur, available: false, inferred: false, monthlyNative: null, monthlyCNY: null,
            firstNative: null, renewalNative: null, annualNative: null, annualApprox, periodMonths };
    /* 年付有价格时全年金额一定存在：优先结构化全年金额，否则按折月价 ×12。 */
    const annualNative = mode === "Y" ? pickerAnnualNative(p) : monthly * 12;
    const monthlyNative = mode === "Y" ? (annualNative ?? 0) / 12 : monthly;
    const firstNative = mode === "Y" ? annualNative : monthlyNative;
    return { mode, label, cur: p.cur, available, inferred, monthlyNative, monthlyCNY: toCNY(monthlyNative, p.cur),
        firstNative, renewalNative: firstNative, annualNative, annualApprox, periodMonths };
}
/* 未知价格排在已知价格之后；返回有限数，排序比较不会出现 Infinity - Infinity。 */
export const PICKER_UNKNOWN_PRICE = 1e12;
export function pickerMonthlyCNY(p: Plan) { return pickerPaymentQuote(p).monthlyCNY ?? PICKER_UNKNOWN_PRICE; }
export function pickerFirstPaymentText(p: Plan) {
    const quote = pickerPaymentQuote(p);
    return (quote.annualApprox && quote.available ? "约 " : "") + pickerMoney(quote.firstNative, quote.cur);
}
export function pickerAnnualExact(p: Pick<Plan, "annualTotal">) {
    return p.annualTotal != null && Number.isFinite(p.annualTotal) && p.annualTotal > 0 ? p.annualTotal : null;
}
export function pickerAnnualNative(p: Pick<Plan, "annualTotal" | "priceY" | "priceM">) {
    if (!(p.priceY != null && p.priceY > 0))
        return p.priceM === 0 ? 0 : null;
    return pickerAnnualExact(p) ?? p.priceY * 12;
}
export function matchesPickerPurchase(p: Plan) { return withinBudget(p); }
export function pickerPlanForMetric(m: Pick<QuotaRow, "ref" | "vendor" | "plan">) {
    return m.ref != null ? findPlanReference(m.ref) : PLANS.find((p) => p.vendor === m.vendor && p.plan === m.plan) || null;
}
/** 按所选付款方式改写额度行的月费；套餐不符合当前选购条件时返回 null。 */
export function pickerMetricInput(m: MetricRow): MetricRow | null {
    const p = pickerPlanForMetric(m);
    if (!p || !matchesPickerPurchase(p))
        return null;
    return { ...m, priceM: pickerPaymentQuote(p).monthlyNative, cur: p.cur };
}
export function refreshPickerScopes() {
    if (personalState.fromPicker)
        renderPersonalChart();
    if (tableState.fromPicker)
        renderTable();
    if (metricsState.fromPicker)
        renderMetricsTable();
    if (rankState.fromPicker)
        renderRankChart();
}
/* 选了具体工具时，该工具自家厂商的订阅单独出一张对照卡（如点 Cursor 给 Cursor Pro）。
   自家订阅不一定赢下主计划（比如 Cursor 的旗舰走按量池），但不该从推荐里消失。 */
export const TOOL_OWN_VENDOR: Record<string, string> = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };
const TOOL_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };
export function pickerToolRelationship(p: Plan) {
    const vendor = TOOL_OWN_VENDOR[pickerState.tool];
    if (!vendor)
        return "";
    const tool = TOOL_NAMES[pickerState.tool];
    if (p.vendor === vendor)
        return `${tool} 自家订阅，模型与额度由 ${vendor} 提供。`;
    const modelNote = pickerState.tool === "claude" ? "；支持 Claude Code 不代表附赠 Claude 模型"
        : pickerState.tool === "codex" ? "；支持 Codex 不代表附赠 OpenAI 模型" : "";
    return `${tool} 兼容接入，模型与额度由 ${shortVendor(p.vendor)} 提供${modelNote}。`;
}
export function metricMatchesPlan(m: Pick<QuotaRow, "ref" | "vendor" | "plan">, p: Plan) {
    if (m.ref != null)
        return findPlanReference(m.ref) === p;
    return m.vendor === p.vendor && m.plan === p.plan;
}
export function hasCodingSurface(p: Plan) {
    if (typeof p.codingSurface === "boolean")
        return p.codingSurface;
    const tools = resolvedField(p, "tools");
    if (/Claude Code/i.test(tools) || /\bCodex\b/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
        return true;
    return hasOwnClient(p);
}
/* 通用推荐排除国家限定套餐；工具免费不等于模型推理免费。 */
export function recommendablePlan(p: Plan) {
    return isPriceConfirmed(p) && !isRelay(p) && !isRetiredPlan(p) && offerable(p) && hasCodingSurface(p) &&
        hasIncludedModelQuota(p) && isPurchaseCountryAllowed(p, "");
}
export function matchesTool(p: Plan, tool: string) {
    if (tool === "any")
        return true;
    const tools = resolvedField(p, "tools");
    if (tool === "claude")
        return /Claude Code/i.test(tools);
    if (tool === "codex")
        return /Codex/i.test(tools);
    if (tool === "cursor")
        return p.vendor === "Cursor" || /\bCursor\b/i.test(tools);
    if (tool === "own") {
        if (typeof p.ownClient === "boolean")
            return p.ownClient;
        if (/Claude Code/i.test(tools) || /Codex/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
            return false;
        return hasOwnClient(p);
    }
    return true;
}
export function planTitle(p: Pick<Plan, "vendor" | "plan">) {
    const parts = String(p.vendor || "").split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && String(p.plan || "").startsWith(last))
        return parts.slice(0, -1).concat(p.plan).join(" ");
    return `${p.vendor} ${p.plan}`;
}
export function priceLine(p: Plan) {
    if (p.priceM === 0)
        return "免费";
    const quote = pickerPaymentQuote(p);
    if (!quote.available)
        return "未列公开" + quote.label + "价格";
    return pickerMoney(quote.monthlyNative, p.cur) + "/月" + (quote.mode === "Y" ? "（年付折月）" : "") +
        (p.cur === "CNY" ? "" : "，约 " + fmtCNY(quote.monthlyCNY ?? 0));
}
export function bandRank(band: string | undefined) { return band === "A" ? 3 : band === "B" ? 2 : 1; }
export function catRank(p: Plan) { return p.cat === "official" ? 3 : p.cat === "tool" ? 2 : p.cat === "cloud" ? 1 : 0; }
/* 计划名里的 5x / 20x 优先（× 和 x 都算）。额度原文里的「5× Pro」也算加窗；「5× Free」只是入门档基线。
   额度文案统一走 resolvedField，继承行（「同某档」）也能命中倍率写法。 */
export function multiplier(p: Plan) {
    const fromPlan = String(p.plan || "").match(/(\d+)\s*[x×]/i);
    if (fromPlan)
        return Number(fromPlan[1]);
    const q = resolvedField(p, "quota") || "";
    const named = q.match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
    if (named)
        return Number(named[1]);
    if (/(\d+)\s*×\s*Free/i.test(q))
        return 1;
    return 0;
}
export function splitModelAccess(text: string | null | undefined) {
    const parts = String(text || "").split(/[；;]/);
    if (parts.length >= 2 && /按(?:\s*M\s*token|牌价|量)/.test(parts[parts.length - 1]!)) {
        return { included: parts.slice(0, -1).join("；"), metered: parts[parts.length - 1]! };
    }
    return { included: String(text || ""), metered: "" };
}
export function modelTextForRoles(p: Plan) {
    const own = resolvedField(p, "models");
    if (matchModelRoles(own).length)
        return own;
    if (!/旗舰|同级|全模型|全系/.test(own))
        return own;
    const idx = PLANS.indexOf(p);
    for (let i = idx - 1; i >= 0; i--) {
        if (PLANS[i]!.vendor !== p.vendor)
            break;
        const prev = resolvedField(PLANS[i], "models");
        if (matchModelRoles(prev).some((r) => r.task === "hard"))
            return prev;
    }
    return own;
}
type RoleAccess = { included: ModelRole[]; metered: ModelRole[] };
/* 每层先应用自己的排除，再合并上层增补；Pro 的“不含旗舰”不会否定 Pro+ 新增 Opus。 */
export function modelRoleAccess(p: Plan | null | undefined, seen: Set<Plan> = new Set()): RoleAccess {
    if (!p || seen.has(p))
        return { included: [], metered: [] };
    const stack = new Set(seen);
    stack.add(p);
    const base = p.modelBaseRef != null ? findPlanReference(p.modelBaseRef) : null;
    if (p.modelBaseRef != null && !base)
        return { included: [], metered: [] };
    const inherited = base ? modelRoleAccess(base, stack) : { included: [], metered: [] };
    const local = Array.isArray(p.modelIncludes) ? p.modelIncludes.join("、")
        : p.modelBaseRef != null ? p.models : modelTextForRoles(p);
    const access = splitModelAccess(local);
    const excluded = p.modelExcludes || [];
    const merge = (previous: ModelRole[], text: string) => [...new Map(previous.concat(matchModelRoles(text)).map((r) => [r.id, r])).values()]
        .filter((r) => !excluded.some((name) => r.re.test(name)));
    return { included: merge(inherited.included, access.included), metered: merge(inherited.metered, access.metered) };
}
/* 重置周期和模型之间的共享关系是两个独立事实。
   不同模型的条数区间并不能证明它们拥有独立额度池；未公开时保留 unknown。 */
export function quotaWindowPeriod(p: Pick<Plan, "windowPeriod">) { return p.windowPeriod || "unknown"; }
export function quotaSharing(p: Pick<Plan, "quotaSharing">) { return p.quotaSharing || "unknown"; }
export function oneSharedWindow(p: Plan) {
    return quotaWindowPeriod(p) === "5h" && quotaSharing(p) === "shared";
}
export function roleUseText(role: ModelRole | null | undefined) {
    if (!role)
        return "";
    if (role.ceiling)
        return "复杂任务的高强度选项，实际消耗以套餐说明为准";
    return role.task === "hard" ? "适合复杂编码和重构任务" : "适合日常编码和轻量任务";
}
const GPT_VARIANTS: Record<string, string> = { "gpt-sol": "Sol", "luna": "Luna", "gpt-astra": "Astra" };
/* 用途角色按系列匹配；显示版本仍须来自本档权益，不能用角色名称替换旧版模型。 */
export function roleDisplayName(p: Plan, role: ModelRole | null | undefined) {
    if (!role)
        return "";
    const text = splitModelAccess(resolvedField(p, "models")).included;
    if (role.id === "glm-5") {
        const listed = [...text.matchAll(/\bGLM[\s-]*(5(?:\.\d+)?)(?![\d.]|[\w.-]*flash)/gi)]
            .map((m) => `GLM-${m[1]}`).filter((name) => publicModelIncluded(p, name));
        return listed.length ? listed.sort((a, b) => Number(b.slice(4)) - Number(a.slice(4)))[0]! : "GLM-5 系列";
    }
    const gptVariant = GPT_VARIANTS[role.id];
    if (gptVariant) {
        const explicit = new RegExp("\\bGPT[\\s-]*(\\d+(?:\\.\\d+)?)[\\s-]+" + gptVariant + "\\b", "gi");
        const versions = [...text.matchAll(explicit)].map((m) => m[1]!);
        /* 现有权益匹配器核对 GPT-6 Sol / Luna / Astra 的共享版本简称。 */
        if (p.vendor === "OpenAI") {
            versions.push(...[...text.matchAll(/\bGPT[\s-]*(\d+(?:\.\d+)?)[\s-]+(?:Sol|Luna|Astra)\b/gi)].map((m) => m[1]!));
        }
        const groups = [...text.matchAll(/\bGPT[\s-]*(\d+(?:\.\d+)?)\s*全系[（(]([^）)]+)[）)]/gi)];
        for (const group of groups) {
            for (const member of group[2]!.split("/")) {
                const variant = member.trim().match(new RegExp("^(?:(\\d+(?:\\.\\d+)?)\\s+)?" + gptVariant + "$", "i"));
                if (variant)
                    versions.push(variant[1] || group[1]!);
            }
        }
        const included = versions.filter((version) => publicModelIncluded(p, `GPT-${version} ${gptVariant}`));
        if (included.length)
            return `GPT-${included.sort((a, b) => Number(b) - Number(a))[0]} ${gptVariant}`;
        return `GPT ${gptVariant} 系列`;
    }
    return role.name;
}
export function quotaLabel(p: Plan) {
    const period = quotaWindowPeriod(p);
    return period === "5h" ? "5 小时窗口" : period === "month" ? "月度额度" : "额度规则";
}
const CONFIDENCE_RANK: Record<string, number> = { "高": 3, "中": 2, "低": 1 };
export function metricForRole(p: Plan, role: ModelRole | null | undefined): RoleMetric | null {
    if (!role)
        return null;
    const rows = METRICS_ALL
        .filter((m) => metricMatchesPlan(m, p) && role.re.test(m.model || ""))
        .map((m) => ({ m, c: computeMetrics(m), conf: provenance(m).conf }))
        .filter((r): r is RoleMetric => r.c != null);
    rows.sort((a, b) => (CONFIDENCE_RANK[b.conf] || 0) - (CONFIDENCE_RANK[a.conf] || 0) || ((a.m.isEst ? 1 : 0) - (b.m.isEst ? 1 : 0)));
    return rows[0] || null;
}
/* 额度依据：高置信或按官方额度规则（积分系数、credits 面值、官方区间）统一折算的中置信行；
   第三方毛利反推与请求次数折算只作参考，不当作已知额度。推荐按区间下限保守比较，仍不保证实际可用量。 */
export function tokenEvidence(p: Plan, role: ModelRole | null | undefined) {
    const met = metricForRole(p, role);
    if (!met || (met.conf !== "高" && met.conf !== "中") || met.c.moLow == null)
        return null;
    return { tokens: met.c.moLow, conf: met.conf, method: met.m.method || provenance(met.m).text };
}
export function knownTokens(p: Plan, role: ModelRole | null | undefined) {
    const evidence = tokenEvidence(p, role);
    return evidence ? evidence.tokens : 0;
}
export function tokenEvidenceText(p: Plan, role: ModelRole | null | undefined) {
    const evidence = tokenEvidence(p, role);
    return evidence ? `按${evidence.method}，保守参考下限约 ${fmtTok(evidence.tokens)} tokens/月（统一假设，置信${evidence.conf}）` : "";
}
export function planProfile(p: Plan): PlanProfile {
    const access = modelRoleAccess(p);
    const hasQuota = hasIncludedModelQuota(p);
    const included = hasQuota ? access.included : [];
    const metered = hasQuota ? access.metered : access.included.concat(access.metered);
    const hard = included.filter((r) => r.task === "hard" && !r.ceiling);
    const ceilings = included.filter((r) => r.task === "hard" && r.ceiling);
    hard.sort((a, b) => bandRank(b.band) - bandRank(a.band));
    ceilings.sort((a, b) => bandRank(b.band) - bandRank(a.band));
    const headline = hard[0] || ceilings[0] || null;
    const loose = included.filter((r) => r.task === "daily" && r.burn === "slow");
    const shared = oneSharedWindow(p);
    const windowPeriod = quotaWindowPeriod(p);
    const sharing = quotaSharing(p);
    return { p, included, metered, headline, ceilings, loose, shared, windowPeriod, sharing,
        internalDaily: sharing === "separate" ? loose : [] };
}
export function windowStats(x: PlanProfile) {
    const role = x.headline || x.loose[0];
    return { tokens: knownTokens(x.p, role), mult: multiplier(x.p), price: pickerMonthlyCNY(x.p) || 0 };
}
export function betterWindow(a: PlanProfile, b: PlanProfile) {
    const A = windowStats(a);
    const B = windowStats(b);
    if (A.tokens !== B.tokens)
        return A.tokens > B.tokens;
    if (A.mult !== B.mult)
        return A.mult > B.mult;
    /* tokens 与倍率完全打平时取更便宜的：代表档收敛的是「同厂商同角色的性价比之选」 */
    return A.price < B.price;
}
type TokenRangeKey = "fLow" | "fHigh" | "wkLowM" | "wkHighM" | "moLow" | "moHigh";
export function tokSpan(c: MetricsResult, keyLow: TokenRangeKey, keyHigh: TokenRangeKey) {
    const lo = c[keyLow];
    const hi = c[keyHigh];
    if (lo != null && hi != null && hi > lo * 1.05)
        return fmtTok(lo) + "–" + fmtTok(hi);
    return fmtTok(lo);
}
/* 满额成本区间与额度上下界反向对应；固定额度不制造额外不确定性。 */
export function fullUseCostRange(c: Pick<MetricsResult, "priceCNY" | "moLow" | "moHigh">): [number, number] | null {
    const { priceCNY, moLow, moHigh } = c;
    if (!(priceCNY > 0 && moLow != null && moLow > 0 && moHigh != null && moHigh > moLow))
        return null;
    return [priceCNY / moHigh, priceCNY / moLow];
}
export function fullUseCostRangeText(c: Pick<MetricsResult, "priceCNY" | "moLow" | "moHigh">) {
    const range = fullUseCostRange(c);
    return range ? `参考区间 ¥${range[0].toFixed(3)}–¥${range[1].toFixed(3)}/M` : "";
}
export function windowSentence(p: Plan, role: ModelRole | null | undefined) {
    const period = quotaWindowPeriod(p);
    const q = String(resolvedField(p, "quota")).replace(/\s+/g, " ");
    if (period === "none")
        return `目前没有 5 小时上限；总体用量仍以官方仪表盘为准。原文：${trunc(q, 96)}`;
    if (period === "month")
        return `额度按月计量；具体重置和超额规则请核对官网。原文：${trunc(q, 96)}`;
    if (period === "unknown")
        return `额度重置周期或窗口上限未公开。原文：${trunc(q, 96)}`;
    const met = metricForRole(p, role);
    if (met && met.conf === "高" && met.c.fLow != null) {
        return `5 小时窗口按官方每周额度折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens。`;
    }
    if (met && met.conf === "中" && met.c.fLow != null && met.m.wkLowM != null && /系数折算/.test(met.m.note || "")) {
        return `5 小时窗口按官方每周积分与抵扣系数、统一假设折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens，置信度中。`;
    }
    const bit = role ? dailyRoleBit(role) : "";
    if (new RegExp(escRe(bit), "i").test(q) && /5\s*小时|\/5h/i.test(q)) {
        return `5 小时窗口按官方原文：${trunc(q, 96)}`;
    }
    if (met && met.conf === "中" && met.c.fLow != null) {
        return `5 小时窗口按${met.m.method || provenance(met.m).text}大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens，置信度中。`;
    }
    if (/5\s*小时|\/5h/i.test(q))
        return `官方没有公布这个模型的 5 小时 token 数。原文：${trunc(q, 80)}`;
    return `官方没有公布 5 小时窗口。额度原文：${trunc(q, 72)}`;
}
export function withinBudget(p: Plan) {
    if (!recommendablePlan(p))
        return false;
    if (pickerState.region !== "all" && p.region !== pickerState.region)
        return false;
    if (!matchesTool(p, pickerState.tool))
        return false;
    if (pickerState.budget === "0")
        return isFreeCodingEntry(p);
    if (!isPersonalMonthly(p))
        return false;
    if (!pickerPaymentQuote(p).available)
        return false;
    if (pickerState.budget === "any")
        return true;
    return (pickerMonthlyCNY(p) || 0) <= Number(pickerState.budget) + BUDGET_EPS;
}
export function eligibleProfiles() {
    return PLANS.filter(withinBudget).map(planProfile);
}
/** 每组只保留 better 判定最好的一档。 */
export function representatives(list: PlanProfile[], keyOf: (x: PlanProfile) => string, better: (a: PlanProfile, b: PlanProfile) => boolean = betterWindow) {
    const best = new Map<string, PlanProfile>();
    list.forEach((x) => {
        const key = keyOf(x);
        const prev = best.get(key);
        if (!prev || better(x, prev))
            best.set(key, x);
    });
    return [...best.values()];
}
export function betterDailyTier(a: PlanProfile, b: PlanProfile) {
    const sa = hasSeparateDaily(a) ? 1 : 0;
    const sb = hasSeparateDaily(b) ? 1 : 0;
    if (sa !== sb)
        return sa > sb;
    const ta = knownTokens(a.p, a.loose[0]);
    const tb = knownTokens(b.p, b.loose[0]);
    if (ta !== tb)
        return ta > tb;
    const ma = multiplier(a.p);
    const mb = multiplier(b.p);
    if (ma !== mb)
        return ma > mb;
    return (pickerMonthlyCNY(a.p) || 0) < (pickerMonthlyCNY(b.p) || 0);
}
/* 推荐偏好只改变同一候选池里的先后，不改变预算、地区、工具和任务等资格条件。
   额度优先是默认；模型能力只按 DeepSWE v1.1 已公布成绩比较，未上榜的排在后面，不跨评测合成分数；
   价格优先先比所选付款方式的月均价。 */
export const PICKER_PRIORITY_LABELS: Record<string, string> = { quota: "额度优先", ability: "模型能力优先", price: "价格优先" };
export function pickerPriority() { return Object.hasOwn(PICKER_PRIORITY_LABELS, pickerState.priority) ? pickerState.priority : "quota"; }
/* 同一轮渲染里反复比较同一档位，评测匹配要跑多个正则；按「套餐 + 角色」缓存，推荐区每次重算时清空。 */
export const pickerAbilityCache = new Map<string, ReturnType<typeof planProtocolScore>>();
export function abilityHit(p: Plan | null | undefined, role: ModelRole | null | undefined) {
    if (!p || !role)
        return null;
    const key = p.id + "|" + role.id;
    if (!pickerAbilityCache.has(key))
        pickerAbilityCache.set(key, planProtocolScore(p, role));
    return pickerAbilityCache.get(key) ?? null;
}
export function abilityValue(p: Plan, role: ModelRole | null | undefined) {
    const hit = abilityHit(p, role);
    return hit ? hit.row.score : -1;
}
/* 价格优先时同厂商同角色保留月费最低的一档，月费相同再按原规则比较额度。 */
export function cheaperThen(better: (a: PlanProfile, b: PlanProfile) => boolean) {
    return (a: PlanProfile, b: PlanProfile) => {
        const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
        return Math.abs(diff) > BUDGET_EPS ? diff < 0 : better(a, b);
    };
}
/* 复杂任务主计划的排序（额度优先）：模型档位 → 可折算额度 → 倍率 → 套餐类别 → 编程入口 → 月费。
   只比较都有复杂任务主力模型的两档。 */
export function hardMainOrder(a: PlanProfile, b: PlanProfile, withPrice: boolean = true) {
    if (!a.headline || !b.headline)
        return 0;
    const priority = pickerPriority();
    if (priority === "price" && withPrice) {
        const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
        if (Math.abs(diff) > BUDGET_EPS)
            return diff;
    }
    if (priority === "ability") {
        const diff = abilityValue(b.p, b.headline) - abilityValue(a.p, a.headline);
        if (diff)
            return diff;
    }
    return bandRank(b.headline.band) - bandRank(a.headline.band)
        || knownTokens(b.p, b.headline) - knownTokens(a.p, a.headline)
        || multiplier(b.p) - multiplier(a.p)
        || catRank(b.p) - catRank(a.p)
        || (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0)
        || (withPrice ? (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0) : 0);
}
/* 同厂商同主力模型只保留一档代表：价格优先保留最便宜的一档，其余偏好保留额度最大的一档。 */
export function hardRepresentatives(pool: PlanProfile[]) {
    return representatives(pool.filter((x) => x.headline), (x) => x.p.vendor + "|" + x.headline!.id, pickerPriority() === "price" ? cheaperThen(betterWindow) : betterWindow);
}
export function chooseHardMain(pool: PlanProfile[]) {
    const reps = hardRepresentatives(pool);
    reps.sort((a, b) => hardMainOrder(a, b));
    return reps[0] || null;
}
/* 额度都无法折算、其余条件也打平时，实际由月费决定；主卡要直说，避免把「更便宜」读成能力或额度更好。 */
export function priceDecidedMain(main: PlanProfile, pool: PlanProfile[]) {
    if (pickerState.task === "daily" || !main.headline || knownTokens(main.p, main.headline) > 0)
        return false;
    return hardRepresentatives(pool).some((x) => x.p !== main.p && hardMainOrder(main, x, false) === 0 &&
        (pickerMonthlyCNY(x.p) || 0) > (pickerMonthlyCNY(main.p) || 0) + BUDGET_EPS);
}
export function dailyRepresentatives(pool: PlanProfile[]) {
    return representatives(pool.filter((x) => x.loose.length), (x) => x.p.vendor + "|" + x.loose[0]!.id, pickerPriority() === "price" ? cheaperThen(betterDailyTier) : betterDailyTier);
}
export function dailyOrder(a: PlanProfile, b: PlanProfile) {
    const priority = pickerPriority();
    if (priority === "price") {
        const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
        if (Math.abs(diff) > BUDGET_EPS)
            return diff;
    }
    if (priority === "ability") {
        const diff = abilityValue(b.p, b.loose[0]) - abilityValue(a.p, a.loose[0]);
        if (diff)
            return diff;
    }
    return 0;
}
/* 日常主计划的排序（额度优先）：独立日常池 → 纯日常档 → 可折算额度 → 月费。 */
export function dailyMainOrder(a: PlanProfile, b: PlanProfile) {
    const preferred = dailyOrder(a, b);
    if (preferred)
        return preferred;
    const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
    if (sep)
        return sep;
    const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
    if (pure)
        return pure;
    const tok = knownTokens(b.p, b.loose[0]) - knownTokens(a.p, a.loose[0]);
    if (tok)
        return tok;
    return (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
}
export function chooseDailyMain(pool: PlanProfile[]) {
    const reps = dailyRepresentatives(pool);
    reps.sort(dailyMainOrder);
    return reps[0] || null;
}
export function chooseMain(pool: PlanProfile[]) {
    if (pickerState.task === "daily")
        return chooseDailyMain(pool);
    return chooseHardMain(pool) || (pickerState.task === "both" ? chooseDailyMain(pool) : null);
}
/* 当前偏好下排在最前的几档（主计划居首），对比表与推荐摘要共用同一顺序。 */
export function rankedCandidates(pool: PlanProfile[], main: PlanProfile | null, limit: number = 3) {
    if (!main)
        return [];
    const hard = pickerState.task === "daily" ? [] : hardRepresentatives(pool).sort((a, b) => hardMainOrder(a, b));
    const daily = pickerState.task === "hard" ? [] : dailyRepresentatives(pool).filter((x) => pickerState.task === "daily" || !x.headline).sort(dailyMainOrder);
    const list = [main];
    for (const x of pickerState.task === "daily" ? daily : hard.concat(daily)) {
        if (list.length >= limit)
            break;
        if (!list.some((y) => y.p === x.p))
            list.push(x);
    }
    return list;
}
export function candidateRole(x: PlanProfile) { return pickerState.task === "daily" || !x.headline ? x.loose[0] : x.headline; }
export function abilityText(x: PlanProfile) {
    const hit = abilityHit(x.p, candidateRole(x));
    return hit ? `第 ${hit.row.rank}/${hit.protocol.total} 名 · ${publicScoreText(hit.row.score, hit.protocol.unit)}` : "未上榜";
}
export function quotaEvidenceText(x: PlanProfile) {
    const evidence = tokenEvidence(x.p, candidateRole(x));
    return evidence ? `约 ${fmtTok(evidence.tokens)}/月 · 置信${evidence.conf}` : "未公开";
}
const SUMMARY_TOOLS: Record<string, string> = { any: "不限工具", claude: "Claude Code", codex: "Codex", cursor: "Cursor", own: "自家工具" };
const SUMMARY_TASKS: Record<string, string> = { hard: "复杂为主", both: "复杂和日常", daily: "日常为主" };
const SUMMARY_REGIONS: Record<string, string> = { cn: "国内", intl: "国际", all: "不限地区" };
/* 纯文本摘要便于转发到聊天工具；金额与额度沿用页面同一口径，链接带上当前条件。 */
export function pickerSummaryText(url: string) {
    const pool = eligibleProfiles();
    const main = chooseMain(pool);
    const tool = SUMMARY_TOOLS[pickerState.tool] || "不限工具";
    const task = SUMMARY_TASKS[pickerState.task] || "";
    const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "≤¥" + pickerState.budget;
    const region = SUMMARY_REGIONS[pickerState.region] || "";
    const lines = [`Coding Plan 比价中心 · 推荐摘要（数据版本 ${META.updated}）`,
        `条件：${budget} · ${region} · ${tool} · ${task} · ${PICKER_BILLING_LABELS[pickerState.billing]} · ${PICKER_PRIORITY_LABELS[pickerPriority()]}`];
    if (!main)
        lines.push("当前条件没有匹配的套餐：" + pickerEmptyReason(pool));
    else
        rankedCandidates(pool, main).forEach((x, i) => {
            const role = candidateRole(x);
            lines.push(`${i === 0 ? "主计划" : "候选 " + (i + 1)}：${planTitle(x.p)} — ${priceLine(x.p)}；${role ? roleDisplayName(x.p, role) : "附赠模型"}；额度参考下限 ${quotaEvidenceText(x)}；DeepSWE v1.1 ${abilityText(x)}`);
        });
    lines.push("价格、额度与购买资格以官网为准。", url);
    return lines.join("\n");
}
/* 同厂商、同一主力模型、更便宜的个人档。主计划按「窗口最大」选档时会跳过中档（如不限预算直接选 Max），
   这里把被跳过的档（如 GLM Coding V3 Pro）补回可见，不然用户会以为厂商只有这一档。 */
export function cheaperTiers(main: PlanProfile) {
    if (!main.headline)
        return [];
    const roleId = main.headline.id;
    const mainPrice = pickerMonthlyCNY(main.p) || 0;
    const rows: PlanProfile[] = [];
    PLANS.forEach((p) => {
        if (p.vendor !== main.p.vendor || !isPersonalMonthly(p) || !recommendablePlan(p))
            return;
        if (pickerState.region !== "all" && p.region !== pickerState.region)
            return;
        if (!matchesTool(p, pickerState.tool))
            return;
        if ((pickerMonthlyCNY(p) || 0) >= mainPrice - BUDGET_EPS)
            return;
        const prof = planProfile(p);
        if (prof.headline && prof.headline.id === roleId)
            rows.push(prof);
    });
    rows.sort((a, b) => (pickerMonthlyCNY(b.p) || 0) - (pickerMonthlyCNY(a.p) || 0));
    return rows;
}
export function peerNote(main: PlanProfile, pool: PlanProfile[]) {
    const headline = main.headline;
    if (!headline || knownTokens(main.p, headline) <= 0)
        return "";
    const peers = representatives(pool.filter((x) => x.headline && x.p.vendor !== main.p.vendor && x.headline.band === headline.band), (x) => x.p.vendor);
    const quiet = peers.filter((x) => knownTokens(x.p, x.headline) <= 0);
    quiet.sort((a, b) => {
        const code = (/code/i.test(b.p.plan) ? 1 : 0) - (/code/i.test(a.p.plan) ? 1 : 0);
        if (code)
            return code;
        const cat = catRank(b.p) - catRank(a.p);
        if (cat)
            return cat;
        return (pickerMonthlyCNY(b.p) || 0) - (pickerMonthlyCNY(a.p) || 0) || a.p.vendor.localeCompare(b.p.vendor, "zh");
    });
    const top = quiet[0];
    if (!top)
        return "";
    return `同预算还能买 ${planTitle(top.p)}（${roleDisplayName(top.p, top.headline)}）。它的额度没有可按官方规则折算的依据，所以主计划用了能估出额度的这一档。`;
}
const UPGRADE_CEILINGS: Record<string, number> = { "0": 100, "100": 200, "200": 500 };
/* 升级只跨到紧邻的预算档，避免 ≤200 元直接推到 538 元。
   500 元和不限预算后没有更高的有限档，才允许查看所有价格。 */
export function upgradeBudgetCeiling() {
    return UPGRADE_CEILINGS[pickerState.budget] || Infinity;
}
export function nextTier(current: PlanProfile): PlanProfile | null {
    const dailyLead = pickerState.task === "daily" || !current.headline;
    const roleId = dailyLead ? current.loose[0] && current.loose[0].id : current.headline!.id;
    let best: PlanProfile | null = null;
    PLANS.forEach((p) => {
        if (p.vendor !== current.p.vendor || !isPersonalMonthly(p) || !recommendablePlan(p))
            return;
        if (!pickerPaymentQuote(p).available)
            return;
        if (pickerState.region !== "all" && p.region !== pickerState.region)
            return;
        if (!matchesTool(p, pickerState.tool))
            return;
        const price = pickerMonthlyCNY(p) || 0;
        if (price <= (pickerMonthlyCNY(current.p) || 0) + BUDGET_EPS)
            return;
        if (price > upgradeBudgetCeiling() + BUDGET_EPS)
            return;
        const prof = planProfile(p);
        if (dailyLead) {
            if (!prof.loose.some((r) => r.id === roleId))
                return;
        }
        else if (roleId) {
            if (!prof.headline || prof.headline.id !== roleId)
                return;
        }
        else if (!prof.loose.length)
            return;
        if (!best || price < (pickerMonthlyCNY(best.p) || 0))
            best = prof;
    });
    return best;
}
export function unlockText(cur: PlanProfile, next: PlanProfile) {
    const dailyLead = pickerState.task === "daily" || !cur.headline;
    const role = dailyLead ? cur.loose[0] : cur.headline;
    const nextRole = dailyLead ? next.loose.find((r) => role && r.id === role.id) : next.headline;
    if (role && nextRole && role.id === nextRole.id) {
        const currentModel = roleDisplayName(cur.p, role), nextModel = roleDisplayName(next.p, nextRole);
        const models = currentModel === nextModel ? `模型仍是 ${nextModel}。` : `当前 ${currentModel}；升级档列出 ${nextModel}。`;
        const a = metricForRole(cur.p, role);
        const b = metricForRole(next.p, nextRole);
        const known = (x: RoleMetric | null): x is RoleMetric => !!x && (x.conf === "高" || x.conf === "中") && x.c.fLow != null;
        if (cur.windowPeriod === "5h" && next.windowPeriod === "5h" && known(a) && known(b)) {
            const conf = a.conf === "高" && b.conf === "高" ? "" : "（按官方额度规则统一折算，置信中）";
            return `${models}5 小时窗口从大约 ${tokSpan(a.c, "fLow", "fHigh")} tokens 提到 ${tokSpan(b.c, "fLow", "fHigh")} tokens${conf}，加的钱换来更大的窗口。`;
        }
        if (known(a) && known(b) && a.c.moLow != null && a.c.moLow > 0) {
            return `${models}每月可用额度约从 ${tokSpan(a.c, "moLow", "moHigh")} 提到 ${tokSpan(b.c, "moLow", "moHigh")} tokens（统一假设折算），约 ${((b.c.moLow ?? 0) / a.c.moLow).toFixed(1)} 倍。`;
        }
        const mult = resolvedField(next.p, "quota").match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
        if (mult)
            return `${models}官方额度是 ${mult[1]}× ${mult[2]}，具体重置周期以官方说明为准。`;
        return `${models}未公开的额度差不能按价格推算；请核对官网。额度原文：${trunc(resolvedField(next.p, "quota"), 72)}`;
    }
    if (dailyLead && next.loose.length)
        return `这档带日常模型 ${next.loose.map((r) => roleDisplayName(next.p, r)).join("、")}。额度原文：${trunc(resolvedField(next.p, "quota"), 80)}`;
    if (next.headline && (!cur.headline || bandRank(next.headline.band) > bandRank(cur.headline.band))) {
        return `这档才能把复杂任务模型换成 ${roleDisplayName(next.p, next.headline)}。${roleUseText(next.headline)}。`;
    }
    if (next.loose.length)
        return `这档带日常模型 ${next.loose.map((r) => roleDisplayName(next.p, r)).join("、")}。${roleUseText(next.loose[0])}。`;
    return `额度原文：${trunc(resolvedField(next.p, "quota"), 80)}`;
}
export function dailyEntries(pool: PlanProfile[], main: PlanProfile) {
    /* 主计划候选可以只看月付档，补充池还须包含真正免费且附赠推理的入口。
       免费工具/BYOK、团队与国家限定档仍按同一资格规则排除。 */
    const seen = new Set(pool.map((x) => x.p));
    const free = PLANS.filter((p) => !seen.has(p) && !p.seat && p.cat !== "team" &&
        isFreeCodingEntry(p) && recommendablePlan(p) &&
        (pickerState.region === "all" || p.region === pickerState.region) && matchesTool(p, pickerState.tool)).map(planProfile);
    return pool.concat(free).filter((x) => x.p !== main.p && x.p.vendor !== main.p.vendor && (x.internalDaily.length || (!x.headline && x.loose.length)));
}
/* 官方在额度原文里给日常模型点名条数的（如 Luna 350–3,000 条/5h），折成每 5h 的 M tokens 作排序信号 */
export function dailyRoleBit(role: ModelRole) {
    const words = String(role.name).split(/\s+/);
    const last = words[words.length - 1]!;
    return /^[A-Za-z][A-Za-z0-9.-]{2,}$/.test(last) ? last : role.name;
}
export function dailyQuotaSignal(p: Plan, role: ModelRole | null | undefined) {
    if (!role)
        return 0;
    const q = String(resolvedField(p, "quota") || "").replace(/\s+/g, " ");
    const bit = escRe(dailyRoleBit(role));
    const range = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*[–—-]\\s*(\\d[\\d,]*)\\s*条", "i"));
    if (range)
        return (Number(range[2]!.replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
    const single = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*条", "i"));
    if (single)
        return (Number(single[1]!.replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
    return 0;
}
/* 只有明确标注模型之间分池的套餐才算独立日常池。 */
export function hasSeparateDaily(x: PlanProfile) {
    return x.internalDaily.length > 0;
}
export function pickSupplement(main: PlanProfile, pool: PlanProfile[]) {
    const list = dailyEntries(pool, main).slice().sort((a, b) => {
        const free = (isFreeCodingEntry(b.p) ? 1 : 0) - (isFreeCodingEntry(a.p) ? 1 : 0);
        if (free)
            return free;
        const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
        if (sep)
            return sep;
        const sig = dailyQuotaSignal(b.p, b.loose[0]) - dailyQuotaSignal(a.p, a.loose[0]);
        if (sig)
            return sig;
        const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
        if (pure)
            return pure;
        const coding = (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0);
        if (coding)
            return coding;
        const ta = knownTokens(a.p, a.loose[0]), tb = knownTokens(b.p, b.loose[0]);
        if (ta !== tb)
            return tb - ta;
        const ma = multiplier(a.p), mb = multiplier(b.p);
        if (ma !== mb)
            return mb - ma;
        return (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
    });
    const cap = pickerState.budget === "any" ? Infinity : pickerState.budget === "0" ? 0 : Number(pickerState.budget);
    const remain = cap - (pickerMonthlyCNY(main.p) || 0);
    const fit = list.filter((x) => (pickerMonthlyCNY(x.p) || 0) <= remain + BUDGET_EPS);
    const dreamed = list.find((x) => hasSeparateDaily(x) && (pickerMonthlyCNY(x.p) || 0) > remain + BUDGET_EPS);
    return { chosen: fit[0] || null, dreamed: dreamed || null, remain };
}
export function sameWindowText(profile: PlanProfile) {
    const names = profile.included.filter((r) => r.task === "daily").map((r) => roleDisplayName(profile.p, r));
    if (!profile.headline)
        return "";
    if (!names.length)
        return `${roleDisplayName(profile.p, profile.headline)} 这档没有另外的慢烧模型。`;
    if (profile.shared)
        return `${names.join("、")} 和 ${roleDisplayName(profile.p, profile.headline)} 共用同一个 5 小时窗口。日常使用会消耗这一窗口的额度。`;
    return windowNoteShort(profile);
}
export function meteredText(profile: PlanProfile) {
    if (!profile.metered.some((r) => r.id === "claude-opus"))
        return "";
    return "Claude Opus 在另一池，按百万 tokens 计价，不在这档送的慢烧额度里。";
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
/* 公开编程评测默认只作模型能力参考；选「模型能力优先」时按 DeepSWE v1.1 参与排序。成绩对应评测时的推理与 Agent 配置。 */
export function benchmarkRankingNote() {
    return pickerPriority() === "ability" ? "本次按 DeepSWE v1.1 参与排序" : "不参与推荐排序";
}
/* 自家订阅与主计划共用任务/额度选档规则；有限预算先在预算内选。
   地区内没有时提供国际参考；预算连入门档也放不下时只展示最便宜的任务适配档并提示。 */
export function ownVendorPlan(vendor: string) {
    const all = PLANS.filter((p) => p.vendor === vendor && isPersonalMonthly(p) && recommendablePlan(p) && matchesTool(p, pickerState.tool));
    if (!all.length)
        return null;
    const inRegion = all.filter((p) => pickerState.region === "all" || p.region === pickerState.region);
    const cap = pickerState.budget === "any" ? Infinity : pickerState.budget === "0" ? 0 : Number(pickerState.budget);
    const profiles = (inRegion.length ? inRegion : all).map(planProfile);
    const suitable = profiles.filter((x) => pickerState.task === "daily" ? x.loose.length
        : pickerState.task === "hard" ? x.headline : x.headline || x.loose.length);
    const taskPool = suitable.length ? suitable : profiles;
    const priced = taskPool.filter((x) => pickerPaymentQuote(x.p).available);
    const fit = priced.filter((x) => pickerMonthlyCNY(x.p) <= cap + BUDGET_EPS);
    const cheapest = (priced.length ? priced : taskPool).slice().sort((a, b) => pickerMonthlyCNY(a.p) - pickerMonthlyCNY(b.p))[0]!;
    const picked = fit.length ? chooseMain(fit) || fit[0]! : cheapest;
    return { plan: picked.p, regionMiss: !inRegion.length, withinBudget: fit.length > 0 };
}
export function windowNoteShort(prof: Pick<PlanProfile, "windowPeriod" | "sharing" | "shared">) {
    if (prof.windowPeriod === "none")
        return "目前没有 5 小时上限；总体用量仍需查看官方仪表盘。";
    if (prof.sharing === "separate")
        return "官方说明日常模型与复杂任务模型分池计算额度。";
    if (prof.shared)
        return "日常模型和复杂任务模型共用同一个 5 小时窗口，日常使用会消耗这份额度。";
    if (prof.windowPeriod === "month" && prof.sharing === "shared")
        return "日常模型和复杂任务模型共用月度额度池。";
    if (prof.sharing === "shared")
        return "日常模型和复杂任务模型共用同一额度池；重置周期或窗口上限未公开。";
    return "模型之间的额度共享情况未公开，无法确认日常使用是否会挤占复杂任务额度。";
}
/* 供卡片里的按钮一键放宽筛选（data-set-picker="region=all"） */
export function setPicker(rowKey: keyof PickerState, value: string) {
    pickerState[rowKey] = value;
    updateAppState(() => {}, renderPicker);
}
export function pickerEmptyReason(pool: PlanProfile[]) {
    if (pool.length) {
        const task = pickerState.task === "daily" ? "日常" : "复杂任务";
        return `有 ${pool.length} 档符合购买条件，但没有匹配到附赠的${task}模型。可以调整任务选择，或在数据表核对完整模型列表。`;
    }
    const base = PLANS.filter((p) => recommendablePlan(p) &&
        (pickerState.budget === "0" ? isFreeCodingEntry(p) : isPersonalMonthly(p)));
    const region = base.filter((p) => pickerState.region === "all" || p.region === pickerState.region);
    if (!region.length)
        return "所选地区没有包含编程推理额度的通用个人档。可以调整地区；国家限定套餐可在完整数据表查看。";
    const tool = region.filter((p) => matchesTool(p, pickerState.tool));
    if (!tool.length)
        return "所选地区没有匹配这个工具的通用个人档。可以改选工具或地区；自备 Key 的免费平台不等于免费推理。";
    if (!tool.some((p) => pickerPaymentQuote(p).available))
        return "符合地区与工具的套餐未列所选支付方式的明确价格。可以切换月付标价；未公开的年付价不会用于预算推荐。";
    return "当前预算没有匹配的通用套餐。可以提高预算或查看免费入口；国家限定套餐可在完整数据表查看。";
}
export function pickerChoiceReason(profile: PlanProfile) {
    const daily = pickerState.task === "daily" || !profile.headline;
    const role = daily ? profile.loose[0] : profile.headline;
    const parts = [`${role ? roleDisplayName(profile.p, role) : "附赠模型"} 符合所选任务，月费 ${priceLine(profile.p)}，满足当前预算、地区与工具条件`];
    if (daily && hasSeparateDaily(profile))
        parts.push("日常模型与复杂任务模型明确分池，日常选择优先考虑这类额度");
    const evidence = tokenEvidenceText(profile.p, role);
    if (evidence)
        parts.push(`额度可按官方规则折算：${evidence}，可核对用量`);
    else
        parts.push("可用 token 总量没有可按官方规则折算的依据，主要按模型用途、公开额度规则和月费比较");
    if (pickerPriority() === "ability")
        parts.push(abilityHit(profile.p, role) ? "已按 DeepSWE v1.1 已公布成绩优先排序" : "主力模型未进入 DeepSWE v1.1，按额度与月费比较");
    else if (planCodingBenchmarks(profile.p, role).length)
        parts.push("卡片上的公开编程评测只作模型能力参考，不参与排序");
    if (pickerPriority() === "price")
        parts.push("已按所选付款方式的月均价优先选档");
    return parts.join("；") + "。";
}
/* 先给省钱候选，再给排序中的另一选择；尽量来自不同厂商，单厂商筛选仍可比较不同档位。 */
export function alternativeProfiles(pool: PlanProfile[], main: PlanProfile | null, shownIds: Set<string> = new Set()) {
    if (!main)
        return [];
    /* 已在补充、升级或自家订阅卡出现的档位不再重复列为候选。 */
    const suitable = pool.filter((x) => x.p !== main.p && !shownIds.has(x.p.id) && (pickerState.task === "daily" ? x.loose.length
        : pickerState.task === "hard" ? x.headline : x.headline || x.loose.length));
    const selected: PlanProfile[] = [];
    const cheapest = suitable.slice().sort((a, b) => (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0));
    const first = cheapest.find((x) => x.p.vendor !== main.p.vendor) || cheapest[0];
    if (first)
        selected.push(first);
    const remaining = suitable.filter((x) => !selected.includes(x));
    const vendors = new Set([main.p.vendor, ...selected.map((x) => x.p.vendor)]);
    const different = remaining.filter((x) => !vendors.has(x.p.vendor));
    const second = chooseMain(different.length ? different : remaining);
    if (second)
        selected.push(second);
    return selected;
}
export function renderPicker() {
    /* Vue derives recommendation cards from shared reactive state. Only notify applied scopes. */
    pickerAbilityCache.clear();
    renderCostCalculator();
    refreshPickerScopes();
}
export function auditProfiles() {
    /* 断言隐含「国内 + 不限预算 + 不限工具」的筛选前提（如智谱省钱档），先锁定状态，
       结束后还原，避免 ?debug=1 时污染页面正在展示的推荐。 */
    const saved = { ...pickerState };
    Object.assign(pickerState, { budget: "any", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
    try {
        const by = (vendor: string, plan: string) => PLANS.find((p) => p.vendor === vendor && p.plan === plan);
        const idOf = (p: Plan | undefined) => { const h = p ? planProfile(p).headline : null; return h ? h.id : ""; };
        const expect = (vendor: string, plan: string, id: string) => {
            const got = idOf(by(vendor, plan));
            if (got !== id)
                console.error("[picker]", vendor, plan, "headline", got || "(none)", "expected", id || "(none)");
        };
        expect("Anthropic", "Claude Pro", "claude-opus");
        expect("Anthropic", "Claude Free", "");
        expect("Anthropic", "Claude Max 5x", "claude-opus");
        expect("Cursor", "Pro", "");
        expect("OpenAI", "ChatGPT Plus", "gpt-sol");
        expect("智谱 BigModel", "GLM Coding V3 Lite", "glm-5");
        expect("智谱 BigModel", "GLM Coding V3 Pro", "glm-5");
        expect("智谱 BigModel", "GLM Coding V3 Max", "glm-5");
        /* 不限预算时主计划会跳过中档，「省钱档」行必须能把 GLM V3 Pro 补回来 */
        const max = by("智谱 BigModel", "GLM Coding V3 Max");
        if (!max || !cheaperTiers(planProfile(max)).some((x) => x.p.plan === "GLM Coding V3 Pro")) {
            console.error("[picker] GLM V3 Max 的省钱档应列出 GLM Coding V3 Pro");
        }
        const cursorPlan = by("Cursor", "Pro");
        const cursor = cursorPlan ? planProfile(cursorPlan) : null;
        if (!cursor || !cursor.internalDaily.some((r) => r.id === "grok"))
            console.error("[picker] Cursor Pro 应把 Grok 当成分开的日常额度");
        if (!cursor || cursor.metered.every((r) => r.id !== "claude-opus"))
            console.error("[picker] Cursor Pro 的 Opus 应在按量池");
    }
    finally {
        Object.assign(pickerState, saved);
    }
}
