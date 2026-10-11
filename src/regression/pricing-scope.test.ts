
/* 「应用选购条件」对排行、价格表与个人图的局部重算，以及年价与搜索长度边界。原 scripts/tests/test-app-pricing-scope.js，现用真实 App。
 * 全年金额冲突的数据校验见 data.test.ts。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import type { RankRow } from "../test/runtime";
import { openPage, type Page } from "../test/page";

const near = (actual: number | null | undefined, expected: number | null | undefined) => assert.ok(Math.abs((actual ?? NaN) - (expected ?? NaN)) < 1e-8, `${actual} != ${expected}`);
const plan = (page: Page, id: string) => page.runtime.findPlanReference(id) as Plan;
const rankRow = (page: Page, rows: RankRow[] = page.runtime.rankRows()) => rows.find((r) => r.m.ref === "plan-0157");

test("排行局部选购按年付及续费重算，折扣不改变额度并随预算过滤", async () => {
  const page = await openPage({ url: "/?budget=any&region=all&billing=Y&rank=all&rapply=1" });
  const app = page.runtime;
  const catalog = rankRow(page, app.rankCandidateRows(false))!.c;
  const annual = rankRow(page)!.c;
  near(catalog.priceCNY, 118);
  near(annual.priceCNY, 82.6);
  near(annual.moLow, catalog.moLow);
  near(annual.moHigh, catalog.moHigh);
  near(annual.costPerM, catalog.costPerM * 0.7);
  assert.match(page.byId("rankScope").textContent!, /年付折月/);
  app.pickerState.billing = "A";
  await page.settle();
  const renewal = rankRow(page)!.c;
  near(renewal.priceCNY, 94.4);
  near(renewal.costPerM, catalog.costPerM * 0.8);
  Object.assign(app.pickerState, { billing: "M", budget: "100" });
  await page.settle();
  assert.equal(rankRow(page), undefined);
  app.pickerState.budget = "200";
  await page.settle();
  near(rankRow(page)!.c.priceCNY, 118);
  const shared = "/?" + app.appQueryString();
  app.applyPickerScope("rank");
  assert.equal(app.rankState.fromPicker, false);
  near(rankRow(page)!.c.priceCNY, 118);
  page.healthy();
  const restored = await openPage({ url: shared });
  assert.equal(restored.runtime.rankState.fromPicker, true);
  restored.healthy();
});

test("价格表所选支付月均排序控件升降往返，目录价格表头仍保留原语义", async () => {
  let page = await openPage({ url: "/?budget=any&region=all&billing=Y&tapply=1&tsort=selectedMonthly:1" });
  let app = page.runtime;
  const monthly = () => page.runtime.computeTableRows().map((p: Plan) => page.runtime.pickerMonthlyCNY(p));
  const sorted = monthly();
  assert.ok(sorted.length > 1);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i]! >= sorted[i - 1]!);
  const control = page.byId<HTMLSelectElement>("tablePriceSort");
  assert.equal(control.value, "selectedMonthly:1");
  control.value = "selectedMonthly:-1";
  page.fire(control, "change");
  await page.settle();
  assert.equal(app.tableState.sortKey, "selectedMonthly");
  assert.equal(app.tableState.sortDir, -1);
  assert.deepEqual(monthly(), sorted.slice().reverse());
  assert.match(document.querySelector("#planTable [data-sort=priceM]")!.getAttribute("aria-label")!, /价格 \/ 周期/);
  const shared = "/?" + app.appQueryString();
  app.applyPickerScope("table");
  await page.settle();
  assert.equal(app.tableState.sortKey, "priceM");
  assert.ok(Array.from(control.options).filter((o) => o.value.startsWith("selectedMonthly:")).every((o) => o.disabled));
  app.applyUrlState("?tsort=selectedMonthly:-1");
  assert.equal(app.tableState.sortKey, "priceM");
  page.healthy();
  page = await openPage({ url: shared });
  app = page.runtime;
  assert.equal(app.tableState.sortKey, "selectedMonthly");
  assert.equal(page.byId<HTMLSelectElement>("tablePriceSort").value, "selectedMonthly:-1");
  page.healthy();
});

test("年付图只显示公开年价，缺失年价不能挪用月价", async () => {
  const page = await openPage();
  const app = page.runtime;
  assert.equal(app.priceOf(plan(page, "plan-0010"), "Y"), null);
  assert.equal(app.cnyOf(plan(page, "plan-0010"), "Y"), null);
  app.personalState.billing = "Y";
  app.personalState.limit = null;
  await page.settle();
  app.renderPersonalChart();
  const plotted = page.charts.get("chartPersonal")!.option.series.flatMap((s: { data?: { _p?: Plan }[] }) => s.data || []).filter((d: { _p?: Plan }) => d._p);
  assert.ok(plotted.length > 0);
  assert.ok(plotted.every((d: { _p: Plan }) => d._p.priceY! > 0));
  assert.ok(plotted.every((d: { _p: Plan }) => d._p.id !== "plan-0010"));
  assert.match(page.byId("notePersonal").textContent!, /未列公开年付价的档位已排除/);
  page.healthy();
});

test("全年结构金额不受备注折月措辞影响，缺结构字段才估算", async () => {
  const page = await openPage();
  const app = page.runtime;
  /* 备注里的折月措辞不参与计算。 */
  const noted: Plan = { ...plan(page, "plan-0002"), note: "年付 $16.67（折月）" };
  near(app.pickerAnnualNative(noted), 200);
  const listed = { priceM: 118, priceY: 82.6, cur: "CNY", note: "年付 ¥82.6（折月）" };
  near(app.pickerAnnualNative(listed), 82.6 * 12);
  const annualOnly: Partial<Plan> = { priceY: 82.6, note: "年付 ¥82.6（折月）" };
  assert.equal(app.pickerAnnualExact(annualOnly), null);
  page.healthy();
});

test("无限量和不限量不被当作限量发售，真正限量和抢购仍排除", async () => {
  const page = await openPage();
  for (const name of ["无限量", "不限量", "专业版（无限量）"]) assert.equal(page.runtime.offerable({ plan: name } as Plan), true, name);
  for (const name of ["限量", "专业版限量发售", "抢购"]) assert.equal(page.runtime.offerable({ plan: name } as Plan), false, name);
  page.healthy();
});

test("分享URL及输入事件统一限制搜索长度，地址与控件保持同步", async () => {
  const value = "a".repeat(1000);
  const page = await openPage({ url: "/?q=" + value + "&pq=" + value });
  const app = page.runtime;
  assert.equal(app.tableState.search.length, 200);
  assert.equal(app.personalState.q.length, 200);
  const params = new URLSearchParams(app.appQueryString());
  assert.equal(params.get("q")!.length, 200);
  assert.equal(params.get("pq")!.length, 200);
  for (const [id, state] of [["chartSearch", () => app.personalState.q], ["searchInput", () => app.tableState.search]] as const) {
    const input = page.byId<HTMLInputElement>(id);
    assert.equal(input.getAttribute("maxlength"), "200");
    input.value = "b".repeat(1000);
    page.fire(input, "input");
    await page.flushTimers();
    assert.equal(input.value.length, 200);
    assert.equal(state().length, 200);
  }
  page.healthy();
});
