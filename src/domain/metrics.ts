import { RATE_USD_CNY, RATE_INR_CNY, matchModelRoles } from '../generated/catalog';

/* ============================================================
 * 额度换算纯计算模块（无 DOM 依赖）
 * 浏览器业务模块与公式回归使用同一实现，数据来自生成的审计目录。
 * ============================================================ */
/** 额度换算的入参：额度行（METRICS_RAW / ESTIMATES）加上经 ref 解析出的套餐价格。数量单位为百万 tokens。 */
export interface MetricsInput {
    /** 官方或估算的每周 tokens 下限、上限。 */
    wkLowM?: number; wkHighM?: number;
    /** 请求数制：每周、每月、每 5 小时的请求数。 */
    reqPerWk?: number; reqPerMo?: number; reqPer5h?: number;
    /** 官方每 5 小时条数区间与单次 tokens 区间。 */
    reqLowPer5h?: number; reqHighPer5h?: number;
    tokensLowPerReq?: number; tokensHighPerReq?: number;
    /** 周期标记；月池和无 5h 限制不生成 5 小时窗口。 */
    windowPeriod?: string;
    /** credits 制：月池的美元或人民币面值。 */
    creditUSD?: number; creditCNY?: number;
    /** 模型牌价：输入、输出、缓存命中输入，每百万 tokens。 */
    apiIn?: number; apiOut?: number; apiCache?: number;
    /** API 牌价币种；省略时沿用套餐币种。 */
    apiCur?: string;
    /** 月费与币种。 */
    priceM?: number | null; cur?: string;
}

/** 额度换算结果。tokens 为百万，价值与套餐同币种，倍率 = 额度价值 ÷ 该时段分摊月费。 */
export interface MetricsResult {
    /** 5 小时窗口、每周、每月 tokens 的下限与上限，以及月中值。 */
    fLow: number | null; fHigh: number | null; wkLowM: number | null; wkHighM: number | null;
    moLow: number | null; moHigh: number | null; moMidM: number | null;
    /** 混合牌价（与条目同币种）与月费折算人民币。 */
    blend: number | null; priceCNY: number;
    /** 每百万 tokens 的实际成本（人民币）。 */
    costPerM: number | null;
    val5h: number | null; valWk: number | null; valMo: number | null;
    val5hHi?: number | null; valWkHi?: number | null; valMoHi?: number | null;
    r5h: number | null; rwk: number | null; rmo: number | null;
    r5hHi?: number | null; rwkHi?: number | null; rmoHi?: number | null;
}
/* 换算假设：每月 4.33 周、每周 5 个 5h 窗口、输入/输出 80/20、缓存命中率 95%、
   请求数制计划按约 20K tokens/请求折算。 */
export const WEEKS_PER_MONTH = 4.33;

export const SLOTS_PER_WEEK = 5;

export const API_MIX_IN = 0.8, API_MIX_OUT = 0.2;

export const CACHE_HIT_RATE = 0.95;

export const TOKENS_PER_REQ = 20000;

/** 5 小时·周·月的 tokens 区间（百万）。 */
export interface WindowTokens { fLow: number; fHigh: number; wkLowM: number; wkHighM: number; moLow: number; moHigh: number; }

/** 各时段的额度倍率。 */
export interface PeriodRates { r5h: number; rwk: number; rmo: number; }

/* 80% 输入（95% 缓存命中）+ 20% 输出，折成每百万 tokens 混合牌价；缺牌价时得到 NaN。 */
export function blendPrice(m: Pick<MetricsInput, "apiIn" | "apiOut" | "apiCache" | "apiCur" | "cur">) {
    const effIn = CACHE_HIT_RATE * (m.apiCache ?? NaN) + (1 - CACHE_HIT_RATE) * (m.apiIn ?? NaN);
    const value = API_MIX_IN * effIn + API_MIX_OUT * (m.apiOut ?? NaN);
    return m.apiCur && m.apiCur !== m.cur ? fromCNY(toCNY(value, m.apiCur), m.cur) : value;
}

/** 原币金额折算人民币；未知币种得到 NaN。 */
export function toCNY(v: number, cur: string | undefined) {
    if (cur === "USD")
        return v * RATE_USD_CNY;
    if (cur === "INR")
        return v * RATE_INR_CNY;
    return cur === "CNY" ? v : NaN;
}

