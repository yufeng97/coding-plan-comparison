
/* 「帮我选」四维条件全组合：候选资格、预算、工具与地区；主计划、替代、升级与补充的约束；卡片结构不变量。
 * 原 scripts/tests/test-app-picker.js 的 225 组断言，卡片改为检查真实 Vue 组件的渲染结果。 */
import { useMount } from "../test/setup";
import { beforeEach, expect, test } from "vitest";
import { nextTick } from "vue";
import * as app from "../test/runtime";
import PickerRecommendations from "../sections/picker/PickerRecommendations.vue";

const recommendations = useMount(PickerRecommendations);
beforeEach(() => {
  Object.assign(app.pickerState, app.APP_DEFAULTS.picker);
  app.cmpState.items = [];
});

type Profile = ReturnType<typeof app.eligibleProfiles>[number];

/* 225 次真实渲染：给足时间，避免并行负载下误报超时 */
test("225组四维推荐满足资格、预算、工具和地区；升级/补充均排除国家限定", async () => {
  await recommendations.render();
  const failures: string[] = [];
  let total = 0;
  const check = (ok: unknown, label: string) => { if (!ok) failures.push(`${label} ${JSON.stringify(app.pickerState)}`); };
  const allowed = (p: Plan, label: string) => {
    check(!app.isRelay(p) && !app.isRetiredPlan(p) && !app.isOneTimePlan(p) && !app.isRenewalOnly(p), label + " 不可购买/中转");
    check(!p.seat && p.cat !== "team", label + " 非个人档");
    check(p.includedModelQuota !== false && p.modelAccess !== "byok" && app.hasCodingSurface(p), label + " 无附赠编程推理额度");
    check(!p.purchaseCountries?.length, label + " 国家限定档不应进入通用推荐");
    check(app.pickerState.region === "all" || p.region === app.pickerState.region, label + " 地区不符");
    check(app.matchesTool(p, app.pickerState.tool), label + " 工具不符");
  };
  const checkCards = () => {
    const grid = document.getElementById("quickGrid")!;
    const cards = Array.from(grid.children).filter((el) => el.classList.contains("quick-card"));
    const ids: string[] = [];
    for (const card of cards) {
      const reasons = card.querySelector(".qc-reasons");
      check(reasons && reasons.children.length >= 1 && reasons.children.length <= 3, "卡片理由不在1–3条内");
      const details = card.querySelector<HTMLDetailsElement>(".qc-details");
      check(details && !details.open && !details.hasAttribute("open"), "购买详情未默认折叠");
      check(card.querySelector(".qc-primary"), "缺少官网入口");
      const id = card.querySelector<HTMLElement>("[data-view-plan]")?.dataset.viewPlan;
      check(id && !ids.includes(id), "卡片重复同套餐或缺少权益入口");
      if (id) ids.push(id);
    }
    check(Number(grid.dataset.cardCount) === cards.length, "卡片列数与内容不一致");
    check(!/priceM|priceY|NaN|undefined/.test(grid.innerHTML), "内部字段/无效数字泄漏");
    return grid;
  };
  const fitsTask = (x: Profile, task: string) => task === "hard" ? !!x.headline : task === "daily" ? !!x.loose.length : !!(x.headline || x.loose.length);

  for (const budget of ["0", "100", "200", "500", "any"])
  for (const region of ["all", "cn", "intl"])
  for (const tool of ["any", "claude", "codex", "cursor", "own"])
  for (const task of ["hard", "both", "daily"]) {
    Object.assign(app.pickerState, { budget, region, tool, task });
    await nextTick();
    total++;
    const pool = app.eligibleProfiles(), main = app.chooseMain(pool);
    const cap = budget === "any" ? Infinity : Number(budget);
    for (const x of pool) {
      allowed(x.p, "候选 " + x.p.plan);
      check((app.cnyOf(x.p, "M") ?? 0) <= cap + 0.05, "候选超预算");
      check(budget === "0" ? x.p.priceM === 0 : (x.p.priceM ?? 0) > 0, "候选免费/付费口径不符");
    }
    const grid = checkCards();
    if (!main) { check(grid.querySelector(".picker-empty"), "无推荐时缺少原因"); continue; }
    check(pool.includes(main), "主计划超出候选池");
    check(fitsTask(main, task), "主计划模型不符任务");
    const alternatives = app.alternativeProfiles(pool, main);
    check(alternatives.length <= 2 && new Set(alternatives.map((x) => x.p.id)).size === alternatives.length, "替代候选数量或去重错误");
    for (const x of alternatives) {
      allowed(x.p, "替代 " + x.p.plan);
      check(pool.includes(x) && x.p !== main.p && (app.cnyOf(x.p, "M") ?? 0) <= cap + 0.05, "替代候选超出预算或重复主计划");
      check(fitsTask(x, task), "替代候选任务不符");
    }
    const next = app.nextTier(main);
    if (next) {
      allowed(next.p, "升级 " + next.p.plan);
      check(next.p.vendor === main.p.vendor && (app.cnyOf(next.p, "M") ?? 0) > (app.cnyOf(main.p, "M") ?? 0), "升级厂商/价格不符");
      check((app.cnyOf(next.p, "M") ?? 0) <= app.upgradeBudgetCeiling() + 0.05, "升级跨过下一预算档");
    }
    const supplement = app.pickSupplement(main, pool).chosen;
    if (supplement) {
      allowed(supplement.p, "补充 " + supplement.p.plan);
      check(app.dailyEntries(pool, main).some((x: Profile) => x.p === supplement.p) && supplement.p.vendor !== main.p.vendor, "补充重复或超出候选");
      check(pool.includes(supplement) || app.isFreeCodingEntry(supplement.p), "主计划候选外仅可加入真实免费推理入口");
      check((app.cnyOf(main.p, "M") ?? 0) + (app.cnyOf(supplement.p, "M") ?? 0) <= cap + 0.05, "补充合计超预算");
    }
  }
  expect(total).toBe(225);
  expect(failures.slice(0, 12)).toEqual([]);
}, 60_000);
