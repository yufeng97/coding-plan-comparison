#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("维护快照、真实变更与贡献者任务规范能完整启动", () => {
  const app = createApp();
  assert.match(app.elements.get("maintenanceSummary").innerHTML, /维护快照/);
  assert.match(app.elements.get("benchmarkResults").innerHTML, /尚未收录贡献者任务记录/);
  assert.match(app.elements.get("benchmarkTasks").innerHTML, /cached-cost/);
  assert.match(app.elements.get("benchmarkMethodology").textContent, /同一解答/);
  assert.match(app.elements.get("contributionProjectNote").textContent, /项目 Issues/);
  assert.equal(app.elements.get("contributionIssueLink").hidden, false);
  assert.match(app.elements.get("contributionIssueLink").getAttribute("href"), /^https:\/\/github.com\/yufeng97\/coding-plan-comparison\/issues\/new\?/);
  const issue = new URL(app.elements.get("contributionIssueLink").getAttribute("href"));
  assert.equal(issue.searchParams.get("body"), app.elements.get("contributionTemplate").value);
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
  next.elements.get("markFollowReadBtn").click();
  assert.equal(next.run("unreadFollowedChanges().length"), 0);
  assert.equal(next.run("followedChanges().length"), total);
  assert.ok(next.run("followState.readChangeIds.every(id => id.startsWith('change-'))"));
  assert.equal(next.elements.get("markFollowReadBtn").disabled, true);
  next.run(`maintenancePlanId = ${JSON.stringify(id)}; renderMaintenanceHistory()`);
  assert.match(next.elements.get("maintenanceHistory").innerHTML, /→/);
  assert.match(next.elements.get("maintenanceHistory").innerHTML, /官方证据/);
  healthy(app); healthy(next);
});

test("关注存储拒绝时仍能本页操作且明确不会跨访问保留", () => {
  const app = createApp({ storageGetterThrows: true });
  const id = app.run("PLANS[0].id");
  assert.equal(app.run(`toggleFollowPlan(${JSON.stringify(id)})`), true);
  assert.match(app.elements.get("followFeedback").textContent, /关闭后不会保留/);
  assert.match(app.elements.get("followStorageNote").textContent, /不可用/);
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

test("历史面板关注后保留原按钮焦点，列表取消关注后的焦点有可见去处", () => {
  const app = createApp({url:"http://127.0.0.1:8123/#updates"});
  app.run("maintenancePlanId = PLANS[0].id; renderMaintenanceHistory(); document.querySelector('#maintenanceHistory [data-watch-plan]').focus()");
  const original = app.run("document.activeElement");
  app.run("toggleFollowPlan(PLANS[0].id)");
  assert.equal(app.run("document.activeElement"), original);
  app.run("document.querySelector('#followedPlans [data-watch-plan]').focus(); toggleFollowPlan(PLANS[0].id)");
  assert.equal(app.run("document.activeElement.id"), "maintenancePlan");
  healthy(app);
});

test("实测记录区分API账单、生成时间和验收次数，未知费用不补零", () => {
  const app = createApp();
  const record = { id: "example", taskId: "csv-export", model: "Example <model>", tool: "Example", measuredAt: "2026-10-08", cost: null, currency: "USD", costBasis: "included-subscription", durationSeconds: 0.1, generationSeconds: 30, passed: true, repeats: 3, evidence: "https://example.com/evidence", environment: "Node 20" };
  const html = app.run(`benchmarkRunHtml(${JSON.stringify(record)})`);
  assert.match(html, /订阅内使用，未分摊单次费用/);
  assert.match(html, /生成时间<\/dt><dd>30 秒/);
  assert.match(html, /平均验收运行时间<\/dt><dd>0.1 秒/);
  assert.match(html, /同一解答验收次数<\/dt><dd>3/);
  assert.match(html, /复现证据/);
  assert.doesNotMatch(html, /官方证据|Example <model>/);
  const unsafe = app.run(`benchmarkRunHtml(${JSON.stringify({ ...record, evidence: "javascript:alert(1)", costBasis: "unknown" })})`);
  assert.doesNotMatch(unsafe, /javascript:/);
  assert.match(unsafe, /费用未记录/);
  healthy(app);
});

test("无仓库时贡献模板仅复制或本地下载，测评模板保留真实口径", async () => {
  const app = createApp();
  const type = app.elements.get("contributionType"); type.value = "benchmark";
  app.fire(type, "change");
  const template = app.elements.get("contributionTemplate").value;
  assert.match(template, /cost=null/);
  assert.match(template, /durationSeconds 不能作为模型生成时间/);
  await app.run("copyContributionTemplate()");
  assert.match(app.elements.get("contributionFeedback").textContent, /已复制/);
  app.elements.get("downloadContributionBtn").click();
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].filename, /benchmark-evidence\.md$/);
  assert.equal(await app.downloads[0].blob.text(), template);
  healthy(app);
});

