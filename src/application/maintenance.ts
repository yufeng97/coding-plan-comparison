import { META, PLANS, API_PRICES, PAYG_REFERENCES, PRICE_CHECKS, PUBLIC_PROJECT } from '../generated/catalog';
import { publicBenchmarkData, maintenanceData, benchmarkData, readFollowImport, readStoredFollowState, writeStoredFollowState } from '../browser/maintenance-data';
import { publicBenchmarkState, publicBenchmarkChartState, followState, followView, maintenanceView, benchmarkFilter, dataRevision, optionalViewState } from '../state/maintenance';
import { publicBenchmarkDate, PUBLIC_CHART_FAMILIES } from '../domain/benchmarks';
import { queryHit, foldSearch, shortVendor } from '../domain/core';
import { PAL } from '../browser/charts/host';
import { csvCell } from '../domain/table-format';
import type { FollowState } from '../state/maintenance';
import { optionalDataLoaded, ensureOptionalData } from '../browser/optional-data';
import { planTitle } from '../domain/core';
import { copyTextToClipboard, downloadTextFile } from '../browser/interaction';
import type { OptionalDataKind } from '../domain/core';
import { buildFollowSyncUrl } from '../browser/maintenance-data';

/** 公开评测组件挂载后登记图表重绘，供懒加载、主题与尺寸变化时调用。 */
export const publicBenchmarkHooks: { renderChart: (() => void) | null } = { renderChart: null };

export function renderPublicBenchmarkChart() {
    if (publicBenchmarkHooks.renderChart)
        publicBenchmarkHooks.renderChart();
}

/* 按需数据未就绪（加载中或下载失败）时只说明待加载，不显示「没有记录」一类结论；进度与重试见标签顶部状态行。 */
export function optionalPendingText(what: string) { return `${what}将在数据加载后显示。`; }

export function selectedPublicBenchmark() {
    const all = publicBenchmarkData().benchmarks;
    const rows = publicBenchmarkState.family ? all.filter((b) => b.family === publicBenchmarkState.family) : all;
    return rows.find((b) => b.id === publicBenchmarkState.id) || defaultPublicBenchmarkForFamily(publicBenchmarkState.family, rows);
}

const PREFERRED_PUBLIC_BENCHMARKS: Record<string, string> = { osworld: "osworld-2-25443e96866dc9ce", hle: "hle-diamond-2026-high-closed-book-multimodal", deepswe: "deepswe-v1-1" };

export function defaultPublicBenchmarkForFamily(family: string, rows: PublicBenchmarkProtocol[]) {
    const preferred = PREFERRED_PUBLIC_BENCHMARKS[String(family || "deepswe").toLowerCase()];
    return rows.find((b) => b.id === preferred) || rows[0] || null;
}

const PUBLIC_BENCHMARK_FAMILY_LABELS: Record<string, string> = { deepswe: "DeepSWE · 编程", cursorbench: "CursorBench · 编程", "swe-bench": "SWE-bench · 编程", osworld: "OSWorld · GUI 操作", hle: "HLE · 综合学术" };

export function publicBenchmarkFamilyLabel(family: string) {
    return PUBLIC_BENCHMARK_FAMILY_LABELS[family.toLowerCase()] || family;
}

export const PUBLIC_BENCHMARK_FAMILY_ORDER = ["deepswe", "cursorbench", "swe-bench", "osworld", "hle"];

export function publicBenchmarkFamilies() {
    return [...new Set(publicBenchmarkData().benchmarks.map((b) => b.family))]
        .sort((a, b) => PUBLIC_BENCHMARK_FAMILY_ORDER.indexOf(a.toLowerCase()) - PUBLIC_BENCHMARK_FAMILY_ORDER.indexOf(b.toLowerCase()));
}

/* 名称与版本相同的协议补上各自不同的配置项（如 a11y、coding action），仍相同时加官方更新日期或序号。 */
export function publicBenchmarkLabels(list: PublicBenchmarkProtocol[]): [PublicBenchmarkProtocol, string][] {
    const base = (b: PublicBenchmarkProtocol) => b.name.toLowerCase().includes(b.version.toLowerCase()) ? b.name : `${b.name} · ${b.version}`;
    const groups = new Map<string, PublicBenchmarkProtocol[]>();
    list.forEach((b) => groups.set(base(b), [...(groups.get(base(b)) || []), b]));
    const labels = new Map<PublicBenchmarkProtocol, string>();
    groups.forEach((group, key) => {
        if (group.length === 1) {
            labels.set(group[0], key);
            return;
        }
        const tokens = group.map((b) => String(b.configuration || "").split(/[；;]/).map((t) => t.trim()).filter(Boolean));
        const common = tokens[0].filter((t) => tokens.every((list) => list.includes(t)));
        const named = group.map((b, i) => {
            const diff = tokens[i].filter((t) => !common.includes(t));
            return diff.length ? `${key} · ${diff.join(" · ")}` : key;
        });
        group.forEach((b, i) => labels.set(b, named.filter((label) => label === named[i]).length > 1
            ? `${named[i]} · 官方更新 ${publicBenchmarkDate(b.sourceUpdatedAt)} · #${i + 1}` : named[i]));
    });
    return list.map((b) => [b, labels.get(b) ?? base(b)]);
}

