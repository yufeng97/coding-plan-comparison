/* 「帮我选」推荐引擎与推荐卡。原 scripts/tests/test-app-picker.js（页面虚拟 DOM + 经典卡片渲染），
 * 现用真实 App：推荐区由 Vue 渲染，指定档位的卡片用 picker-view 的卡片模型挂载真实 PickerCard。
 * 225 组四维组合见 picker-combinations.test.ts。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { mount } from "@vue/test-utils";
import { openPage, type Page } from "../test/page";
import type { PickerCardModel, PickerProfile } from "../sections/picker-view";

type Runtime = Page["runtime"];
type Profile = ReturnType<Runtime["planProfile"]>;

/** 本次页面的卡片模型构造器（与页面同一份业务模块）。 */
const pickerView = () => import("../sections/picker-view");
/** 用真实 PickerCard 渲染一张卡片模型，返回卡片根节点。 */
async function renderCard(model: PickerCardModel | null) {
  assert.ok(model, "应生成卡片");
  const { default: PickerCard } = await import("../sections/PickerCard.vue");
  const wrapper = mount(PickerCard, { props: { model } });
  await Promise.resolve();
  const element = wrapper.element as HTMLElement;
  return { element, text: element.textContent ?? "", unmount: () => wrapper.unmount() };
}
/** 额度表 5h 列的显示文字（真实 MetricsCell）。 */
async function fiveHourCell(m: unknown, c: unknown) {
  const { default: MetricsCell } = await import("../sections/MetricsCell.vue");
  const wrapper = mount(MetricsCell, { props: { column: "t5h", row: { m, c, payg: false } as never } });
  const text = wrapper.text();
  wrapper.unmount();
  return text;
}
const grid = () => document.getElementById("quickGrid")!;
const mainCardElement = () => document.querySelector<HTMLElement>("#quickGrid > .quick-card");
const cardOf = (id: string) => grid().querySelector(`[data-plan-id="${id}"]`)?.closest<HTMLElement>(".quick-card") ?? null;
async function setPicker(page: Page, state: Partial<Runtime["pickerState"]>) {
  Object.assign(page.runtime.pickerState, state);
  await page.settle();
}
const plan = (app: Runtime, id: string) => {
  const found = app.findPlanReference(id);
  assert.ok(found, "缺少套餐 " + id);
  return found as Plan;
};
const fixture = (value: Record<string, unknown>) => value as unknown as Plan;

test("国家限定套餐始终不入通用推荐，过期country链接清理后完整表仍保留限定徽章", async () => {
  for (const country of ["", "IN", "CN", "US", "invalid"]) {
    const page = await openPage({ url: "/index.html?budget=100&region=intl&tool=cursor&task=daily&country=" + country });
    const app = page.runtime;
    page.healthy();
    assert.equal(new URLSearchParams(location.search).has("country"), false, country + " 退役参数应清除");
    assert.equal(Object.hasOwn(app.pickerState, "country"), false);
    assert.equal(app.eligibleProfiles().some((x: Profile) => x.p.purchaseCountries?.length), false, country + " 限定档不能入候选");
    assert.doesNotMatch(grid().textContent!, /Start（印度专属）/);
    await setPicker(page, { budget: "any", region: "all", tool: "cursor", task: "daily" });
    assert.equal(app.eligibleProfiles().some((x: Profile) => x.p.purchaseCountries?.length), false, "提高预算也不应恢复限定档");
    assert.doesNotMatch(grid().textContent!, /Start（印度专属）/);
    app.tableState.search = "Cursor Start";
    await page.settle();
    assert.equal(app.computeTableRows().some((p: Plan) => p.vendor === "Cursor" && p.plan === "Start（印度专属）"), true);
    assert.match(page.byId("tableBody").textContent!, /仅限印度/);
    page.healthy();
  }
});

