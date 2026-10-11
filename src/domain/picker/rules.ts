import { isFreeCodingEntry, isPersonalMonthly, PLANS, META, resolvedField } from '../../generated/catalog';
import { publicScoreText, planCodingBenchmarks } from '../benchmarks';
import { shortVendor, fmtCNY, planTitle, trunc, type MetricRow } from '../core';
import { toCNY, fmtTok } from '../metrics';
import { PICKER_PRIORITY_LABELS, abilityValue, abilityHit } from './ability';
import { PICKER_BILLING_LABELS, renewsAtListPrice, pickerAnnualExact, pickerAnnualNative, PICKER_UNKNOWN_PRICE, pickerMoney, BUDGET_EPS, type PaymentQuote } from './payment';
import { pickerPlanForMetric, TOOL_OWN_VENDOR, knownTokens, multiplier, recommendablePlan, matchesTool, planProfile, hasSeparateDaily, bandRank, catRank, hasCodingSurface, tokenEvidence, metricForRole, dailyQuotaSignal, type PlanProfile, type RoleMetric } from './profile';
import { roleDisplayName, tokSpan, roleUseText, tokenEvidenceText } from './text';

/* ============ Coding Plan 比价中心 — 帮我选 ============ */
/* 依赖选购条件的规则：预算与付款口径、候选池、主计划与替代、升级与补充、推荐理由。条件由调用方显式传入。 */

/** 「帮我选」的选购条件：预算、地区、工具、任务、付款方式与排序偏好（取值经 URL 白名单校验）。 */
export interface PickerCriteria { budget: string; region: string; tool: string; task: string; billing: string; priority: string; }

