/* ============================================================
 * 额度换算纯计算模块（无 DOM 依赖）
 * 被 js/app-*.js、scripts/validate-data.js、scripts/test-metrics.js 共用。
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
 * @property {number} [creditUSD] credits 制：月池美元面值
 * @property {number} [creditCNY] credits 制：月池人民币面值
 * @property {number} [apiIn]   模型牌价：输入 / 1M tokens
 * @property {number} [apiOut]  模型牌价：输出 / 1M tokens
 * @property {number} [apiCache] 模型牌价：缓存命中输入 / 1M tokens
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
  return API_MIX_IN * effIn + API_MIX_OUT * m.apiOut;
}
function toCNY(v, cur) { return cur === "USD" ? v * RATE_USD_CNY : v; }
/* 百万 tokens 的人类可读格式：207.84 → "208M"，2047 → "2.0B" */
function fmtTok(m) {
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
  if (!(priceCNY > 0)) return null;
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
  if (m.wkLowM != null) {
    const wkLowM = m.wkLowM;
    const wkHighM = m.wkHighM ?? m.wkLowM;
    return {
      fLow: wkLowM / SLOTS_PER_WEEK, fHigh: wkHighM / SLOTS_PER_WEEK,
      wkLowM, wkHighM,
      moLow: wkLowM * WEEKS_PER_MONTH, moHigh: wkHighM * WEEKS_PER_MONTH,
    };
  }
  if (m.reqPerWk == null && m.reqPerMo == null && m.reqPer5h == null) return null;
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
  if (METRICS_COMPUTED.has(m)) return METRICS_COMPUTED.get(m);
  const result = computeMetricsUncached(m);
  METRICS_COMPUTED.set(m, result);
  return result;
}
function computeMetricsUncached(m) {
  /* Credits 月池制：额度价值按官方锚点（美元 credits 或 1M Credit=¥1）。
     倍率 = 该时段额度价值 ÷ 该时段分摊月费。写了模型牌价时再把面值折成 tokens。 */
  if (m.creditUSD != null || m.creditCNY != null) {
    if (!(m.priceM > 0)) return null;
    const isUSD = m.creditUSD != null;
    const creditCur = isUSD ? "USD" : "CNY";
    const priceCNY = toCNY(m.priceM, m.cur);
    const valMo = isUSD ? m.creditUSD : m.creditCNY;
    if (!(valMo > 0)) return null;
    const valWk = valMo / WEEKS_PER_MONTH;
    const val5h = valWk / SLOTS_PER_WEEK;
    const rates = periodRates(toCNY(val5h, creditCur), toCNY(valWk, creditCur), toCNY(valMo, creditCur), priceCNY);
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
    return /opus|fable|sonnet|gpt-6(?:\.\d+)?\s*sol|gpt-5|kimi\s*k[23]|\bk3\b|deepseek[\w.\s-]*pro|minimax[\s-]*m3|mimo[\w.\s-]*pro|qwen3(?:\.\d+)?-max|qwen3-coder-(?:plus|next)|doubao[\s-]?seed[\s-]?[\d.]+[\s-]?(?:pro|code)|glm-?\s*5|step[\s-]?5|hy[34]/i.test(t);
  });
}
