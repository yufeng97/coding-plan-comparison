
/* 逐行核价、原币与历史价格的整页边界，原 scripts/tests/test-pricing.js。 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";
import type { PriceCheckKind } from "../test/runtime";
import { openPage, type Page } from "../test/page";

const inventory = JSON.parse(fs.readFileSync(path.resolve("data/audit/pricing-inventory.json"), "utf8")) as { PLANS: Plan[] };
const near = (actual: number | null | undefined, expected: number) => assert.ok(Math.abs((actual ?? NaN) - expected) < 1e-9, `${actual} ≠ ${expected}`);
const plan = (page: Page, id: string) => page.runtime.findPlanReference(id) as Plan;
type Runtime = Page["runtime"];
type ApiPrice = Runtime["API_PRICES"][number];
type PaygReference = Runtime["PAYG_REFERENCES"][number];
/** 核价状态来自启动时的数据，挂载前注入历史状态，组件读取与真实页面相同。 */
function pending(app: Runtime, product: Plan | typeof app.API_PRICES[number] | typeof app.PAYG_REFERENCES[number], kind: PriceCheckKind = "plan", reason = "仅测试官网本次无法确认") {
  const key = kind === "plan" ? "plan:" + (product as Plan).id : kind + ":" + product.vendor + "|" + (product as ApiPrice).model;
  app.PRICE_CHECKS.rows[key] = { ...app.priceCheckOf(product, kind)!, status: "unverified", reason };
}

