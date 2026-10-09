/* 页面加载的外部全局（无类型包），仅供编辑器 checkJs 使用 */
declare const echarts: any;

interface Plan {
  /** 永久标识：更名、调序时保留。 */
  id: string;
  vendor: string;
  plan: string;
  cat: "official" | "tool" | "cloud" | "team";
  region: "cn" | "intl";
  cur: "USD" | "CNY" | "INR";
  priceM: number | null;
  priceY: number | null;
  /** 已核实的原币全年金额；与折月价一起校验，备注不参与计算。 */
  annualTotal?: number;
  /** 已有官方证据的连续包月价格；缺值不从目录价或备注推测。 */
  autoRenewMonthly?: number;
  seat: boolean;
  quota: string;
  models: string;
  tools: string;
  note: string;
  url: string;
  windowPeriod?: "5h" | "month" | "none" | "unknown";
  quotaSharing?: "shared" | "separate" | "unknown";
  codingSurface?: boolean;
  /** 明确自带编程入口；不依赖工具文案匹配。 */
  ownClient?: boolean;
  /** 模型继承和增补分开描述，排除仅作用于本档，避免低档限制传播到新增模型。 */
  modelBaseRef?: string | [string, string];
  modelIncludes?: string[];
  modelExcludes?: string[];
  includedModelQuota?: boolean;
  modelAccess?: "included" | "byok" | "metered";
  purchaseCountries?: string[];
  fieldRefs?: Partial<Record<"models" | "tools" | "quota", string | [string, string]>>;
  /** 官网标明售罄、仅候补：仍是公开标价，但不能下单。 */
  availability?: "sold-out";
  /** 同一订阅的重复条目指向主条目永久 ID；保留核价与历史，不再单独展示和推荐。 */
  sameAs?: string;
  /** 主标价为连续包月价时，另记不续费的单月购买价，供「月付标价」口径对照。 */
  singleMonthPrice?: number;
}

interface PriceVerification {
  status: "verified" | "changed" | "unverified" | "retired" | "custom";
  checkedAt: string;
  sourceIds: string[];
  reason: string;
}

interface MaintenanceChange {
  changeId: string; id: string; kind: string; vendor: string; name: string;
  checkedAt: string; fields: string[]; before: Record<string, unknown>; after: Record<string, unknown>; sourceUrls: string[];
}
interface MaintenanceSnapshot {
  schemaVersion: number; generatedAt: string; checkedThrough: string; staleAfterDays?: number;
  summary: { total: number; verified: number; unverified: number; stale: number };
  records: { id: string; kind: string; vendor: string; name: string; checkedAt: string; status: string; sourceUrls: string[]; ageDays: number | null; stale: boolean }[];
  reviews: { id: string; title: string; planIds?: string[]; vendor?: string; reviewOn: string; source: string; note?: string }[];
  changes: MaintenanceChange[];
}
interface BenchmarkTask { id: string; title: string; description: string; acceptance: string | string[]; }
interface BenchmarkRun {
  id: string; taskId: string; model: string; tool: string; measuredAt: string;
  cost: number | null; currency: string; costBasis: string; durationSeconds: number;
  generationSeconds: number | null; passed: boolean; repeats: number; evidence: string; environment: string;
}
interface PublicBenchmarkProtocol {
  id: string; family: string; name: string; version: string; category: string;
  metric: string; unit: "%"; description: string; configuration: string; scope: string;
  sourceUrl: string; sourceUpdatedAt: string | null; checkedAt: string;
}
interface PublicBenchmarkScore {
  id: string; benchmarkId: string; model: string; reasoning: string | null; agent: string | null;
  score: number; costUSD: number | null; costNote: string | null; uncertainty: string | null;
  tokens: number | null; steps: number | null; sourceUrl: string; checkedAt: string;
}
interface PublicBenchmarkSnapshot { schemaVersion: number; checkedAt: string; benchmarks: PublicBenchmarkProtocol[]; scores: PublicBenchmarkScore[]; }
interface BenchmarkSnapshot { schemaVersion: number; generatedAt: string; tasks: BenchmarkTask[]; runs: BenchmarkRun[]; methodology: string | string[]; public?: PublicBenchmarkSnapshot; }