test("公开JSON按稳定结构导出且不包含本机关注已读和待审资料", async () => {
  const app = createApp();
  app.run("toggleFollowPlan(PLANS[0].id)");
  app.elements.get("downloadPublicDataBtn").click();
  const data = JSON.parse(await app.downloads[0].blob.text());
  assert.deepEqual(Object.keys(data), ["schemaVersion", "meta", "plans", "apiPrices", "paygReferences", "priceChecks", "maintenance", "benchmarks"]);
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.plans.length > 0 && data.maintenance.changes.length > 0);
  assert.equal(data.benchmarks.runs.length, 0);
  assert.ok(!("followState" in data) && !("readChangeIds" in data) && !("candidates" in data));
  assert.match(app.elements.get("publicDataFeedback").textContent, /不含本机关注/);
  healthy(app);
});

function fixturePublicBenchmarks(app) {
  const protocol = { id: "deepswe-1-1", family: "DeepSWE", name: "Fixture DeepSWE", version: "1.1", category: "coding", metric: "任务通过率", unit: "%", description: "仅测试fixture", configuration: "固定测试配置", scope: "10项fixture", sourceUrl: "https://example.com/protocol", sourceUpdatedAt: null, checkedAt: "2026-10-10" };
  const score = { id: "fixture-a", benchmarkId: protocol.id, model: "Fixture Model A", reasoning: "high", agent: "fixture-agent", score: 80, costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: "https://example.com/scores", checkedAt: "2026-10-10" };
  const data = { schemaVersion: 1, checkedAt: "2026-10-10", benchmarks: [protocol, { ...protocol, id: "hle-fixture", family: "HLE", name: "Fixture HLE", version: "no-tools", scope: "20项fixture" }], scores: [score, { ...score, id: "fixture-b", model: "Fixture Model B", score: 80, costUSD: 0 }, { ...score, id: "fixture-c", model: "Fixture Model C", score: 60, reasoning: null, agent: null, tokens: 100, steps: 0 }, { ...score, id: "fixture-hle", benchmarkId: "hle-fixture", model: "Fixture Other Protocol", score: 99 }] };
  app.run(`BENCHMARKS.public = ${JSON.stringify(data)}; publicBenchmarkState = {id:'deepswe-1-1',search:''}; renderPublicBenchmarks();`);
  return data;
}

test("公开榜单仅在协议内排名，并列和模型搜索保留原始名次", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r=>r.rank)")), [1, 1, 3]);
  app.run("publicBenchmarkState.search = 'Model C'; renderPublicBenchmarks()");
  assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r=>[r.model,r.rank])")), [["Fixture Model C", 3]]);
  assert.equal(app.elements.get("publicModelClearBtn").disabled, false);
  assert.doesNotMatch(app.elements.get("publicBenchmarkBody").innerHTML, /Other Protocol/);
  app.run("publicBenchmarkState.family='HLE'; publicBenchmarkState.id='hle-fixture'; publicBenchmarkState.search=''; renderPublicBenchmarks()");
  assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r=>r.model)")), ["Fixture Other Protocol"]);
  assert.match(app.elements.get("publicBenchmarkMeta").innerHTML, /no-tools|20项fixture/);
  healthy(app);
});

