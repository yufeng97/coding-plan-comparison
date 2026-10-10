#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");
const plain = (value) => JSON.parse(JSON.stringify(value));

/* 关注、维护、贡献与贡献者工具由 Vue 组件渲染：渲染与交互断言在 src/sections/*.test.js，这里测共用的状态与计算。 */
test("维护快照、真实变更与贡献者任务规范能完整启动", () => {
  const app = createApp();
  assert.match(app.run("maintenanceData().generatedAt"), /^\d{4}-\d{2}-\d{2}/);
  assert.equal(app.run("benchmarkRuns().length"), 0);
  assert.ok(app.run("benchmarkData().tasks.some((t) => t.id === 'cached-cost')"));
  assert.match(app.run("benchmarkText(benchmarkData().methodology)"), /同一解答/);
  const template = app.run("contributionTemplate('correction')");
  const issue = new URL(app.run("contributionIssueUrl('correction', contributionTemplate('correction'))"));
  assert.match(issue.href, /^https:\/\/github.com\/yufeng97\/coding-plan-comparison\/issues\/new\?/);
  assert.equal(issue.searchParams.get("title"), "套餐纠错与更新");
  assert.equal(issue.searchParams.get("body"), template);
  healthy(app);
});

test("关注永久ID跨访问保留，已读按changeId标记而不改历史记录", () => {
  const app = createApp();
  const id = app.run("MAINTENANCE.changes.find(c => c.kind === 'plan').id");
  const total = app.run(`MAINTENANCE.changes.filter(c => c.id === ${JSON.stringify(id)}).length`);
  assert.ok(total > 0);
  assert.equal(app.run(`toggleFollowPlan(${JSON.stringify(id)})`), true);
  assert.equal(app.run("unreadFollowedChanges().length"), total);
  const stored = app.run("localStorage.getItem(FOLLOW_KEY)");
  const next = createApp({ storage: { "cp-followed-plans-v1": stored } });
  assert.equal(next.run(`isPlanFollowed(${JSON.stringify(id)})`), true);
  next.run("markFollowedChangesRead()");
  assert.equal(next.run("unreadFollowedChanges().length"), 0);
  assert.equal(next.run("followedChanges().length"), total);
  assert.ok(next.run("followState.readChangeIds.every(id => id.startsWith('change-'))"));
  const card = next.run(`changeCardHtml(planChanges(${JSON.stringify(id)})[0])`);
  assert.match(card, /→/);
  assert.match(card, /官方证据/);
  healthy(app); healthy(next);
});

test("关注存储拒绝时仍能本页操作且明确不会跨访问保留", () => {
  const app = createApp({ storageGetterThrows: true });
  const id = app.run("PLANS[0].id");
  assert.equal(app.run(`toggleFollowPlan(${JSON.stringify(id)})`), true);
  assert.match(app.run("followView.feedback"), /关闭后不会保留/);
  assert.match(app.run("followView.storageMessage"), /不可用/);
  app.run(`showPlanDetails(${JSON.stringify(id)})`);
  assert.match(app.elements.get("planDetailsBody").innerHTML, /planFollowFeedback/);
  app.run(`toggleFollowPlan(${JSON.stringify(id)})`);
  assert.match(app.elements.get("planFollowFeedback").textContent, /关闭后不会保留/);
  healthy(app);
});

test("存储中伪造套餐、重复项与不存在的变更ID被清理", () => {
  const app = createApp({ storage: { "cp-followed-plans-v1": JSON.stringify({ planIds: ["plan-0002", "plan-0002", "made-up", "<script>"], readChangeIds: ["fake"] }) } });
  assert.deepEqual(plain(app.run("followState.planIds")), ["plan-0002"]);
  assert.deepEqual(plain(app.run("followState.readChangeIds")), []);
  assert.equal(app.run("toggleFollowPlan('made-up')"), false);
  healthy(app);
});

test("推荐与完整权益的关注按钮同步，并保留对比三按钮布局", () => {
  const app = createApp();
  const id = app.run("document.querySelector('#quickGrid [data-watch-plan]').dataset.watchPlan");
  app.run(`toggleFollowPlan(${JSON.stringify(id)}); showPlanDetails(${JSON.stringify(id)})`);
  assert.equal(app.run(`document.querySelector('#quickGrid [data-watch-plan="${id}"]').getAttribute('aria-pressed')`), "true");
  assert.equal(app.run(`document.querySelector('#planDetailsBody [data-watch-plan="${id}"]').getAttribute('aria-pressed')`), "true");
  assert.equal(app.run("document.querySelector('#quickGrid .qc-actions').children.length"), 2);
  assert.match(app.elements.get("quickGrid").innerHTML, /重置窗口|公开窗口/);
  healthy(app);
});