/** 公开评测成绩加上本协议内的名次（同分同名次）。 */
export type RankedPublicScore = PublicBenchmarkScore & { rank: number };

export function publicBenchmarkRows(): RankedPublicScore[] {
    const benchmark = selectedPublicBenchmark();
    if (!benchmark)
        return [];
    /* 同一评测协议中的名次固定；搜索只筛行，不把第十名显示成第一名。 */
    let sorted = publicBenchmarkData().scores.filter((r) => r.benchmarkId === benchmark.id && typeof r.score === "number" && Number.isFinite(r.score))
        .slice().sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
    if (publicBenchmarkState.mode !== "all") {
        const seen = new Set<string>();
        sorted = sorted.filter((r) => {
            if (seen.has(r.model))
                return false;
            seen.add(r.model);
            return true;
        });
    }
    let rank = 0, previousScore: number | null = null;
    const ranked = sorted.map((r, i) => {
        if (previousScore !== r.score)
            rank = i + 1;
        previousScore = r.score;
        return { ...r, rank };
    });
    const q = publicBenchmarkState.search.trim();
    return q ? ranked.filter((r) => queryHit(foldSearch([r.model, r.reasoning, r.agent].filter(Boolean).join(" ")), q)) : ranked;
}

export function publicBenchmarkChartRows() {
    const rows = publicBenchmarkRows();
    const ranked = publicBenchmarkChartState.metric === "cost" ? rows.filter((r) => r.costUSD != null) : rows;
    return publicBenchmarkChartState.limit === "all" ? ranked : ranked.slice(0, Number(publicBenchmarkChartState.limit));
}

export function publicChartColors(): Record<string, string> {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(PUBLIC_CHART_FAMILIES.map((family) => [family.id, style.getPropertyValue("--bench-" + family.id).trim() || PAL.info]));
}

