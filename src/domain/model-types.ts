export interface MetricsInput {
  wkLowM?: number; wkHighM?: number; reqPerWk?: number; reqPerMo?: number;
  reqPer5h?: number; reqLowPer5h?: number; reqHighPer5h?: number;
  tokensLowPerReq?: number; tokensHighPerReq?: number; windowPeriod?: string;
  creditUSD?: number; creditCNY?: number; apiIn?: number; apiOut?: number;
  apiCache?: number; apiCur?: string; priceM?: number; cur?: string;
}
export interface MetricsResult {
  fLow: number | null; fHigh: number | null; wkLowM: number | null; wkHighM: number | null;
  moLow: number | null; moHigh: number | null; moMidM: number | null;
  blend: number | null; priceCNY: number; costPerM: number | null;
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