test("实测记录区分API账单、生成时间和验收次数，未知费用不补零", () => {
  const app = createApp();
  const record = { id: "example", taskId: "csv-export", model: "Example <model>", tool: "Example", measuredAt: "2026-10-08", cost: null, currency: "USD", costBasis: "included-subscription", durationSeconds: 0.1, generationSeconds: 30, passed: true, repeats: 3, evidence: "https://example.com/evidence", environment: "Node 20" };
  const view = plain(app.run(`benchmarkRunView(${JSON.stringify(record)})`));
  assert.equal(view.cost, "订阅内使用，未分摊单次费用");
  assert.equal(view.generation, "30 秒");
  assert.equal(view.duration, "0.1 秒");
  assert.equal(view.repeats, "3");
  assert.equal(view.evidenceUrl, "https://example.com/evidence");
  assert.match(view.title, / · Example <model>$/, "模型名原样交给组件，由模板转义");
  const unsafe = plain(app.run(`benchmarkRunView(${JSON.stringify({ ...record, evidence: "javascript:alert(1)", costBasis: "unknown" })})`));
  assert.equal(unsafe.evidenceUrl, "");
  assert.equal(unsafe.cost, "费用未记录");
  healthy(app);
});

test("测评贡献模板保留真实口径：费用未知填 null，验收运行时间不当生成时间", () => {
  const app = createApp();
  const template = app.run("contributionTemplate('benchmark')");
  assert.match(template, /cost=null/);
  assert.match(template, /durationSeconds 不能作为模型生成时间/);
  app.run("maintenanceView.planId = 'plan-0002'");
  assert.match(app.run("contributionTemplate('correction')"), /永久套餐 ID：plan-0002/, "模板随关注页选中的套餐更新");
  healthy(app);
});

test("公开JSON按稳定结构导出且不包含本机关注已读和待审资料", async () => {
  const app = createApp();
  app.run("toggleFollowPlan(PLANS[0].id)");
  app.run("downloadPublicData()");
  const data = JSON.parse(await app.downloads[0].blob.text());
  assert.deepEqual(Object.keys(data), ["schemaVersion", "meta", "plans", "apiPrices", "paygReferences", "priceChecks", "maintenance", "benchmarks"]);
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.plans.length > 0 && data.maintenance.changes.length > 0);
  assert.equal(data.benchmarks.runs.length, 0);
  assert.ok(!("followState" in data) && !("readChangeIds" in data) && !("candidates" in data));
  assert.match(app.run("maintenanceView.publicDataFeedback"), /不含本机关注/);
  healthy(app);
});

function fixturePublicBenchmarks(app) {
  const protocol = { id: "deepswe-1-1", family: "DeepSWE", name: "Fixture DeepSWE", version: "1.1", category: "coding", metric: "任务通过率", unit: "%", description: "仅测试fixture", configuration: "固定测试配置", scope: "10项fixture", sourceUrl: "https://example.com/protocol", sourceUpdatedAt: null, checkedAt: "2026-10-10" };
  const score = { id: "fixture-a", benchmarkId: protocol.id, model: "Fixture Model A", reasoning: "high", agent: "fixture-agent", score: 80, costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: "https://example.com/scores", checkedAt: "2026-10-10" };
  const data = { schemaVersion: 1, checkedAt: "2026-10-10", benchmarks: [protocol, { ...protocol, id: "hle-fixture", family: "HLE", name: "Fixture HLE", version: "no-tools", scope: "20项fixture" }], scores: [score, { ...score, id: "fixture-b", model: "Fixture Model B", score: 80, costUSD: 0 }, { ...score, id: "fixture-c", model: "Fixture Model C", score: 60, reasoning: null, agent: null, tokens: 100, steps: 0 }, { ...score, id: "fixture-hle", benchmarkId: "hle-fixture", model: "Fixture Other Protocol", score: 99 }] };
  app.run(`BENCHMARKS.public = ${JSON.stringify(data)}; Object.assign(publicBenchmarkState, {id:'deepswe-1-1',search:''}); renderPublicBenchmarks();`);
  return data;
}