test("Pro无5h上限不触发Go Plus加购，平台免费及非编程订阅不进入推荐", async () => {
  const page = await openPage();
  const app = page.runtime;
  const { mainCard, dailyCard } = await pickerView();
  await setPicker(page, { budget: "any", region: "all", tool: "any", task: "both" });
  for (const price of [100, 200, 500]) {
    const pro = app.PLANS.find((p) => p.vendor === "OpenAI" && p.priceM === price && p.plan.startsWith("ChatGPT Pro"))!;
    const profile = app.planProfile(pro) as PickerProfile;
    assert.equal(profile.windowPeriod, "none");
    assert.equal(profile.shared, false);
    const card = await renderCard(mainCard(profile, app.eligibleProfiles()));
    assert.match(card.text, /日常已包含/);
    assert.doesNotMatch(card.text, /OpenCode Go Plus|可选补充|另付/);
    card.unmount();
    assert.equal(dailyCard(profile, app.eligibleProfiles()), null, "已包含权益不应重复套餐和月费出第二卡");
    assert.match(app.windowSentence(pro, profile.headline), /没有 5 小时上限/);
  }
  for (const [vendor, name] of [["xAI", "SuperGrok"], ["Canopy Wave", "Coding Plan Pro Bundle"]] as const) {
    assert.ok(app.PLANS.find((p) => p.vendor === vendor && p.plan === name), vendor + " 测试方案存在");
    assert.equal(app.eligibleProfiles().some((x: Profile) => x.p.vendor === vendor && x.p.plan === name), true, vendor + " 编程入口不应被通用工具正则误排除");
  }
  assert.equal(app.recommendablePlan(app.PLANS.find((p) => p.vendor === "Kilo Code" && p.priceM === 0)!), false);
  assert.equal(app.recommendablePlan(app.PLANS.find((p) => p.vendor === "Google" && p.plan === "Google AI Plus")!), false);
  await setPicker(page, { budget: "0", region: "all", tool: "any", task: "daily" });
  for (const vendor of ["Kilo Code", "Zed", "Cline", "Roo Code"]) {
    const free = app.PLANS.filter((p) => p.priceM === 0 && p.vendor.startsWith(vendor));
    assert.ok(free.length > 0, vendor + " 免费平台测试方案存在");
    assert.ok(free.every((p) => !app.eligibleProfiles().some((x: Profile) => x.p === p)), vendor + " 未附赠推理额度，不能进入免费主计划候选");
  }
  for (const title of grid().querySelectorAll(".qc-plan")) assert.doesNotMatch(title.textContent!, /^(?:Kilo Code|Zed|Cline|Roo Code)/);
  page.healthy();
});

test("附加模型权益可检索，窗口缺省展示不编造5h额度", async () => {
  const page = await openPage();
  const app = page.runtime;
  app.tableState.search = "Astra Ultrafast";
  await page.settle();
  assert.equal(app.computeTableRows().some((p: Plan) => p.vendor === "OpenAI" && p.priceM === 500), true);
  assert.match(page.byId("tableBody").textContent!, /Astra Ultrafast/);
  const placeholder = (period: string) => fiveHourCell({ windowPeriod: period }, { fLow: null });
  assert.match(await placeholder("none"), /无5h上限/);
  assert.match(await placeholder("month"), /月度池；无5h额度/);
  assert.match(await placeholder("unknown"), /未公布/);
  assert.equal(app.fmtVal(null, "USD"), "—");
  assert.equal(app.rateClass(null), "");
  const mimo = app.windowNoteShort(app.planProfile(app.PLANS.find((p) => p.vendor === "小米 MiMo" && p.plan === "Token Plan Lite")!));
  assert.match(mimo, /共用月度额度池/);
  assert.doesNotMatch(mimo, /共享情况未公开|5 小时/);
  await setPicker(page, { region: "cn", budget: "200", tool: "cursor", task: "daily" });
  assert.doesNotMatch(grid().textContent!, /没赢|没拿下|复杂任务主计划/);
  page.healthy();
});