export function fromCNY(v: number, cur: string | undefined) {
    if (cur === "USD")
        return v / RATE_USD_CNY;
    if (cur === "INR")
        return v / RATE_INR_CNY;
    return cur === "CNY" ? v : NaN;
}

/* 百万 tokens 的人类可读格式：207.84 → "208M"，2047 → "2.0B" */
export function fmtTok(m: number | null | undefined) {
    if (m == null || !Number.isFinite(m) || m < 0)
        return "—";
    if (m >= 1000)
        return (m / 1000).toFixed(1) + "B";
    const digits = m < 1 ? 2 : m < 10 ? 1 : 0;
    return Number(m.toFixed(digits)) + "M";
}

/**
 * 各时段的额度倍率。分母是该时段分摊到的月费：
 * 5h = 月费/(4.33×5)，周 = 月费/4.33，月 = 月费。
 */
export function periodRates(val5hCNY: number, valWkCNY: number, valMoCNY: number, priceCNY: number): PeriodRates | null {
    const slots = WEEKS_PER_MONTH * SLOTS_PER_WEEK;
    if (!Number.isFinite(priceCNY) || !(priceCNY > 0) || ![val5hCNY, valWkCNY, valMoCNY].every((v) => Number.isFinite(v) && v >= 0))
        return null;
    return {
        r5h: val5hCNY / (priceCNY / slots),
        rwk: valWkCNY / (priceCNY / WEEKS_PER_MONTH),
        rmo: valMoCNY / priceCNY,
    };
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * 把额度口径（每周 tokens / 请求数 / 5h 请求数）展开成 5h·周·月 tokens。
 * 口径冲突时以更具体的窗口为锚（有周用周，其次月，最后 5h×5）。
 */
export function windowTokens(m: MetricsInput | null | undefined): WindowTokens | null {
    if (!m || typeof m !== "object")
        return null;
    const { reqLowPer5h, reqHighPer5h, tokensLowPerReq, tokensHighPerReq } = m;
    if ([reqLowPer5h, reqHighPer5h, tokensLowPerReq, tokensHighPerReq].some((v) => v != null)) {
        if (!positive(reqLowPer5h) || !positive(reqHighPer5h) || !positive(tokensLowPerReq) || !positive(tokensHighPerReq)
            || reqHighPer5h < reqLowPer5h || tokensHighPerReq < tokensLowPerReq)
            return null;
        const fLow = reqLowPer5h * tokensLowPerReq / 1e6;
        const fHigh = reqHighPer5h * tokensHighPerReq / 1e6;
        const wkLowM = fLow * SLOTS_PER_WEEK, wkHighM = fHigh * SLOTS_PER_WEEK;
        return { fLow, fHigh, wkLowM, wkHighM, moLow: wkLowM * WEEKS_PER_MONTH, moHigh: wkHighM * WEEKS_PER_MONTH };
    }
    if (m.wkLowM != null) {
        if (!positive(m.wkLowM) || (m.wkHighM != null && (!positive(m.wkHighM) || m.wkHighM < m.wkLowM)))
            return null;
        const wkLowM = m.wkLowM;
        const wkHighM = m.wkHighM ?? m.wkLowM;
        return {
            fLow: wkLowM / SLOTS_PER_WEEK, fHigh: wkHighM / SLOTS_PER_WEEK,
            wkLowM, wkHighM,
            moLow: wkLowM * WEEKS_PER_MONTH, moHigh: wkHighM * WEEKS_PER_MONTH,
        };
    }
    if (m.reqPerWk == null && m.reqPerMo == null && m.reqPer5h == null)
        return null;
    if (![m.reqPerWk, m.reqPerMo, m.reqPer5h].every((v) => v == null || positive(v)))
        return null;
    const toM = (n: number) => (n * TOKENS_PER_REQ) / 1e6;
    const wk = m.reqPerWk != null ? toM(m.reqPerWk) : null;
    const moCap = m.reqPerMo != null ? toM(m.reqPerMo) : null;
    /* 前面已确认三种请求口径至少有一种，周和月都缺时一定有 5h 口径。 */
    const hCap = m.reqPer5h != null ? toM(m.reqPer5h) : null;
    const wkM = wk != null ? wk : moCap != null ? moCap / WEEKS_PER_MONTH : hCap! * SLOTS_PER_WEEK;
    const f = hCap != null ? hCap : wkM / SLOTS_PER_WEEK;
    const mo = moCap != null ? moCap : wkM * WEEKS_PER_MONTH;
    return { fLow: f, fHigh: f, wkLowM: wkM, wkHighM: wkM, moLow: mo, moHigh: mo };
}

/* computeMetrics 是纯函数且在排行图/额度表/帮我选里被反复调用，按入参对象做一层缓存 */
export const METRICS_COMPUTED = new WeakMap<MetricsInput, MetricsResult | null>();

/** 口径不完整、数值非法或月费非正时返回 null。 */
export function computeMetrics(m: MetricsInput | null | undefined): MetricsResult | null {
    if (!m || typeof m !== "object")
        return null;
    if (METRICS_COMPUTED.has(m))
        return METRICS_COMPUTED.get(m) ?? null;
    const result = computeMetricsUncached(m);
    /* 官方周 tokens 仍可按已说明的每周 5 窗口假设均摊；
       周池、月池、未知周期或仅日/月请求不能证明有 5h 配额。明确的 5h 请求口径单独保留。 */
    const has5hRequests = m.reqPer5h != null || m.reqLowPer5h != null;
    const no5hQuota = m.creditUSD != null || m.creditCNY != null ||
        m.windowPeriod === "none" || m.windowPeriod === "week" || m.windowPeriod === "month" ||
        ((m.windowPeriod === "unknown" || m.reqPerMo != null) && !has5hRequests);
    if (result && no5hQuota) {
        result.fLow = result.fHigh = null;
        result.val5h = result.val5hHi = null;
        result.r5h = result.r5hHi = null;
    }
    const valid = result && Object.values(result).some((v) => typeof v === "number" && !Number.isFinite(v)) ? null : result;
    METRICS_COMPUTED.set(m, valid);
    return valid;
}

export function computeMetricsUncached(m: MetricsInput): MetricsResult | null {
    const priceM = m.priceM ?? NaN;
    if (!Number.isFinite(priceM) || !(priceM > 0) || !Number.isFinite(toCNY(priceM, m.cur)) || (m.apiCur && !Number.isFinite(toCNY(1, m.apiCur))))
        return null;
    const hasApi = [m.apiIn, m.apiOut, m.apiCache].some((v) => v != null);
    if (hasApi && !(Number.isFinite(m.apiIn) && m.apiIn! >= 0 && Number.isFinite(m.apiOut) && m.apiOut! > 0 && Number.isFinite(m.apiCache) && m.apiCache! >= 0 && m.apiCache! <= m.apiIn!))
        return null;
    /* Credits 月池制：额度价值按官方锚点（美元 credits 或 1M Credit=¥1）。
       倍率 = 该时段额度价值 ÷ 该时段分摊月费。写了模型牌价时再把面值折成 tokens。 */
    if (m.creditUSD != null || m.creditCNY != null) {
        if (m.creditUSD != null && m.creditCNY != null)
            return null;
        const isUSD = m.creditUSD != null;
        const creditCur = isUSD ? "USD" : "CNY";
        const priceCNY = toCNY(priceM, m.cur);
        const faceValue = (isUSD ? m.creditUSD : m.creditCNY)!;
        if (!Number.isFinite(faceValue) || !(faceValue > 0))
            return null;
        /* API 牌价使用 m.cur；面值先换到同币种，返回的价值列也保持 m.cur。 */
        const valueCNY = toCNY(faceValue, creditCur);
        const valMo = fromCNY(valueCNY, m.cur);
        const valWk = valMo / WEEKS_PER_MONTH;
        const val5h = valWk / SLOTS_PER_WEEK;
        const rates = periodRates(toCNY(val5h, m.cur), toCNY(valWk, m.cur), toCNY(valMo, m.cur), priceCNY);
        if (!rates)
            return null;
        /* 有逐模型牌价时，把 credits 面值折成 tokens（与请求数制同一套 80/20、95% 缓存假设）。
           没有牌价的美元 credits 仍用 ¥10/M 假设，只出每 M 成本、不出 token 列。 */
        if (typeof m.apiIn === "number" && typeof m.apiOut === "number" && typeof m.apiCache === "number") {
            const blend = blendPrice(m);
            if (blend > 0) {
                const moMidM = valMo / blend;
                const wk = moMidM / WEEKS_PER_MONTH;
                const f = wk / SLOTS_PER_WEEK;
                return {
                    fLow: f, fHigh: f, wkLowM: wk, wkHighM: wk, moLow: moMidM, moHigh: moMidM,
                    moMidM, blend, priceCNY, costPerM: priceCNY / moMidM,
                    val5h, val5hHi: val5h, valWk, valWkHi: valWk, valMo, valMoHi: valMo,
                    r5h: rates.r5h, r5hHi: rates.r5h, rwk: rates.rwk, rwkHi: rates.rwk, rmo: rates.rmo, rmoHi: rates.rmo,
                };
            }
        }
        const costPerM = isUSD && faceValue > 0 ? (priceCNY * 10) / (faceValue * RATE_USD_CNY) : null;
        return {
            fLow: null, fHigh: null, wkLowM: null, wkHighM: null,
            moLow: null, moHigh: null, moMidM: null, blend: null, priceCNY, costPerM,
            val5h, val5hHi: val5h, valWk, valWkHi: valWk, valMo, valMoHi: valMo,
            r5h: rates.r5h, r5hHi: rates.r5h, rwk: rates.rwk, rwkHi: rates.rwk, rmo: rates.rmo, rmoHi: rates.rmo,
        };
    }
    const w = windowTokens(m);
    if (!w)
        return null;
    const blend = blendPrice(m);
    if (!(blend > 0) || !(priceM > 0))
        return null;
    const priceCNY = toCNY(priceM, m.cur);
    const val5h = w.fLow * blend, val5hHi = w.fHigh * blend;
    const valWk = w.wkLowM * blend, valWkHi = w.wkHighM * blend;
    const valMo = w.moLow * blend, valMoHi = w.moHigh * blend;
    const rates = periodRates(toCNY(val5h, m.cur), toCNY(valWk, m.cur), toCNY(valMo, m.cur), priceCNY);
    if (!rates)
        return null;
    const moMidM = (w.moLow + w.moHigh) / 2;
    const costPerM = moMidM > 0 ? priceCNY / moMidM : null;
    /* 上限价值不小于下限，下限倍率有效时上限倍率同样有效。 */
    const hi = periodRates(toCNY(val5hHi, m.cur), toCNY(valWkHi, m.cur), toCNY(valMoHi, m.cur), priceCNY)!;
    return {
        ...w, moMidM, blend, priceCNY, costPerM,
        val5h, val5hHi, valWk, valWkHi, valMo, valMoHi,
        r5h: rates.r5h, rwk: rates.rwk, rmo: rates.rmo,
        r5hHi: hi.r5h, rwkHi: hi.rwk, rmoHi: hi.rmo,
    };
}

/* 性价比排行的「旗舰」筛选只排除轻量模型，与「帮我选」的复杂任务角色共用 data.js 的 MODEL_ROLES 正则，不再另维护一套。
   有意的口径差异只在 RANK_MAIN_EXTRA：Sonnet 与仍在售的上一代主力（Kimi K2.x、GPT-5.x）在「帮我选」里不当复杂任务首选，
   但不是轻量模型，排行里与旗舰一起比较。多模型字段按分隔符拆开，任一命中即算；
   Flash/Haiku/Luna/Nano/mini 等轻量名显式排除（\bmini\b 不误伤 MiniMax）。 */
export const RANK_MAIN_EXTRA = /sonnet|kimi[\s-]*k2(?:\.\d+)?|gpt-5(?:\.\d+)?/i;

export function isFlagshipModelName(name: string | null | undefined) {
    return String(name || "").split(/[、,，/|；;]+/).some((part) => {
        const t = part.trim();
        if (!t || /flash|haiku|luna|nano|\bmini\b/i.test(t))
            return false;
        return RANK_MAIN_EXTRA.test(t) || matchModelRoles(t).some((role) => role.task === "hard");
    });
}
