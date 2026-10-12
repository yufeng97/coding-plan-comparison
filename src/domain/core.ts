import { RATE_USD_CNY, META, MODEL_ROLES, isRetiredPlan, isOneTimePlan, isRenewalOnly, isFourWeekPlan, isSoldOut, offerable, isRelay, findPlanReference, resolvedField, hasOwnClient, mainlandAccessOf, METRICS_RAW, ESTIMATES, PRICE_CHECKS, priceCheckOf, isPriceConfirmed } from '../generated/catalog';
import { toCNY } from './metrics';
import { hasIncludedModelQuota, isOnSalePlan, PLANS } from '../generated/catalog';

export type Billing = "M" | "Y";

export type PlanCategory = Plan["cat"];

export type PlanRegion = Plan["region"];

/** 价格核查记录的种类：套餐、API 按量单价、额度表按量参照。 */
export type PriceCheckKind = "plan" | "api" | "payg";

/** 可查核价记录的对象：套餐按永久 ID，API 与按量参照按「厂商|型号」。 */
export type PriceSubject = { id?: string; vendor?: string; model?: string };

/** 首屏后按需下载的辅助数据：维护记录与公开评测。 */
export type OptionalDataKind = "maintenance" | "benchmark";

export const CAT_LABEL: Record<PlanCategory, string> = { official: "模型官方订阅", tool: "第三方工具订阅", cloud: "云厂商/API 套餐", team: "团队 / 企业档" };

export const REGION_LABEL: Record<PlanRegion, string> = { cn: "国内", intl: "国际" };

const VENDOR_SHORT: Record<string, string> = {
    "Cognition Devin Desktop（原 Windsurf）": "Devin Desktop",
    "Cognition Devin Desktop": "Devin Desktop",
    "Cognition Devin（云 agent）": "Devin 云",
    "Roo Code（Roomote）": "Roomote",
    "智谱 BigModel": "BigModel",
    "月之暗面 Kimi": "月之暗面",
    "阿里云 Qoder CN（原通义灵码）": "Qoder CN（灵码）",
    "腾讯云 CodeBuddy": "腾讯 CodeBuddy",
    "腾讯云（LKEAP 知识引擎）": "腾讯云 LKEAP",
    "字节跳动 Trae（国内版）": "字节 Trae(国内)",
    "字节跳动 Trae（国际版）": "字节 Trae(国际)",
    "百度文心快码 Comate": "百度 Comate",
    "火山引擎方舟（字节）": "火山方舟",
    "小米 MiMo": "小米 MiMo",
    "腾讯云 TokenHub": "腾讯 TokenHub",
    "百度千帆": "百度千帆",
    "七牛云": "七牛云",
    "Factory (Droid)": "Droid",
    "讯飞星辰 MaaS": "讯飞 Astron",
    "Canopy Wave": "Canopy",
    /* API 按量图里的厂商短名 */
    "阿里云百炼": "百炼",
    "火山引擎（豆包/方舟）": "火山方舟",
    "硅基流动 SiliconFlow": "硅基流动",
    "阶跃星辰 StepFun": "阶跃",
};

export const RATE = RATE_USD_CNY;

/* 「帮我选」模型角色表的归类日期，取自 data.js 的 MODEL_ROLES.asOf */
export const MODEL_ROLES_ASOF = MODEL_ROLES.find((r) => r.asOf)?.asOf || META.updated;

/* ---------- 计划主索引：METRICS_RAW / ESTIMATES / PLAN_TOKENS 经 ref 引用 PLANS 的价格（单一数据源） ---------- */
/** 额度行解析后的完整口径：身份、名称与价格来自引用的套餐，模型与额度口径保留在行内。 */
export interface MetricRow extends QuotaRow {
    priceM: number | null;
    cur: Plan["cur"];
    windowPeriod: NonNullable<Plan["windowPeriod"]>;
    isEst?: boolean;
}

/** 名称、价格与周期取自引用套餐；引用无法解析时返回 null（校验器同样报错）。 */
export function resolvePlan(m: QuotaRow): MetricRow | null {
    const p = findPlanReference(m.ref);
    if (p)
        return { ...m, vendor: p.vendor, plan: p.plan, priceM: p.priceM, cur: p.cur, windowPeriod: m.windowPeriod || p.windowPeriod || "unknown" };
    console.warn("[data] ref 未解析，已跳过:", m.ref);
    return null;
}

/** HTML 转义：ECharts 提示框等字符串模板使用。 */
export function esc(s: unknown) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch as "&" | "<" | ">" | '"' | "'"]);
}