test("付费主计划可配免费推理入口，合计预算和地区工具资格保持正确", async () => {
  const page = await openPage();
  const app = page.runtime;
  const { dailyCard } = await pickerView();
  await setPicker(page, { budget: "100", region: "all", tool: "codex", task: "both" });
  const pool = app.eligibleProfiles(), main = app.chooseMain(pool)!, supplement = app.pickSupplement(main, pool).chosen!;
  assert.equal(main.p.id, "plan-0164");
  assert.equal(supplement.p.id, "plan-0008");
  assert.equal(app.cnyOf(supplement.p, "M"), 0);
  assert.equal(app.cnyOf(main.p, "M")! + app.cnyOf(supplement.p, "M")!, app.cnyOf(main.p, "M"));
  const card = await renderCard(dailyCard(main, pool));
  assert.match(card.text, /ChatGPT Free|免费入口|无需额外月费/);
  assert.doesNotMatch(card.text, /当前预算放不下|另付 免费|高于当前预算/);
  card.unmount();
  for (const [region, tool] of [["cn", "codex"], ["all", "claude"], ["cn", "own"]]) {
    await setPicker(page, { region, tool });
    const entries = app.dailyEntries(app.eligibleProfiles(), app.planProfile(plan(app, "plan-0164")));
    assert.ok(entries.every((x: Profile) => app.recommendablePlan(x.p) && app.hasIncludedModelQuota(x.p) && app.matchesTool(x.p, app.pickerState.tool) && (region === "all" || x.p.region === region)));
    assert.ok(entries.every((x: Profile) => x.p.id !== "plan-0008"), region + "/" + tool + " 不应混入不合资格的ChatGPT免费入口");
  }
  /* 有预算也优先采用能免费覆盖的入口；付费参考不能被错误标成超预算。 */
  await setPicker(page, { budget: "500", region: "all", tool: "cursor", task: "both" });
  assert.match(grid().textContent!, /Cursor Hobby/);
  assert.doesNotMatch(grid().textContent!, /日常用 Grok 4、Composer，另付/);
  await setPicker(page, { budget: "100", region: "all", tool: "codex", task: "both" });
  const base = { vendor: "Free Fixture", plan: "Free", cat: "tool", region: "intl", priceM: 0, cur: "USD", quota: "持续附赠推理额度", models: "GPT-6 Luna", tools: "Codex" };
  app.PLANS.push(fixture({ ...base, id: "fixture-free" }),
    fixture({ ...base, id: "fixture-country", purchaseCountries: ["IN"] }),
    fixture({ ...base, id: "fixture-byok", modelAccess: "byok", includedModelQuota: false }),
    fixture({ ...base, id: "fixture-team", cat: "team", seat: true }),
    fixture({ ...base, id: "fixture-no-coding", codingSurface: false }));
  const ids = app.dailyEntries(app.eligibleProfiles(), app.planProfile(plan(app, "plan-0164"))).map((x: Profile) => x.p.id);
  assert.ok(ids.includes("fixture-free"));
  for (const id of ["fixture-country", "fixture-byok", "fixture-team", "fixture-no-coding"]) assert.ok(!ids.includes(id), id);
  page.healthy();
});

test("200元预算的升级与档位对比最多到500元，538元档不出现且含价核查不泄漏字段", async () => {
  const page = await openPage();
  const app = page.runtime;
  await setPicker(page, { budget: "200", region: "cn", tool: "any", task: "hard" });
  /* GLM 改按官方积分系数统一折算后，同为 B 档模型且额度更大的小米 Standard 胜出。 */
  assert.equal(app.chooseMain(app.eligibleProfiles())!.p.id, "plan-0168");
  assert.equal(app.upgradeBudgetCeiling(), 500);
  const next = app.nextTier(app.chooseMain(app.eligibleProfiles()));
  assert.ok(!next || app.pickerMonthlyCNY(next.p) <= 500.05, String(next && app.pickerMonthlyCNY(next.p)));
  assert.doesNotMatch(grid().innerHTML, /GLM Coding V3 Pro|priceM|priceY/);
  const tierPrices = Array.from(grid().querySelectorAll(".qc-tiers .qc-tier-price"), (td) => Number(td.getAttribute("data-cny")));
  assert.ok(tierPrices.length >= 2 && tierPrices.every((price) => price <= 500.05), tierPrices.join(","));
  assert.match(grid().textContent!, /页面月费|月付价|月费/);
  assert.equal(grid().querySelectorAll(".qc-details[open]").length, 0);
  assert.equal(grid().querySelectorAll(".qc-primary").length, Number(grid().dataset.cardCount) + grid().querySelectorAll(".picker-alternatives-grid .quick-card").length);
  await setPicker(page, { budget: "500" });
  assert.ok(app.pickerMonthlyCNY(app.nextTier(app.chooseMain(app.eligibleProfiles()))!.p) > 500);
  assert.match(grid().textContent!, /高于当前预算/);
  page.healthy();
});

test("真实月度系数和日月请求行在额度表显示月池而非5h数值", async () => {
  const page = await openPage();
  const app = page.runtime;
  const rows = app.METRICS_ALL.filter((m) => ["小米 MiMo", "腾讯云 TokenHub", "Canopy Wave"].includes(m.vendor));
  const cells = await Promise.all(rows.map((m) => fiveHourCell(m, app.computeMetrics(m))));
  assert.equal(cells.length, 19);
  assert.ok(cells.every((cell) => cell.includes("月度池；无5h额度")), cells.join("\n"));
  page.healthy();
});

test("真实缺省周期历史估算不冒充5h额度，明确官方周窗口仍按假设展示", async () => {
  const page = await openPage();
  const app = page.runtime;
  const rows = app.METRICS_ALL.filter((m) => ["plan-0017", "plan-0105", "plan-0080", "plan-0081"].includes(String(m.ref)));
  assert.equal(rows.length, 4);
  for (const m of rows) {
    const c = app.computeMetrics(m)!;
    const ref = String(m.ref);
    assert.equal(m.windowPeriod, "unknown", ref);
    assert.equal(c.fLow, null, ref);
    assert.equal(c.r5h, null, ref);
    assert.ok(c.moLow != null && c.costPerM != null && c.moLow > 0 && c.costPerM > 0, ref);
    assert.match(await fiveHourCell(m, c), /未公布/);
  }
  /* 智谱/Z.ai 每周 10,000 积分按官方抵扣系数与统一假设（636.8 积分/百万 tokens）折算，不再采用厂商自估的 48M。 */
  const official = app.METRICS_ALL.find((m) => m.ref === "plan-0031")!;
  assert.equal(app.computeMetrics(official)!.fLow, 3.1407);
  assert.equal(official.vendorWkLowM, 48);
  page.healthy();
});

