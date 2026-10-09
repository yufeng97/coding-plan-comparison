/* ============================================================
 * 额度换算纯计算模块（无 DOM 依赖）
 * 被 js/app-*.js、scripts/build/validate-data.js、scripts/tests/test-metrics.js 共用。
 * 经典脚本按序加载：data.js → metrics.js → app-*.js；
 * 因此这里不得声明 data.js 已有的全局名（如 RATE_USD_CNY）。
 * ============================================================ */

/* 换算假设：每月 4.33 周、每周 5 个 5h 窗口、输入/输出 80/20、缓存命中率 95%、
   请求数制计划按约 20K tokens/请求折算。 */
const WEEKS_PER_MONTH = 4.33;
const SLOTS_PER_WEEK = 5;
const API_MIX_IN = 0.8, API_MIX_OUT = 0.2;
const CACHE_HIT_RATE = 0.95;
const TOKENS_PER_REQ = 20000;

/** @typedef {"USD"|"CNY"} Currency */

/**
 * 计算入参（METRICS_RAW / ESTIMATES 条目 + ref 解析出的价格）。
 * @typedef {object} MetricsInput
 * @property {number} [wkLowM]  官方/估算每周 tokens 下限（百万）
 * @property {number} [wkHighM] 每周 tokens 上限
 * @property {number} [reqPerWk] 请求数制：每周请求
 * @property {number} [reqPerMo] 请求数制：每月请求
 * @property {number} [reqPer5h] 请求数制：每 5h 请求
 * @property {number} [reqLowPer5h] 官方每 5h 条数区间下限
 * @property {number} [reqHighPer5h] 官方每 5h 条数区间上限
 * @property {number} [tokensLowPerReq] 区间折算：单次 tokens 下限
 * @property {number} [tokensHighPerReq] 区间折算：单次 tokens 上限
 * @property {string} [windowPeriod] 周期标记；月池和无5h限制不生成窗口上限
 * @property {number} [creditUSD] credits 制：月池美元面值
 * @property {number} [creditCNY] credits 制：月池人民币面值
 * @property {number} [apiIn]   模型牌价：输入 / 1M tokens
 * @property {number} [apiOut]  模型牌价：输出 / 1M tokens
 * @property {number} [apiCache] 模型牌价：缓存命中输入 / 1M tokens
 * @property {Currency} [apiCur] API 牌价币种；省略时沿用计划币种
 * @property {number} [priceM]  月费
 * @property {Currency} [cur]
 */

/**
 * 计算结果。
 * @typedef {object} MetricsResult
 * @property {number|null} fLow   5h 窗口 tokens 下限（百万）
 * @property {number|null} fHigh  5h 窗口 tokens 上限
 * @property {number|null} wkLowM 每周 tokens 下限
 * @property {number|null} wkHighM 每周 tokens 上限
 * @property {number|null} moLow  每月 tokens 下限
 * @property {number|null} moHigh 每月 tokens 上限
 * @property {number|null} moMidM 每月 tokens 中值
 * @property {number|null} blend  混合牌价（与条目同币种）
 * @property {number} priceCNY    月费折算人民币
 * @property {number|null} costPerM 每百万 tokens 实际成本（¥）
 * @property {number|null} val5h  5h 额度价值（条目币种）
 * @property {number|null} valWk  周额度价值
 * @property {number|null} valMo  月额度价值
 * @property {number|null} r5h    5h 额度倍率
 * @property {number|null} rwk    周额度倍率
 * @property {number|null} rmo    月额度倍率
 * @property {number|null} r5hHi/rwkHi/rmoHi 区间上限倍率
 */

/* 80% 输入（95% 缓存命中）+ 20% 输出，折成每百万 tokens 混合牌价 */
function blendPrice(m) {
  const effIn = CACHE_HIT_RATE * m.apiCache + (1 - CACHE_HIT_RATE) * m.apiIn;
  const value = API_MIX_IN * effIn + API_MIX_OUT * m.apiOut;
  return m.apiCur && m.apiCur !== m.cur ? fromCNY(toCNY(value, m.apiCur), m.cur) : value;
}
function toCNY(v, cur) {
  if (cur === "USD") return v * RATE_USD_CNY;
  if (cur === "INR") return v * RATE_INR_CNY;
  return cur === "CNY" ? v : NaN;
}
function fromCNY(v, cur) {
  if (cur === "USD") return v / RATE_USD_CNY;
  if (cur === "INR") return v / RATE_INR_CNY;
  return cur === "CNY" ? v : NaN;
}
/* 百万 tokens 的人类可读格式：207.84 → "208M"，2047 → "2.0B" */
function fmtTok(m) {
  if (m == null || !Number.isFinite(m) || m < 0) return "—";
  if (m >= 1000) return (m / 1000).toFixed(1) + "B";
  const digits = m < 1 ? 2 : m < 10 ? 1 : 0;
  return Number(m.toFixed(digits)) + "M";
}

