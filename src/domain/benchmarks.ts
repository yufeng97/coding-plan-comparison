import { isFreeCodingEntry, isRelay, resolvedField, PLANS, BENCHMARK_SUMMARY } from '../generated/catalog';
import { displayModelName, escRe, metricOfferOk, cnyOf } from './core';
import { splitModelAccess } from './core';

/** 只接受 https 来源链接；其他协议（含 javascript:）一律视为未公布。 */
export function publicBenchmarkSourceUrl(url: unknown) {
    return typeof url === "string" && /^https:\/\//i.test(url.trim()) ? url.trim() : "";
}

export function publicScoreText(score: number, unit: string) { return Number(score.toFixed(1)) + unit; }

export function publicCostText(cost: number | null | undefined) {
    return cost == null ? "未公布" : cost > 0 && cost < 0.01 ? "小于 $0.01" : "$" + Number(cost.toFixed(2));
}

export function publicModelDisplayName(model: string) {
    const name = displayModelName(String(model).replace(/(\d)-(\d)(?=-|$)/g, "$1.$2"));
    return name.replace(/^Claude-(Opus|Sonnet|Haiku|Fable)-/i, "Claude $1 ")
        .replace(/^(GPT|GLM|Gemini|Qwen|DeepSeek|MiniMax|MiMo|Grok)-([\d.]+)-/i, "$1-$2 ")
        .replace(/^(Opus|Sonnet|Haiku|Fable)[\s-]+(\d)/i, "Claude $1 $2");
}

/* 模式只取决于名称本身（无 g 标志、无 lastIndex 状态），可安全复用；搜索重绘不再逐行逐套餐重新编译正则。 */
export const publicPatternCache = new Map<string, RegExp>();

export function publicModelExactPattern(name: string) {
    let re = publicPatternCache.get(name);
    if (!re) {
        const pattern = name.split(/[\s-]+/).map(escRe).join("[\\s-]*");
        re = new RegExp("(^|[^a-z0-9])" + pattern + "(?![a-z0-9.-]|\\s+(?:pro|flash|lite|mini|nano|preview|exp|plus|ultra|max|fast|turbo|thinking)\\b)", "i");
        publicPatternCache.set(name, re);
    }
    return re;
}

export function publicModelClauseIncludes(part: string, label: string) {
    const match = publicModelExactPattern(label).exec(part);
    if (!match)
        return false;
    /* 冒号不截断否定语境：「本档不支持：Kimi-K3」整句仍是否定。 */
    const prefix = part.slice(0, match.index + match[1].length).split(/[）)，,；;]/).pop() ?? "";
    const suffix = part.slice(match.index + match[0].length);
    return !/不含|不支持|不可用/.test(prefix) &&
        !/^[\s（(]*(?:需\s*(?:usage\s*credits|按量|额外付费)|(?:不支持|不可用|未包含)(?=[）),，;；]|$))/i.test(suffix);
}

/* 只展开文本已声明的同系列版本：Sonnet 4.6/5/5.5、Grok 4.5–4.7 等。
   针对待匹配的精确型号检查版本，不生成型号；Pro/Flash 等后缀与否定/付费语境仍走原匹配规则。 */
const publicVersionPatternCache = new Map<string, RegExp>();