test("讯飞异版本牌价估算在真实页面保留低置信，排除官方和官方折算排行", async () => {
  const page = await openPage();
  const app = page.runtime;
  const m = app.METRICS_ALL.find((row) => row.ref === "plan-0082")!;
  const scope = (value: string) => { app.rankState.scope = value; return app.rankScopeOk(m); };
  assert.equal(m.isEst, true);
  assert.equal(app.provenance(m).conf, "低");
  assert.match(app.provenance(m).text, /异版本牌价代理/);
  assert.equal(scope("official"), false);
  assert.equal(scope("credits"), false);
  assert.equal(scope("all"), true);
  page.healthy();
});

test("继承模型保留日常与新增旗舰，明确否定K3和自家入口保持正确", async () => {
  const page = await openPage();
  const app = page.runtime;
  for (const id of ["plan-0092", "plan-0093"]) {
    const profile = app.planProfile(plan(app, id));
    assert.equal(profile.headline?.id, "claude-opus");
    assert.ok(profile.loose.some((r: { id: string }) => r.id === "luna"));
    assert.ok(profile.loose.some((r: { id: string }) => r.id === "grok"));
  }
  const small = app.planProfile(plan(app, "plan-0212")).included.map((r: { id: string }) => r.id);
  assert.ok(!small.includes("kimi-k3"));
  assert.ok(small.includes("glm-5"));
  app.tableState.search = "Luna";
  const search = app.computeTableRows().filter((p: Plan) => p.vendor === "GitHub Copilot").map((p: Plan) => p.plan);
  assert.ok(search.includes("Pro+") && search.includes("Max"));
  Object.assign(app.pickerState, { budget: "any", region: "intl", tool: "own", task: "daily" });
  assert.deepEqual(app.eligibleProfiles().filter((x: Profile) => x.p.vendor === "xAI").map((x: Profile) => x.p.plan), ["SuperGrok", "SuperGrok Plus"]);
  assert.equal(app.nextTier(app.planProfile(plan(app, "plan-0091")))?.p.plan, "Pro+");
  const base = fixture({ id: "role-base", vendor: "Role Fixture", plan: "Base", models: "Claude Sonnet / Haiku（不含 Opus）" });
  const added = fixture({ id: "role-added", vendor: "Role Fixture", plan: "Added", models: "新增 Opus", modelBaseRef: "role-base", modelIncludes: ["Claude Opus"] });
  const excluded = fixture({ ...added, id: "role-excluded", modelExcludes: ["Claude Opus"] });
  app.PLANS.push(base, added, excluded);
  assert.equal(app.planProfile(base).headline, null);
  assert.equal(app.planProfile(added).headline?.id, "claude-opus");
  assert.equal(app.planProfile(excluded).headline, null);
  await page.settle();
  page.healthy();
});

test("推荐卡可直接对比和查看权益，展示本档核查及准确全年年费", async () => {
  const page = await openPage();
  const app = page.runtime;
  const { mainCard } = await pickerView();
  const claude = plan(app, "plan-0002"), google = plan(app, "plan-0017");
  app.priceCheckOf(claude)!.checkedAt = "2020-01-02";
  await setPicker(page, { budget: "500", region: "all", tool: "any", task: "both" });
  const card = await renderCard(mainCard(app.planProfile(claude) as PickerProfile, app.eligibleProfiles()));
  assert.match(card.text, /2020-01-02/);
  assert.match(card.text, /查看核查依据/);
  assert.doesNotMatch(card.text, /页面数据更新于/);
  assert.match(card.text, /\$200\/年/);
  assert.doesNotMatch(card.text, /200\.04/);
  assert.ok(card.element.querySelector('[data-plan-id="plan-0002"]'));
  assert.ok(card.element.querySelector('[data-view-plan="plan-0002"]'));
  card.unmount();
  assert.match(app.annualPaymentText(google), /\$199\.99\/年/);
  assert.equal(app.alternativeProfiles(app.eligibleProfiles(), app.chooseMain(app.eligibleProfiles())).length, 2);
  assert.match(grid().textContent!, /其他候选（2 档，均在预算内）/);
  assert.match(grid().textContent!, /选取理由/);
  page.healthy();
});