/** 只接受 http(s) 链接并转义，供字符串模板使用；其他协议返回空串。 */
export function safeHref(u: unknown) {
    const s = String(u ?? "").trim();
    return /^https?:\/\//i.test(s) ? esc(s) : "";
}

/* Native Vue bindings escape attributes themselves. Keep the validated URL unescaped. */
export function safeLink(value: unknown): string {
    const href = String(value ?? '').trim();
    return /^https?:\/\//i.test(href) ? href : '';
}

/* 计划分类（含中转站名单 isRelay）、offerable、resolvedField、hasOwnClient 在 data/sources/data.js，页面与校验器共用。 */
export interface PlanBadge { t: string; k: "risk" | "agent"; }

const PURCHASE_COUNTRY_NAMES: Record<string, string> = { IN: "印度", CN: "中国", US: "美国" };

/* 风险标签只读结构化字段：备注里的「支持 BYOK」「季付 $403.2」等文字不能推断为必须自备 Key 或访问异常。 */
export function planBadges(p: Plan): PlanBadge[] {
    const badges: PlanBadge[] = [];
    const check = priceCheckOf(p);
    if (check && check.status === "unverified")
        badges.push({ t: "价格待核", k: "risk" });
    const tools = resolvedField(p, "tools");
    if (isRelay(p))
        badges.push({ t: "中转", k: "risk" });
    if (p.modelAccess === "byok")
        badges.push({ t: "要自备 Key", k: "risk" });
    else if (p.modelAccess === "metered" || p.includedModelQuota === false)
        badges.push({ t: "推理另计", k: "risk" });
    if (isRenewalOnly(p))
        badges.push({ t: "仅老用户", k: "risk" });
    if (isOneTimePlan(p))
        badges.push({ t: "一次性", k: "risk" });
    if (isSoldOut(p))
        badges.push({ t: "售罄 · 仅候补", k: "risk" });
    const mainland = mainlandAccessOf(p);
    if (mainland)
        badges.push({ t: mainland.status === "unsupported" ? "不服务中国大陆" : "部分模型限地区", k: "risk" });
    if (p.purchaseCountries && p.purchaseCountries.length)
        badges.push({ t: "仅限" + p.purchaseCountries.map((c) => PURCHASE_COUNTRY_NAMES[c] || c).join("/"), k: "risk" });
    if (p.accessUnstable)
        badges.push({ t: "访问不稳", k: "risk" });
    if (/Claude Code/i.test(tools))
        badges.push({ t: "Claude Code", k: "agent" });
    if (/Codex/i.test(tools))
        badges.push({ t: "Codex", k: "agent" });
    if (p.vendor === "Cursor" || /\bCursor\b/i.test(tools))
        badges.push({ t: "Cursor", k: "agent" });
    if (!badges.some((b) => b.k === "agent") && !isRelay(p) && hasOwnClient(p))
        badges.push({ t: "自家客户端", k: "agent" });
    return badges;
}

/* 中国大陆可用性的展示文案：国内档为国内服务；国际档只在登记了官方说明时给结论，其余标未核实。 */
export function mainlandAccessText(p: Plan | null | undefined) {
    const access = mainlandAccessOf(p);
    if (access)
        return `${access.status === "unsupported" ? "官方支持地区不含中国大陆" : "服务可用，部分模型受供应商地区限制"}（${access.checkedAt} 核查）：${access.evidence}`;
    return p && p.region === "cn" ? "国内服务" : "未核实官方支持地区";
}

/** 额度行对应的档位是否仍可正常购买（排除停售、待核价、一次性、仅老用户与限量）。
 * 经 ref 读取主表的结构化状态（校验器要求每行都有 ref），不按行名猜测购买资格。 */
export function metricOfferOk(m: Pick<QuotaRow, "ref">) {
    const p = findPlanReference(m.ref);
    return !p || !(isRetiredPlan(p) || !isPriceConfirmed(p) || isOneTimePlan(p) || isRenewalOnly(p) || !offerable(p));
}

function adoptMetric(m: QuotaRow, isEst: boolean): MetricRow | null {
    const resolved = resolvePlan(m);
    return resolved ? { ...resolved, isEst } : null;
}

export const METRICS_ALL: MetricRow[] = [
    ...METRICS_RAW.map((m) => adoptMetric(m, false)),
    ...ESTIMATES.map((m) => adoptMetric(m, true)),
].filter((m): m is MetricRow => m !== null);

