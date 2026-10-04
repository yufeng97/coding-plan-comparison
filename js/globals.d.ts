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
  seat: boolean;
  quota: string;
  models: string;
  tools: string;
  note: string;
  url: string;
  windowPeriod?: "5h" | "month" | "none" | "unknown";
  quotaSharing?: "shared" | "separate" | "unknown";
  codingSurface?: boolean;
  includedModelQuota?: boolean;
  modelAccess?: "included" | "byok" | "metered";
  purchaseCountries?: string[];
  fieldRefs?: Partial<Record<"models" | "tools" | "quota", string | [string, string]>>;
}

interface PriceVerification {
  status: "verified" | "changed" | "unverified" | "retired" | "custom";
  checkedAt: string;
  sourceIds: string[];
  reason: string;
}
