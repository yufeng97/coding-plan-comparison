/* 审计数据（data/sources/*.js、data/generated/*.js）的结构类型：数据文件的 checkJs 与应用的 TypeScript 程序（经 src/types.d.ts 引用）共用这一份。 */

/** 套餐引用：永久 ID，旧数据仍可写 [厂商, 套餐名]。 */
type PlanRef = string | [string, string];
/** 可写「同某档」并经 fieldRefs 继承的文字字段。 */
type PlanTextField = "models" | "tools" | "quota" | "note";

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
  modelBaseRef?: PlanRef;
  modelIncludes?: string[];
  modelExcludes?: string[];
  includedModelQuota?: boolean;
  modelAccess?: "included" | "byok" | "metered";
  purchaseCountries?: string[];
  fieldRefs?: Partial<Record<PlanTextField, PlanRef>>;
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
interface PriceChecks {
  checkedAt: string;
  sources: Record<string, { url: string; evidence: string; checkedAt?: string }>;
  rows: Record<string, PriceVerification>;
}

/** 「帮我选」的模型用途分组（不是跑分）；re 同时供排行的旗舰判定复用。 */
interface ModelRole {
  id: string;
  name: string;
  re: RegExp;
  /** hard=复杂任务，daily=日常。 */
  task: "hard" | "daily";
  /** 额度消耗：fast=窗口打得快，slow=慢烧，same=比旗舰耐用但通常仍是同一窗口。 */
  burn: "fast" | "slow" | "same";
  /** 预算内选主计划的档次（A 高于 B），页面不展示。 */
  band: "A" | "B" | "C";
  /** 同套餐里更吃额度的上限模型，不当默认复杂任务模型。 */
  ceiling?: boolean;
  reason: string;
  asOf: string;
}

/** 国际档在中国大陆的官方可用性说明；planIds 省略时适用该厂商全部档位。 */
interface MainlandAccess {
  vendor: string;
  status: "unsupported" | "restricted";
  checkedAt: string;
  url: string;
  evidence: string;
  planIds?: string[];
}

/** API 按量单价（每百万 tokens）：USD 条目用 inUSD/outUSD，CNY 条目用 inCNY/outCNY；apiCache 与条目同币种。 */
interface ApiPrice {
  vendor: string;
  model: string;
  label: string;
  region: "cn" | "intl";
  cur: "USD" | "CNY";
  inUSD?: number;
  outUSD?: number;
  inCNY?: number;
  outCNY?: number;
  apiCache?: number;
  note: string;
  url: string;
}

/** 额度表的按量参照行。 */
interface PaygReference {
  vendor: string;
  model: string;
  cur: "USD" | "CNY";
  apiIn: number;
  apiOut: number;
  apiCache: number;
  note: string;
  source: string;
  url: string;
}

/** 额度行（METRICS_RAW 官方口径与 ESTIMATES 估算共用）：经 ref 引用套餐的身份与价格，自身保留模型与额度口径。 */
interface QuotaRow {
  vendor: string;
  plan: string;
  ver: string;
  model: string;
  region: "cn" | "intl";
  ref: PlanRef;
  /** false 表示与 PLAN_TOKENS 档位同额度的重复行，每周 tokens 图排除。 */
  weeklyChart?: boolean;
  wkLowM?: number;
  wkHighM?: number;
  /** 厂商自估的每周 tokens，仅作对照。 */
  vendorWkLowM?: number;
  vendorWkHighM?: number;
  reqPer5h?: number;
  reqPerWk?: number;
  reqPerMo?: number;
  reqLowPer5h?: number;
  reqHighPer5h?: number;
  tokensLowPerReq?: number;
  tokensHighPerReq?: number;
  creditUSD?: number;
  creditCNY?: number;
  /** 套餐周期；省略时沿用引用套餐的 windowPeriod。 */
  windowPeriod?: Plan["windowPeriod"];
  /** 模型牌价的币种；省略时与引用套餐同币种。 */
  apiCur?: "USD" | "CNY" | "INR";
  apiIn: number;
  apiOut: number;
  apiCache: number;
  tps: string;
  source: string;
  note: string;
  /** 估算行的推算方法与置信度。 */
  isEst?: boolean;
  method?: string;
  confidence?: "高" | "中" | "低";
  confidenceReason?: string;
}

/** 官方公布每周 tokens 的档位（每周 tokens 图的官方柱）。 */
interface PlanTokens {
  plan: string;
  model: string;
  ref: PlanRef;
  url: string;
  lowM: number;
  highM: number;
  vendorLowM: number;
  vendorHighM: number;
  note: string;
}

interface DynamicItem {
  date: string;
  text: string;
  source: string;
  url: string;
  /** true 表示本站在 date 这一天核对到该状态，不是厂商公告日。 */
  checked?: boolean;
  /** 活动或限时状态的结束日期；省略时从正文的「MM-DD~MM-DD」范围推算。 */
  endDate?: string;
}

interface SourceGroup {
  group: string;
  urls: string[];
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
/** 帮我选卡片的编程评测摘要（data/generated/benchmark-summary.js，由 npm run benchmark:build 生成，随首屏加载）。 */
interface BenchmarkSummaryRow { model: string; reasoning: string | null; score: number; rank: number; }
interface BenchmarkSummaryProtocol { id: string; family: string; name: string; version: string; metric: string; unit: string; checkedAt: string; total: number; rows: BenchmarkSummaryRow[]; }
interface BenchmarkSummary { schemaVersion: number; checkedAt: string; protocols: BenchmarkSummaryProtocol[]; }
/** 导航未读提醒用的套餐变更 ID（data/generated/maintenance-summary.js，由 npm run maintenance:build 生成，编入类型化目录随首屏加载）。 */
interface MaintenanceSummary { schemaVersion: number; changes: { id: string; changeId: string }[]; }