/* 公开评测区块由 Vue 组件渲染：渲染、事件、下载与图表断言在 src/sections/PublicBenchmarks.test.js，这里只测共用的计算逻辑。 */
test("公开榜单仅在协议内排名，并列和模型搜索保留原始名次", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r=>r.rank)")), [1, 1, 3]);
  app.run("publicBenchmarkState.search = 'Model C'");
  assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r=>[r.model,r.rank])")), [["Fixture Model C", 3]]);
  app.run("publicBenchmarkState.family='HLE'; publicBenchmarkState.id='hle-fixture'; publicBenchmarkState.search=''");
  assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r=>r.model)")), ["Fixture Other Protocol"]);
  assert.equal(app.run("selectedPublicBenchmark().scope"), "20项fixture");
  healthy(app);
});

test("每模型最佳配置默认取协议内最高分，全部模式保留不同推理配置", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  app.run("BENCHMARKS.public.scores.push({...BENCHMARKS.public.scores[0],id:'fixture-a-low',reasoning:'low',score:70,costUSD:0.1})");
  assert.equal(app.run("publicBenchmarkRows().length"), 3);
  assert.equal(app.run("publicBenchmarkRows().find(r=>r.model==='Fixture Model A').reasoning"), "high");
  app.run("publicBenchmarkState.mode = 'all'");
  assert.equal(app.run("publicBenchmarkRows().length"), 4);
  assert.deepEqual(plain(app.run("publicBenchmarkRows().filter(r=>r.model==='Fixture Model A').map(r=>r.reasoning)")), ["high", "low"]);
  healthy(app);
});

test("用途选择只列同类协议，HLE和OSWorld默认公开当前配置而非历史表", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  app.run(`BENCHMARKS.public.benchmarks.push({...BENCHMARKS.public.benchmarks[1],id:'hle-diamond-2026-high-closed-book-multimodal',name:'Fixture Diamond'}, {...BENCHMARKS.public.benchmarks[1],id:'osworld-2-25443e96866dc9ce',family:'OSWorld',name:'Fixture OS2 current'});`);
  app.run("publicBenchmarkState.family='HLE'; publicBenchmarkState.id=''");
  assert.equal(app.run("selectedPublicBenchmark().id"), "hle-diamond-2026-high-closed-book-multimodal");
  assert.deepEqual(plain(app.run("publicBenchmarkLabels(publicBenchmarkData().benchmarks.filter(b=>b.family==='HLE')).map(([b])=>b.family)")), ["HLE", "HLE"]);
  app.run("publicBenchmarkState.family='OSWorld'; publicBenchmarkState.id=''");
  assert.equal(app.run("selectedPublicBenchmark().name"), "Fixture OS2 current");
  assert.deepEqual(plain(app.run("publicBenchmarkFamilies()")), ["DeepSWE", "OSWorld", "HLE"]);
  healthy(app);
});

test("评测CSV保留独立协议、配置与缺失成本", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  app.run("publicBenchmarkState.search='Model A'");
  const csv = app.run("publicBenchmarkCsv()");
  assert.match(csv, /官方评测每任务成本 USD/);
  assert.match(csv, /deepswe-1-1/); assert.match(csv, /固定测试配置/);
  assert.match(csv, /"80","%","",""/); assert.doesNotMatch(csv, /Other Protocol/);
  healthy(app);
});

test("评测套餐映射保留精确版本，不把Flash或按量入口当成包含模型的订阅", () => {
  const app = createApp();
  assert.equal(app.run("publicModelPlans('glm-5.3').some(p=>['plan-0174','plan-0175','plan-0176','plan-0177','plan-0039'].includes(p.id))"), false);
  assert.equal(app.run("publicModelPlans('glm-5.3-flash').some(p=>p.id==='plan-0174')"), true);
  app.run("PLANS.find(p=>p.id==='plan-0174').models='GLM-5.3 Flash';");
  assert.equal(app.run("publicModelPlans('glm-5.3').some(p=>p.id==='plan-0174')"), false);
  assert.equal(app.run("publicCostText(0.004)"), "小于 $0.01");
  assert.equal(app.run("publicCostText(0)"), "$0");
  healthy(app);
});