/**
 * 各时段的额度倍率。分母是该时段分摊到的月费：
 * 5h = 月费/(4.33×5)，周 = 月费/4.33，月 = 月费。
 */
function periodRates(val5hCNY, valWkCNY, valMoCNY, priceCNY) {
  const slots = WEEKS_PER_MONTH * SLOTS_PER_WEEK;
  if (!Number.isFinite(priceCNY) || !(priceCNY > 0) || ![val5hCNY, valWkCNY, valMoCNY].every((v) => Number.isFinite(v) && v >= 0)) return null;
  return {
    r5h: val5hCNY / (priceCNY / slots),
    rwk: valWkCNY / (priceCNY / WEEKS_PER_MONTH),
    rmo: valMoCNY / priceCNY,
  };
}

/**
 * 把额度口径（每周 tokens / 请求数 / 5h 请求数）展开成 5h·周·月 tokens。
 * 口径冲突时以更具体的窗口为锚（有周用周，其次月，最后 5h×5）。
 * @param {MetricsInput} m
 * @returns {{fLow:number,fHigh:number,wkLowM:number,wkHighM:number,moLow:number,moHigh:number}|null}
 */
function windowTokens(m) {
  if (!m || typeof m !== "object") return null;
  const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
  const rangeFields = [m.reqLowPer5h, m.reqHighPer5h, m.tokensLowPerReq, m.tokensHighPerReq];
  if (rangeFields.some((v) => v != null)) {
    if (!rangeFields.every(positive) || m.reqHighPer5h < m.reqLowPer5h || m.tokensHighPerReq < m.tokensLowPerReq) return null;
    const fLow = m.reqLowPer5h * m.tokensLowPerReq / 1e6;
    const fHigh = m.reqHighPer5h * m.tokensHighPerReq / 1e6;
    const wkLowM = fLow * SLOTS_PER_WEEK, wkHighM = fHigh * SLOTS_PER_WEEK;
    return { fLow, fHigh, wkLowM, wkHighM, moLow: wkLowM * WEEKS_PER_MONTH, moHigh: wkHighM * WEEKS_PER_MONTH };
  }
  if (m.wkLowM != null) {
    if (!positive(m.wkLowM) || (m.wkHighM != null && (!positive(m.wkHighM) || m.wkHighM < m.wkLowM))) return null;
    const wkLowM = m.wkLowM;
    const wkHighM = m.wkHighM ?? m.wkLowM;
    return {
      fLow: wkLowM / SLOTS_PER_WEEK, fHigh: wkHighM / SLOTS_PER_WEEK,
      wkLowM, wkHighM,
      moLow: wkLowM * WEEKS_PER_MONTH, moHigh: wkHighM * WEEKS_PER_MONTH,
    };
  }
  if (m.reqPerWk == null && m.reqPerMo == null && m.reqPer5h == null) return null;
  if (![m.reqPerWk, m.reqPerMo, m.reqPer5h].every((v) => v == null || positive(v))) return null;
  const toM = (n) => (n * TOKENS_PER_REQ) / 1e6;
  const wk = m.reqPerWk != null ? toM(m.reqPerWk) : null;
  const moCap = m.reqPerMo != null ? toM(m.reqPerMo) : null;
  const hCap = m.reqPer5h != null ? toM(m.reqPer5h) : null;
  const wkM = wk != null ? wk : moCap != null ? moCap / WEEKS_PER_MONTH : hCap * SLOTS_PER_WEEK;
  const f = hCap != null ? hCap : wkM / SLOTS_PER_WEEK;
  const mo = moCap != null ? moCap : wkM * WEEKS_PER_MONTH;
  return { fLow: f, fHigh: f, wkLowM: wkM, wkHighM: wkM, moLow: mo, moHigh: mo };
}

/* computeMetrics 是纯函数且在排行图/额度表/帮我选里被反复调用，按入参对象做一层缓存 */
const METRICS_COMPUTED = new WeakMap();
/**
 * @param {MetricsInput} m
 * @returns {MetricsResult|null} 口径不完整或月费非正时返回 null
 */