/** 推荐规则只依赖调用方传入的选购条件与审计目录；state/picker.ts 把它绑定到共享条件。 */
export function createPickerRules(pickerState: PickerCriteria) {
    /* 付款方式是预算与展示的共同口径。缺少年价时保留未知，不挪用月价。 */
    function pickerPaymentQuote(p: Plan, billing: string = pickerState.billing): PaymentQuote {
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

    function pickerMonthlyCNY(p: Plan) { return pickerPaymentQuote(p).monthlyCNY ?? PICKER_UNKNOWN_PRICE; }

    function pickerFirstPaymentText(p: Plan) {
        const quote = pickerPaymentQuote(p);
        return (quote.annualApprox && quote.available ? "约 " : "") + pickerMoney(quote.firstNative, quote.cur);
    }

    function matchesPickerPurchase(p: Plan) { return withinBudget(p); }

    /** 按所选付款方式改写额度行的月费；套餐不符合当前选购条件时返回 null。 */
    function pickerMetricInput(m: MetricRow): MetricRow | null {
        const p = pickerPlanForMetric(m);
        if (!p || !matchesPickerPurchase(p))
            return null;
        return {
        ...m, priceM: pickerPaymentQuote(p).monthlyNative, cur: p.cur,
    };
    }

    const TOOL_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

    function pickerToolRelationship(p: Plan) {
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

    function priceLine(p: Plan) {
        if (p.priceM === 0)
            return "免费";
        const quote = pickerPaymentQuote(p);
        if (!quote.available)
            return "未列公开" + quote.label + "价格";
        return pickerMoney(quote.monthlyNative, p.cur) + "/月" + (quote.mode === "Y" ? "（年付折月）" : "") +
            (p.cur === "CNY" ? "" : "，约 " + fmtCNY(quote.monthlyCNY ?? 0));
    }

    function windowStats(x: PlanProfile) {
        const role = x.headline || x.loose[0];
        return { tokens: knownTokens(x.p, role), mult: multiplier(x.p), price: pickerMonthlyCNY(x.p) || 0 };
    }

    function betterWindow(a: PlanProfile, b: PlanProfile) {
        const A = windowStats(a);
        const B = windowStats(b);
        if (A.tokens !== B.tokens)
            return A.tokens > B.tokens;
        if (A.mult !== B.mult)
            return A.mult > B.mult;
        /* tokens 与倍率完全打平时取更便宜的：代表档收敛的是「同厂商同角色的性价比之选」 */
        return A.price < B.price;
    }

    function withinBudget(p: Plan) {
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

    function eligibleProfiles() {
        return PLANS.filter(withinBudget).map(planProfile);
    }

    /** 每组只保留 better 判定最好的一档。 */
    function representatives(list: PlanProfile[], keyOf: (x: PlanProfile) => string, better: (a: PlanProfile, b: PlanProfile) => boolean = betterWindow) {
        const best = new Map<string, PlanProfile>();
        list.forEach((x) => {
            const key = keyOf(x);
            const prev = best.get(key);
            if (!prev || better(x, prev))
                best.set(key, x);
        });
        return [...best.values()];
    }

    function betterDailyTier(a: PlanProfile, b: PlanProfile) {
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

    function pickerPriority() { return Object.hasOwn(PICKER_PRIORITY_LABELS, pickerState.priority) ? pickerState.priority : "quota"; }

    /* 价格优先时同厂商同角色保留月费最低的一档，月费相同再按原规则比较额度。 */
    function cheaperThen(better: (a: PlanProfile, b: PlanProfile) => boolean) {
        return (a: PlanProfile, b: PlanProfile) => {
            const diff = (pickerMonthlyCNY(a.p) || 0) - (pickerMonthlyCNY(b.p) || 0);
            return Math.abs(diff) > BUDGET_EPS ? diff < 0 : better(a, b);
        };
    }

    /* 复杂任务主计划的排序（额度优先）：模型档位 → 可折算额度 → 倍率 → 套餐类别 → 编程入口 → 月费。
       只比较都有复杂任务主力模型的两档。 */
    function hardMainOrder(a: PlanProfile, b: PlanProfile, withPrice: boolean = true) {
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
    function hardRepresentatives(pool: PlanProfile[]) {
        return representatives(pool.filter((x) => x.headline), (x) => x.p.vendor + "|" + x.headline!.id, pickerPriority() === "price" ? cheaperThen(betterWindow) : betterWindow);
    }

    function chooseHardMain(pool: PlanProfile[]) {
        const reps = hardRepresentatives(pool);
        reps.sort((a, b) => hardMainOrder(a, b));
        return reps[0] || null;
    }

    /* 额度都无法折算、其余条件也打平时，实际由月费决定；主卡要直说，避免把「更便宜」读成能力或额度更好。 */
    function priceDecidedMain(main: PlanProfile, pool: PlanProfile[]) {
        if (pickerState.task === "daily" || !main.headline || knownTokens(main.p, main.headline) > 0)
            return false;
        return hardRepresentatives(pool).some((x) => x.p !== main.p && hardMainOrder(main, x, false) === 0 &&
            (pickerMonthlyCNY(x.p) || 0) > (pickerMonthlyCNY(main.p) || 0) + BUDGET_EPS);
    }

    function dailyRepresentatives(pool: PlanProfile[]) {
        return representatives(pool.filter((x) => x.loose.length), (x) => x.p.vendor + "|" + x.loose[0]!.id, pickerPriority() === "price" ? cheaperThen(betterDailyTier) : betterDailyTier);
    }

    function dailyOrder(a: PlanProfile, b: PlanProfile) {
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
    function dailyMainOrder(a: PlanProfile, b: PlanProfile) {
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

    function chooseDailyMain(pool: PlanProfile[]) {
        const reps = dailyRepresentatives(pool);
        reps.sort(dailyMainOrder);
        return reps[0] || null;
    }

    function chooseMain(pool: PlanProfile[]) {
        if (pickerState.task === "daily")
            return chooseDailyMain(pool);
        return chooseHardMain(pool) || (pickerState.task === "both" ? chooseDailyMain(pool) : null);
    }

    /* 当前偏好下排在最前的几档（主计划居首），对比表与推荐摘要共用同一顺序。 */
    function rankedCandidates(pool: PlanProfile[], main: PlanProfile | null, limit: number = 3) {
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

    function candidateRole(x: PlanProfile) { return pickerState.task === "daily" || !x.headline ? x.loose[0] : x.headline; }

    function abilityText(x: PlanProfile) {
        const hit = abilityHit(x.p, candidateRole(x));
        return hit ? `第 ${hit.row.rank}/${hit.protocol.total} 名 · ${publicScoreText(hit.row.score, hit.protocol.unit)}` : "未上榜";
    }

    function quotaEvidenceText(x: PlanProfile) {
        const evidence = tokenEvidence(x.p, candidateRole(x));
        return evidence ? `约 ${fmtTok(evidence.tokens)}/月 · 置信${evidence.conf}` : "未公开";
    }

    const SUMMARY_TOOLS: Record<string, string> = { any: "不限工具", claude: "Claude Code", codex: "Codex", cursor: "Cursor", own: "自家工具" };

    const SUMMARY_TASKS: Record<string, string> = { hard: "复杂为主", both: "复杂和日常", daily: "日常为主" };

    const SUMMARY_REGIONS: Record<string, string> = { cn: "国内", intl: "国际", all: "不限地区" };

    /* 纯文本摘要便于转发到聊天工具；金额与额度沿用页面同一口径，链接带上当前条件。 */
    function pickerSummaryText(url: string) {
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
       这里把被跳过的档（如 GLM Coding V3 Pro）补回可见，不然用户会以为厂商只有这一档。
       以日常模型为主的主计划（如 Cursor Ultra）按同一日常模型找省钱档，与 nextTier 的选角一致。 */
    function cheaperTiers(main: PlanProfile) {
        const dailyLead = pickerState.task === "daily" || !main.headline;
        const role = dailyLead ? main.loose[0] : main.headline;
        if (!role)
            return [];
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
            if (dailyLead ? prof.loose.some((r) => r.id === role.id) : prof.headline && prof.headline.id === role.id)
                rows.push(prof);
        });
        rows.sort((a, b) => (pickerMonthlyCNY(b.p) || 0) - (pickerMonthlyCNY(a.p) || 0));
        return rows;
    }

    function peerNote(main: PlanProfile, pool: PlanProfile[]) {
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
    function upgradeBudgetCeiling() {
        return UPGRADE_CEILINGS[pickerState.budget] || Infinity;
    }

    function nextTier(current: PlanProfile): PlanProfile | null {
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

    function unlockText(cur: PlanProfile, next: PlanProfile) {
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

    function dailyEntries(pool: PlanProfile[], main: PlanProfile) {
        /* 主计划候选可以只看月付档，补充池还须包含真正免费且附赠推理的入口。
           免费工具/BYOK、团队与国家限定档仍按同一资格规则排除。 */
        const seen = new Set(pool.map((x) => x.p));
        const free = PLANS.filter((p) => !seen.has(p) && !p.seat && p.cat !== "team" &&
            isFreeCodingEntry(p) && recommendablePlan(p) &&
            (pickerState.region === "all" || p.region === pickerState.region) && matchesTool(p, pickerState.tool)).map(planProfile);
        return pool.concat(free).filter((x) => x.p !== main.p && x.p.vendor !== main.p.vendor && (x.internalDaily.length || (!x.headline && x.loose.length)));
    }

    function pickSupplement(main: PlanProfile, pool: PlanProfile[]) {
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

    /* 公开编程评测默认只作模型能力参考；选「模型能力优先」时按 DeepSWE v1.1 参与排序。成绩对应评测时的推理与 Agent 配置。 */
    function benchmarkRankingNote() {
        return pickerPriority() === "ability" ? "本次按 DeepSWE v1.1 参与排序" : "不参与推荐排序";
    }

    /* 自家订阅与主计划共用任务/额度选档规则；有限预算先在预算内选。
       地区内没有时提供国际参考；预算连入门档也放不下时只展示最便宜的任务适配档并提示。 */
    function ownVendorPlan(vendor: string) {
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

    function pickerEmptyReason(pool: PlanProfile[]) {
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

    function pickerChoiceReason(profile: PlanProfile) {
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
    function alternativeProfiles(pool: PlanProfile[], main: PlanProfile | null, shownIds: Set<string> = new Set()) {
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

    return { pickerPaymentQuote, pickerMonthlyCNY, pickerFirstPaymentText, matchesPickerPurchase, pickerMetricInput, pickerToolRelationship, priceLine, windowStats, betterWindow, withinBudget, eligibleProfiles, representatives, betterDailyTier, pickerPriority, cheaperThen, hardMainOrder, hardRepresentatives, chooseHardMain, priceDecidedMain, dailyRepresentatives, dailyOrder, dailyMainOrder, chooseDailyMain, chooseMain, rankedCandidates, candidateRole, abilityText, quotaEvidenceText, pickerSummaryText, cheaperTiers, peerNote, upgradeBudgetCeiling, nextTier, unlockText, dailyEntries, pickSupplement, benchmarkRankingNote, ownVendorPlan, pickerEmptyReason, pickerChoiceReason, alternativeProfiles };
}
