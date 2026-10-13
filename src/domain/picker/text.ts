import { resolvedField } from '../../generated/catalog';
import { publicModelIncluded } from '../benchmarks';
import { splitModelAccess, trunc, escRe } from '../core';
import { fmtTok, type MetricsResult } from '../metrics';
import { provenance } from '../provenance';
import { fmtCpm } from '../table-format';
import { quotaWindowPeriod, tokenEvidence, metricForRole, dailyRoleBit, type PlanProfile } from './profile';

/* 套餐画像的文字说明：模型用途、额度窗口、token 区间与满额使用成本。 */

export type TokenRangeKey = "fLow" | "fHigh" | "wkLowM" | "wkHighM" | "moLow" | "moHigh";

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

export function tokenEvidenceText(p: Plan, role: ModelRole | null | undefined) {
    const evidence = tokenEvidence(p, role);
    return evidence ? `按${evidence.method}，保守参考下限约 ${fmtTok(evidence.tokens)} tokens/月（统一假设，置信${evidence.conf}）` : "";
}

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
    /* 与额度表、排行明细同一套小数位（fmtCpm）。 */
    return range ? `参考区间 ${fmtCpm(range[0])}–${fmtCpm(range[1])}/M` : "";
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