function publicListedVersionIncludes(part: string, label: string) {
    /* 列表末尾直接修饰整个列表的收费条件不能在按 slash 分项时丢失。
       「（Fable 需 usage credits）」只修饰 Fable，仍由具体模型的前后文判断。 */
    if (part.includes("/") && /[（(]\s*需\s*(?:usage\s*credits|按量|额外付费)[^）)]*[）)]\s*$|\s+需\s*(?:usage\s*credits|按量|额外付费)\s*$/i.test(part))
        return false;
    const target = label.match(/^(.+?)[\s-]*(\d+(?:\.\d+)*)(.*)$/);
    if (!target)
        return publicModelClauseIncludes(part, label);
    const family = target[1].replace(/[\s-]+$/, "");
    let listed = publicVersionPatternCache.get(family);
    if (!listed) {
        const version = "\\d+(?:\\.\\d+)*";
        const pattern = family.split(/[\s-]+/).map(escRe).join("[\\s-]*");
        const suffix = "(?:[\\s-]+(?:pro|flash|lite|mini|nano|preview|exp|plus|ultra|max|fast|turbo|thinking)(?![a-z0-9.-]))*";
        const range = version + "(?:\\s*[–—~～]\\s*" + version + ")?";
        const item = range + suffix;
        const sequence = "(?:" + item + "(?:\\s*/\\s*" + item + ")+|" + version + "\\s*[–—~～]\\s*" + version + suffix + ")";
        listed = new RegExp("(^|[^a-z0-9])(" + pattern + "[\\s-]*)(" + sequence + ")(?![\\d.])", "gi");
        publicVersionPatternCache.set(family, listed);
    }
    const compare = (a: string, b: string) => {
        const left = a.split(".").map(Number), right = b.split(".").map(Number);
        for (let i = 0; i < Math.max(left.length, right.length); i++) {
            const diff = (left[i] ?? 0) - (right[i] ?? 0);
            if (diff) return diff;
        }
        return 0;
    };
    let plain = part;
    for (const match of part.matchAll(listed)) {
        /* 版本组必须连同后面的资格一起判断，不能让组首版本从普通精确匹配绕过付费限制。 */
        plain = plain.replace(match[0], match[1]);
        for (const item of match[3].split("/")) {
            const version = item.trim().match(/^(\d+(?:\.\d+)*)(?:\s*[–—~～]\s*(\d+(?:\.\d+)*))?(.*)$/)!;
            const allowed = version[2] ? compare(target[2], version[1]) >= 0 && compare(target[2], version[2]) <= 0
                : compare(target[2], version[1]) === 0;
            if (!allowed)
                continue;
            const start = match.index + match[1].length + match[2].length;
            const expanded = part.slice(0, start) + target[2] + version[3] + part.slice(start + match[3].length);
            if (publicModelClauseIncludes(expanded, label))
                return true;
        }
    }
    return publicModelClauseIncludes(plain, label);
}

function publicClauseIncludesVersion(part: string, label: string) {
    return publicListedVersionIncludes(part, label);
}

export function publicModelIncluded(p: Plan, name: string) {
    const names = [name];
    if (/^Claude (?:Opus|Sonnet|Haiku|Fable)\b/i.test(name))
        names.push(name.replace(/^Claude /i, ""));
    /* 结构化排除优先于文本匹配。 */
    if (Array.isArray(p.modelExcludes) && p.modelExcludes.some((x) => names.some((label) => publicClauseIncludesVersion(String(x), label) || publicModelExactPattern(String(x)).test(label))))
        return false;
    const included = splitModelAccess(resolvedField(p, "models")).included;
    const parts = included.split(/[、；;]/);
    /* Claude 的共享品牌前缀及官方 GPT 全系括号内的精确版本，均来自套餐明确列出的文本。 */
    if (names.some((label) => parts.some((part) => publicClauseIncludesVersion(part, label))))
        return true;
    const gpt = name.match(/^GPT-(\d+(?:\.\d+)?)\s+(.+)$/i);
    if (p.vendor === "OpenAI" && gpt) {
        const group = included.match(new RegExp("\\bGPT[\\s-]*" + escRe(gpt[1].split(".")[0]) + "(?![\\d.])\\s*全系[（(]([^）)]+)[）)]", "i"));
        const short = (gpt[1].includes(".") ? gpt[1] + " " : "") + gpt[2];
        if (group && !/不含|不支持|不可用/.test(included.split(/[、；]/).find((part) => part.includes(group[0])) || "") &&
            group[1].split("/").some((part) => part.trim().toLowerCase() === short.toLowerCase()))
            return true;
        /* 如 GPT-6 Sol / Luna / Astra，简称仅继承前一个明确模型的版本，遇到新系列即重置。 */
        return included.split(/[、；;]/).some((segment) => {
            if (/不含|不支持|不可用|需\s*(?:usage\s*credits|按量|额外付费)/i.test(segment))
                return false;
            let version = "";
            return segment.split("/").some((part) => {
                const explicit = part.trim().match(/^GPT[\s-]*(\d+(?:\.\d+)?)[\s-]+(?:Astra|Sol|Luna)$/i);
                if (explicit) {
                    version = explicit[1];
                    return false;
                }
                if (!/^(?:Astra|Sol|Luna)$/i.test(part.trim())) {
                    version = "";
                    return false;
                }
                return version === gpt[1] && publicModelClauseIncludes(part, gpt[2]);
            });
        });
    }
    return false;
}