test("258 条核价记录完整对应计划、API 与 PAYG，日期与官方来源可追溯", async () => {
  const page = await openPage(), app = page.runtime;
  const rows = [
    ...app.PLANS.map((p: Plan) => ({ key: "plan:" + p.id, check: app.priceCheckOf(p) })),
    ...app.API_PRICES.map((p: ApiPrice) => ({ key: "api:" + p.vendor + "|" + p.model, check: app.priceCheckOf(p, "api") })),
    ...app.PAYG_REFERENCES.map((p: PaygReference) => ({ key: "payg:" + p.vendor + "|" + p.model, check: app.priceCheckOf(p, "payg") })),
  ];
  assert.equal(rows.length, 258);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
  assert.equal(Object.keys(app.PRICE_CHECKS.rows).length, rows.length);
  for (const { key, check } of rows) {
    assert.ok(check, key);
    assert.ok(["verified", "changed", "unverified", "retired", "custom"].includes(check.status), key);
    assert.match(check.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(check.checkedAt >= "2026-10-04" && check.checkedAt <= app.PRICE_CHECKS.checkedAt, key);
    assert.ok(check.reason.trim() && check.sourceIds.length, key);
    for (const id of check.sourceIds) {
      const source = app.PRICE_CHECKS.sources[id];
      assert.ok(source, key + " 未知来源 " + id);
      assert.match(source.url, /^https?:\/\//);
      assert.ok(source.evidence.trim());
    }
  }
  assert.equal(app.PRICE_CHECKS.checkedAt, rows.map((r) => r.check!.checkedAt).sort().at(-1));
  page.healthy();
});

test("历史套餐保留原价，稳定 ID 不受更名影响", async () => {
  const page = await openPage(), app = page.runtime;
  const historical = app.PLANS.filter((p: Plan) => app.priceCheckOf(p)?.status === "unverified");
  assert.ok(historical.length > 0);
  for (const p of historical) {
    const before = inventory.PLANS.find((old) => old.id === p.id);
    assert.ok(before, p.id);
    assert.deepEqual({ priceM: p.priceM, priceY: p.priceY, cur: p.cur }, { priceM: before.priceM, priceY: before.priceY, cur: before.cur });
  }
  const renamed = { ...app.PLANS[0]!, plan: "仅测试更名" };
  assert.equal(app.priceCheckOf(renamed), app.priceCheckOf(app.PLANS[0]));
  page.healthy();
});

test("Cursor 印度套餐保留 ₹649 原价、汇率依据与跨币种排序", async () => {
  const page = await openPage({ url: "/?pcat=all&pregion=all&plimit=all#s1", prepare(app) {
    const p = { ...app.findPlanReference("plan-0097"), id: "pricing-test-usd", vendor: "跨币种测试", plan: "USD 8", purchaseCountries: [], priceM: 8, cur: "USD" } as Plan;
    app.PLANS.push(p);
    app.PRICE_CHECKS.rows["plan:" + p.id] = { status: "verified", checkedAt: "2026-10-04", sourceIds: [], reason: "仅内存测试" };
  } });
  const app = page.runtime, p = plan(page, "plan-0097");
  assert.equal(p.priceM, 649);
  assert.equal(p.cur, "INR");
  assert.equal(app.planPriceLabel(p), "₹649/月");
  near(app.RATE_INR_CNY, 6.7074 / 95.74);
  near(app.cnyOf(p, "M"), 649 * 6.7074 / 95.74);
  Object.assign(app.tableState, { search: "Cursor", extra: true });
  await page.settle();
  const row = page.byId("tableBody").querySelector(`[data-plan-id="${p.id}"]`)!.closest("tr")!;
  assert.match(row.textContent!, /₹649\/月.*≈¥45\.5\/月/s);
  const csv = app.tableRowsCsv([p]), md = app.tableRowsMarkdown([p]);
  assert.match(csv, /参考汇率（INR\/CNY）/);
  assert.match(md, /1 INR ≈ [\d.]+ CNY/);
  for (const text of [csv, md]) for (const value of ["₹649/月", String(app.RATE_INR_CNY), app.META.rateAsOf, app.META.rateSource]) assert.ok(text.includes(value), value);
  Object.assign(app.personalState, { cat: "all", region: "all", q: "", limit: null, billing: "M" });
  app.renderPersonalChart();
  assert.equal(page.charts.get("chartPersonal")!.option.series[0].data.find((d: { _p: Plan }) => d._p.id === p.id).value, 45.5);
  assert.match(app.personalTooltip(p), /₹649/);
  Object.assign(app.tableState, { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1 });
  assert.deepEqual(app.computeTableRows().filter((p: Plan) => ["plan-0097", "pricing-test-usd"].includes(p.id)).map((p: Plan) => p.id), ["plan-0097", "pricing-test-usd"]);
  assert.equal(app.recommendablePlan(p), false);
  page.healthy();
});

test("待核每席位价格退出团队图，历史金额通过完整表开关保留", async () => {
  let id = "";
  const page = await openPage({ url: "/#s2", prepare(app) {
    const p = app.PLANS.find((p: Plan) => p.seat && p.priceM! > 0 && !app.isRetiredPlan(p))!;
    id = p.id;
    pending(app, p, "plan", "席位价格本次待核");
  } });
  assert.equal(page.charts.get("chartTeam")!.option.series[0].data.some((d: { _p: Plan }) => d._p.id === id), false);
  assert.equal(page.runtime.computeTableRows().some((p: Plan) => p.id === id), false);
  page.runtime.tableState.extra = true;
  assert.equal(page.runtime.computeTableRows().some((p: Plan) => p.id === id), true);
  page.healthy();
});

test("待核个人价格退出推荐与价格图，完整表、搜索入口与导出保留日期来源", async () => {
  const page = await openPage({ url: "/?budget=any&region=all#s1", prepare(app) { pending(app, app.findPlanReference("plan-0098")!, "plan", "官网本次无法确认"); } });
  const app = page.runtime, p = plan(page, "plan-0098");
  assert.equal(app.computeTableRows().includes(p), false);
  assert.equal(app.recommendablePlan(p), false);
  assert.equal(app.eligibleProfiles().some((x: { p: Plan }) => x.p.id === p.id), false);
  assert.equal(page.charts.get("chartPersonal")!.option.series[0].data.some((d: { _p: Plan }) => d._p.id === p.id), false);
  Object.assign(app.tableState, { search: "Cursor Pro", extra: true });
  await page.settle();
  assert.equal(app.computeTableRows().includes(p), true);
  assert.match(page.byId("tableBody").textContent!, /历史价 · 待核实/);
  assert.match(page.byId("tableBody").textContent!, /官网本次无法确认/);
  const search = page.byId<HTMLInputElement>("chartSearch");
  search.value = "Cursor Pro";
  page.fire(search, "input");
  await page.flushTimers();
  assert.match(page.byId("notePersonal").textContent!, /价格待核实/);
  app.tableState.extra = false;
  page.fire(page.byId("showExcludedInTable"), "click");
  await page.settle();
  assert.equal(app.tableState.extra, true);
  assert.equal(app.computeTableRows().includes(p), true);
  const urls = app.priceCheckSources(p);
  assert.ok(urls.length > 0);
  for (const text of [app.tableRowsCsv([p]), app.tableRowsMarkdown([p])]) {
    for (const value of [app.planPriceLabel(p), "历史价 · 待核实", app.priceCheckOf(p)!.checkedAt, "价格核查来源", "官网本次无法确认", ...urls]) assert.ok(text.includes(value), value);
  }
  page.healthy();
});

test("待核官方与推算额度退出 tokens、排行与默认额度表，明细保留历史范围说明", async () => {
  const page = await openPage({ url: "/?rank=all#s3", prepare(app) {
    for (const id of ["plan-0031", "plan-0002"]) pending(app, app.findPlanReference(id)!);
  } });
  const app = page.runtime;
  const tokens = page.charts.get("chartTokens")!.option.series.flatMap((s: { data: { _r: { label: string } }[] }) => s.data).filter(Boolean);
  assert.equal(tokens.some((d: { _r: { label: string } }) => /Z\.ai Lite|Anthropic Claude Pro/.test(d._r.label)), false);
  app.renderRankChart();
  assert.equal(page.charts.get("chartRank")!.option.series[0].data.filter((d: { _r?: unknown }) => d._r).some((d: { _r: { m: { ref: string } } }) => ["plan-0031", "plan-0002"].includes(app.findPlanReference(d._r.m.ref)?.id ?? "")), false);
  assert.equal(app.metricsTableRows().rows.some((r) => ["plan-0031", "plan-0002"].includes(app.findPlanReference(r.m.ref)?.id ?? "")), false);
  app.metricsState.offer = "all";
  app.metricsState.model = app.METRICS_ALL.find((m) => app.findPlanReference(m.ref)?.id === "plan-0002")!.model;
  await page.settle();
  assert.match(page.byId("metricsBody").textContent!, /历史价折算 · 价格待核/);
  page.healthy();
});

test("待核 API 保留带日期来源的明细，退出价格与购买力图", async () => {
  const page = await openPage({ url: "/#s4", prepare(app) { pending(app, app.API_PRICES[0]!, "api"); } });
  const app = page.runtime, p = app.API_PRICES[0]!;
  assert.equal(page.charts.get("chartPower")!.option.series.flatMap((s: { data: { a: ApiPrice }[] }) => s.data).filter(Boolean).some((d: { a: ApiPrice }) => d.a.vendor === p.vendor && d.a.model === p.model), false);
  assert.equal(page.charts.get("chartApi")!.option.series[0].data.length, app.API_PRICES.filter((a: ApiPrice) => app.isPriceConfirmed(a, "api")).length);
  const html = page.byId("apiDetailBody").innerHTML;
  assert.ok(html.includes(p.vendor));
  assert.match(page.byId("apiDetailBody").textContent!, /历史价 · 待核实.*2026-10-04/s);
  for (const url of app.priceCheckSources(p, "api")) assert.ok(html.includes(url));
  page.healthy();
});

test("待核 PAYG 按 vendor/model 映射，明细按历史牌价降低置信", async () => {
  const page = await openPage({ prepare(app) { pending(app, app.PAYG_REFERENCES[0]!, "payg"); } });
  const app = page.runtime;
  Object.assign(app.metricsState, { tier: "all", offer: "all", model: app.PAYG_REFERENCES[0]!.model });
  await page.settle();
  assert.equal(app.isPriceConfirmed(app.paygReferenceRows()[0]!.m, "payg"), false);
  assert.match(page.byId("metricsBody").textContent!, /历史牌价 · 待核实/);
  page.healthy();
});

test("免费入口排除待核状态，对比不将历史价格突出为最低价", async () => {
  const page = await openPage({ prepare(app) {
    for (const id of ["plan-0096", "plan-0098"]) pending(app, app.findPlanReference(id)!);
  } });
  const app = page.runtime;
  assert.equal(app.isFreeCodingEntry(plan(page, "plan-0096")), false);
  assert.equal(Array.from(page.byId("freeGrid").querySelectorAll(".fc-vendor")).some((el) => el.textContent === "Cursor"), false);
  app.cmpState.items = [plan(page, "plan-0098"), plan(page, "plan-0099")];
  await page.settle();
  assert.doesNotMatch(page.byId("cmpTable").innerHTML, /cmp-best-price|同周期最低价/);
  assert.match(page.byId("cmpTable").textContent!, /历史价 · 待核实.*2026-10-04/s);
  page.healthy();
});

test("Kiro 每用户订阅保持个人月付与推荐资格", async () => {
  const page = await openPage(), app = page.runtime;
  for (const id of ["plan-0075", "plan-0076", "plan-0077", "plan-0078"]) {
    const p = plan(page, id);
    assert.equal(p.seat, false);
    assert.equal(app.isPersonalMonthly(p), true);
    assert.equal(app.recommendablePlan(p), true);
  }
  page.healthy();
});
