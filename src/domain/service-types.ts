/** Inputs remain strings so an incomplete edit can be validated before entering shared state. */
export interface WorkloadState {
  model: string;
  requests: string;
  tokens: string;
  days: string;
  input: string;
  cache: string;
  cachePrice: string;
  budget: string;
  scenario?: string;
}
export interface WorkloadApi {
  cur: string;
  inUSD?: number;
  outUSD?: number;
  inCNY?: number;
  outCNY?: number;
  apiCache?: number;
}
export interface WorkloadResult {
  monthlyM: number;
  blended: number;
  costNative: number;
  costCNY: number;
  noCacheCNY: number;
  monthlyBudgetM: number | null;
  cachePrice: number;
  cacheBasis: "custom" | "official" | "none";
}
export interface CostScenarioResult extends WorkloadResult {
  id: string;
  label: string;
  input: string;
  cache: string;
  lowCNY: number;
  highCNY: number;
}
export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  activeDays: number;
  spanDays: number;
  months: number;
  inputShare: number;
  cacheRate: number;
}
export type UsageCalculatorValues = Pick<WorkloadState, "requests" | "tokens" | "days" | "input" | "cache">;