test("真实推荐卡的对比按钮可操作且重绘后保留选择与自身焦点", async () => {
  const page = await openPage();
  const app = page.runtime;
  await setPicker(page, { budget: "500", region: "cn", tool: "any", task: "both" });
  const button = grid().querySelector<HTMLElement>(".cmp-add")!;
  assert.equal(button.closest(".qc-details"), null, "推荐动作应无需展开即可操作");
  const id = button.dataset.planId!;
  page.fire(button, "click");
  await page.settle();
  assert.equal(app.cmpState.items.some((p: Plan) => p.id === id), true);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  button.focus();
  /* 推荐区按共享状态重新计算（评测数据到达也会这样）。 */
  app.dataRevision.benchmark++;
  await page.settle();
  const current = grid().querySelector<HTMLElement>(`.cmp-add[data-plan-id="${id}"]`)!;
  assert.equal(current.getAttribute("aria-pressed"), "true");
  assert.equal(current.closest(".qc-details"), null, "重绘后的动作仍可直接访问");
  assert.equal(document.activeElement, current);
  page.healthy();
});

test("首屏评测摘要与评测页「每模型最佳配置」的模型、分数和名次逐行一致", async () => {
  const page = await openPage();
  const app = page.runtime;
  const protocols = app.BENCHMARK_SUMMARY.protocols;
  assert.deepEqual([...new Set(protocols.map((p) => p.family))], ["deepswe", "cursorbench", "SWE-bench"]);
  assert.deepEqual(protocols.filter((p) => p.family === "deepswe").map((p) => p.version), ["1.1", "1"]);
  for (const protocol of protocols) {
    Object.assign(app.publicBenchmarkState, { id: protocol.id, family: protocol.family, search: "", mode: "best" });
    assert.deepEqual(app.publicBenchmarkRows().map((r: { model: string; score: number; rank: number }) => [r.model, r.score, r.rank]), protocol.rows.map((r) => [r.model, r.score, r.rank]), protocol.id);
    assert.equal(protocol.total, protocol.rows.length);
  }
  page.healthy();
});

test("推荐卡评测行只列本档明确包含的精确版本，转义文案且不改变推荐", async () => {
  const page = await openPage();
  const app = page.runtime;
  await setPicker(page, { region: "intl", budget: "200", tool: "any", task: "hard", billing: "M" });
  const main = app.chooseMain(app.eligibleProfiles())!.p;
  /* 前提：主计划列出 Opus 5.5，不含 Opus 4.1。 */
  assert.equal(app.publicModelIncluded(main, "Claude Opus 5.5"), true);
  assert.equal(app.publicModelIncluded(main, "Claude Opus 4.1"), false);
  const summary = app.BENCHMARK_SUMMARY as { schemaVersion: number; protocols: unknown[] };
  summary.protocols = [{ id: "fixture-coding", family: "deepswe", name: "Fixture <b>Coding</b>", version: "1", metric: "pass@1", unit: "%", checkedAt: "2026-10-08", total: 3, rows: [
    { model: "claude-opus-4-1", reasoning: null, score: 90, rank: 1 },
    { model: "claude-opus-5-5", reasoning: "max", score: 80, rank: 2 },
    { model: "Fixture Unlisted", reasoning: null, score: 70, rank: 3 }] }];
  app.dataRevision.benchmark++;
  await page.settle();
  assert.equal(app.chooseMain(app.eligibleProfiles())!.p.id, main.id, "评测摘要不参与推荐排序");
  const bench = mainCardElement()!.querySelector(".qc-bench");
  assert.ok(bench, "主计划应显示评测行");
  assert.equal(bench.querySelector("li")!.textContent, "Fixture <b>Coding</b> 第 2/3 名 · Claude Opus 5.5 80%", "协议名按文本显示");
  assert.equal(bench.querySelector("li b")!.textContent, "Fixture <b>Coding</b>");
  assert.doesNotMatch(bench.textContent!, /Opus 4\.1|Fixture Unlisted/);
  assert.match(bench.textContent!, /不参与推荐排序/);
  assert.ok(bench.querySelector('a[href="#benchmarks"]'));
  assert.match(app.pickerChoiceReason(app.planProfile(main)), /公开编程评测只作模型能力参考/);
  summary.schemaVersion = 2;
  app.dataRevision.benchmark++;
  await page.settle();
  assert.equal(grid().querySelector(".qc-bench"), null, "摘要格式不认识时不显示评测行");
  page.healthy();
});

