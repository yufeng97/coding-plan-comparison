
/* 付款方式：自动续费、年付、首次付款与「应用选购条件」的范围。原 scripts/tests/test-app-payments.js，现用真实 App。
 * 自动续费金额的数据校验见 src/regression/data.test.ts。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { mount } from "@vue/test-utils";
import { openPage, type Page } from "../test/page";

const near = (actual: number | null | undefined, expected: number | null | undefined) =>
  assert.ok(typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const plan = (page: Page, id: string) => {
  const found = page.runtime.findPlanReference(id);
  assert.ok(found, "缺少套餐 " + id);
  return found as Plan;
};
/** 推荐卡与详情里的付款说明（完整版）。 */
async function paymentText(p: Plan) {
  const { paymentSummary } = await import("../sections/picker/picker-view");
  return paymentSummary(p).join("\n");
}

test("每个新增自动续费金额均来自对应官方证据，原目录价和核查日期保留", async () => {
  const page = await openPage();
  const app = page.runtime;
  const kimi = { id: "cn-kimi-member", url: "https://www.kimi.com/membership/pricing", evidence: /连续包月99\/199\/699元/ };
  const codebuddy = { id: "cn-codebuddy-pricing", url: "https://www.codebuddy.cn/pricing/", evidence: /连续包月70\/140\/700元/ };
  const traeCN = { id: "cn-trae-cn", url: "https://www.trae.cn/pricing", evidence: /连续包月Pro\+219、Ultra629元/ };
  const fixtures = [
    { id: "plan-0066", amount: 29, priceM: 29, priceY: null, cur: "USD", sources: [
      { id: "relays-devpass", url: "https://devpass.llmgateway.io/", evidence: /Lite \$29、Pro \$79、Max \$179/ },
      { id: "relays-devpass-terms", url: "https://devpass.llmgateway.io/legal/terms", evidence: /自动月续订/ },
    ] },
    { id: "plan-0161", amount: 99, priceM: 99, priceY: 79, cur: "CNY", sources: [kimi] },
    { id: "plan-0162", amount: 199, priceM: 199, priceY: 159, cur: "CNY", sources: [kimi] },
    { id: "plan-0163", amount: 699, priceM: 699, priceY: 559, cur: "CNY", sources: [kimi] },
    { id: "plan-0189", amount: 70, priceM: 99, priceY: 56, cur: "CNY", sources: [codebuddy] },
    { id: "plan-0190", amount: 140, priceM: 199, priceY: 112, cur: "CNY", sources: [codebuddy] },
    { id: "plan-0191", amount: 700, priceM: 999, priceY: 560, cur: "CNY", sources: [codebuddy] },
    { id: "plan-0195", amount: 219, priceM: 239, priceY: null, cur: "CNY", sources: [traeCN] },
    { id: "plan-0196", amount: 629, priceM: 699, priceY: null, cur: "CNY", sources: [traeCN] },
    { id: "plan-0197", amount: 10, priceM: 10, priceY: 7.5, cur: "USD", sources: [
      { id: "cn-trae-global", url: "https://www.trae.ai/pricing", evidence: /自动续费10美元\/月/ },
    ] },
  ];
  for (const { id, amount, priceM, priceY, cur, sources } of fixtures) {
    const p = plan(page, id);
    const check = app.priceCheckOf(p)!;
    const quote = app.pickerPaymentQuote(p, "A");
    assert.equal(p.autoRenewMonthly, amount, id);
    assert.equal(p.priceM, priceM, id);
    assert.equal(p.priceY, priceY, id);
    assert.equal(p.cur, cur, id);
    assert.match(p.note!, /连续包月|自动续费/, id);
    assert.equal(check.checkedAt, "2026-10-04", id);
    assert.ok(["verified", "changed"].includes(check.status), id);
    for (const { id: sourceId, url, evidence } of sources) {
      assert.ok(check.sourceIds.includes(sourceId), `${id}: ${sourceId}`);
      const source = app.PRICE_CHECKS.sources[sourceId as keyof typeof app.PRICE_CHECKS.sources]!;
      assert.equal(source.url, url, `${id}: ${sourceId}`);
      assert.match(source.evidence, evidence, `${id}: ${sourceId}`);
    }
    assert.equal(quote.available, true, id);
    assert.equal(quote.inferred, false, id);
    assert.equal(quote.cur, cur, id);
    assert.equal(quote.monthlyNative, amount, id);
    assert.equal(quote.firstNative, amount, id);
    assert.equal(quote.renewalNative, amount, id);
    near(quote.monthlyCNY, app.toCNY(amount, cur));
    near(quote.annualNative, amount * 12);
  }
  for (const id of ["plan-0195", "plan-0196"]) {
    const note = plan(page, id).note!;
    assert.doesNotMatch(note, /首月/, id);
    assert.match(note, /单月购买.*到期不续订/, id);
  }
  page.healthy();
});