/* ---------- 工具函数 ---------- */
export const shortVendor = (v: string) => VENDOR_SHORT[v] || v;

export const fmtCNY = (n: number) => "¥" + (Math.round(n * 10) / 10).toLocaleString("zh-CN");

export const trunc = (s: string | null | undefined, n: number) => (!s ? "—" : (s.length > n ? s.slice(0, n) + "…" : s));

export function priceOf(p: Plan, billing: string) {
    if (billing === "Y")
        return p.priceY ?? null;
    return p.priceM;
}

/* Currency conversion uses the shared ./metrics implementation. */
export function cnyOf(p: Plan, billing: string) {
    const v = priceOf(p, billing);
    return v == null ? null : toCNY(v, p.cur);
}

export function priceText(p: Plan, key: "priceM" | "priceY") {
    const v = p[key];
    if (v == null)
        return "按量/定制";
    if (v === 0)
        return "免费";
    return currencySymbol(p.cur) + Number(v.toFixed(2));
}

export function currencySymbol(cur: string) { return cur === "USD" ? "$" : cur === "INR" ? "₹" : "¥"; }

const PRICE_CHECK_LABELS: Record<PriceVerification["status"], string> = { verified: "价格已核实", changed: "核价信息已校正", unverified: "历史价 · 待核实", retired: "已停售", custom: "需询价" };

export function priceCheckLabel(p: PriceSubject, kind: PriceCheckKind = "plan") {
    const check = priceCheckOf(p, kind);
    return check ? PRICE_CHECK_LABELS[check.status] : "未核实";
}

export function priceCheckSources(p: PriceSubject, kind: PriceCheckKind = "plan") {
    const check = priceCheckOf(p, kind);
    return check ? check.sourceIds.map((id) => PRICE_CHECKS.sources[id]?.url).filter((url): url is string => !!url) : [];
}

/* 所有表格/对比/导出共用计价单位，不能把充值或席位费用当作个人月费。 */
export function priceUnit(p: Plan) {
    if (isOneTimePlan(p))
        return "一次性";
    if (isFourWeekPlan(p))
        return p.seat ? "席位/4周" : "4周";
    return p.seat ? "席位/月" : "月";
}

export function planPriceLabel(p: Plan, billing: string = "M") {
    const key = billing === "Y" ? "priceY" : "priceM";
    if (p[key] == null)
        return billing === "Y" ? "—" : "按量/定制";
    if (p[key] === 0)
        return p.includedModelQuota === false ? "平台免费；推理另计" : "免费";
    return priceText(p, key) + "/" + priceUnit(p) + (billing === "Y" ? "（年付折月）" : "");
}

const MODEL_BRANDS: [RegExp, string][] = [
    [/^(gpt)(.*)$/i, "GPT"],
    [/^(glm)(.*)$/i, "GLM"],
    [/^(qwen)(.*)$/i, "Qwen"],
    [/^(deepseek)(.*)$/i, "DeepSeek"],
    [/^(kimi)(.*)$/i, "Kimi"],
    [/^(claude)(.*)$/i, "Claude"],
    [/^(gemini)(.*)$/i, "Gemini"],
    [/^(minimax)(.*)$/i, "MiniMax"],
    [/^(mimo)(.*)$/i, "MiMo"],
    [/^(doubao)(.*)$/i, "Doubao"],
    [/^(step)(.*)$/i, "Step"],
    [/^(grok)(.*)$/i, "Grok"],
    [/^(ernie)(.*)$/i, "ERNIE"],
    [/^(hy)(\d.*)$/i, "Hy"],
];

