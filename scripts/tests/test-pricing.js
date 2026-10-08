#!/usr/bin/env node
/* 官方核价元数据与原币价格回归：真实页面脚本，隔离内存状态，不访问网络。 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createApp, healthy, test, main } = require("./app-harness");

const inventory = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../audit/pricing-inventory.json"), "utf8"));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("258 条核价记录完整对应计划、API 与 PAYG，日期和官方来源可追溯", () => {
  const app = createApp();
  const rows = JSON.parse(app.run(`JSON.stringify([
    ...PLANS.map(p => ({ key: 'plan:' + p.id, check: priceCheckOf(p) })),
    ...API_PRICES.map(p => ({ key: 'api:' + p.vendor + '|' + p.model, check: priceCheckOf(p, 'api') })),
    ...PAYG_REFERENCES.map(p => ({ key: 'payg:' + p.vendor + '|' + p.model, check: priceCheckOf(p, 'payg') }))
  ])`));
  assert.equal(rows.length, 258, "现行库存应逐条核查，不能以厂商级状态代替套餐级记录");
  assert.equal(new Set(rows.map(r => r.key)).size, rows.length);
  assert.equal(app.run("Object.keys(PRICE_CHECKS.rows).length"), rows.length, "不能遗漏或残留其他产品的核价记录");
  for (const { key, check } of rows) {
    assert.ok(check, key + " 缺少核价记录");
    assert.ok(["verified", "changed", "unverified", "retired", "custom"].includes(check.status), key + " 状态非法");
    assert.equal(check.checkedAt, "2026-10-04", key + " 核价日期不匹配");
    assert.ok(check.reason && check.reason.trim(), key + " 缺少证据说明");
    assert.ok(check.sourceIds.length, key + " 缺少来源");
  }
  const sources = JSON.parse(app.run("JSON.stringify(PRICE_CHECKS.sources)"));
  for (const { key, check } of rows) for (const id of check.sourceIds) {
    assert.ok(sources[id], key + " 引用未知来源 " + id);
    assert.match(sources[id].url, /^https?:\/\//, id + " 缺少可点击来源 URL");
    assert.ok(sources[id].evidence && sources[id].evidence.trim(), id + " 缺少证据释义");
  }
  assert.equal(app.run("PRICE_CHECKS.checkedAt"), "2026-10-04");
  healthy(app);
});

test("无法确认的历史套餐价格保留原值，稳定 ID 不受套餐更名影响", () => {
  const app = createApp();
  const historical = JSON.parse(app.run("JSON.stringify(PLANS.filter(p => priceCheckOf(p)?.status === 'unverified'))"));
  assert.ok(historical.length > 0);
  for (const p of historical) {
    const before = inventory.PLANS.find(old => old.id === p.id);
    assert.ok(before, p.id + " 没有历史库存锚点");
    assert.deepEqual({ priceM: p.priceM, priceY: p.priceY, cur: p.cur },
      { priceM: before.priceM, priceY: before.priceY, cur: before.cur }, p.id + " 待核价格不能猜测更新");
  }
  assert.equal(app.run(`(() => {
    const p = PLANS[0];
    return priceCheckOf({ ...p, plan: '仅测试更名' }) === priceCheckOf(p);
  })()`), true);
  healthy(app);
});

test("Cursor 印度套餐保留 ₹649 原价，人民币换算和跨币种排序正确", () => {
  const app = createApp();
  const original = JSON.parse(app.run("JSON.stringify(findPlanReference('plan-0097'))"));
  assert.equal(original.priceM, 649);
  assert.equal(original.cur, "INR");
  assert.equal(app.run("planPriceLabel(findPlanReference('plan-0097'))"), "₹649/月");
  near(app.run("RATE_INR_CNY"), 6.7074 / 95.74);
  near(app.run("cnyOf(findPlanReference('plan-0097'), 'M')"), 649 * 6.7074 / 95.74);
  assert.match(app.run("planMonthlyPriceCell(findPlanReference('plan-0097'))"), /₹649\/月.*≈¥45\.5\/月/s);
  assert.match(app.run("tableRowsCsv([findPlanReference('plan-0097')])"), /₹649\/月/);
  assert.match(app.run("tableRowsMarkdown([findPlanReference('plan-0097')])"), /₹649\/月/);
  const exports = JSON.parse(app.run(`JSON.stringify({
    csv: tableRowsCsv([findPlanReference('plan-0097')]), md: tableRowsMarkdown([findPlanReference('plan-0097')]),
    rate: RATE_INR_CNY, date: META.rateAsOf, source: META.rateSource
  })`));
  assert.match(exports.csv, /参考汇率（INR\/CNY）/);
  assert.match(exports.md, /1 INR ≈ [\d.]+ CNY/);
  for (const text of [exports.csv, exports.md]) {
    for (const value of [String(exports.rate), exports.date, exports.source]) {
      assert.ok(text.includes(value), "印度原价导出缺少汇率依据 " + value);
    }
  }
  app.run("Object.assign(personalState, { cat: 'all', region: 'all', q: '', limit: null, billing: 'M' }); renderPersonalChart();");
  assert.equal(app.run("chartCache.chartPersonal.option.series[0].data.find(d => d._p.id === 'plan-0097').value"), 45.5);
  assert.match(app.run("personalTooltip(findPlanReference('plan-0097'))"), /₹649/);
  app.run(`(() => {
    const p = { ...findPlanReference('plan-0097'), id: 'pricing-test-usd', vendor: '跨币种测试', plan: 'USD 8',
      purchaseCountries: [], priceM: 8, cur: 'USD' };
    PLANS.push(p);
    PRICE_CHECKS.rows['plan:' + p.id] = { status: 'verified', checkedAt: '2026-10-04', sourceIds: [], reason: '仅内存测试' };
    Object.assign(tableState, { search: '', cat: 'all', region: 'all', sortKey: 'priceM', sortDir: 1 });
  })()`);
  const order = JSON.parse(app.run("JSON.stringify(computeTableRows().filter(p => ['plan-0097', 'pricing-test-usd'].includes(p.id)).map(p => p.id))"));
  assert.deepEqual(order, ["plan-0097", "pricing-test-usd"], "不能按 649 与 8 的原始数字排序");
  assert.equal(app.run("recommendablePlan(findPlanReference('plan-0097'))"), false, "地区专属档仍不参与通用推荐");
  healthy(app);
});

test("待核每席位价格也退出团队图，历史金额保留在完整表", () => {
  const app = createApp();
  app.run(`(() => {
    const p = PLANS.find(p => p.seat && p.priceM > 0 && !isRetiredPlan(p));
    globalThis.pendingSeatPriceId = p.id;
    PRICE_CHECKS.rows['plan:' + p.id] = { ...priceCheckOf(p), status: 'unverified', reason: '席位价格本次待核' };
    renderTeamChart();
  })()`);
  assert.equal(app.run("chartCache.chartTeam.option.series[0].data.some(d => d._p.id === pendingSeatPriceId)"), false);
  assert.equal(app.run("computeTableRows().some(p => p.id === pendingSeatPriceId)"), true);
  healthy(app);
});

test("待核个人价格保留在完整表和导出，退出推荐与个人价格图", () => {
  const app = createApp();
  app.run(`(() => {
    const p = findPlanReference('plan-0098');
    PRICE_CHECKS.rows['plan:' + p.id] = { ...priceCheckOf(p), status: 'unverified', reason: '官网本次无法确认' };
    Object.assign(personalState, { cat: 'all', region: 'all', q: '', limit: null });
    Object.assign(pickerState, { region: 'all', budget: 'any', task: 'daily', tool: 'any' });
    tableState.search = 'Cursor Pro';
    renderPersonalChart(); renderTable();
  })()`);
  assert.equal(app.run("computeTableRows().includes(findPlanReference('plan-0098'))"), true);
  assert.equal(app.run("recommendablePlan(findPlanReference('plan-0098'))"), false);
  assert.equal(app.run("eligibleProfiles().some(x => x.p.id === 'plan-0098')"), false);
  assert.equal(app.run("chartCache.chartPersonal.option.series[0].data.some(x => x._p.id === 'plan-0098')"), false);
  assert.match(app.elements.get("tableBody").innerHTML, /历史价 · 待核实/);
  assert.match(app.elements.get("tableBody").innerHTML, /官网本次无法确认/);
  const search = app.elements.get("chartSearch");
  search.value = "Cursor Pro";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.match(app.elements.get("notePersonal").innerHTML, /价格待核实/);
  assert.ok(app.elements.get("showExcludedInTable"), "待核搜索应提供完整表入口");
  app.fire(app.elements.get("showExcludedInTable"), "click");
  assert.equal(app.run("computeTableRows().some(p => p.id === 'plan-0098')"), true);
  const data = JSON.parse(app.run(`(() => {
    const p = findPlanReference('plan-0098');
    return JSON.stringify({ csv: tableRowsCsv([p]), md: tableRowsMarkdown([p]), price: planPriceLabel(p), urls: priceCheckSources(p) });
  })()`));
  assert.ok(data.urls.length > 0);
  for (const text of [data.csv, data.md]) {
    for (const value of [data.price, "历史价 · 待核实", "2026-10-04", "价格核查来源", "官网本次无法确认", ...data.urls]) assert.ok(text.includes(value), "导出缺少 " + value);
  }
  healthy(app);
});

test("待核官方和推算额度退出周 tokens、成本排行和默认额度表；历史范围保留核查说明", () => {
  const app = createApp();
  app.run(`(() => {
    for (const id of ['plan-0031', 'plan-0002']) {
      const p = findPlanReference(id);
      PRICE_CHECKS.rows['plan:' + id] = { ...priceCheckOf(p), status: 'unverified', reason: '仅内存模拟官网不可达' };
    }
    Object.assign(rankState, { scope: 'all', tier: 'all' });
    renderTokensChart(); renderRankChart(); renderMetricsTable();
  })()`);
  assert.equal(app.run("chartCache.chartTokens.option.series.flatMap(s => s.data).filter(Boolean).some(d => /Z\\.ai Lite|Anthropic Claude Pro/.test(d._r.label))"), false);
  assert.equal(app.run("chartCache.chartRank.option.series[0].data.some(d => ['plan-0031', 'plan-0002'].includes(findPlanReference(d._r.m.ref)?.id))"), false);
  assert.equal(app.run("metricsTableRows().rows.some(r => ['plan-0031', 'plan-0002'].includes(findPlanReference(r.m.ref)?.id))"), false);
  app.run('metricsState.offer = "all"; metricsState.model = METRICS_ALL.find(m => findPlanReference(m.ref)?.id === "plan-0002").model; renderMetricsTable();');
  assert.match(app.elements.get("metricsBody").innerHTML, /历史价折算 · 价格待核/);
  healthy(app);
});

test("待核 API 牌价保留在带日期来源明细，退出价格和购买力图", () => {
  const app = createApp();
  app.run(`(() => {
    const p = API_PRICES[0];
    globalThis.pendingPricingApi = { vendor: p.vendor, model: p.model };
    PRICE_CHECKS.rows['api:' + p.vendor + '|' + p.model] = { ...priceCheckOf(p, 'api'), status: 'unverified', reason: '仅内存模拟 API 未确认' };
    renderApiChart();
  })()`);
  const expected = JSON.parse(app.run("JSON.stringify(pendingPricingApi)"));
  assert.equal(app.run(`chartCache.chartPower.option.series.flatMap(s => s.data).filter(Boolean).some(d => d.a.vendor === pendingPricingApi.vendor && d.a.model === pendingPricingApi.model)`), false);
  assert.equal(app.run("chartCache.chartApi.option.series[0].data.length"), app.run("API_PRICES.filter(a => isPriceConfirmed(a, 'api')).length"));
  const html = app.elements.get("apiDetailBody").innerHTML;
  assert.ok(html.includes(expected.vendor));
  assert.match(html, /历史价 · 待核实.*2026-10-04/s);
  const urls = JSON.parse(app.run("JSON.stringify(priceCheckSources(API_PRICES[0], 'api'))"));
  for (const url of urls) assert.ok(html.includes(url));
  healthy(app);
});

test("待核 PAYG 映射沿用 vendor/model，额度表按历史牌价降低置信", () => {
  const app = createApp();
  app.run(`(() => {
    const p = PAYG_REFERENCES[0];
    PRICE_CHECKS.rows['payg:' + p.vendor + '|' + p.model] = { ...priceCheckOf(p, 'payg'), status: 'unverified', reason: '仅内存模拟 PAYG 未确认' };
    Object.assign(metricsState, { tier: "all", offer: "all", model: p.model });
    renderMetricsTable();
  })()`);
  assert.equal(app.run("isPriceConfirmed(paygReferenceRows()[0].m, 'payg')"), false);
  assert.match(app.elements.get("metricsBody").innerHTML, /历史牌价 · 待核实/);
  healthy(app);
});

test("免费入口也排除待核状态，对比不将历史价格突出为最低价", () => {
  const app = createApp();
  app.run(`(() => {
    const free = findPlanReference('plan-0096');
    const paid = findPlanReference('plan-0098');
    PRICE_CHECKS.rows['plan:' + free.id] = { ...priceCheckOf(free), status: 'unverified', reason: '免费发放政策待核' };
    PRICE_CHECKS.rows['plan:' + paid.id] = { ...priceCheckOf(paid), status: 'unverified', reason: '历史月价待核' };
    renderFree();
    cmpState.items = [paid, findPlanReference('plan-0099')]; renderCmpModal();
  })()`);
  assert.equal(app.run("isFreeCodingEntry(findPlanReference('plan-0096'))"), false);
  assert.doesNotMatch(app.elements.get("freeGrid").innerHTML, /<span class="fc-vendor">Cursor<\/span>/,
    "历史零价格不能当作当前免费可用入口推荐，其他厂商同名 Hobby 不受影响");
  assert.doesNotMatch(app.elements.get("cmpTable").innerHTML, /cmp-best-price|同周期最低价/, "历史价与现价不能生成最低价推荐");
  assert.match(app.elements.get("cmpTable").innerHTML, /历史价 · 待核实.*2026-10-04/s);
  healthy(app);
});

test("Kiro 个人每用户订阅保持个人月付与推荐资格", () => {
  const app = createApp();
  for (const id of ["plan-0075", "plan-0076", "plan-0077", "plan-0078"]) {
    assert.equal(app.run(`findPlanReference('${id}').seat`), false);
    assert.equal(app.run(`isPersonalMonthly(findPlanReference('${id}'))`), true);
    assert.equal(app.run(`recommendablePlan(findPlanReference('${id}'))`), true);
  }
  healthy(app);
});

main();
