
/* 关注、维护、贡献者工具与按需数据的整页回归，原 test-app-maintenance.js。
 * 公开榜单并列/搜索/最佳配置/CSV 缺值与任务记录转义也有对应组件用例。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test, vi } from "vitest";
import { isAdditionChange } from "../generated/catalog";
import { openPage } from "../test/page";

const query = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  assert.ok(element, selector);
  return element;
};
function publicFixture(): PublicBenchmarkSnapshot {
  const protocol: PublicBenchmarkProtocol = { id: "deepswe-1-1", family: "DeepSWE", name: "Fixture DeepSWE", version: "1.1", category: "coding", metric: "任务通过率", unit: "%", description: "仅测试 fixture", configuration: "固定测试配置", scope: "10项fixture", sourceUrl: "https://example.com/protocol", sourceUpdatedAt: null, checkedAt: "2026-10-10" };
  const score: PublicBenchmarkScore = { id: "fixture-a", benchmarkId: protocol.id, model: "Fixture Model A", reasoning: "high", agent: "fixture-agent", score: 80, costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: "https://example.com/scores", checkedAt: "2026-10-10" };
  return { schemaVersion: 1, checkedAt: "2026-10-10", benchmarks: [protocol, { ...protocol, id: "hle-fixture", family: "HLE", name: "Fixture HLE", version: "no-tools", scope: "20项fixture" }], scores: [score, { ...score, id: "fixture-b", model: "Fixture Model B", score: 80, costUSD: 0 }, { ...score, id: "fixture-c", model: "Fixture Model C", score: 60, reasoning: null, agent: null, tokens: 100, steps: 0 }, { ...score, id: "fixture-hle", benchmarkId: "hle-fixture", model: "Fixture Other Protocol", score: 99 }] };
}
async function fixturePage() {
  const page = await openPage({ url: "/#benchmarks", prepare(app) { app.benchmarkData().public = publicFixture(); } });
  Object.assign(page.runtime.publicBenchmarkState, { id: "deepswe-1-1", search: "" });
  await page.settle();
  return page;
}

test("维护快照、真实变更与贡献者任务规范完整启动，贡献链接与模板一致", async () => {
  const page = await openPage(), app = page.runtime;
  assert.match(app.maintenanceData().generatedAt, /^\d{4}-\d{2}-\d{2}/);
  assert.equal(app.benchmarkRuns().length, 0);
  assert.ok(app.benchmarkData().tasks.some((t: BenchmarkTask) => t.id === "cached-cost"));
  assert.match(app.benchmarkText(app.benchmarkData().methodology), /同一解答/);
  const template = app.contributionTemplate("correction");
  const issue = new URL(app.contributionIssueUrl("correction", template));
  assert.match(issue.href, /^https:\/\/github.com\/yufeng97\/coding-plan-comparison\/issues\/new\?/);
  assert.equal(issue.searchParams.get("title"), "套餐纠错与更新");
  assert.equal(issue.searchParams.get("body"), template);
  assert.match(app.contributionTemplate("benchmark"), /cost=null/);
  assert.match(app.contributionTemplate("benchmark"), /durationSeconds 不能作为模型生成时间/);
  app.maintenanceView.planId = "plan-0002";
  await page.settle();
  assert.match(page.byId<HTMLTextAreaElement>("contributionTemplate").value, /永久套餐 ID：plan-0002/);
  page.healthy();
});

test("关注永久 ID 跨访问保留，已读按 changeId 标记且保留历史记录", async () => {
  let page = await openPage({ url: "/#updates" });
  let app = page.runtime;
  const id = app.maintenanceData().changes.find((c: MaintenanceChange) => c.kind === "plan" && !isAdditionChange(c))!.id;
  const total = app.maintenanceData().changes.filter((c: MaintenanceChange) => c.id === id).length;
  assert.ok(total > 0);
  assert.equal(app.toggleFollowPlan(id), true);
  await page.settle();
  assert.equal(app.unreadFollowedChanges().length, total);
  const stored = localStorage.getItem(app.FOLLOW_KEY)!;
  page.healthy();
  page = await openPage({ url: "/#updates", storage: { "cp-followed-plans-v1": stored } });
  app = page.runtime;
  assert.equal(app.isPlanFollowed(id), true);
  assert.match(page.byId("followedChanges").textContent!, /→/);
  assert.match(page.byId("followedChanges").textContent!, /官方证据/);
  app.markFollowedChangesRead();
  await page.settle();
  assert.equal(app.unreadFollowedChanges().length, 0);
  assert.equal(app.followedChanges().length, total);
  assert.ok(app.followState.readChangeIds.every((changeId: string) => changeId.startsWith("change-")));
  page.healthy();
});

test("存储拒绝仍能本页关注，伪造套餐、重复项与不存在的变更被清理", async () => {
  let page = await openPage({ storageFails: "getter" });
  const id = page.runtime.PLANS[0]!.id;
  assert.equal(page.runtime.toggleFollowPlan(id), true);
  assert.match(page.runtime.followView.feedback, /关闭后不会保留/);
  assert.match(page.runtime.followView.storageMessage, /不可用/);
  page.runtime.showPlanDetails(id);
  await page.settle();
  page.runtime.toggleFollowPlan(id);
  await page.settle();
  assert.match(page.byId("planFollowFeedback").textContent!, /关闭后不会保留/);
  page.healthy();
  page = await openPage({ storage: { "cp-followed-plans-v1": JSON.stringify({ planIds: ["plan-0002", "plan-0002", "made-up", "<script>"], readChangeIds: ["fake"] }) } });
  assert.deepEqual([...page.runtime.followState.planIds], ["plan-0002"]);
  assert.deepEqual([...page.runtime.followState.readChangeIds], []);
  assert.equal(page.runtime.toggleFollowPlan("made-up"), false);
  page.healthy();
});

test("推荐卡与完整权益关注按钮同步，对比、关注、详情入口保留", async () => {
  const page = await openPage();
  const control = query<HTMLButtonElement>("#quickGrid [data-watch-plan]");
  const id = control.dataset.watchPlan!;
  page.fire(control, "click");
  page.runtime.showPlanDetails(id);
  await page.settle();
  assert.equal(query(`#quickGrid [data-watch-plan="${id}"]`).getAttribute("aria-pressed"), "true");
  assert.equal(query(`#planDetailsBody [data-watch-plan="${id}"]`).getAttribute("aria-pressed"), "true");
  const actions = query("#quickGrid .qc-actions");
  assert.ok(actions.querySelector("[data-plan-id]"));
  assert.ok(actions.querySelector("[data-view-plan]"));
  assert.equal(actions.children.length, 2);
  assert.match(page.byId("quickGrid").textContent!, /重置窗口|公开窗口/);
  page.healthy();
});

test("实测费用、生成时间与验收次数分列，未知费用不补零", async () => {
  const page = await openPage(), app = page.runtime;
  const record: BenchmarkRun = { id: "example", taskId: "csv-export", model: "Example <model>", tool: "Example", measuredAt: "2026-10-08", cost: null, currency: "USD", costBasis: "included-subscription", durationSeconds: 0.1, generationSeconds: 30, passed: true, repeats: 3, evidence: "https://example.com/evidence", environment: "Node 20" };
  const view = app.benchmarkRunView(record);
  assert.equal(view.cost, "订阅内使用，未分摊单次费用");
  assert.equal(view.generation, "30 秒");
  assert.equal(view.duration, "0.1 秒");
  assert.equal(view.repeats, "3");
  assert.equal(view.evidenceUrl, record.evidence);
  assert.match(view.title, / · Example <model>$/);
  const unsafe = app.benchmarkRunView({ ...record, evidence: "javascript:alert(1)", costBasis: "unknown" });
  assert.equal(unsafe.evidenceUrl, "");
  assert.equal(unsafe.cost, "费用未记录");
  page.healthy();
});

test("公开 JSON 导出稳定结构且不含本机关注、已读或待审资料", async () => {
  const page = await openPage(), app = page.runtime;
  app.toggleFollowPlan(app.PLANS[0]!.id);
  app.downloadPublicData();
  await page.settle();
  assert.equal(page.downloads.length, 1);
  const data = JSON.parse(await page.downloads[0]!.blob.text());
  assert.deepEqual(Object.keys(data), ["schemaVersion", "meta", "plans", "apiPrices", "paygReferences", "priceChecks", "maintenance", "benchmarks"]);
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.plans.length > 0 && data.maintenance.changes.length > 0);
  assert.equal(data.benchmarks.runs.length, 0);
  assert.ok(!("followState" in data) && !("readChangeIds" in data) && !("candidates" in data));
  assert.match(app.maintenanceView.publicDataFeedback, /不含本机关注/);
  page.healthy();
});

test("公开榜单协议、并列名次、模型搜索与最佳配置在整页共享", async () => {
  const page = await fixturePage(), app = page.runtime;
  assert.deepEqual(app.publicBenchmarkRows().map((r: { rank: number }) => r.rank), [1, 1, 3]);
  app.publicBenchmarkState.search = "Model C";
  assert.deepEqual(app.publicBenchmarkRows().map((r: { model: string; rank: number }) => [r.model, r.rank]), [["Fixture Model C", 3]]);
  Object.assign(app.publicBenchmarkState, { family: "HLE", id: "hle-fixture", search: "" });
  assert.deepEqual(app.publicBenchmarkRows().map((r: { model: string }) => r.model), ["Fixture Other Protocol"]);
  assert.equal(app.selectedPublicBenchmark().scope, "20项fixture");
  Object.assign(app.publicBenchmarkState, { family: "DeepSWE", id: "deepswe-1-1" });
  app.benchmarkData().public!.scores.push({ ...app.benchmarkData().public!.scores[0]!, id: "fixture-a-low", reasoning: "low", score: 70, costUSD: 0.1 });
  assert.equal(app.publicBenchmarkRows().length, 3);
  assert.equal(app.publicBenchmarkRows().find((r: { model: string }) => r.model === "Fixture Model A")!.reasoning, "high");
  app.publicBenchmarkState.mode = "all";
  assert.equal(app.publicBenchmarkRows().length, 4);
  assert.deepEqual(app.publicBenchmarkRows().filter((r: { model: string }) => r.model === "Fixture Model A").map((r) => r.reasoning), ["high", "low"]);
  app.publicBenchmarkState.search = "Model A";
  const csv = app.publicBenchmarkCsv();
  assert.match(csv, /官方评测每任务成本 USD/);
  assert.match(csv, /deepswe-1-1/);
  assert.match(csv, /固定测试配置/);
  assert.match(csv, /"80","%","",""/);
  assert.doesNotMatch(csv, /Other Protocol/);
  page.healthy();
});

test("用途只列同类协议，HLE 与 OSWorld 默认当前配置", async () => {
  const page = await fixturePage(), app = page.runtime;
  const protocol = app.benchmarkData().public!.benchmarks[1]!;
  app.benchmarkData().public!.benchmarks.push({ ...protocol, id: "hle-diamond-2026-high-closed-book-multimodal", name: "Fixture Diamond" }, { ...protocol, id: "osworld-2-25443e96866dc9ce", family: "OSWorld", name: "Fixture OS2 current" });
  Object.assign(app.publicBenchmarkState, { family: "HLE", id: "" });
  assert.equal(app.selectedPublicBenchmark().id, "hle-diamond-2026-high-closed-book-multimodal");
  assert.deepEqual(app.publicBenchmarkLabels(app.publicBenchmarkData().benchmarks.filter((b: PublicBenchmarkProtocol) => b.family === "HLE")).map(([b]) => b.family), ["HLE", "HLE"]);
  Object.assign(app.publicBenchmarkState, { family: "OSWorld", id: "" });
  assert.equal(app.selectedPublicBenchmark().name, "Fixture OS2 current");
  assert.deepEqual(app.publicBenchmarkFamilies(), ["DeepSWE", "OSWorld", "HLE"]);
  page.healthy();
});

test("评测套餐映射保留精确版本，不把 Flash 或按量入口当作包含模型订阅", async () => {
  const page = await openPage(), app = page.runtime;
  assert.equal(app.publicModelPlans("glm-5.3").some((p: Plan) => ["plan-0174", "plan-0175", "plan-0176", "plan-0177", "plan-0039"].includes(p.id)), false);
  assert.equal(app.publicModelPlans("glm-5.3-flash").some((p: Plan) => p.id === "plan-0174"), true);
  app.PLANS.find((p: Plan) => p.id === "plan-0174")!.models = "GLM-5.3 Flash";
  assert.equal(app.publicModelPlans("glm-5.3").some((p: Plan) => p.id === "plan-0174"), false);
  assert.equal(app.publicCostText(0.004), "小于 $0.01");
  assert.equal(app.publicCostText(0), "$0");
  page.healthy();
});

test("贡献者任务筛选跨辅助标签保留，不存在的工具、模型和任务归全部", async () => {
  const page = await openPage({ url: "/#benchmarks" }), app = page.runtime;
  app.benchmarkFilter.task = "csv-export";
  app.refreshOptionalViews("benchmark");
  page.fire(page.anchor("#updates"), "click");
  await page.settle();
  page.fire(page.anchor("#benchmarks"), "click");
  await page.settle();
  assert.equal(app.benchmarkFilter.task, "csv-export");
  assert.equal(page.byId<HTMLSelectElement>("benchmarkTask").value, "csv-export");
  Object.assign(app.benchmarkFilter, { tool: "unknown-tool", model: "unknown-model" });
  app.normalizeBenchmarkFilter();
  assert.equal(app.benchmarkFilter.tool, "all");
  assert.equal(app.benchmarkFilter.model, "all");
  app.benchmarkFilter.task = "unknown-task";
  app.normalizeBenchmarkFilter();
  assert.equal(app.benchmarkFilter.task, "all");
  page.healthy();
});

test("Claude 共享品牌、GPT 全系简称保留精确版本与包含资格", async () => {
  const page = await openPage(), app = page.runtime;
  const ids = (model: string) => app.publicModelPlans(model).map((p: Plan) => p.id);
  assert.deepEqual(ids("claude-opus-5"), ids("Opus 5"));
  assert.ok(ids("claude-opus-5").includes("plan-0075"));
  assert.equal(app.publicModelDisplayName("Opus 5"), "Claude Opus 5");
  assert.deepEqual(app.publicModelPlans("claude-fable-5.1").filter((p: Plan) => p.vendor === "Anthropic").map((p: Plan) => p.id).sort(), ["plan-0003", "plan-0004", "plan-0006"]);
  assert.equal(app.publicModelPlans("claude-fable-5.1")[0].vendor, "Anthropic");
  assert.equal(app.publicModelPlans("kimi-k3").some((p: Plan) => (p.modelExcludes || []).includes("Kimi-K3")), false);
  const newer = app.publicNewerVersion("claude-opus-5", app.publicModelPlans("claude-opus-5"))!;
  assert.deepEqual({ family: newer.family, version: newer.version }, { family: "Opus", version: 5.5 });
  assert.deepEqual(app.publicModelPlans("GPT-6.1 Sol").filter((p: Plan) => p.vendor === "OpenAI").map((p: Plan) => p.id), ["plan-0010", "plan-0011", "plan-0012", "plan-0013"]);
  assert.equal(app.publicModelPlans("GPT-6.2 Sol").some((p: Plan) => p.vendor === "OpenAI"), false);
  assert.equal(app.publicModelPlans("claude-fable-5").some((p: Plan) => p.vendor === "Anthropic"), false);
  assert.equal(app.publicModelIncluded(app.findPlanReference("plan-0001")!, "Claude Haiku 4.5"), true);
  for (const model of ["GPT-6 Luna", "GPT-6 Astra"]) assert.ok(ids(model).includes("plan-0010"));
  const p = app.PLANS.find((p: Plan) => p.id === "plan-0010")!;
  for (const text of ["GPT-6 Sol / Luna / GPT-5.6 系列 / Astra", "GPT-6 Sol / 未明确的模型 / Astra", "GPT-6 Sol、Astra"]) {
    p.models = text;
    assert.equal(ids("GPT-6 Astra").includes("plan-0010"), false);
  }
  app.PLANS.find((p: Plan) => p.id === "plan-0002")!.models = "Claude Sonnet 5.5（不含Claude Opus 5.5）";
  assert.equal(ids("claude-opus-5.5").includes("plan-0002"), false);
  assert.equal(ids("claude-sonnet-5.5").includes("plan-0002"), true);
  page.healthy();
});

test("评测数据进入标签才下载，失败可重试，到达后通知组件渲染榜单与任务", async () => {
  const page = await openPage({ lazyData: true, failData: (_src, attempt) => attempt === 1 });
  assert.deepEqual(page.scriptLoads, []);
  page.fire(page.anchor("#benchmarks"), "click");
  await page.settle();
  const status = page.byId("benchmarkDataStatus");
  assert.deepEqual(page.scriptLoads, ["js/benchmark-data.js"]);
  assert.match(status.textContent!, /正在加载本标签的数据/);
  const revision = page.runtime.dataRevision.benchmark;
  await page.finishDataLoads();
  assert.match(status.textContent!, /数据文件下载失败/);
  assert.equal(page.runtime.optionalDataLoaded("benchmark"), false);
  page.fire(query("#benchmarkDataStatus [data-retry-data]"), "click");
  await page.settle();
  assert.match(status.textContent!, /正在加载本标签的数据/);
  assert.deepEqual(page.scriptLoads, ["js/benchmark-data.js", "js/benchmark-data.js"]);
  await page.finishDataLoads();
  assert.equal(status.textContent, "");
  assert.ok(page.runtime.publicBenchmarkRows().length > 0);
  assert.ok(page.runtime.dataRevision.benchmark > revision);
  assert.ok(page.byId("publicBenchmarkBody").querySelectorAll("tr").length > 0);
  assert.ok(page.runtime.benchmarkData().tasks.some((t: BenchmarkTask) => t.id === "cached-cost"));
  assert.equal(page.runtime.benchmarkRuns().length, 0);
  page.healthy();
});

test("下载超时可重试，迟到的数据已就绪时不重复下载", async () => {
  const page = await openPage({ lazyData: true, url: "/#benchmarks" });
  assert.deepEqual(page.scriptLoads, ["js/benchmark-data.js"]);
  await page.flushTimers();
  assert.match(page.byId("benchmarkDataStatus").textContent!, /数据下载超时，请重试/);
  await page.finishDataLoads();
  assert.equal(page.runtime.optionalDataLoaded("benchmark"), true);
  page.fire(query("#benchmarkDataStatus [data-retry-data]"), "click");
  await page.settle();
  assert.deepEqual(page.scriptLoads, ["js/benchmark-data.js"]);
  assert.equal(page.byId("benchmarkDataStatus").textContent, "");
  assert.ok(page.runtime.benchmarkData().tasks.some((t: BenchmarkTask) => t.id === "cached-cost"));
  page.healthy();
});

test("关注页按需加载维护数据，公开 JSON 下载先补齐两份数据", async () => {
  const page = await openPage({ lazyData: true, url: "/#updates", storage: { "cp-followed-plans-v1": JSON.stringify({ planIds: ["plan-0002"], readChangeIds: [] }) } });
  const app = page.runtime;
  assert.deepEqual(page.scriptLoads, ["js/maintenance-data.js"]);
  assert.equal(app.optionalDataLoaded("maintenance"), false);
  const revision = app.dataRevision.maintenance;
  await page.finishDataLoads();
  assert.equal(page.byId("maintenanceDataStatus").textContent, "");
  assert.ok(app.dataRevision.maintenance > revision);
  assert.match(app.maintenanceData().generatedAt, /^\d{4}-\d{2}-\d{2}/);
  assert.equal(app.followedPlans().length, 1);
  assert.equal(app.unreadFollowedChanges().length, app.followedChanges().length);
  assert.deepEqual([...app.followState.planIds], ["plan-0002"]);
  app.downloadPublicData();
  await page.settle();
  assert.match(app.maintenanceView.publicDataFeedback, /正在加载完整公开数据/);
  assert.deepEqual(page.scriptLoads, ["js/maintenance-data.js", "js/benchmark-data.js"]);
  assert.equal(page.downloads.length, 0);
  await page.finishDataLoads();
  assert.equal(page.downloads.length, 1);
  const data = JSON.parse(await page.downloads[0]!.blob.text());
  assert.ok(data.maintenance.changes.length > 0 && data.benchmarks.tasks.length > 0);
  assert.match(app.maintenanceView.publicDataFeedback, /已生成公开数据 JSON/);
  page.healthy();
});

test("完整权益历史展开才加载，失败后重新展开恢复，summary 与焦点保留", async () => {
  const page = await openPage({ lazyData: true, failData: (_src, attempt) => attempt === 1 });
  page.runtime.showPlanDetails("plan-0002");
  await page.settle();
  const details = query<HTMLDetailsElement>("#planDetailsBody .plan-history"), summary = details.querySelector("summary")!;
  assert.equal(summary.textContent, "已确认价格与权益历史");
  assert.deepEqual(page.scriptLoads, []);
  summary.focus();
  details.open = true;
  page.fire(details, "toggle");
  await page.settle();
  assert.deepEqual(page.scriptLoads, ["js/maintenance-data.js"]);
  assert.match(details.querySelector(".plan-history-body")!.textContent!, /正在加载历史数据/);
  await page.finishDataLoads();
  assert.match(details.querySelector(".plan-history-body")!.textContent!, /加载失败，请关闭后重新展开/);
  details.open = false;
  page.fire(details, "toggle");
  details.open = true;
  page.fire(details, "toggle");
  await page.settle();
  assert.deepEqual(page.scriptLoads, ["js/maintenance-data.js", "js/maintenance-data.js"]);
  await page.finishDataLoads();
  assert.equal(details.querySelector("summary"), summary);
  assert.match(summary.textContent!, /^已确认价格与权益历史（\d+ 条）$/);
  assert.equal(document.activeElement, summary);
  assert.doesNotMatch(details.querySelector(".plan-history-body")!.textContent!, /正在加载|加载失败/);
  page.healthy();
});

test("公开图表条数不改变表格与 CSV，DeepSWE 两版本独立排名", async () => {
  const page = await openPage({ url: "/#benchmarks" }), app = page.runtime;
  const count = app.publicBenchmarkRows().length;
  assert.equal(app.publicBenchmarkChartRows().length, 20);
  app.publicBenchmarkChartState.limit = "10";
  assert.equal(app.publicBenchmarkChartRows().length, 10);
  assert.equal(app.publicBenchmarkRows().length, count);
  assert.equal(app.publicBenchmarkCsv().split("\r\n").length, count + 1);
  Object.assign(app.publicBenchmarkState, { id: "deepswe-v1" });
  app.publicBenchmarkChartState.limit = "all";
  assert.equal(app.publicBenchmarkChartRows().length, app.publicBenchmarkRows().length);
  assert.ok(app.publicBenchmarkRows().every((r: { benchmarkId: string }) => r.benchmarkId === "deepswe-v1"));
  assert.equal(app.selectedPublicBenchmark().id, "deepswe-v1");
  assert.ok(app.planCodingBenchmarks(app.findPlanReference("plan-0159")).some((r) => r.protocol.id === "deepswe-v1-1"));
  assert.ok(app.planCodingBenchmarks(app.findPlanReference("plan-0002")).some((r) => r.protocol.id === "deepswe-v1"));
  assert.ok(app.planCodingBenchmarks(app.findPlanReference("plan-0164")).some((r) => r.protocol.id === "deepswe-v1" && app.publicModelDisplayName(r.row.model) === "MiniMax-M3"));
  page.healthy();
});

test("模型族稳定取色，窄屏简称保留版本，推荐证据只关联当前任务角色", async () => {
  const page = await openPage({ url: "/#benchmarks" }), app = page.runtime;
  const original = getComputedStyle;
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (key: string) => key }));
  assert.equal(app.publicChartColors().glm, "--bench-glm");
  vi.stubGlobal("getComputedStyle", original);
  assert.ok(new Set(app.publicBenchmarkChartRows().map((r: { model: string }) => app.publicChartFamily(r.model).id)).size > 3);
  for (const [model, family] of [["Claude-Opus-5.5", "claude"], ["Opus 5", "claude"], ["Composer 2", "composer"], ["Unknown model", "other"]]) assert.equal(app.publicChartFamily(model).id, family);
  assert.equal(app.publicChartAxisName("#14 DeepSeek-V4-Pro", true), "#14 DeepSeek\nV4-Pro");
  assert.equal(app.publicChartAxisName("#12 Gemini-3.7 Flash · high", true), "#12 Gemini-3.7\nFlash");
  assert.ok(app.planCodingBenchmarks(app.findPlanReference("plan-0002")).some((r) => app.publicModelDisplayName(r.row.model) === "Claude Haiku 4.5"));
  assert.equal(app.planCodingBenchmarks(app.findPlanReference("plan-0002"), app.MODEL_ROLES.find((r: { id: string }) => r.id === "claude-opus")).some((r) => /Haiku/i.test(r.row.model)), false);
  assert.ok(app.planCodingBenchmarks(app.findPlanReference("plan-0159"), app.MODEL_ROLES.find((r: { id: string }) => r.id === "glm-5")).every((r) => /GLM/i.test(r.row.model)));
  page.healthy();
});

test("超时后在旧请求返回前重试，迟到脚本与重试脚本都执行也不报重复声明", async () => {
  for (const [hash, kind, file] of [["#updates", "maintenance", "js/maintenance-data.js"], ["#benchmarks", "benchmark", "js/benchmark-data.js"]] as const) {
    const page = await openPage({ lazyData: true, url: "/" + hash });
    const status = page.byId(kind + "DataStatus");
    assert.deepEqual(page.scriptLoads, [file]);
    await page.flushTimers();
    assert.match(status.textContent!, /数据下载超时，请重试/);
    page.fire(query(`#${kind}DataStatus [data-retry-data]`), "click");
    await page.settle();
    assert.deepEqual(page.scriptLoads, [file, file], "卡住的旧请求不能阻止重试发出新请求");
    await page.finishDataLoads();
    assert.equal(page.runtime.optionalDataLoaded(kind), true);
    assert.equal(status.textContent, "");
    page.healthy();
  }
  /* 浏览器里已发出的旧脚本仍会执行：生成的数据脚本在同一全局环境执行两次，只覆盖同一份数据。 */
  for (const file of ["maintenance-data.js", "benchmark-data.js"]) {
    const source = fs.readFileSync(path.resolve("data/generated", file), "utf8");
    const context = vm.createContext({});
    vm.runInContext(source, context);
    assert.doesNotThrow(() => vm.runInContext(source, context), file);
  }
});

