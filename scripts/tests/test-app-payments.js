"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createApp, healthy, test, main } = require("./app-harness");
const { validateData } = require("../build/validate-data");
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("每个新增自动续费金额均来自对应官方证据，原目录价和核查日期保留", () => {
  const app = createApp();
  const kimi = { id:"cn-kimi-member", url:"https://www.kimi.com/membership/pricing", evidence:/连续包月99\/199\/699元/ };
  const codebuddy = { id:"cn-codebuddy-pricing", url:"https://www.codebuddy.cn/pricing/", evidence:/连续包月70\/140\/700元/ };
  const traeCN = { id:"cn-trae-cn", url:"https://www.trae.cn/pricing", evidence:/连续包月Pro\+219、Ultra629元/ };
  const fixtures = [
    { id:"plan-0066", amount:29, priceM:29, priceY:null, cur:"USD", sources:[
      { id:"relays-devpass", url:"https://devpass.llmgateway.io/", evidence:/Lite \$29、Pro \$79、Max \$179/ },
      { id:"relays-devpass-terms", url:"https://devpass.llmgateway.io/legal/terms", evidence:/自动月续订/ },
    ] },
    { id:"plan-0161", amount:99, priceM:99, priceY:79, cur:"CNY", sources:[kimi] },
    { id:"plan-0162", amount:199, priceM:199, priceY:159, cur:"CNY", sources:[kimi] },
    { id:"plan-0163", amount:699, priceM:699, priceY:559, cur:"CNY", sources:[kimi] },
    { id:"plan-0189", amount:70, priceM:99, priceY:56, cur:"CNY", sources:[codebuddy] },
    { id:"plan-0190", amount:140, priceM:199, priceY:112, cur:"CNY", sources:[codebuddy] },
    { id:"plan-0191", amount:700, priceM:999, priceY:560, cur:"CNY", sources:[codebuddy] },
    { id:"plan-0195", amount:219, priceM:239, priceY:null, cur:"CNY", sources:[traeCN] },
    { id:"plan-0196", amount:629, priceM:699, priceY:null, cur:"CNY", sources:[traeCN] },
    { id:"plan-0197", amount:10, priceM:10, priceY:7.5, cur:"USD", sources:[
      { id:"cn-trae-global", url:"https://www.trae.ai/pricing", evidence:/自动续费10美元\/月/ },
    ] },
  ];
  for (const fixture of fixtures) {
    const { id, amount, priceM, priceY, cur, sources } = fixture;
    const p = app.run(`findPlanReference(${JSON.stringify(id)})`);
    const check = app.run(`priceCheckOf(findPlanReference(${JSON.stringify(id)}))`);
    const quote = app.run(`pickerPaymentQuote(findPlanReference(${JSON.stringify(id)}),"A")`);
    assert.equal(p.autoRenewMonthly, amount, id);
    assert.equal(p.priceM, priceM, id);
    assert.equal(p.priceY, priceY, id);
    assert.equal(p.cur, cur, id);
    assert.match(p.note, /连续包月|自动续费/, id);
    assert.equal(check.checkedAt, "2026-10-04", id);
    assert.ok(["verified", "changed"].includes(check.status), id);
    for (const { id:sourceId, url, evidence } of sources) {
      assert.ok(check.sourceIds.includes(sourceId), `${id}: ${sourceId}`);
      const source = app.run(`PRICE_CHECKS.sources[${JSON.stringify(sourceId)}]`);
      assert.equal(source.url, url, `${id}: ${sourceId}`);
      assert.match(source.evidence, evidence, `${id}: ${sourceId}`);
    }
    assert.equal(quote.available, true, id);
    assert.equal(quote.inferred, false, id);
    assert.equal(quote.cur, cur, id);
    assert.equal(quote.monthlyNative, amount, id);
    assert.equal(quote.firstNative, amount, id);
    assert.equal(quote.renewalNative, amount, id);
    near(quote.monthlyCNY, app.run(`toCNY(${amount},${JSON.stringify(cur)})`));
    near(quote.annualNative, amount * 12);
  }
  for (const id of ["plan-0195", "plan-0196"]) {
    const note = app.run(`findPlanReference(${JSON.stringify(id)}).note`);
    assert.doesNotMatch(note, /首月/, id);
    assert.match(note, /单月购买.*到期不续订/, id);
  }
  healthy(app);
});