test("公开评测null成本显示未公布，真实零成本及步骤保留且模型文案转义", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  let html = app.elements.get("publicBenchmarkBody").innerHTML;
  assert.match(html, /未公布/); assert.match(html, /\$0/); assert.match(html, /Steps：0/);
  app.run("BENCHMARKS.public.scores[0].model='<script>fixture</script>'; BENCHMARKS.public.scores[0].sourceUrl='javascript:alert(1)'; renderPublicBenchmarks()");
  html = app.elements.get("publicBenchmarkBody").innerHTML;
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|javascript:/);
  healthy(app);
});

test("每模型最佳配置默认取协议内最高分，全部模式保留不同推理配置", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  app.run("BENCHMARKS.public.scores.push({...BENCHMARKS.public.scores[0],id:'fixture-a-low',reasoning:'low',score:70,costUSD:0.1}); renderPublicBenchmarks()");
  assert.equal(app.run("publicBenchmarkRows().length"), 3);
  assert.equal(app.run("publicBenchmarkRows().find(r=>r.model==='Fixture Model A').reasoning"), "high");
  const mode = app.elements.get("publicBenchmarkMode"); mode.value = "all"; app.fire(mode, "change");
  assert.equal(app.run("publicBenchmarkRows().length"), 4);
  assert.deepEqual(plain(app.run("publicBenchmarkRows().filter(r=>r.model==='Fixture Model A').map(r=>r.reasoning)")), ["high", "low"]);
  assert.match(app.elements.get("publicBenchmarkCount").textContent, /全部已公布配置/);
  healthy(app);
});

test("用途选择只列同类协议，HLE和OSWorld默认公开当前配置而非历史表", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  app.run(`BENCHMARKS.public.benchmarks.push({...BENCHMARKS.public.benchmarks[1],id:'hle-diamond-2026-high-closed-book-multimodal',name:'Fixture Diamond'}, {...BENCHMARKS.public.benchmarks[1],id:'osworld-2-25443e96866dc9ce',family:'OSWorld',name:'Fixture OS2 current'}); syncPublicBenchmarkChoices();`);
  const family = app.elements.get("publicBenchmarkFamily"); family.value = "HLE"; app.fire(family, "change");
  assert.equal(app.run("publicBenchmarkState.id"), "hle-diamond-2026-high-closed-book-multimodal");
  assert.doesNotMatch(app.elements.get("publicBenchmarkSelect").innerHTML, /deepswe/);
  family.value = "OSWorld"; app.fire(family, "change");
  assert.equal(app.run("publicBenchmarkState.id"), "osworld-2-25443e96866dc9ce");
  assert.match(app.elements.get("publicBenchmarkMeta").innerHTML, /Fixture OS2 current/);
  healthy(app);
});

test("公开模型搜索空态可清除，下载按钮状态与结果一致且焦点返回搜索", () => {
  const app = createApp({url:"http://127.0.0.1:8123/#benchmarks"}); fixturePublicBenchmarks(app);
  const input = app.elements.get("publicModelSearch"); input.value = "missing fixture model";
  app.fire(input, "input");
  /* 搜索输入防抖：停顿后才重绘，连续输入不逐键重算套餐映射。 */
  assert.equal(app.elements.get("publicBenchmarkWrap").hidden, false);
  app.flushTimeouts();
  assert.equal(app.elements.get("publicBenchmarkWrap").hidden, true);
  assert.equal(app.elements.get("publicBenchmarkEmpty").hidden, false);
  assert.equal(app.elements.get("downloadPublicBenchmarkCsvBtn").disabled, true);
  app.elements.get("publicModelClearBtn").click();
  assert.equal(app.elements.get("publicBenchmarkWrap").hidden, false);
  assert.equal(app.elements.get("downloadPublicBenchmarkCsvBtn").disabled, false);
  assert.equal(app.run("document.activeElement.id"), "publicModelSearch");
  healthy(app);
});