test("同档候选的额度都无法折算时，主卡写明按月费较低选出", async () => {
  const page = await openPage();
  const app = page.runtime;
  const reasons = () => Array.from(mainCardElement()!.querySelectorAll(".qc-reasons li"), (li) => li.textContent);
  const state = async (region: string, budget: string) => {
    await setPicker(page, { region, budget, tool: "any", task: "hard", billing: "M" });
    const pool = app.eligibleProfiles(), main = app.chooseMain(pool)!;
    const ties = app.hardRepresentatives(pool).filter((x: Profile) => x.p !== main.p && app.hardMainOrder(main, x, false) === 0 && app.pickerMonthlyCNY(x.p) > app.pickerMonthlyCNY(main.p));
    return { tokens: app.knownTokens(main.p, main.headline), ties: ties.length, decided: app.priceDecidedMain(main, pool) };
  };
  const cheap = await state("intl", "100");
  assert.deepEqual({ ...cheap, ties: cheap.ties > 0 }, { tokens: 0, ties: true, decided: true });
  assert.ok(reasons().some((text) => text!.startsWith("同档候选的额度都无法折算，按月费较低选出")));
  /* 档位更高的唯一候选不是靠月费胜出。 */
  assert.deepEqual(await state("intl", "200"), { tokens: 0, ties: 0, decided: false });
  assert.doesNotMatch(mainCardElement()!.textContent!, /按月费较低选出/);
  /* 有可折算额度时按额度说明。 */
  assert.equal((await state("cn", "200")).decided, false);
  assert.ok(reasons().some((text) => text!.startsWith("按官方额度规则折算，保守参考下限")));
  page.healthy();
});

test("国内 Claude Code 不限预算使用 Max 20x 作国际参考，与主计划共用额度选档规则", async () => {
  const page = await openPage({ url: "/?budget=any&region=cn&tool=claude&task=hard" });
  const app = page.runtime;
  const { mainCard, ownCard } = await pickerView();
  const main = app.chooseMain(app.eligibleProfiles())!, picked = app.ownVendorPlan("Anthropic")!;
  const own = app.planProfile(picked.plan);
  assert.equal(main.p.vendor, "智谱 BigModel");
  assert.equal(main.p.region, "cn");
  assert.equal(picked.plan.id, "plan-0004");
  assert.equal(picked.plan.priceM, 200);
  assert.equal(picked.regionMiss, true);
  assert.equal(picked.withinBudget, true);
  assert.equal(app.knownTokens(own.p, own.headline), 0, "未公开 token 量时不按月费制造额度");
  const mainText = (await renderCard(mainCard(main, app.eligibleProfiles()))).text;
  assert.match(mainText, /Claude Code 兼容接入 · GLM-5\.3/);
  assert.match(mainText, /支持 Claude Code 不代表附赠 Claude 模型/);
  const ownModel = ownCard(main);
  const card = await renderCard(ownModel);
  assert.match(card.text, /Anthropic 国际参考/);
  assert.match(card.text, /Claude Max 20x/);
  assert.equal(card.element.querySelector(".qc-value em")!.textContent, "$200");
  assert.match(card.element.querySelector(".qc-value")!.textContent!, /^\$200\/月/);
  assert.match(card.text, /与主计划采用相同规则/);
  assert.match(card.text, /当前地区不符合；此卡仅供参考/);
  assert.match(card.text, /Claude Pro|Claude Max 5x|Claude Max 20x/);
  assert.match(card.text, /20× Pro/);
  assert.match(card.text, /当前参考|地区外参考/);
  card.unmount();
  const tiers = cardOf("plan-0004")!.querySelector(".qc-tiers")!;
  assert.equal(tiers.querySelectorAll("tbody tr").length, 3);
  page.healthy();
});

