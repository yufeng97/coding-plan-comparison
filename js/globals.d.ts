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
  /** sold-out：官网售罄、仅候补；retired：已停售或下架；limited：限量抢购。均不进入推荐。 */
  availability?: "sold-out" | "retired" | "limited";
  /** 非月付计价单位：一次性预付或每 4 周收费；月付省略。 */
  billingUnit?: "one-time" | "four-weeks";
  /** 仅老用户可续费，新用户不能购买。 */
  renewalOnly?: true;
  /** 免费档不能当编程工具（聊天免费档、应用构建器等）时显式排除。 */
  freeCodingEntry?: false;
  /** 官网或文档实测访问异常（如返回 403、连接失败）；页面据此显示「访问不稳」，不从备注文字推断。 */
  accessUnstable?: boolean;
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
  /** 分厂商变更订阅：path 为相对站点根目录的 feeds/<slug>.xml。 */
  feeds?: { vendor: string; path: string; changes: number }[];
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
/** 帮我选卡片的编程评测摘要（js/benchmark-summary.js，由 npm run benchmark:build 生成，随首屏加载）。 */
interface BenchmarkSummaryRow { model: string; reasoning: string | null; score: number; rank: number; }
interface BenchmarkSummaryProtocol { id: string; family: string; name: string; version: string; metric: string; unit: string; checkedAt: string; total: number; rows: BenchmarkSummaryRow[]; }
interface BenchmarkSummary { schemaVersion: number; checkedAt: string; protocols: BenchmarkSummaryProtocol[]; }
/** 导航未读提醒用的套餐变更 ID（js/maintenance-summary.js，由 npm run maintenance:build 生成，随首屏加载）。 */
interface MaintenanceSummary { schemaVersion: number; changes: { id: string; changeId: string }[]; }