test("评测CSV保留独立协议、配置与缺失成本，JSON仅导出公共榜单", async () => {
  const app = createApp(); const data = fixturePublicBenchmarks(app);
  app.run("publicBenchmarkState.search='Model A'; renderPublicBenchmarks(); downloadPublicBenchmarkCsv(); downloadPublicBenchmarkJson()");
  const csv = Buffer.from(await app.downloads[0].blob.arrayBuffer()).toString("utf8");
  assert.ok(csv.startsWith("\uFEFF")); assert.match(csv, /官方评测每任务成本 USD/);
  assert.match(csv, /deepswe-1-1/); assert.match(csv, /固定测试配置/);
  assert.match(csv, /"80","%","",""/); assert.doesNotMatch(csv, /Other Protocol/);
  assert.deepEqual(JSON.parse(await app.downloads[1].blob.text()), data);
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

test("切换辅助标签后贡献者任务控件与筛选结果保持一致", () => {
  const app = createApp();
  app.run("benchmarkFilter.task='csv-export'; refreshOptionalViews('benchmark');");
  assert.equal(app.elements.get("benchmarkTask").value, "csv-export");
  assert.equal((app.elements.get("benchmarkTasks").innerHTML.match(/<details/g) || []).length, 1);
  app.run("benchmarkFilter.tool='unknown-tool'; benchmarkFilter.model='unknown-model'; refreshBenchmarkTaskChoices();");
  assert.equal(app.run("benchmarkFilter.tool"), "all");
  assert.equal(app.elements.get("benchmarkTool").value, "all");
  assert.equal(app.elements.get("benchmarkModel").value, "all");
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
  assert.match(app.run("publicModelPlansHtml('claude-opus-5')"), /同系列较新的 Opus 5\.5/);
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
  /* 未就绪时不下「没有记录」类结论。 */
  assert.match(app.elements.get("publicBenchmarkMeta").innerHTML, /将在数据加载后显示/);
  assert.equal(app.elements.get("publicBenchmarkEmpty").hidden, true);
  assert.equal(app.elements.get("publicBenchmarkCount").textContent, "");
  assert.doesNotMatch(app.elements.get("benchmarkResults").innerHTML, /尚未收录/);
  app.finishDataLoads(); await settle();
  assert.match(status.innerHTML, /数据文件下载失败/);
  assert.equal(app.run("optionalDataLoaded('benchmark')"), false);
  app.run("document.querySelector('#benchmarkDataStatus [data-retry-data]')").click();
  assert.match(status.textContent, /正在加载本标签的数据/);
  assert.deepEqual(app.scriptLoads, ["js/benchmark-data.js", "js/benchmark-data.js"]);
  app.finishDataLoads(); await settle();
  assert.equal(status.textContent, "");
  assert.ok(app.run("publicBenchmarkRows().length") > 0, "加载后应有公开榜单");
  assert.equal(app.elements.get("publicBenchmarkWrap").hidden, false);
  assert.match(app.elements.get("benchmarkTasks").innerHTML, /cached-cost/);
  assert.match(app.elements.get("benchmarkResults").innerHTML, /尚未收录贡献者任务记录/);
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
  assert.match(app.elements.get("benchmarkTasks").innerHTML, /cached-cost/);
  healthy(app);
});

test("超时后在旧请求返回前重试，迟到脚本与重试脚本都执行也不报重复声明", async () => {
  for (const [hash, kind, file] of [["#updates", "maintenance", "js/maintenance-data.js"], ["#benchmarks", "benchmark", "js/benchmark-data.js"]]) {
    const app = createApp({ lazyData: true, url: "http://127.0.0.1:8123/" + hash });
    const status = app.elements.get(kind + "DataStatus");
    assert.deepEqual(app.scriptLoads, [file]);
    app.flushTimeouts(); await settle();
    assert.match(status.innerHTML, /数据下载超时，请重试/);
    app.run(`document.querySelector('#${kind}DataStatus [data-retry-data]')`).click();
    assert.deepEqual(app.scriptLoads, [file, file], "卡住的旧请求不能阻止重试发出新请求");
    /* 浏览器里已发出的旧脚本仍会执行；两份都执行时只覆盖同一份数据。 */
    app.finishDataLoads(); await settle();
    assert.equal(app.run(`optionalDataLoaded('${kind}')`), true);
    assert.equal(status.textContent, "");
    healthy(app);
  }
});

test("关注页按需加载维护数据，公开JSON下载先补齐两份数据", async () => {
  const id = "plan-0002";
  const app = createApp({ lazyData: true, url: "http://127.0.0.1:8123/#updates", storage: { "cp-followed-plans-v1": JSON.stringify({ planIds: [id], readChangeIds: [] }) } });
  assert.deepEqual(app.scriptLoads, ["js/maintenance-data.js"]);
  assert.match(app.elements.get("maintenanceSummary").innerHTML, /将在数据加载后显示/);
  assert.match(app.elements.get("maintenanceReviews").innerHTML, /将在数据加载后显示/);
  assert.match(app.elements.get("followedChanges").innerHTML, /将在数据加载后显示/);
  assert.equal(app.elements.get("followUnreadCount").textContent, "1 档关注");
  app.finishDataLoads(); await settle();
  assert.equal(app.elements.get("maintenanceDataStatus").textContent, "");
  assert.match(app.elements.get("maintenanceSummary").innerHTML, /维护快照 \d{4}-\d{2}-\d{2}/);
  assert.match(app.elements.get("followUnreadCount").textContent, /^1 档关注 · \d+ 条未读变更$/);
  assert.deepEqual(plain(app.run("followState.planIds")), [id], "加载后清理关注状态不应丢掉有效套餐");
  app.elements.get("downloadPublicDataBtn").click();
  assert.match(app.elements.get("publicDataFeedback").textContent, /正在加载完整公开数据/);
  assert.deepEqual(app.scriptLoads, ["js/maintenance-data.js", "js/benchmark-data.js"]);
  assert.equal(app.downloads.length, 0);
  app.finishDataLoads(); await settle();
  assert.equal(app.downloads.length, 1);
  const data = JSON.parse(await app.downloads[0].blob.text());
  assert.ok(data.maintenance.changes.length > 0 && data.benchmarks.tasks.length > 0);
  assert.match(app.elements.get("publicDataFeedback").textContent, /已生成公开数据 JSON/);
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

test("关注页选中套餐后展开历史，数据迟到也不重建面板或丢焦点", async () => {
  const app = createApp({ lazyData: true, url: "http://127.0.0.1:8123/#updates", failData: (_src, attempt) => attempt === 1 });
  app.finishDataLoads(); await settle();
  assert.match(app.elements.get("maintenanceDataStatus").innerHTML, /数据文件下载失败/);
  const select = app.elements.get("maintenancePlan"); select.value = "plan-0002"; app.fire(select, "change");
  assert.match(app.elements.get("maintenanceHistory").innerHTML, /将在数据加载后显示/);
  const details = app.run("document.querySelector('#maintenanceHistory [data-plan-history]')");
  const summary = details.querySelector("summary");
  summary.focus(); details.open = true; app.fire(details, "toggle");
  app.finishDataLoads(); await settle();
  assert.equal(app.run("document.querySelector('#maintenanceHistory [data-plan-history]')"), details);
  assert.equal(details.open, true);
  assert.equal(app.run("document.activeElement"), summary);
  assert.match(summary.textContent, /（\d+ 条）$/);
  assert.match(app.run("document.querySelector('#maintenanceHistory .maintenance-plan-status').innerHTML"), /^核查 \d{4}-\d{2}-\d{2}/);
  healthy(app);
});

test("公开排名图保留协议原名次，成本缺值跳过且合法零成本保留", () => {
  const app = createApp(); fixturePublicBenchmarks(app);
  app.run("activatePageForTarget(byId('benchmarks')); renderPublicBenchmarks()");
  const chart = () => app.charts.get("chartPublicBenchmark").option;
  assert.deepEqual(plain(chart().series[0].data), [80, 80, 60]);
  assert.match(chart().yAxis.data[2], /^#3 Fixture Model C/);
  assert.equal(chart().xAxis.max, 100);
  app.run("publicBenchmarkChartState.metric = 'cost'; renderPublicBenchmarkChart()");
  assert.deepEqual(plain(chart().series[0].data), [0]);
  assert.match(chart().yAxis.data[0], /^#1 Fixture Model B/);
  assert.equal(chart().xAxis.max, undefined);
  assert.match(app.elements.get("publicBenchmarkChartNote").textContent, /1 \/ 3/);
  app.run("publicBenchmarkState.search='Model C'; renderPublicBenchmarks()");
  assert.equal(app.run("publicBenchmarkChartState.metric"), "score");
  assert.deepEqual(plain(chart().series[0].data), [60]);
  assert.match(chart().yAxis.data[0], /^#3 /);
  app.run("publicBenchmarkState.search='__no_match__'; renderPublicBenchmarks()");
  assert.equal(app.elements.get("publicBenchmarkChartWrap").hidden, true);
  healthy(app);
});

test("公开图表条数不改变表格和CSV，两个DeepSWE版本独立排名", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/#benchmarks" });
  app.run("renderPublicBenchmarks()");
  const chart = () => app.charts.get("chartPublicBenchmark").option;
  assert.equal(chart().series[0].data.length, 20);
  const count = app.run("publicBenchmarkRows().length");
  app.run("publicBenchmarkChartState.limit='10'; renderPublicBenchmarkChart()");
  assert.equal(chart().series[0].data.length, 10);
  assert.equal(app.run("publicBenchmarkRows().length"), count);
  assert.equal(app.run("publicBenchmarkCsv().split('\\r\\n').length"), count + 1);
  app.run("publicBenchmarkState.id='deepswe-v1'; publicBenchmarkChartState.limit='all'; renderPublicBenchmarks()");
  assert.equal(chart().series[0].data.length, app.run("publicBenchmarkRows().length"));
  assert.ok(app.run("publicBenchmarkRows().every(r=>r.benchmarkId === 'deepswe-v1')"));
  assert.match(app.elements.get("publicBenchmarkMeta").innerHTML, /DeepSWE v1/);
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0159')).some(r=>r.protocol.id==='deepswe-v1-1')"));
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0002')).some(r=>r.protocol.id==='deepswe-v1')"));
  assert.ok(app.run("planCodingBenchmarks(PLANS.find(p=>p.id==='plan-0164')).some(r=>r.protocol.id==='deepswe-v1' && publicModelDisplayName(r.row.model)==='MiniMax-M3')"));
  healthy(app);
});

test("排名系列颜色稳定且图例随搜索更新，不把同系列配置染成不同颜色", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/#benchmarks" });
  app.run("getComputedStyle=()=>({getPropertyValue:key=>key}); renderPublicBenchmarks()");
  const chart = () => app.charts.get("chartPublicBenchmark").option;
  const models = plain(app.run("publicBenchmarkChartRows().map(r=>r.model)"));
  const colors = models.map((_model, i) => chart().series[0].itemStyle.color({dataIndex: i}));
  assert.ok(new Set(colors).size > 3);
  models.forEach((model, i) => assert.equal(colors[i], app.run("'--bench-'+publicChartFamily(" + JSON.stringify(model) + ").id")));
  assert.equal(app.run("publicChartFamily('Claude-Opus-5.5').id"), "claude");
  assert.equal(app.run("publicChartFamily('Opus 5').id"), "claude");
  assert.equal(app.run("publicChartFamily('Composer 2').id"), "composer");
  assert.equal(app.run("publicChartFamily('Unknown model').id"), "other");
  assert.equal(app.run("publicChartAxisName('#14 DeepSeek-V4-Pro', true)"), "#14 DeepSeek\nV4-Pro");
  assert.equal(app.run("publicChartAxisName('#12 Gemini-3.7 Flash · high', true)"), "#12 Gemini-3.7\nFlash");
  app.run("publicBenchmarkState.search='GLM'; renderPublicBenchmarks()");
  assert.match(app.elements.get("publicBenchmarkChartLegend").innerHTML, /GLM/);
  assert.doesNotMatch(app.elements.get("publicBenchmarkChartLegend").innerHTML, /Claude/);
  assert.equal(chart().series[0].itemStyle.color({dataIndex: 0}), "--bench-glm");
  app.run("publicBenchmarkChartState.metric='cost'; renderPublicBenchmarkChart()");
  assert.equal(app.elements.get("publicBenchmarkChartLegend").hidden, true);
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