test("自家订阅有限预算按可负担额度选档，预算过低和缺少年价均保留参考边界", async () => {
  const page = await openPage();
  const app = page.runtime;
  const { ownCard } = await pickerView();
  const picked = async (budget: string, billing = "M", region = "cn", task = "hard") => {
    await setPicker(page, { budget, billing, region, tool: "claude", task });
    const own = app.ownVendorPlan("Anthropic")!;
    const model = ownCard(app.chooseMain(app.eligibleProfiles()));
    const card = model ? await renderCard(model) : null;
    const text = card?.text ?? "";
    card?.unmount();
    return { id: own.plan.id, fit: own.withinBudget, regionMiss: own.regionMiss, quote: app.pickerPaymentQuote(own.plan), text };
  };
  for (const budget of ["200", "500"]) {
    const p = await picked(budget);
    assert.equal(p.id, "plan-0002");
    assert.equal(p.fit, true);
    assert.match(p.text, /先满足当前预算/);
  }
  for (const budget of ["0", "100"]) {
    const p = await picked(budget);
    assert.equal(p.id, "plan-0002");
    assert.equal(p.fit, false);
    assert.match(p.text, /高于当前预算/);
    assert.match(p.text, /月费最低的一档作参考/);
  }
  const max5 = await picked("1000");
  assert.equal(max5.id, "plan-0003");
  assert.equal(max5.fit, true);
  const annual = await picked("any", "Y");
  assert.equal(annual.id, "plan-0002", "Max 未公开年价，不进入年付预算选档");
  assert.equal(annual.quote.firstNative, 200);
  assert.equal(annual.quote.periodMonths, 12);
  assert.doesNotMatch(annual.text, /Claude Max 20x/);
  for (const task of ["hard", "both", "daily"]) {
    const domestic = await picked("any", "M", "cn", task);
    const international = await picked("any", "M", "intl", task);
    assert.equal(domestic.id, "plan-0004", task);
    assert.equal(domestic.regionMiss, true);
    assert.equal(international.id, "plan-0004", task);
    assert.equal(international.regionMiss, false);
    const anthropic = app.PLANS.filter((p) => p.vendor === "Anthropic" && app.withinBudget(p)).map(app.planProfile);
    assert.equal(app.ownVendorPlan("Anthropic")!.plan.id, app.chooseMain(anthropic)!.p.id, task);
    assert.equal(ownCard(app.planProfile(plan(app, "plan-0004")) as PickerProfile), null, "原生主卡已展示时不重复同一厂商参考");
  }
  page.healthy();
});

test("自家订阅不把更高月费当作更大额度，额度相同仍选较低月费", async () => {
  const page = await openPage();
  const app = page.runtime;
  Object.assign(app.pickerState, { budget: "any", region: "cn", tool: "claude", task: "hard", billing: "M" });
  app.PLANS.push({ ...plan(app, "plan-0004"), id: "fixture-native-expensive", plan: "Claude Personal Premium", priceM: 300 });
  assert.equal(app.ownVendorPlan("Anthropic")!.plan.id, "plan-0004");
  await page.settle();
  page.healthy();
});

test("推荐显示套餐明确支持的 GLM 与 GPT Sol 版本，不用用途角色的新版本冒充", async () => {
  const page = await openPage();
  const app = page.runtime;
  const { mainCard } = await pickerView();
  const name = (id: string) => { const p = plan(app, id); return app.roleDisplayName(p, app.planProfile(p).headline); };
  assert.equal(name("plan-0157"), "GLM-5.3");
  assert.equal(name("plan-0088"), "GLM-5.2");
  assert.equal(name("plan-0202"), "GLM-5");
  assert.equal(name("plan-0082"), "GLM-5");
  assert.equal(name("plan-0069"), "GPT-5.6 Sol");
  assert.equal(name("plan-0070"), "GPT-5.6 Sol");
  assert.equal(name("plan-0010"), "GPT-6.1 Sol");
  assert.equal(name("plan-0011"), "GPT-6.1 Sol", "GPT 全系括号内的明确 Sol 版本可显示");
  const card = await renderCard(mainCard(app.planProfile(plan(app, "plan-0088")) as PickerProfile, app.eligibleProfiles()));
  assert.match(card.text, /GLM-5\.2 适合复杂编码任务/);
  assert.doesNotMatch(card.text, /GLM-5\.3/);
  card.unmount();
  const denied = { ...plan(app, "plan-0157"), models: "GLM-5.2、GLM-5.2-Flash；不含 GLM-5.3", modelExcludes: ["GLM-5.3"] };
  assert.equal(app.roleDisplayName(denied, app.MODEL_ROLES.find((r) => r.id === "glm-5")), "GLM-5.2", "被明确排除的较新版本不能成为显示名称");
  page.healthy();
});

test("Luna 与 Astra 显示本档版本，支持官方简称并保留未公开系列", async () => {
  const page = await openPage();
  const app = page.runtime;
  const role = (id: string) => app.MODEL_ROLES.find((r) => r.id === id);
  const name = (id: string, roleId: string) => app.roleDisplayName(plan(app, id), role(roleId));
  assert.equal(name("plan-0040", "luna"), "GPT-5.6 Luna", "OpenCode Go 的 5.6 Luna 不能显示角色默认 6 Luna");
  assert.equal(name("plan-0008", "luna"), "GPT-6 Luna");
  assert.equal(name("plan-0010", "luna"), "GPT-6 Luna", "Luna 简称继承前一个明确 GPT 模型版本");
  assert.equal(name("plan-0010", "gpt-astra"), "GPT-6 Astra");
  assert.equal(name("plan-0011", "luna"), "GPT-6 Luna", "GPT 全系括号内的 Luna 版本可显示");
  assert.equal(name("plan-0011", "gpt-astra"), "GPT-6 Astra");
  const denied = { ...plan(app, "plan-0010"), models: "GPT-5.6 Astra / GPT-5.6 Luna；不含 GPT-6 Astra / GPT-6 Luna", modelExcludes: ["GPT-6 Astra", "GPT-6 Luna"] };
  assert.deepEqual(["gpt-astra", "luna"].map((id) => app.roleDisplayName(denied, role(id))), ["GPT-5.6 Astra", "GPT-5.6 Luna"]);
  const unknown = { ...plan(app, "plan-0010"), models: "GPT 系列" };
  assert.deepEqual(["gpt-sol", "gpt-astra", "luna"].map((id) => app.roleDisplayName(unknown, role(id))), ["GPT Sol 系列", "GPT Astra 系列", "GPT Luna 系列"]);
  const models = app.planCodingBenchmarks(plan(app, "plan-0040"), role("luna")).map((hit: { row: { model: string } }) => app.publicModelDisplayName(hit.row.model));
  assert.ok(models.length && models.every((model: string) => model === "GPT-5.6 Luna"), "评测仍只匹配权益中的 5.6 Luna");
  page.healthy();
});

