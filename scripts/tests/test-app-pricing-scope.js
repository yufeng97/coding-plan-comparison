#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { createApp, healthy, test, main } = require("./app-harness");
const { validateData, PLAN_MARKERS, SITE_ACCESS_MARKER } = require("../build/validate-data");
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const plain = v => JSON.parse(JSON.stringify(v));

test("排行局部选购按年付及续费重算，折扣不改变额度并随预算过滤", () => {
  const app = createApp({url:"http://127.0.0.1:8123/?budget=any&region=all&billing=Y&rank=all&rapply=1"});
  const catalog = app.run('rankCandidateRows(false).find(r=>r.m.ref==="plan-0157").c');
  const annual = app.run('rankRows().find(r=>r.m.ref==="plan-0157").c');
  near(catalog.priceCNY,118);near(annual.priceCNY,82.6);
  near(annual.moLow,catalog.moLow);near(annual.moHigh,catalog.moHigh);
  near(annual.costPerM,catalog.costPerM*0.7);
  assert.match(app.elements.get("rankScope").textContent,/年付折月/);
  app.run('pickerState.billing="A";renderPicker();');
  const renewal=app.run('rankRows().find(r=>r.m.ref==="plan-0157").c');
  near(renewal.priceCNY,94.4);near(renewal.costPerM,catalog.costPerM*0.8);
  app.run('Object.assign(pickerState,{billing:"M",budget:"100"});renderPicker();');
  assert.equal(app.run('rankRows().some(r=>r.m.ref==="plan-0157")'),false);
  app.run('pickerState.budget="200";renderPicker();');
  near(app.run('rankRows().find(r=>r.m.ref==="plan-0157").c.priceCNY'),118);
  const restored=createApp({url:"http://127.0.0.1:8123/?"+app.run("appQueryString()")});
  assert.equal(restored.run("rankState.fromPicker"),true);
  app.run('applyPickerScope("rank")');
  assert.equal(app.run("rankState.fromPicker"),false);
  near(app.run('rankRows().find(r=>r.m.ref==="plan-0157").c.priceCNY'),118);
  healthy(app);healthy(restored);
});

test("价格表所选支付月均排序控件升降往返，目录价格表头仍保留原语义", () => {
  const app=createApp({url:"http://127.0.0.1:8123/?budget=any&region=all&billing=Y&tapply=1&tsort=selectedMonthly:1"});
  const sorted=app.run("computeTableRows().map(p=>pickerMonthlyCNY(p))");
  assert.ok(sorted.length>1);
  for(let i=1;i<sorted.length;i++)assert.ok(sorted[i]>=sorted[i-1]);
  assert.equal(app.elements.get("tablePriceSort").value,"selectedMonthly:1");
  const control=app.elements.get("tablePriceSort");control.value="selectedMonthly:-1";app.fire(control,"change");
  assert.equal(app.run("tableState.sortKey"),"selectedMonthly");assert.equal(app.run("tableState.sortDir"),-1);
  const descending=app.run("computeTableRows().map(p=>pickerMonthlyCNY(p))");
  assert.deepEqual(plain(descending),plain(sorted).reverse());
  assert.match(app.run('document.querySelector("#planTable [data-sort=priceM]").getAttribute("aria-label")'),/价格 \/ 周期/);
  const restored=createApp({url:"http://127.0.0.1:8123/?"+app.run("appQueryString()")});
  assert.equal(restored.run("tableState.sortKey"),"selectedMonthly");
  assert.equal(restored.elements.get("tablePriceSort").value,"selectedMonthly:-1");
  app.run('applyPickerScope("table")');
  assert.equal(app.run("tableState.sortKey"),"priceM");
  assert.ok(control.options.filter(o=>o.value.startsWith("selectedMonthly:")).every(o=>o.disabled));
  app.run('applyUrlState("?tsort=selectedMonthly:-1");');
  assert.equal(app.run("tableState.sortKey"),"priceM");
  healthy(app);healthy(restored);
});

test("年付图只显示公开年价，缺失年价不能挪用月价", () => {
  const app=createApp();
  assert.equal(app.run('priceOf(findPlanReference("plan-0010"),"Y")'),null);
  assert.equal(app.run('cnyOf(findPlanReference("plan-0010"),"Y")'),null);
  app.run('personalState.billing="Y";personalState.limit=null;renderPersonalChart();');
  const plotted=app.charts.get("chartPersonal").option.series.flatMap(s=>s.data||[]).filter(d=>d._p);
  assert.ok(plotted.length>0);
  assert.ok(plotted.every(d=>d._p.priceY>0));
  assert.ok(plotted.every(d=>d._p.id!=="plan-0010"));
  assert.match(app.elements.get("notePersonal").innerHTML,/未列公开年付价的档位已排除/);
  healthy(app);
});