test("导航「我的关注」用首屏摘要显示未读数，不下载完整维护数据；标为已读或取消关注后清除", async () => {
  let page = await openPage();
  const summary = page.runtime.MAINTENANCE_SUMMARY;
  const id = summary.changes[0]!.id, expected = summary.changes.filter((c) => c.id === id).length;
  const storage = { "cp-followed-plans-v1": JSON.stringify({ planIds: [id], readChangeIds: [] }) };
  assert.equal(page.byId("followNavBadge").hidden, true, "没有关注时不显示");
  page = await openPage({ lazyData: true, storage });
  const badge = page.byId("followNavBadge");
  assert.deepEqual(page.scriptLoads, [], "首屏不下载完整维护数据");
  assert.equal(badge.hidden, false);
  assert.equal(badge.querySelector('[aria-hidden="true"]')!.textContent, String(expected));
  assert.equal(badge.querySelector(".sr-only")!.textContent, `，${expected} 条未读变更`);
  page.runtime.navigateToSection("#updates");
  await page.settle();
  await page.finishDataLoads();
  assert.equal(page.runtime.optionalDataLoaded("maintenance"), true);
  assert.equal(badge.hidden, false, "完整数据加载后口径不变");
  assert.equal(badge.querySelector('[aria-hidden="true"]')!.textContent, String(expected));
  page.fire(page.byId("markFollowReadBtn"), "click");
  await page.settle();
  assert.equal(badge.hidden, true);
  assert.equal(badge.textContent, "");
  page.healthy();

  page = await openPage({ storage });
  assert.equal(page.byId("followNavBadge").hidden, false);
  page.runtime.toggleFollowPlan(id);
  await page.settle();
  assert.equal(page.byId("followNavBadge").hidden, true, "取消关注后不再提醒");
  page.healthy();
});