test("切换辅助标签后贡献者任务筛选保留，数据中不存在的工具与模型回到全部", () => {
  const app = createApp();
  app.run("benchmarkFilter.task='csv-export'; refreshOptionalViews('benchmark');");
  assert.equal(app.run("benchmarkFilter.task"), "csv-export");
  app.run("benchmarkFilter.tool='unknown-tool'; benchmarkFilter.model='unknown-model'; normalizeBenchmarkFilter();");
  assert.equal(app.run("benchmarkFilter.tool"), "all");
  assert.equal(app.run("benchmarkFilter.model"), "all");
  app.run("benchmarkFilter.task='unknown-task'; normalizeBenchmarkFilter();");
  assert.equal(app.run("benchmarkFilter.task"), "all");
  healthy(app);
});

test("评测与套餐的Claude共享品牌、GPT全系简称保留精确版本和包含资格", () => {
  const app = createApp();
  assert.deepEqual(plain(app.run("publicModelPlans('claude-opus-5').map(p=>p.id)")), plain(app.run("publicModelPlans('Opus 5').map(p=>p.id)")));
  assert.equal(app.run("publicModelPlans('claude-opus-5').some(p=>p.id==='plan-0075')"), true);
  assert.equal(app.run("publicModelDisplayName('Opus 5')"), "Claude Opus 5");
  assert.deepEqual(plain(app.run("publicModelPlans('claude-fable-5.1').filter(p=>p.vendor==='Anthropic').map(p=>p.id).sort()")), ["plan-0003", "plan-0004", "plan-0006"]);
  /* 出品方官方订阅排在第三方工具之前，组内按月费。 */
  assert.equal(app.run("publicModelPlans('claude-fable-5.1')[0].vendor"), "Anthropic");
  assert.equal(app.run("publicModelPlans('kimi-k3').some(p => (p.modelExcludes || []).includes('Kimi-K3'))"), false);
  assert.deepEqual(plain(app.run("(({ family, version }) => ({ family, version }))(publicNewerVersion('claude-opus-5', publicModelPlans('claude-opus-5')))")), { family: "Opus", version: 5.5 });
  assert.deepEqual(plain(app.run("publicModelPlans('GPT-6.1 Sol').filter(p=>p.vendor==='OpenAI').map(p=>p.id)")), ["plan-0010", "plan-0011", "plan-0012", "plan-0013"]);
  assert.equal(app.run("publicModelPlans('GPT-6.2 Sol').some(p=>p.vendor==='OpenAI')"), false);
  assert.equal(app.run("publicModelPlans('claude-fable-5').some(p=>p.vendor==='Anthropic')"), false);
  assert.equal(app.run("publicModelIncluded(PLANS.find(p=>p.id==='plan-0001'), 'Claude Haiku 4.5')"), true);
  assert.equal(app.run("publicModelPlans('GPT-6 Luna').some(p=>p.id==='plan-0010')"), true);
  assert.equal(app.run("publicModelPlans('GPT-6 Astra').some(p=>p.id==='plan-0010')"), true);
  app.run("PLANS.find(p=>p.id==='plan-0010').models='GPT-6 Sol / Luna / GPT-5.6 系列 / Astra';");
  assert.equal(app.run("publicModelPlans('GPT-6 Astra').some(p=>p.id==='plan-0010')"), false);
  app.run("PLANS.find(p=>p.id==='plan-0010').models='GPT-6 Sol / 未明确的模型 / Astra';");
  assert.equal(app.run("publicModelPlans('GPT-6 Astra').some(p=>p.id==='plan-0010')"), false);
  app.run("PLANS.find(p=>p.id==='plan-0010').models='GPT-6 Sol、Astra';");
  assert.equal(app.run("publicModelPlans('GPT-6 Astra').some(p=>p.id==='plan-0010')"), false);
  app.run("PLANS.find(p=>p.id==='plan-0002').models='Claude Sonnet 5.5（不含Claude Opus 5.5）';");
  assert.equal(app.run("publicModelPlans('claude-opus-5.5').some(p=>p.id==='plan-0002')"), false);
  assert.equal(app.run("publicModelPlans('claude-sonnet-5.5').some(p=>p.id==='plan-0002')"), true);
  healthy(app);
});