/* 模型出品方的官方订阅排在前面，再按月费；第三方工具与云厂商随后。 */
export const PUBLIC_MODEL_MAKERS: [RegExp, string[]][] = [
    [/^claude/i, ["Anthropic"]], [/^gpt/i, ["OpenAI"]], [/^gemini/i, ["Google"]], [/^glm/i, ["智谱 BigModel", "Z.ai"]],
    [/^kimi/i, ["月之暗面 Kimi"]], [/^minimax/i, ["MiniMax"]], [/^mimo/i, ["小米 MiMo"]], [/^qwen/i, ["阿里云百炼"]],
    [/^deepseek/i, ["DeepSeek"]], [/^grok/i, ["xAI"]], [/^step/i, ["阶跃星辰 StepFun"]],
];

export function publicModelMakers(name: string) { return PUBLIC_MODEL_MAKERS.find(([re]) => re.test(name))?.[1] ?? []; }

export function publicPlanEligible(p: Plan) {
    return metricOfferOk({ ref: p.id }) && !isRelay(p) && ((p.priceM ?? 0) > 0 || isFreeCodingEntry(p)) && p.includedModelQuota !== false && p.modelAccess !== "byok" && p.modelAccess !== "metered";
}

export function publicModelPlans(model: string) {
    const name = publicModelDisplayName(model), makers = publicModelMakers(name);
    return PLANS.filter((p) => publicPlanEligible(p) && publicModelIncluded(p, name))
        .sort((a, b) => Number(!makers.includes(a.vendor)) - Number(!makers.includes(b.vendor)) || (cnyOf(a, "M") || 0) - (cnyOf(b, "M") || 0));
}

/* 套餐只列出同系列较新版本时（如 Opus 5.5 之于 Opus 5），提示出品方官方套餐，避免误以为只有第三方能用该系列。 */
export function publicNewerVersion(model: string, plans: Plan[]): { family: string; version: number; plans: Plan[] } | null {
    const name = publicModelDisplayName(model), makers = publicModelMakers(name);
    if (!makers.length || plans.some((p) => makers.includes(p.vendor)))
        return null;
    const m = name.match(/^(.*?)[\s-]*(\d+(?:\.\d+)?)$/);
    if (!m)
        return null;
    const family = m[1].replace(/^Claude\s+/i, ""), current = Number(m[2]);
    const re = new RegExp("(?:^|[^a-z0-9])" + family.split(/[\s-]+/).map(escRe).join("[\\s-]*") + "[\\s-]*(\\d+(?:\\.\\d+)?)(?![\\d.])", "gi");
    const newer = PLANS.filter((p) => makers.includes(p.vendor) && publicPlanEligible(p)).map((p) => {
        /* 与精确匹配同一条款判断：被否定或「需 usage credits / 按量」的版本不算包含。 */
        const versions = splitModelAccess(resolvedField(p, "models")).included.split(/[/、；;]/).flatMap((part) => [...part.matchAll(re)].map((x) => Number(x[1]))
            .filter((v) => v > current && Math.floor(v) === Math.floor(current) && publicModelClauseIncludes(part, `${family} ${v}`)));
        return versions.length ? { p, version: Math.max(...versions) } : null;
    }).filter((x): x is { p: Plan; version: number } => x !== null);
    if (!newer.length)
        return null;
    const version = Math.max(...newer.map((x) => x.version));
    return { family, version, plans: newer.filter((x) => x.version === version).slice(0, 3).map((x) => x.p) };
}

/** 评测行里的套餐链接：免费入口默认跳到免费区，其余跳到数据表。 */
export function publicPlanLink(p: Plan, section: string = isFreeCodingEntry(p) ? "free" : "table") {
    return `?q=${encodeURIComponent(p.vendor + " " + p.plan)}#${section}`;
}

/** 套餐明确列出的模型在某个编程协议里的最佳一行。 */
export interface PlanBenchmarkHit { protocol: BenchmarkSummaryProtocol; row: BenchmarkSummaryRow }

/* 只按模型用途的名称规则筛选（帮我选的复杂任务 / 日常模型）。 */
type RoleFilter = Pick<ModelRole, "re"> | null | undefined;

function planBenchmarkRow(p: Plan, protocol: BenchmarkSummaryProtocol, role: RoleFilter) {
    return protocol.rows.find((r) => {
        const name = publicModelDisplayName(r.model);
        return (!role || role.re.test(name)) && publicModelIncluded(p, name);
    });
}

/* 帮我选卡片：本档明确列出的模型在各编程协议中的最佳名次，读首屏摘要，不依赖完整榜单。
   与「可用套餐」同一精确版本匹配；协议分别列出，不合成总分。摘要行已按分数降序，find 即本档最佳。 */