test("Trae Lite与Pro未单列续费价时按标价估算，首月优惠不作续费金额", async () => {
  const page = await openPage({ url: "/?billing=A" });
  const app = page.runtime;
  for (const { id, firstMonth } of [{ id: "plan-0193", firstMonth: 39 }, { id: "plan-0194", firstMonth: 69 }]) {
    const p = plan(page, id);
    const quote = app.pickerPaymentQuote(p, "A");
    assert.equal(p.autoRenewMonthly, undefined, id);
    assert.match(p.note!, new RegExp(`首月低至 ¥${firstMonth}`), id);
    assert.equal(quote.available, true, id);
    assert.equal(quote.inferred, true, id);
    assert.equal(quote.monthlyNative, p.priceM, id);
    assert.equal(quote.firstNative, p.priceM, id);
    assert.equal(quote.renewalNative, p.priceM, id);
    assert.equal(quote.annualNative, p.priceM! * 12, id);
    assert.notEqual(quote.renewalNative, firstMonth, id);
    assert.match(await paymentText(p), /未单列连续包月价，按月付标价计/, id);
  }
  assert.match(app.PRICE_CHECKS.sources["cn-trae-cn" as keyof typeof app.PRICE_CHECKS.sources]!.evidence, /首月Lite39、Pro69/);
  page.healthy();
});

test("已记录连续包月金额参与预算，普通月订阅标价估算明确标注，缺少年价保留未知", async () => {
  const page = await openPage({ url: "/?budget=100" });
  const app = page.runtime;
  const grid = page.byId("quickGrid");
  assert.equal(app.eligibleProfiles().some((x: { p: Plan }) => x.p.id === "plan-0157"), false);
  app.pickerState.billing = "A";
  await page.settle();
  assert.equal(app.eligibleProfiles().some((x: { p: Plan }) => x.p.id === "plan-0157"), true);
  near(app.pickerMonthlyCNY(plan(page, "plan-0157")), 94.4);
  assert.match(grid.textContent!, /首次 ¥94.4/);
  assert.match(grid.textContent!, /1,132.8/);
  const inferred = app.pickerPaymentQuote(plan(page, "plan-0010"), "A");
  assert.equal(inferred.available, true);
  assert.equal(inferred.inferred, true);
  assert.equal(inferred.monthlyNative, 20);
  near(inferred.monthlyCNY, app.toCNY(20, "USD"));
  assert.match(await paymentText(plan(page, "plan-0010")), /未单列连续包月价，按月付标价计/);
  assert.match(page.byId("pickerBillingNote").textContent!, /按标价计作为上限/);
  Object.assign(app.pickerState, { billing: "Y", region: "intl", tool: "codex", budget: "any" });
  await page.settle();
  assert.doesNotMatch(grid.textContent!, /价格符合预算/);
  assert.doesNotMatch(grid.textContent!, /NaN|Infinity|¥∞/);
  page.healthy();
});