test("全年结构金额不受备注折月措辞影响，缺结构字段才估算，校验拒绝全年金额冲突", () => {
  const app=createApp();
  near(app.run('pickerAnnualNative({...findPlanReference("plan-0002"),note:"年付 $16.67（折月）"})'),200);
  near(app.run('pickerAnnualNative({priceM:118,priceY:82.6,cur:"CNY",note:"年付 ¥82.6（折月）"})'),82.6*12);
  assert.equal(app.run('pickerAnnualExact({priceY:82.6,note:"年付 ¥82.6（折月）"})'),null);
  const workspace=path.resolve(__dirname,"../..");
  const source=fs.readFileSync(path.join(workspace,"js/data.js"),"utf8");
  const broken=source.replace(/annualTotal:\s*200\b/,"annualTotal: 20");
  assert.notEqual(broken,source);
  assert.ok(validateData({workspace,source:broken}).errors.some(e=>e.includes("annualTotal")));
  healthy(app);
});

test("无限量和不限量不被当作限量发售，真正限量和抢购须标 availability:limited 并排除", () => {
  const limited = PLAN_MARKERS.find((m) => m.field === 'availability: "limited"').name;
  for(const name of ["无限量","不限量","专业版（无限量）"])assert.equal(limited.test(name),false,name);
  for(const name of ["限量","专业版限量发售","抢购"])assert.equal(limited.test(name),true,name);
  const app=createApp();
  assert.equal(app.run('offerable({plan:"专业版限量发售"})'),true,"页面不再按计划名猜测购买资格");
  assert.equal(app.run('offerable({plan:"专业版",availability:"limited"})'),false);
  healthy(app);
});

test("计划名状态标记与结构化字段不一致时校验失败，金额里的403不要求标访问异常", () => {
  const workspace=path.join(__dirname,"..","..");
  const source=fs.readFileSync(path.join(workspace,"js/data.js"),"utf8");
  /** @type {Array<{pattern: RegExp, field: string}>} */
  const cases=[
    { pattern: /(plan: "Starter 预付包（已下架）"[^\n]*?) availability: "retired",/, field: 'availability: "retired"' },
    { pattern: /(plan: "Pro（4 周订阅）"[^\n]*?) billingUnit: "four-weeks",/, field: 'billingUnit: "four-weeks"' },
    { pattern: /(plan: "GLM Coding V2 Lite（老用户续费）"[^\n]*?) renewalOnly: true,/, field: "renewalOnly: true" },
  ];
  for(const { pattern, field } of cases){
    const broken=source.replace(pattern,"$1");
    assert.notEqual(broken,source,field);
    assert.ok(validateData({workspace,source:broken}).errors.some((e)=>e.includes("计划名标记与结构化字段不一致")&&e.includes(field)),field);
  }
  /* 同厂商其他档已标 relay：漏标一档会被发现。 */
  const relayBroken=source.replace(/(plan: "Pro（4 周订阅）"[^\n]*?) relay: true,/,"$1");
  assert.notEqual(relayBroken,source);
  assert.ok(validateData({workspace,source:relayBroken}).errors.some((e)=>e.includes("relay 标注必须一致")||e.includes("relay: true")));
  assert.equal(SITE_ACCESS_MARKER.test("季付 $403.2，年付 $1411.2"),false);
  assert.equal(SITE_ACCESS_MARKER.test("站点访问不稳定（403）"),true);
  assert.equal(SITE_ACCESS_MARKER.test("www.88code.ai 返回 403，"),true);
  const result=validateData({workspace,source});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.warns.some((w)=>w.includes("siteAccess")),false);
});

test("分享URL及输入事件统一限制搜索长度，地址与控件保持同步", () => {
  const value="a".repeat(1000);
  const app=createApp({url:"http://127.0.0.1:8123/?q="+value+"&pq="+value});
  assert.equal(app.run("tableState.search.length"),200);assert.equal(app.run("personalState.q.length"),200);
  const params=new URLSearchParams(app.run("appQueryString()"));
  assert.equal(params.get("q").length,200);assert.equal(params.get("pq").length,200);
  for(const [id,state]of [["chartSearch","personalState.q"],["searchInput","tableState.search"]]){
    const input=app.elements.get(id);assert.equal(input.getAttribute("maxlength"),"200");
    input.value="b".repeat(1000);app.fire(input,"input");
    assert.equal(input.value.length,200);assert.equal(app.run(state+".length"),200);
  }
  app.flushTimeouts();healthy(app);
});

main();