test("Trae Lite与Pro未单列续费价时按标价估算，首月优惠不作续费金额", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/?billing=A" });
  for (const { id, firstMonth } of [{ id:"plan-0193", firstMonth:39 }, { id:"plan-0194", firstMonth:69 }]) {
    const p = app.run(`findPlanReference(${JSON.stringify(id)})`);
    const quote = app.run(`pickerPaymentQuote(findPlanReference(${JSON.stringify(id)}),"A")`);
    assert.equal(p.autoRenewMonthly, undefined, id);
    assert.match(p.note, new RegExp(`首月低至 ¥${firstMonth}`), id);
    assert.equal(quote.available, true, id);
    assert.equal(quote.inferred, true, id);
    assert.equal(quote.monthlyNative, p.priceM, id);
    assert.equal(quote.firstNative, p.priceM, id);
    assert.equal(quote.renewalNative, p.priceM, id);
    assert.equal(quote.annualNative, p.priceM * 12, id);
    assert.notEqual(quote.renewalNative, firstMonth, id);
    assert.match(app.run(`pickerPaymentSummaryHtml(findPlanReference(${JSON.stringify(id)}))`), /未单列连续包月价，按月付标价计/, id);
  }
  assert.match(app.run('PRICE_CHECKS.sources["cn-trae-cn"].evidence'), /首月Lite39、Pro69/);
  healthy(app);
});

test("已记录连续包月金额参与预算，普通月订阅标价估算明确标注，缺少年价保留未知", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/?budget=100" });
  assert.equal(app.run('eligibleProfiles().some(x=>x.p.id === "plan-0157")'), false);
  app.run('pickerState.billing="A";renderPicker();');
  assert.equal(app.run('eligibleProfiles().some(x=>x.p.id === "plan-0157")'), true);
  near(app.run('pickerMonthlyCNY(findPlanReference("plan-0157"))'),94.4);
  assert.match(app.elements.get("quickGrid").innerHTML,/首次 ¥94.4/);
  assert.match(app.elements.get("quickGrid").innerHTML,/1,132.8/);
  const inferred = app.run('pickerPaymentQuote(findPlanReference("plan-0010"),"A")');
  assert.equal(inferred.available,true);
  assert.equal(inferred.inferred,true);
  assert.equal(inferred.monthlyNative,20);
  near(inferred.monthlyCNY,app.run('toCNY(20,"USD")'));
  assert.match(app.run('pickerPaymentSummaryHtml(findPlanReference("plan-0010"))'),/未单列连续包月价，按月付标价计/);
  assert.match(app.elements.get("pickerBillingNote").textContent,/按标价计作为上限/);
  app.run('Object.assign(pickerState,{billing:"Y",region:"intl",tool:"codex",budget:"any"});renderPicker();');
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML,/价格符合预算/);
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML,/NaN|Infinity|¥∞/);
  healthy(app);
});

test("一次性预付、4周和老用户续费档不会自动推定为普通月续订", () => {
  const app = createApp();
  for (const id of ["plan-0043", "plan-0057", "plan-0063", "plan-0036"]) {
    const p = app.run(`findPlanReference(${JSON.stringify(id)})`);
    const quote = app.run(`pickerPaymentQuote(findPlanReference(${JSON.stringify(id)}),"A")`);
    assert.ok(p.priceM > 0, id);
    assert.equal(p.autoRenewMonthly, undefined, id);
    assert.equal(quote.available, false, id);
    assert.equal(quote.inferred, false, id);
    for (const key of ["monthlyNative", "monthlyCNY", "firstNative", "renewalNative", "annualNative"]) {
      assert.equal(quote[key], null, `${id}: ${key}`);
    }
  }
  healthy(app);
});

test("年付保留官网全年金额及真实月均，首次付款不冒充一个月", () => {
  const app = createApp({url:"http://127.0.0.1:8123/?billing=Y&region=intl"});
  const quote = app.run('pickerPaymentQuote(findPlanReference("plan-0002"))');
  assert.equal(quote.firstNative,200);
  assert.equal(quote.annualNative,200);
  near(quote.monthlyNative,200/12);
  assert.equal(quote.periodMonths,12);
  assert.equal(quote.annualApprox,false);
  assert.equal(app.run('pickerPaymentQuote(findPlanReference("plan-0010"),"Y").available'),false);
  assert.match(app.run('pickerPaymentSummaryHtml(findPlanReference("plan-0002"))'),/一次支付全年/);
  assert.match(app.run('pickerPaymentSummaryHtml({...findPlanReference("plan-0002"),note:"",priceY:16.67,annualTotal:undefined})'),/首次 约 \$200.04.*折月价×12估算/);
  assert.match(app.run('pickerFirstPaymentText({...findPlanReference("plan-0002"),note:"",priceY:16.67,annualTotal:undefined})'),/^约 \$200.04$/);
  healthy(app);
});

test("满额折算成本显示额度上下界对应的反向区间，固定额度不制造区间", () => {
  const app = createApp();
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(fullUseCostRange({priceCNY:100,moLow:10,moHigh:20}))')),[5,10]);
  assert.equal(app.run('fullUseCostRange({priceCNY:100,moLow:10,moHigh:10})'),null);
  assert.equal(app.run('fullUseCostRange({priceCNY:100,moLow:null,moHigh:null})'),null);
  assert.match(app.elements.get("rankDetailBody").innerHTML,/参考区间/);
  healthy(app);
});