test("一次性预付、4周和老用户续费档不会自动推定为普通月续订", async () => {
  const page = await openPage();
  for (const id of ["plan-0043", "plan-0057", "plan-0063", "plan-0036"]) {
    const p = plan(page, id);
    const quote = page.runtime.pickerPaymentQuote(p, "A");
    assert.ok(p.priceM! > 0, id);
    assert.equal(p.autoRenewMonthly, undefined, id);
    assert.equal(quote.available, false, id);
    assert.equal(quote.inferred, false, id);
    for (const key of ["monthlyNative", "monthlyCNY", "firstNative", "renewalNative", "annualNative"] as const) assert.equal(quote[key], null, `${id}: ${key}`);
  }
  page.healthy();
});

test("年付保留官网全年金额及真实月均，首次付款不冒充一个月", async () => {
  const page = await openPage({ url: "/?billing=Y&region=intl" });
  const app = page.runtime;
  const claude = plan(page, "plan-0002");
  const quote = app.pickerPaymentQuote(claude);
  assert.equal(quote.firstNative, 200);
  assert.equal(quote.annualNative, 200);
  near(quote.monthlyNative, 200 / 12);
  assert.equal(quote.periodMonths, 12);
  assert.equal(quote.annualApprox, false);
  assert.equal(app.pickerPaymentQuote(plan(page, "plan-0010"), "Y").available, false);
  assert.match(await paymentText(claude), /一次支付全年/);
  const estimated = { ...claude, note: "", priceY: 16.67, annualTotal: undefined };
  assert.match((await paymentText(estimated)).replace(/\n/g, " "), /首次 约 \$200.04.*折月价×12估算/);
  assert.match(app.pickerFirstPaymentText(estimated), /^约 \$200.04$/);
  page.healthy();
});

test("满额折算成本显示额度上下界对应的反向区间，固定额度不制造区间", async () => {
  const page = await openPage();
  const app = page.runtime;
  assert.deepEqual(app.fullUseCostRange({ priceCNY: 100, moLow: 10, moHigh: 20 }), [5, 10]);
  assert.equal(app.fullUseCostRange({ priceCNY: 100, moLow: 10, moHigh: 10 }), null);
  assert.equal(app.fullUseCostRange({ priceCNY: 100, moLow: null, moHigh: null }), null);
  assert.match(page.byId("rankDetailBody").textContent!, /参考区间/);
  page.healthy();
});

test("付款与范围条件的分享恢复及非法参数遵循白名单", async () => {
  let page = await openPage({ url: "/?budget=100&billing=A&tapply=1&papply=1&mapply=1&cscenario=conservative" });
  let app = page.runtime;
  assert.equal(app.pickerState.billing, "A");
  assert.equal(app.calcState.scenario, "conservative");
  assert.equal(app.personalState.fromPicker && app.tableState.fromPicker && app.metricsState.fromPicker, true);
  app.applyUrlState("?billing=bad&tapply=true&mapply=0&papply=2&cscenario=bad");
  assert.equal(app.pickerState.billing, "M");
  assert.equal(app.tableState.fromPicker || app.personalState.fromPicker || app.metricsState.fromPicker, false);
  assert.equal(app.calcState.scenario, "typical");
  page = await openPage({ url: "/?budget=100&billing=A&tapply=1&papply=1&mapply=1&cscenario=conservative" });
  const shared = "/?" + page.runtime.appQueryString();
  page = await openPage({ url: shared });
  app = page.runtime;
  assert.equal(app.pickerState.billing, "A");
  assert.equal(app.tableState.fromPicker, true);
  page.healthy();
});