/* 轴上和表里的模型名统一成产品写法：qwen3-coder-next → Qwen3-Coder-Next。计费 ID 仍用原文。 */
export function displayModelName(name: string | null | undefined) {
    const raw = String(name || "").trim();
    if (!raw)
        return raw;
    const tailMatch = raw.match(/\s*[\[（(].*$/);
    const head = tailMatch ? raw.slice(0, tailMatch.index) : raw;
    const tail = tailMatch ? tailMatch[0] : "";
    const cap = (tok: string) => {
        for (const [re, brand] of MODEL_BRANDS) {
            const m = tok.match(re);
            if (m)
                return brand + (m[2] || "");
        }
        return /^[a-z]/.test(tok) ? tok.charAt(0).toUpperCase() + tok.slice(1) : tok;
    };
    return head.split("-").map(cap).join("-") + tail;
}

export function foldSearch(s: unknown) {
    return String(s || "").toLowerCase().replace(/[\s_\-./·]+/g, "");
}

/* 正则转义（windowSentence 的模型名片段、测试与校验共用的小工具） */
export function escRe(s: string) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SEARCH_VENDOR_ALIASES: [RegExp, string][] = [
    [/OpenAI|ChatGPT/i, "OpenAI ChatGPT Codex GPT 聊天GPT"],
    [/Anthropic|Claude/i, "Anthropic Claude 克劳德"],
    [/智谱|BigModel|Z\.ai/i, "智谱 BigModel GLM Z.ai"],
    [/月之暗面|Kimi/i, "月之暗面 Kimi Moonshot"],
    [/DeepSeek|深度求索/i, "DeepSeek 深度求索"],
    [/阿里/i, "阿里 Alibaba"],
    [/Qwen|千问/i, "千问 Qwen"],
    [/字节/i, "字节 ByteDance"],
    [/豆包|Doubao/i, "豆包 Doubao"],
    [/GitHub|Copilot/i, "GitHub Copilot"],
    [/Google|Gemini|谷歌/i, "Google 谷歌 Gemini 双子座"],
    [/MiniMax|稀宇/i, "MiniMax 稀宇"],
    [/小米|MiMo/i, "小米 Xiaomi MiMo"],
];

/* 搜索文本只取决于套餐的静态字段，每次输入都要对全部套餐匹配：按套餐对象缓存。 */
const SEARCH_BLOB_CACHE = new WeakMap<Plan, string>();

export function planSearchBlob(p: Plan) {
    let blob = SEARCH_BLOB_CACHE.get(p);
    if (blob === undefined) {
        blob = planSearchBlobUncached(p);
        SEARCH_BLOB_CACHE.set(p, blob);
    }
    return blob;
}

function planSearchBlobUncached(p: Plan) {
    const identity = [p.vendor, p.plan].join(" ");
    const aliases = SEARCH_VENDOR_ALIASES.filter(([pattern]) => pattern.test(identity)).map(([, words]) => words);
    return foldSearch([p.vendor, p.plan, resolvedField(p, "models"), resolvedField(p, "tools"), resolvedField(p, "quota"), resolvedField(p, "note"), ...aliases].join(" "));
}

/** 价格表里确有记录的厂商（在售明码标价档），按中文名排序；数据表的厂商筛选与链接参数校验共用。 */
export function tableVendors() {
    return [...new Set(PLANS.filter(isOnSalePlan).map((p) => p.vendor))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function queryHit(blob: string, q: string | null | undefined) {
    const terms = String(q || "").trim().split(/\s+/).map(foldSearch).filter(Boolean);
    return terms.every((term) => blob.includes(term));
}

/* ---------- 统计卡 ---------- */
export function planLabel(p: Pick<Plan, "vendor" | "plan">) {
    const sv = shortVendor(p.vendor);
    const words = sv.split(/[\s（(]/).filter(Boolean);
    const first = words[0];
    const last = words[words.length - 1];
    const plan = p.plan;
    if (first && plan.toLowerCase().startsWith(first.toLowerCase()))
        return plan;
    if (last && plan.toLowerCase().startsWith(last.toLowerCase())) {
        return sv.slice(0, sv.lastIndexOf(last)).trim() + " " + plan;
    }
    return sv + " " + plan;
}

/* 每百万 tokens 成本的档位阈值：排行图配色、排行说明与额度表共用（≤0.3 低 / ≤1 中 / >1 高） */
export function cpmTier(v: number | null | undefined) {
    return v == null ? "na" : v <= 0.3 ? "lo" : v <= 1 ? "mid" : "hi";
}

/* 套餐标题与模型清单：标题去掉与厂商末段重复的前缀；模型清单把「按量」的末段与包含部分分开。 */
export function planTitle(p: Pick<Plan, "vendor" | "plan">) {
    const parts = String(p.vendor || "").split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && String(p.plan || "").startsWith(last))
        return parts.slice(0, -1).concat(p.plan).join(" ");
    return `${p.vendor} ${p.plan}`;
}

export function splitModelAccess(text: string | null | undefined) {
    const parts = String(text || "").split(/[；;]/);
    if (parts.length >= 2 && /按(?:\s*M\s*token|牌价|量)/.test(parts[parts.length - 1]!)) {
        return { included: parts.slice(0, -1).join("；"), metered: parts[parts.length - 1]! };
    }
    return { included: String(text || ""), metered: "" };
}

export function freeKind(p: Plan) { return hasIncludedModelQuota(p) ? "included" : "byok"; }
