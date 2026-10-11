import { findPlanReference, PLANS, resolvedField, hasOwnClient, isPriceConfirmed, isRelay, isRetiredPlan, offerable, hasIncludedModelQuota, isPurchaseCountryAllowed, matchModelRoles } from '../../generated/catalog';
import { splitModelAccess, METRICS_ALL, escRe, type MetricRow } from '../core';
import { computeMetrics, TOKENS_PER_REQ, type MetricsResult } from '../metrics';
import { provenance } from '../provenance';

/* 一档套餐的客观画像：包含与按量的模型用途、额度周期与共享方式、可折算的 tokens 证据。不依赖选购条件。 */

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

/** 套餐中某个模型用途对应的额度行与折算结果。 */
export interface RoleMetric { m: MetricRow; c: MetricsResult; conf: string; }

export type RoleAccess = { included: ModelRole[]; metered: ModelRole[] };

export function pickerPlanForMetric(m: Pick<QuotaRow, "ref" | "vendor" | "plan">) {
    return m.ref != null ? findPlanReference(m.ref) : PLANS.find((p) => p.vendor === m.vendor && p.plan === m.plan) || null;
}

/* 选了具体工具时，该工具自家厂商的订阅单独出一张对照卡（如点 Cursor 给 Cursor Pro）。
   自家订阅不一定赢下主计划（比如 Cursor 的旗舰走按量池），但不该从推荐里消失。 */
export const TOOL_OWN_VENDOR: Record<string, string> = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };

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