export function publicBenchmarkCsv() {
    const benchmark = selectedPublicBenchmark();
    if (!benchmark)
        return "";
    const columns = ["协议 ID", "评测", "版本", "范围", "协议配置", "展示模式", "名次", "模型", "推理配置", "Agent", "分数", "单位", "官方评测每任务成本 USD", "成本说明", "不确定性", "Tokens", "Steps", "成绩来源", "核查日期", "协议来源", "官方标注日期"];
    return [columns.map(csvCell).join(","), ...publicBenchmarkRows().map((r) => [benchmark.id, benchmark.name, benchmark.version, benchmark.scope, benchmark.configuration, publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置", r.rank, r.model, r.reasoning, r.agent, r.score, benchmark.unit, r.costUSD, r.costNote, r.uncertainty, r.tokens, r.steps, r.sourceUrl, r.checkedAt, benchmark.sourceUrl, benchmark.sourceUpdatedAt].map(csvCell).join(","))].join("\r\n");
}

/** 本机存储里读到的关注记录可能来自旧版本或被改坏：只保留已知套餐与变更 ID。 */
export function cleanFollowState(value: unknown): FollowState {
    const planIds = new Set(PLANS.map((p) => p.id));
    /* 未下载历史时保留已读ID，避免首屏把上次访问的标记清空。 */
    const changeIds = optionalDataLoaded("maintenance") ? new Set(maintenanceData().changes.map((c) => c.changeId)) : null;
    const clean = (values: unknown, allowed: Set<string> | null, max: number) => Array.isArray(values)
        ? [...new Set(values.filter((v): v is string => typeof v === "string" && (allowed ? allowed.has(v) : /^change-[\w-]{1,100}$/.test(v))))].slice(0, max) : [];
    const stored = value && typeof value === "object" ? value as { planIds?: unknown; readChangeIds?: unknown } : null;
    return { version: 1, planIds: clean(stored && stored.planIds, planIds, 500), readChangeIds: clean(stored && stored.readChangeIds, changeIds, 10000) };
}

export function isPlanFollowed(id: string) { return followState.planIds.includes(id); }

function plansByIds(ids: string[]) {
    return ids.map((id) => PLANS.find((p) => p.id === id)).filter((p): p is Plan => p !== undefined);
}

export function followedPlans() {
    return plansByIds(followState.planIds);
}

export function followedChanges() {
    return maintenanceData().changes.filter((c) => followState.planIds.includes(c.id));
}

export function unreadFollowedChanges() {
    return followedChanges().filter((c) => !followState.readChangeIds.includes(c.changeId));
}

export function followFeedback(text: string) {
    followView.feedback = text + (followView.storageMessage ? " " + followView.storageMessage : "");
}

export function toggleFollowPlan(id: string) {
    const p = PLANS.find((plan) => plan.id === id);
    if (!p)
        return false;
    const on = isPlanFollowed(id);
    followState.planIds = on ? followState.planIds.filter((v) => v !== id) : [...followState.planIds, id];
    persistFollowState();
    followFeedback(`${on ? "已取消关注" : "已关注"} ${planTitle(p)}。关注与已读记录仅保存在本机，不上传，也不包含在分享链接中。`);
    return true;
}

export function markFollowedChangesRead() {
    followState.readChangeIds = [...new Set([...followState.readChangeIds, ...followedChanges().map((c) => c.changeId)])];
    persistFollowState();
    followFeedback("已将当前关注套餐的已确认变更标为已读；之后新收录的变更仍会提示。");
}

/** 只保留 https 证据链接。 */
export function maintenanceSourceUrls(urls: readonly unknown[] | null | undefined): string[] {
    return (urls || []).flatMap((url) => typeof url === "string" && /^https:\/\//i.test(url.trim()) ? [url.trim()] : []);
}

export function changeValue(value: unknown) {
    if (value == null)
        return "未记录";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export const CHANGE_FIELD_LABELS: Record<string, string> = { priceM: "月付价", priceY: "年付折月价", annualTotal: "年付全年金额", quota: "额度", models: "模型", tools: "工具", note: "备注", status: "核查状态", inUSD: "输入 USD/M", outUSD: "输出 USD/M", inCNY: "输入 CNY/M", outCNY: "输出 CNY/M", cacheUSD: "缓存 USD/M", cacheCNY: "缓存 CNY/M" };

export function changeKindLabel(kind: string) { return kind === "plan" ? "套餐" : kind === "api" ? "API" : "按量参考"; }

export function changeFields(change: MaintenanceChange): { label: string; before: string; after: string }[] {
    return change.fields.map((field) => ({ label: CHANGE_FIELD_LABELS[field] || field, before: changeValue(change.before[field]), after: changeValue(change.after[field]) }));
}

export function planChanges(id: string) { return maintenanceData().changes.filter((c) => c.id === id); }

export const PLAN_HISTORY_EMPTY = "尚未收录本档的已确认变更；当前值与核查日期见完整权益。首次收录是基线，不代表曾经涨价或降价。";

export function planHistorySummary(id: string) {
    return optionalDataLoaded("maintenance") ? `已确认价格与权益历史（${planChanges(id).length} 条）` : "已确认价格与权益历史";
}

export async function copyFollowLink() {
    if (!followState.planIds.length)
        return;
    const ok = await copyTextToClipboard(followSyncUrl());
    followFeedback(ok ? "已复制关注同步链接。在另一台设备或浏览器打开后，选择「合并到本机关注」即可；链接只含套餐 ID，不含已读记录。"
        : "复制失败，请改用该设备手动关注。");
}

/** 链接带来的、尚未在本机关注的套餐。 */
export function followImportPlans(): { plans: Plan[]; fresh: Plan[] } {
    const plans = plansByIds(followView.importIds);
    return { plans, fresh: plans.filter((p) => !isPlanFollowed(p.id)) };
}

export function applyFollowImport(merge: boolean) {
    const valid = followView.importIds.filter((id) => PLANS.some((p) => p.id === id));
    if (merge) {
        followState.planIds = [...new Set([...followState.planIds, ...valid])].slice(0, 500);
        persistFollowState();
    }
    followView.importIds = [];
    followFeedback(merge ? `已合并链接里的 ${valid.length} 档关注，本机现关注 ${followState.planIds.length} 档。` : "已忽略链接里的关注套餐。");
}

type MaintenanceFeed = NonNullable<MaintenanceSnapshot["feeds"]>[number];

/* 只为关注的厂商列出订阅地址；路径来自维护摘要，格式固定为 feeds/<slug>.xml。 */
export function followFeeds(plans: Plan[]) {
    if (!optionalDataLoaded("maintenance"))
        return [];
    const feeds = maintenanceData().feeds || [];
    return [...new Set(plans.map((p) => p.vendor))]
        .map((vendor) => feeds.find((feed) => feed.vendor === vendor))
        .filter((feed): feed is MaintenanceFeed => !!feed && /^feeds\/[a-z0-9-]+\.xml$/.test(feed.path))
        .map((feed) => ({ path: feed.path, label: shortVendor(feed.vendor) }));
}

const MAINTENANCE_STATUS_LABELS: Record<string, string> = { verified: "已核实", changed: "核价信息已校正", unverified: "待核实", custom: "定制询价", retired: "已停售" };

export function maintenanceStatusLabel(status: string) {
    return MAINTENANCE_STATUS_LABELS[status] || status || "待核实";
}

export function maintenancePlanStatus(p: Plan) {
    const record = maintenanceData().records.find((r) => r.id === p.id);
    return record ? `核查 ${record.checkedAt || "日期未记录"} · ${maintenanceStatusLabel(record.status)}${record.stale ? " · 已超过复查间隔" : ""}。日期为本站核查日。`
        : optionalDataLoaded("maintenance") ? "暂无逐条维护记录。" : optionalPendingText("核查日期与状态");
}

export function maintenanceRecords(filter: string = maintenanceView.recordFilter) {
    return maintenanceData().records.filter((r) => filter === "all" || (filter === "stale" ? r.stale : r.status === "unverified"));
}

export function todayLocalIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* 复查提示按本机日期计算，不代表已重新核验。 */
export function dueReviews() {
    const today = todayLocalIso();
    return maintenanceData().reviews.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.reviewOn) && r.reviewOn <= today)
        .map((r) => ({ ...r, overdue: r.reviewOn < today }));
}

export function benchmarkFilterOptions(key: "taskId" | "tool" | "model") {
    return [...new Set(benchmarkData().runs.map((r) => r[key]).filter((v) => typeof v === "string" && v))].sort();
}

export function benchmarkText(value: string | string[] | null | undefined) { return Array.isArray(value) ? value.join("；") : String(value || ""); }

/** 贡献者实测记录的展示值：真实账单、生成时间与验收运行时间分开，未知不补零。 */
export function benchmarkRunView(run: BenchmarkRun) {
    const task = benchmarkData().tasks.find((t) => t.id === run.taskId);
    const seconds = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `${value} 秒` : "未记录";
    return {
        title: `${task ? task.title : run.taskId} · ${run.model}`,
        meta: `${run.tool} · ${run.measuredAt} · ${run.passed === true ? "全部验收通过" : run.passed === false ? "验收未全部通过" : "验收状态未记录"}`,
        cost: run.costBasis === "api-receipt" && typeof run.cost === "number" && Number.isFinite(run.cost) && run.cost >= 0 ? `${run.currency} ${run.cost}`
            : run.costBasis === "included-subscription" ? "订阅内使用，未分摊单次费用" : "费用未记录",
        generation: seconds(run.generationSeconds),
        duration: seconds(run.durationSeconds),
        repeats: String(run.repeats),
        environment: run.environment || "未记录",
        evidenceUrl: maintenanceSourceUrls([run.evidence])[0] || "",
    };
}

export function benchmarkRuns() {
    return benchmarkData().runs.filter((r) => (benchmarkFilter.task === "all" || r.taskId === benchmarkFilter.task)
        && (benchmarkFilter.tool === "all" || r.tool === benchmarkFilter.tool) && (benchmarkFilter.model === "all" || r.model === benchmarkFilter.model));
}

/* 数据更新后，筛选值不在新数据里时回到「全部」。 */
export function normalizeBenchmarkFilter() {
    if (!benchmarkData().tasks.some((t) => t.id === benchmarkFilter.task))
        benchmarkFilter.task = "all";
    for (const key of ["tool", "model"] as const)
        if (!benchmarkFilterOptions(key).includes(benchmarkFilter[key]))
            benchmarkFilter[key] = "all";
}

export const CONTRIBUTION_TITLES = { correction: "套餐纠错与更新", vendor: "收录新厂商 / 套餐", benchmark: "真实任务测评" };

export type ContributionType = keyof typeof CONTRIBUTION_TITLES;

export function contributionTemplate(type: ContributionType) {
    const p = PLANS.find((plan) => plan.id === maintenanceView.planId);
    const common = `\n\n## 官方证据\n- HTTPS 来源链接：\n- 核对日期（YYYY-MM-DD）：\n- 官方原文/截图链接：\n- 适用国家、账号资格与活动限制：\n\n## 变更内容\n- 当前页面显示：\n- 应修正/补充为：\n- 价格币种、计费周期与全年总额：\n- 模型、工具、共享额度与重置窗口：\n\n不要填写账号、API Key、付款隐私或未获许可的内容。\n`;
    if (type === "benchmark") {
        const taskId = benchmarkFilter.task === "all" ? benchmarkData().tasks[0]?.id || "" : benchmarkFilter.task;
        return `# 提交可复现真实任务测评\n\n任务：${taskId}\n模型及精确版本：\n工具及版本：\n生成日期（YYYY-MM-DD）：\n实际生成时间 generationSeconds（秒，未记录填 null）：\n实际 API 账单 cost / currency：\n费用依据 costBasis（api-receipt / included-subscription / unknown）：\n同一解答重复验收次数 repeats：\n平均验收运行时间 durationSeconds（秒）：\n该解答是否全部验收通过 passed：\n操作系统、运行时与环境 environment：\nHTTPS 可公开证据 evidence：\n\n请附原始提示、模型原始解答、验收输出与费用凭证。订阅内使用或费用未知时 cost=null；repeats 是同一解答验收次数，不是模型独立尝试次数。durationSeconds 不能作为模型生成时间。不要上传 API Key 或付费账号信息。\n`;
    }
    return `# ${type === "vendor" ? "申请收录新厂商 / 套餐" : "套餐纠错 / 更新证据"}\n\n厂商：${p ? p.vendor : ""}\n套餐：${p ? p.plan : ""}\n永久套餐 ID：${p ? p.id : ""}${common}`;
}

/** 预填标题与证据模板的 Issues 地址；未配置公开仓库时为空。 */
export function contributionIssueUrl(type: ContributionType, body: string) {
    const base: unknown = PUBLIC_PROJECT.githubIssuesBase;
    return typeof base === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/?$/.test(base)
        ? base.replace(/\/$/, "") + "/new?title=" + encodeURIComponent(CONTRIBUTION_TITLES[type] || "套餐反馈") + "&body=" + encodeURIComponent(body) : "";
}

export function downloadPublicData() {
    if (!optionalDataLoaded("maintenance") || !optionalDataLoaded("benchmark")) {
        maintenanceView.publicDataFeedback = "正在加载完整公开数据…";
        Promise.all([ensureOptionalData("maintenance"), ensureOptionalData("benchmark")]).then(downloadPublicData, () => {
            maintenanceView.publicDataFeedback = "公开数据加载失败，请重试下载。";
        });
        return;
    }
    const data = { schemaVersion: 1, meta: META, plans: PLANS, apiPrices: API_PRICES, paygReferences: PAYG_REFERENCES, priceChecks: PRICE_CHECKS, maintenance: maintenanceData(), benchmarks: benchmarkData() };
    downloadTextFile(JSON.stringify(data, null, 2) + "\n", `coding-plan-public-data-${META.updated}.json`, "application/json;charset=utf-8");
    maintenanceView.publicDataFeedback = "已生成公开数据 JSON；不含本机关注、已读记录或待审队列。";
}

/* 按需数据到达后清理关注状态、规范筛选，并通知 Vue 组件重新读取。 */
export function refreshOptionalViews(kind: OptionalDataKind) {
    if (kind === "maintenance") {
        Object.assign(followState, cleanFollowState(followState));
        dataRevision.maintenance++;
    }
    else {
        normalizeBenchmarkFilter();
        dataRevision.benchmark++;
    }
}

export function loadViewData(kind: OptionalDataKind) {
    const status = optionalViewState[kind];
    Object.assign(status, { message: optionalDataLoaded(kind) ? "" : "正在加载本标签的数据…", failed: false, loading: !optionalDataLoaded(kind) });
    return ensureOptionalData(kind).then(() => {
        Object.assign(status, { message: "", failed: false, loading: false });
        refreshOptionalViews(kind);
    }, (err: unknown) => {
        Object.assign(status, { message: `${err instanceof Error ? err.message : String(err)}。`, failed: true, loading: false });
    });
}
export function loadFollowState() {
    followView.importIds = readFollowImport();
    try { Object.assign(followState, cleanFollowState(readStoredFollowState())); }
    catch (error) { followView.storageMessage = error instanceof Error ? error.message : String(error); }
}
export function persistFollowState() {
    try { writeStoredFollowState(followState); followView.storageMessage = ''; }
    catch (error) { followView.storageMessage = error instanceof Error ? error.message : String(error); }
}
export function followSyncUrl() { return buildFollowSyncUrl(followState.planIds); }

