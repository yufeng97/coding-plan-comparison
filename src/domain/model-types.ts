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
export interface ChartPalette {
  text: string; dim: string; catLabel: string; faint: string; gold: string; green: string;
  red: string; info: string; axisLine: string; splitLine: string; tipBg: string;
  tipBorder: string; tipText: string;
}
export interface FollowState { version: number; planIds: string[]; readChangeIds: string[]; }