/* lazyData：评测与维护数据经页面自己的加载器按需进入，下载完成（finishDataLoads）与超时计时器分别推进。 */
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("评测数据进入标签才下载，失败可重试，成功后渲染榜单与任务", async () => {
  const app = createApp({ lazyData: true, failData: (_src, attempt) => attempt === 1 });
  assert.deepEqual(app.scriptLoads, [], "首屏不应下载评测或维护数据");
  healthy(app);
  app.anchor("#benchmarks").click();
  const status = app.elements.get("benchmarkDataStatus");
  assert.deepEqual(app.scriptLoads, ["js/benchmark-data.js"]);
  assert.match(status.textContent, /正在加载本标签的数据/);
  /* 未就绪时不下「没有记录」类结论（公开榜单的待加载文案见组件测试）。 */
  const revision = app.run("dataRevision.benchmark");
  app.finishDataLoads(); await settle();
  assert.match(status.innerHTML, /数据文件下载失败/);
  assert.equal(app.run("optionalDataLoaded('benchmark')"), false);
  app.run("document.querySelector('#benchmarkDataStatus [data-retry-data]')").click();
  assert.match(status.textContent, /正在加载本标签的数据/);
  assert.deepEqual(app.scriptLoads, ["js/benchmark-data.js", "js/benchmark-data.js"]);
  app.finishDataLoads(); await settle();
  assert.equal(status.textContent, "");
  assert.ok(app.run("publicBenchmarkRows().length") > 0, "加载后应有公开榜单");
  assert.ok(app.run("dataRevision.benchmark") > revision, "数据到达后通知组件重新读取");
  assert.ok(app.run("benchmarkData().tasks.some((t) => t.id === 'cached-cost')"));
  assert.equal(app.run("benchmarkRuns().length"), 0);
  healthy(app);
});

test("评测数据下载超时后可重试；迟到的数据已就绪时重试不再重复下载", async () => {
  const app = createApp({ lazyData: true, url: "http://127.0.0.1:8123/#benchmarks" });
  assert.deepEqual(app.scriptLoads, ["js/benchmark-data.js"]);
  app.flushTimeouts(); await settle();
  assert.match(app.elements.get("benchmarkDataStatus").innerHTML, /数据下载超时，请重试/);
  /* 超时后浏览器仍可能执行已发出的脚本；它的 onload 已解绑。 */
  app.finishDataLoads(); await settle();
  assert.equal(app.run("optionalDataLoaded('benchmark')"), true);
  app.run("document.querySelector('#benchmarkDataStatus [data-retry-data]')").click();
  await settle();
  assert.deepEqual(app.scriptLoads, ["js/benchmark-data.js"]);
  assert.equal(app.elements.get("benchmarkDataStatus").textContent, "");
  assert.ok(app.run("benchmarkData().tasks.some((t) => t.id === 'cached-cost')"));
  healthy(app);
});

test("关注页按需加载维护数据，公开JSON下载先补齐两份数据", async () => {
  const id = "plan-0002";
  const app = createApp({ lazyData: true, url: "http://127.0.0.1:8123/#updates", storage: { "cp-followed-plans-v1": JSON.stringify({ planIds: [id], readChangeIds: [] }) } });
  assert.deepEqual(app.scriptLoads, ["js/maintenance-data.js"]);
  assert.equal(app.run("optionalDataLoaded('maintenance')"), false, "待加载时组件只显示待加载提示");
  const revision = app.run("dataRevision.maintenance");
  app.finishDataLoads(); await settle();
  assert.equal(app.elements.get("maintenanceDataStatus").textContent, "");
  assert.ok(app.run("dataRevision.maintenance") > revision, "数据到达后通知组件重新读取");
  assert.match(app.run("maintenanceData().generatedAt"), /^\d{4}-\d{2}-\d{2}/);
  assert.equal(app.run("followedPlans().length"), 1);
  assert.equal(app.run("unreadFollowedChanges().length"), app.run("followedChanges().length"), "尚未标记已读");
  assert.deepEqual(plain(app.run("followState.planIds")), [id], "加载后清理关注状态不应丢掉有效套餐");
  app.run("downloadPublicData()");
  assert.match(app.run("maintenanceView.publicDataFeedback"), /正在加载完整公开数据/);
  assert.deepEqual(app.scriptLoads, ["js/maintenance-data.js", "js/benchmark-data.js"]);
  assert.equal(app.downloads.length, 0);
  app.finishDataLoads(); await settle();
  assert.equal(app.downloads.length, 1);
  const data = JSON.parse(await app.downloads[0].blob.text());
  assert.ok(data.maintenance.changes.length > 0 && data.benchmarks.tasks.length > 0);
  assert.match(app.run("maintenanceView.publicDataFeedback"), /已生成公开数据 JSON/);
  healthy(app);
});