test("应用条件的两张表与图表使用所选付款金额，取消恢复完整范围", async () => {
  const page = await openPage({ url: "/?budget=100&billing=A&tapply=1&papply=1&mapply=1&q=BigModel&mmodel=GLM-5.3" });
  const app = page.runtime;
  assert.deepEqual(app.computeTableRows().map((p: Plan) => p.id), ["plan-0157"]);
  assert.match(page.byId("tableBody").textContent!, /选购口径：¥94.4\/月/);
  const markdown = app.tableRowsMarkdown(app.computeTableRows());
  assert.match(markdown, /选购首次付款/);
  assert.match(markdown, /¥94.4/);
  const applied = app.metricsTableRows();
  assert.equal(applied.payg.length, 0);
  assert.ok(applied.rows.length);
  for (const row of applied.rows) near(row.c.priceCNY, 94.4);
  near(app.personalChartPrice(plan(page, "plan-0157")), 94.4);
  /* 三处范围都恢复默认（等同各区「清除筛选」），再确认回到完整范围。 */
  Object.assign(app.tableState, app.APP_DEFAULTS.table);
  Object.assign(app.metricsState, app.APP_DEFAULTS.metrics);
  Object.assign(app.personalState, app.APP_DEFAULTS.personal);
  app.renderPersonalChart();
  await page.settle();
  assert.equal(app.tableState.fromPicker || app.personalState.fromPicker || app.metricsState.fromPicker, false);
  assert.ok(app.computeTableRows().length > 1);
  assert.ok(app.metricsTableRows().payg.length > 0);
  near(app.personalChartPrice(plan(page, "plan-0157")), 118);
  page.healthy();
});

test("已应用范围随支付和预算变化重绘，额度量不随折扣被放大", async () => {
  const page = await openPage({ url: "/?budget=100&billing=A&tapply=1&mapply=1&q=BigModel" });
  const app = page.runtime;
  const lite = plan(page, "plan-0157");
  const baseline = app.computeMetrics(app.METRICS_ALL.find((m) => app.metricMatchesPlan(m, lite))!)!;
  const discounted = app.metricsTableRows().rows.find((r) => r.m.ref === "plan-0157")!.c;
  near(discounted.moMidM, baseline.moMidM);
  near(discounted.costPerM, baseline.costPerM! * 0.8);
  app.pickerState.billing = "M";
  await page.settle();
  assert.equal(app.computeTableRows().some((p: Plan) => p.id === "plan-0157"), false);
  assert.equal(app.metricsTableRows().rows.some((r) => r.m.ref === "plan-0157"), false);
  app.pickerState.budget = "200";
  await page.settle();
  assert.match(page.byId("tableBody").textContent!, /V3 Lite/);
  page.healthy();
});

test("推荐卡对比与权益动作可直接访问，无需展开购买详情", async () => {
  const page = await openPage();
  const card = page.byId("quickGrid").querySelector(".quick-card")!;
  assert.ok(card.querySelector(".cmp-add"));
  assert.equal(card.querySelector(".cmp-add")!.closest(".qc-details"), null);
  assert.equal(card.querySelector("[data-view-plan]")!.closest(".qc-details"), null);
  assert.ok(card.querySelector(".qc-payment-summary"));
  page.healthy();
});

test("TRAE Pro 单月购买、自动续费与年付按各自价格参与预算和表格", async () => {
  const page = await openPage();
  const app = page.runtime;
  const trae = plan(page, "plan-0197");
  const quote = (billing: string) => app.pickerPaymentQuote(trae, billing);
  assert.equal(quote("M").monthlyNative, 15);
  assert.equal(quote("M").firstNative, 15);
  assert.equal(quote("M").annualNative, 180);
  assert.equal(quote("A").monthlyNative, 10);
  assert.equal(quote("Y").annualNative, 90);
  Object.assign(app.pickerState, { billing: "M", budget: "100", region: "all" });
  assert.equal(app.withinBudget(trae), false, "$15 超过 ¥100");
  app.pickerState.billing = "A";
  assert.equal(app.withinBudget(trae), true, "$10 连续续费在 ¥100 内");
  const { default: PlanPrice } = await import("../components/PlanPrice.vue");
  const cell = mount(PlanPrice, { props: { plan: trae } });
  assert.match(cell.text(), /连续包月价；单月一次购买 \$15/);
  cell.unmount();
  await page.settle();
  page.healthy();
});
