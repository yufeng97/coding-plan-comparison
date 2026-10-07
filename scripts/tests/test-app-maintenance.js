#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("维护快照、真实变更与无实测记录的任务规范能完整启动", () => {
  const app = createApp();
  assert.match(app.elements.get("maintenanceSummary").innerHTML, /维护快照/);
  assert.match(app.elements.get("benchmarkResults").innerHTML, /尚未公布真实模型测评结果/);
  assert.match(app.elements.get("benchmarkTasks").innerHTML, /cached-cost/);
  assert.match(app.elements.get("benchmarkMethodology").textContent, /同一解答/);
  assert.match(app.elements.get("contributionProjectNote").textContent, /未配置公开仓库/);
  assert.equal(app.elements.get("contributionIssueLink").hidden, true);
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
  assert.equal(app.run("document.querySelector('#quickGrid .qc-actions').children.length"), 3);
  assert.match(app.elements.get("quickGrid").innerHTML, /重置窗口|公开窗口/);
  healthy(app);
});

test("历史面板关注后保留原按钮焦点，列表取消关注后的焦点有可见去处", () => {
  const app = createApp();
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

main();