test("展开完整权益里的历史时才加载，失败后重新展开可恢复，summary 节点与焦点保留", async () => {
  const app = createApp({ lazyData: true, failData: (_src, attempt) => attempt === 1 });
  app.run("showPlanDetails('plan-0002')");
  const details = app.run("document.querySelector('#planDetailsBody [data-plan-history]')");
  const summary = details.querySelector("summary");
  assert.equal(summary.textContent, "已确认价格与权益历史");
  assert.deepEqual(app.scriptLoads, []);
  summary.focus(); details.open = true; app.fire(details, "toggle");
  assert.deepEqual(app.scriptLoads, ["js/maintenance-data.js"]);
  assert.match(details.querySelector(".plan-history-body").innerHTML, /正在加载历史数据/);
  app.finishDataLoads(); await settle();
  assert.match(details.querySelector(".plan-history-body").innerHTML, /加载失败，请关闭后重新展开/);
  details.open = false; app.fire(details, "toggle");
  details.open = true; app.fire(details, "toggle");
  assert.deepEqual(app.scriptLoads, ["js/maintenance-data.js", "js/maintenance-data.js"]);
  app.finishDataLoads(); await settle();
  assert.equal(details.querySelector("summary"), summary);
  assert.match(summary.textContent, /^已确认价格与权益历史（\d+ 条）$/);
  assert.equal(app.run("document.activeElement"), summary);
  assert.doesNotMatch(details.querySelector(".plan-history-body").innerHTML, /正在加载|加载失败/);
  healthy(app);
});

test("公开图表条数不改变表格和CSV，两个DeepSWE版本独立排名", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/#benchmarks" });
  const count = app.run("publicBenchmarkRows().length");
  assert.equal(app.run("publicBenchmarkChartRows().length"), 20);
  app.run("publicBenchmarkChartState.limit='10'");
  assert.equal(app.run("publicBenchmarkChartRows().length"), 10);
  assert.equal(app.run("publicBenchmarkRows().length"), count);
  assert.equal(app.run("publicBenchmarkCsv().split('\\r\\n').length"), count + 1);
  app.run("publicBenchmarkState.id='deepswe-v1'; publicBenchmarkChartState.limit='all'");
  assert.equal(app.run("publicBenchmarkChartRows().length"), app.run("publicBenchmarkRows().length"));
  assert.ok(app.run("publicBenchmarkRows().every(r=>r.benchmarkId === 'deepswe-v1')"));
  assert.equal(app.run("selectedPublicBenchmark().id"), "deepswe-v1");
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0159')).some(r=>r.protocol.id==='deepswe-v1-1')"));
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0002')).some(r=>r.protocol.id==='deepswe-v1')"));
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0164')).some(r=>r.protocol.id==='deepswe-v1' && publicModelDisplayName(r.row.model)==='MiniMax-M3')"));
  healthy(app);
});

test("排名系列按模型族稳定取色，不把同系列配置染成不同颜色", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/#benchmarks" });
  app.run("getComputedStyle=()=>({getPropertyValue:key=>key})");
  const colors = plain(app.run("publicChartColors()"));
  assert.equal(colors.glm, "--bench-glm");
  assert.ok(new Set(plain(app.run("publicBenchmarkChartRows().map(r=>publicChartFamily(r.model).id)"))).size > 3);
  assert.equal(app.run("publicChartFamily('Claude-Opus-5.5').id"), "claude");
  assert.equal(app.run("publicChartFamily('Opus 5').id"), "claude");
  assert.equal(app.run("publicChartFamily('Composer 2').id"), "composer");
  assert.equal(app.run("publicChartFamily('Unknown model').id"), "other");
  assert.equal(app.run("publicChartAxisName('#14 DeepSeek-V4-Pro', true)"), "#14 DeepSeek\nV4-Pro");
  assert.equal(app.run("publicChartAxisName('#12 Gemini-3.7 Flash · high', true)"), "#12 Gemini-3.7\nFlash");
  healthy(app);
});

test("推荐的评测证据只关联当前任务角色，缺少该角色成绩不借用日常模型", () => {
  const app = createApp();
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0002')).some(r=>publicModelDisplayName(r.row.model)==='Claude Haiku 4.5')"));
  assert.equal(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0002'), MODEL_ROLES.find(r=>r.id==='claude-opus')).some(r=>/Haiku/i.test(r.row.model))"), false);
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0159'), MODEL_ROLES.find(r=>r.id==='glm-5')).every(r=>/GLM/i.test(r.row.model))"));
  healthy(app);
});

main();