test("套餐卡先展示付款简句和可操作按钮，全年费用、评测和档位表在详情中", async () => {
  const page = await openPage({ url: "/?budget=any&region=cn&tool=claude&task=hard" });
  const cards = grid().querySelectorAll<HTMLElement>(".quick-card");
  assert.ok(cards.length > 0);
  for (const card of cards) {
    const summary = card.querySelector(".qc-payment-summary")!;
    assert.equal(summary.closest(".qc-details"), null);
    assert.match(summary.textContent!, /首次.*按当前价续期/);
    assert.doesNotMatch(summary.textContent!, /12 个月|费用情景|续费与优惠资格/);
    const details = card.querySelector<HTMLDetailsElement>(".qc-details")!;
    assert.ok(details && !details.open);
    assert.match(details.querySelector(".qc-payment-summary")!.textContent!, /12 个月/);
    for (const content of card.querySelectorAll(".qc-bench, .qc-tiers")) assert.equal(content.closest(".qc-details"), details);
    for (const action of card.querySelectorAll(".cmp-add, [data-view-plan], .qc-primary, .qc-watch")) assert.equal(action.closest(".qc-details"), null);
  }
  await setPicker(page, { billing: "Y" });
  assert.match(cardOf("plan-0002")!.querySelector(".qc-payment-summary")!.textContent!, /首次 \$200，一次支付全年/);
  page.healthy();
});

test("复杂任务评测只展示主力系列的精确版本，日常模型成绩不填充复杂任务卡", async () => {
  const page = await openPage({ url: "/?budget=200&region=intl&task=hard" });
  const app = page.runtime;
  const summary = app.BENCHMARK_SUMMARY as { protocols: { rows: unknown[] }[] };
  summary.protocols = [{ id: "fixture-task", family: "deepswe", name: "Task fixture", unit: "%", total: 2, rows: [
    { model: "claude-haiku-4-5", score: 90, rank: 1 }, { model: "claude-opus-5-5", score: 80, rank: 2 }] } as { rows: unknown[] }];
  app.dataRevision.benchmark++;
  await page.settle();
  assert.match(mainCardElement()!.textContent!, /Claude Opus 5\.5 80%/);
  assert.doesNotMatch(mainCardElement()!.textContent!, /Claude Haiku 4\.5 90%/);
  summary.protocols[0]!.rows.pop();
  app.dataRevision.benchmark++;
  await page.settle();
  assert.equal(mainCardElement()!.querySelector(".qc-bench"), null, "没有主力模型评测时不借用日常模型成绩");
  page.healthy();
});

test("Cursor 复杂任务参考说明按量池费用，模型能力不被错误描述为不存在", async () => {
  const page = await openPage({ url: "/?budget=200&region=cn&tool=cursor&task=hard" });
  const own = cardOf("plan-0098")!;
  const reasons = Array.from(own.querySelectorAll(".qc-reasons li"), (li) => li.textContent).join("；");
  assert.match(reasons, /复杂任务模型在按量池，需核对额度与费用/);
  assert.doesNotMatch(reasons, /没有匹配.*任务.*模型/);
  assert.equal(own.querySelector(".qc-bench"), null, "按量池复杂任务卡不展示附赠日常模型的评测");
  const policy = () => page.byId("pickerPolicy").textContent!;
  assert.match(policy(), /模型用途分组.*可折算额度.*倍率.*套餐类别/);
  assert.match(policy(), /公开评测仅供能力参考/);
  await setPicker(page, { budget: "any", task: "daily" });
  assert.match(policy(), /日常优先独立额度池/);
  assert.match(policy(), /预算不限会优先较大额度档/);
  page.healthy();
});