export function planCodingBenchmarks(p: Plan | null | undefined, role: RoleFilter = null): PlanBenchmarkHit[] {
    if (BENCHMARK_SUMMARY.schemaVersion !== 1 || !p || !publicPlanEligible(p))
        return [];
    const families = new Set<string>();
    return BENCHMARK_SUMMARY.protocols.map((protocol) => {
        if (families.has(protocol.family))
            return null;
        const row = planBenchmarkRow(p, protocol, role);
        if (row)
            families.add(protocol.family);
        return row ? { protocol, row } : null;
    }).filter((hit): hit is PlanBenchmarkHit => hit !== null);
}

/* 「模型能力优先」只读一个协议，避免把不同评测的分数混排；摘要行已按分数降序，find 即本档最佳。 */
export const ABILITY_PROTOCOL_ID = "deepswe-v1-1";

export function planProtocolScore(p: Plan | null | undefined, role: RoleFilter = null, protocolId: string = ABILITY_PROTOCOL_ID): PlanBenchmarkHit | null {
    if (BENCHMARK_SUMMARY.schemaVersion !== 1 || !p || !publicPlanEligible(p))
        return null;
    const protocol = BENCHMARK_SUMMARY.protocols.find((x) => x.id === protocolId);
    if (!protocol)
        return null;
    const row = planBenchmarkRow(p, protocol, role);
    return row ? { protocol, row } : null;
}

export function publicUncertaintyLabel(row: Pick<PublicBenchmarkScore, "uncertainty">) {
    if (!row.uncertainty)
        return "置信区间未公布";
    const range = String(row.uncertainty).match(/([\d.]+)%?\s*[–—-]\s*([\d.]+)%/);
    return range ? `来源区间 ${Number(Number(range[1]).toFixed(1))}–${Number(Number(range[2]).toFixed(1))}%` : String(row.uncertainty);
}

export function publicBenchmarkDate(value: string | null | undefined) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value || "未公布";
}

export function publicBenchmarkConfiguration(row: Pick<PublicBenchmarkScore, "reasoning" | "agent" | "tokens" | "steps">) {
    return [row.reasoning ? "推理：" + row.reasoning : "推理配置未公布", row.agent ? "Agent：" + row.agent : "Agent 配置未公布", "Tokens：" + (row.tokens == null ? "未公布" : row.tokens), "Steps：" + (row.steps == null ? "未公布" : row.steps)].join("；");
}

/** 公开评测图按模型系列配色；颜色取自 CSS 变量 --bench-<id>。 */
export interface PublicChartFamily { id: string; label: string; re: RegExp }

export const PUBLIC_CHART_FAMILIES: PublicChartFamily[] = [
    { id: "gpt", label: "GPT / o 系列", re: /^(?:gpt|o[134](?:\b|-))/i },
    { id: "claude", label: "Claude", re: /^claude/i },
    { id: "gemini", label: "Gemini", re: /^gemini/i },
    { id: "glm", label: "GLM", re: /^glm/i },
    { id: "kimi", label: "Kimi", re: /^kimi/i },
    { id: "deepseek", label: "DeepSeek", re: /^deepseek/i },
    { id: "qwen", label: "Qwen", re: /^qwen/i },
    { id: "minimax", label: "MiniMax", re: /^minimax/i },
    { id: "grok", label: "Grok", re: /^grok/i },
    { id: "composer", label: "Composer", re: /^composer/i },
    { id: "mimo", label: "MiMo", re: /^mimo/i },
    { id: "other", label: "其他系列", re: /./ },
];

export function publicChartFamily(model: string) {
    return PUBLIC_CHART_FAMILIES.find((family) => family.re.test(publicModelDisplayName(model))) || PUBLIC_CHART_FAMILIES[PUBLIC_CHART_FAMILIES.length - 1];
}

export function publicChartAxisName(label: string, narrow: boolean) {
    const name = label.replace(/^(#\d+ )Claude /, "$1");
    if (!narrow)
        return name;
    return name.split(" · ")[0].replace(/^(#\d+ \S+) (.+)$/, "$1\n$2")
        .replace(/^(#\d+ Qwen[\d.]+)-(.+)$/, "$1\n$2")
        .replace(/^(#\d+ (?:DeepSeek|Muse-Spark|MiniMax|MiMo))-(.+)$/, "$1\n$2");
}