test("付款与范围条件的分享恢复及非法参数遵循白名单", () => {
  const app = createApp({url:"http://127.0.0.1:8123/?budget=100&billing=A&tapply=1&papply=1&mapply=1&cscenario=conservative"});
  assert.equal(app.run('pickerState.billing'),"A");
  assert.equal(app.run('calcState.scenario'),"conservative");
  assert.equal(app.run('personalState.fromPicker && tableState.fromPicker && metricsState.fromPicker'),true);
  const url = app.run('appQueryString()');
  const restored = createApp({url:"http://127.0.0.1:8123/?"+url});
  assert.equal(restored.run('pickerState.billing'),"A");
  assert.equal(restored.run('tableState.fromPicker'),true);
  app.run('applyUrlState("?billing=bad&tapply=true&mapply=0&papply=2&cscenario=bad");');
  assert.equal(app.run('pickerState.billing'),"M");
  assert.equal(app.run('tableState.fromPicker || personalState.fromPicker || metricsState.fromPicker'),false);
  assert.equal(app.run('calcState.scenario'),"typical");
  healthy(restored);
});

test("应用条件的两张表与图表使用所选付款金额，取消恢复完整范围", () => {
  const app = createApp({url:"http://127.0.0.1:8123/?budget=100&billing=A&tapply=1&papply=1&mapply=1&q=BigModel&mmodel=GLM-5.3"});
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(computeTableRows().map(p=>p.id))')),["plan-0157"]);
  assert.match(app.elements.get("tableBody").innerHTML,/选购口径：¥94.4\/月/);
  assert.match(app.run('tableRowsMarkdown(computeTableRows())'),/选购首次付款/);
  assert.match(app.run('tableRowsMarkdown(computeTableRows())'),/¥94.4/);
  const applied = app.run('metricsTableRows()');
  assert.equal(applied.payg.length,0);
  assert.ok(applied.rows.length);
  for (const row of applied.rows) near(row.c.priceCNY,94.4);
  near(app.run('personalChartPrice(findPlanReference("plan-0157"))'),94.4);
  app.run('resetTableFilters();resetMetricsFilters();resetPersonalFilters();');
  assert.equal(app.run('tableState.fromPicker || personalState.fromPicker || metricsState.fromPicker'),false);
  assert.ok(app.run('computeTableRows().length')>1);
  assert.ok(app.run('metricsTableRows().payg.length')>0);
  near(app.run('personalChartPrice(findPlanReference("plan-0157"))'),118);
  healthy(app);
});

test("已应用范围随支付和预算变化重绘，额度量不随折扣被放大", () => {
  const app = createApp({url:"http://127.0.0.1:8123/?budget=100&billing=A&tapply=1&mapply=1&q=BigModel"});
  const baseline = app.run('computeMetrics(METRICS_ALL.find(m=>metricMatchesPlan(m,findPlanReference("plan-0157"))))');
  const discounted = app.run('metricsTableRows().rows.find(r=>r.m.ref==="plan-0157").c');
  near(discounted.moMidM,baseline.moMidM);
  near(discounted.costPerM,baseline.costPerM*0.8);
  app.run('pickerState.billing="M";renderPicker();');
  assert.equal(app.run('computeTableRows().some(p=>p.id==="plan-0157")'),false);
  assert.equal(app.run('metricsTableRows().rows.some(r=>r.m.ref==="plan-0157")'),false);
  app.run('pickerState.budget="200";renderPicker();');
  assert.match(app.elements.get("tableBody").innerHTML,/V3 Lite/);
  healthy(app);
});

test("推荐卡对比与权益动作可直接访问，无需展开购买详情", () => {
  const app = createApp();
  const card=app.elements.get("quickGrid").querySelector(".quick-card");
  assert.ok(card.querySelector(".cmp-add"));
  assert.equal(card.querySelector(".cmp-add").closest(".qc-details"),null);
  assert.equal(card.querySelector("[data-view-plan]").closest(".qc-details"),null);
  assert.ok(card.querySelector(".qc-payment-summary"));
  healthy(app);
});

test("自动续费金额非法或没有说明时数据校验拒绝", () => {
  const workspace=path.resolve(__dirname,"../..");
  const source=fs.readFileSync(path.join(workspace,"js/data.js"),"utf8");
  assert.equal(validateData({workspace,source}).errors.length,0);
  assert.ok(validateData({workspace,source:source.replace('autoRenewMonthly: 94.4','autoRenewMonthly: -1')}).errors.some(error=>error.includes('autoRenewMonthly')));
});

main();