function computeMetrics(m) {
  if (!m || typeof m !== "object") return null;
  if (METRICS_COMPUTED.has(m)) return METRICS_COMPUTED.get(m);
  const result = computeMetricsUncached(m);
  /* 官方周 tokens 仍可按已说明的每周 5 窗口假设均摊；
     月池、未知周期或仅日/月请求不能证明有 5h 配额。明确的 5h 请求口径单独保留。 */
  const has5hRequests = m.reqPer5h != null || m.reqLowPer5h != null;
  const no5hQuota = m.creditUSD != null || m.creditCNY != null ||
    m.windowPeriod === "none" || m.windowPeriod === "month" ||
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
function computeMetricsUncached(m) {
  if (!Number.isFinite(m.priceM) || !(m.priceM > 0) || !Number.isFinite(toCNY(m.priceM, m.cur)) || (m.apiCur && !Number.isFinite(toCNY(1, m.apiCur)))) return null;
  const hasApi = [m.apiIn, m.apiOut, m.apiCache].some((v) => v != null);
  if (hasApi && !(Number.isFinite(m.apiIn) && m.apiIn >= 0 && Number.isFinite(m.apiOut) && m.apiOut > 0 && Number.isFinite(m.apiCache) && m.apiCache >= 0 && m.apiCache <= m.apiIn)) return null;
  /* Credits 月池制：额度价值按官方锚点（美元 credits 或 1M Credit=¥1）。
     倍率 = 该时段额度价值 ÷ 该时段分摊月费。写了模型牌价时再把面值折成 tokens。 */
  if (m.creditUSD != null || m.creditCNY != null) {
    if (m.creditUSD != null && m.creditCNY != null) return null;
    const isUSD = m.creditUSD != null;
    const creditCur = isUSD ? "USD" : "CNY";
    const priceCNY = toCNY(m.priceM, m.cur);
    const faceValue = isUSD ? m.creditUSD : m.creditCNY;
    if (!Number.isFinite(faceValue) || !(faceValue > 0)) return null;
    /* API 牌价使用 m.cur；面值先换到同币种，返回的价值列也保持 m.cur。 */
    const valueCNY = toCNY(faceValue, creditCur);
    const valMo = fromCNY(valueCNY, m.cur);
    const valWk = valMo / WEEKS_PER_MONTH;
    const val5h = valWk / SLOTS_PER_WEEK;
    const rates = periodRates(toCNY(val5h, m.cur), toCNY(valWk, m.cur), toCNY(valMo, m.cur), priceCNY);
    if (!rates) return null;
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
    const costPerM = isUSD && m.creditUSD > 0 ? (priceCNY * 10) / (m.creditUSD * RATE_USD_CNY) : null;
    return {
      fLow: null, fHigh: null, wkLowM: null, wkHighM: null,
      moLow: null, moHigh: null, moMidM: null, blend: null, priceCNY, costPerM,
      val5h, val5hHi: val5h, valWk, valWkHi: valWk, valMo, valMoHi: valMo,
      r5h: rates.r5h, r5hHi: rates.r5h, rwk: rates.rwk, rwkHi: rates.rwk, rmo: rates.rmo, rmoHi: rates.rmo,
    };
  }

  const w = windowTokens(m);
  if (!w) return null;
  const blend = blendPrice(m);
  if (!(blend > 0) || !(m.priceM > 0)) return null;
  const priceCNY = toCNY(m.priceM, m.cur);
  const val5h = w.fLow * blend, val5hHi = w.fHigh * blend;
  const valWk = w.wkLowM * blend, valWkHi = w.wkHighM * blend;
  const valMo = w.moLow * blend, valMoHi = w.moHigh * blend;
  const rates = periodRates(toCNY(val5h, m.cur), toCNY(valWk, m.cur), toCNY(valMo, m.cur), priceCNY);
  if (!rates) return null;
  const moMidM = (w.moLow + w.moHigh) / 2;
  const costPerM = moMidM > 0 ? priceCNY / moMidM : null;
  const hi = periodRates(toCNY(val5hHi, m.cur), toCNY(valWkHi, m.cur), toCNY(valMoHi, m.cur), priceCNY);
  return {
    ...w, moMidM, blend, priceCNY, costPerM,
    val5h, val5hHi, valWk, valWkHi, valMo, valMoHi,
    r5h: rates.r5h, rwk: rates.rwk, rmo: rates.rmo,
    r5hHi: hi.r5h, rwkHi: hi.rwk, rmoHi: hi.rmo,
  };
}

/* 性价比排行的旗舰判定：多模型字段按分隔符拆开，任一命中旗舰即算；
   Flash/Haiku/Luna/Nano/mini 等轻量名显式排除（\bmini\b 不误伤 MiniMax）。
   旗舰正则同时接受连字符与空格写法（MiniMax M3 / MiMo Pro / Step 5 / Doubao Seed 2.0 Pro）。 */
function isFlagshipModelName(name) {
  return String(name || "").split(/[、,，/|；;]+/).some((part) => {
    const t = part.trim();
    if (!t || /flash|haiku|luna|nano|\bmini\b/i.test(t)) return false;
    return /opus|fable|sonnet|gpt-6(?:\.\d+)?\s*sol|gpt-5|gemini[\s-]*\d+(?:\.\d+)?[\s-]*pro|kimi[\s-]*k[23]|\bk3\b|deepseek[\w.\s-]*pro|minimax[\s-]*m3|mimo[\w.\s-]*pro|qwen3(?:\.\d+)?-max|qwen3-coder-(?:plus|next)|doubao[\s-]?seed[\s-]?[\d.]+[\s-]?(?:pro|code)|glm-?\s*5|step[\s-]?5|hy[34]/i.test(t);
  });
}
