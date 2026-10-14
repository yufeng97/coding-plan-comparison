/* 2026-10-13 数据更新与审查修复的回归：The X Subscription 的收录口径（新永久 ID、旧档仅老用户续费、旧免费档并入新 Free）、
 * 每周额度池的文字、选 Cursor 时自家订阅卡的选档、额度表牌价按自身币种显示，以及变更记录的读者文字（新收录只列要点、不露出内部字段）。 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { mount } from "@vue/test-utils";
import { openPage } from "../test/page";
import { MAINTENANCE_DATA } from "../test/setup";
import { METRICS_RAW, changeDisplay, findPlanReference, isDuplicateListing, isFreeCodingEntry, isOnSalePlan, isPersonalMonthly, isRenewalOnly } from "../generated/catalog";
import { listPriceParts } from "@domain/table-format";
import ChangeCard from "../sections/follow/ChangeCard.vue";

const plan = (id: string) => {
  const found = findPlanReference(id);
  assert.ok(found, id);
  return found;
};

test("X Subscription 新档用新永久 ID，旧 SuperGrok / Cursor 付费档仅老用户续费，旧免费档并入新 Free", () => {
  const premium = plan("plan-0215");
  assert.equal(premium.vendor, "xAI");
  assert.deepEqual([premium.priceM, premium.priceY, premium.annualTotal, premium.cur], [30, 25, 300, "USD"]);
  for (const id of ["plan-0214", "plan-0215", "plan-0216", "plan-0217"]) {
    const p = plan(id);
    assert.equal(p.windowPeriod, "week", id);
    assert.equal(p.quotaSharing, "shared", id);
    assert.ok(isPersonalMonthly(p), id);
    assert.ok(Math.abs(p.annualTotal! / 12 - p.priceY!) <= 0.02, id + " 年付折月与全年金额一致");
  }
  for (const id of ["plan-0218", "plan-0219", "plan-0220"]) {
    const p = plan(id);
    assert.ok(p.seat && p.cat === "team", id);
    assert.equal(p.priceY, null, id + " 团队年付价未公开，不照搬个人年付");
  }
  for (const id of ["plan-0025", "plan-0026", "plan-0098", "plan-0099", "plan-0100", "plan-0101", "plan-0102"]) {
    const p = plan(id);
    assert.ok(isRenewalOnly(p) && /老用户续费/.test(p.plan), id);
    assert.equal(isPersonalMonthly(p), false, id + " 不进入个人在售月付与推荐");
    assert.equal(isOnSalePlan(p), true, id + " 仍在完整价格表供老用户核对");
  }
  for (const id of ["plan-0023", "plan-0096"]) {
    const p = plan(id);
    assert.equal(p.sameAs, "plan-0213", id);
    assert.ok(isDuplicateListing(p) && !isFreeCodingEntry(p), id);
  }
  assert.ok(isFreeCodingEntry(plan("plan-0213")), "X Subscription Free 是新的免费编程入口");
});

test("选 Cursor 时自家订阅卡来自 X Subscription：复杂任务优先能按量用第三方旗舰的档，超预算时如实提示", async () => {
  const page = await openPage({ url: "/?budget=500&region=all&tool=cursor&task=hard" });
  const app = page.runtime;
  assert.equal(app.TOOL_OWN_VENDOR.cursor, "xAI");
  const own = app.ownVendorPlan("xAI")!;
  assert.equal(own.plan.id, "plan-0215", "Plus 只有 Grok 模型，复杂任务参考选 Premium");
  assert.equal(own.withinBudget, true);
  const card = () => document.querySelector("#quickGrid [data-plan-id=\"plan-0215\"]")?.closest(".quick-card") ?? null;
  assert.ok(card(), "推荐区显示 X Subscription Premium 自家订阅卡");
  assert.match(card()!.textContent!, /Cursor 自家订阅，模型与额度由 xAI 提供/);
  assert.match(card()!.textContent!, /复杂任务模型在按量池/);
  assert.match(card()!.textContent!, /X Subscription 承载/);
  Object.assign(app.pickerState, { budget: "200" });
  await page.settle();
  const tight = app.ownVendorPlan("xAI")!;
  assert.equal(tight.plan.id, "plan-0215", "预算放不下时仍给能按量用旗舰的档作参考");
  assert.equal(tight.withinBudget, false);
  assert.match(card()!.textContent!, /高于当前预算/);
  Object.assign(app.pickerState, { budget: "any", task: "daily" });
  await page.settle();
  assert.match(app.windowNoteShort(app.planProfile(plan("plan-0217"))), /共用每周额度池，没有 5 小时窗口/);
  page.healthy();
});

test("额度表的模型牌价按牌价自身币种显示：人民币套餐里的美元牌价用 $，印度卢比用 ₹", () => {
  assert.deepEqual(listPriceParts({ cur: "CNY", apiCur: "USD", apiIn: 0.32, apiOut: 1.28, apiCache: 0.064 }), ["输入 $0.32", "输出 $1.28", "缓存 $0.064"]);
  assert.deepEqual(listPriceParts({ cur: "INR", apiIn: 1, apiOut: 2, apiCache: 0.1 }), ["输入 ₹1", "输出 ₹2", "缓存 ₹0.1"]);
  assert.deepEqual(listPriceParts({ cur: "CNY", apiIn: 8, apiOut: 28, apiCache: 2 }), ["输入 ¥8", "输出 ¥28", "缓存 ¥2"]);
  /* OpenRouter 美元挂牌按原币记录，人民币折算随页面参考汇率变化，不再写死某一天的汇率。 */
  const qwen = METRICS_RAW.find((m) => m.ref === "plan-0209" && m.model === "qwen3.7-plus");
  assert.ok(qwen);
  assert.deepEqual([qwen.apiCur, qwen.apiIn, qwen.apiOut, qwen.apiCache], ["USD", 0.32, 1.28, 0.064]);
});

test("变更记录的读者文字：新收录只列要点、不露出继承引用与永久 ID，并入主条目写名称", async () => {
  const added = MAINTENANCE_DATA.changes.find((c) => c.id === "plan-0215");
  const merged = MAINTENANCE_DATA.changes.find((c) => c.id === "plan-0096" && c.fields.includes("sameAs"));
  assert.ok(added && merged);
  const shown = changeDisplay(added);
  assert.equal(shown.addition, true);
  assert.deepEqual(shown.fields.map((f) => f.label), ["月付价", "年付折月价", "年付全年金额", "币种", "按席位计费", "额度", "官网链接"]);
  const card = mount(ChangeCard, { props: { change: added } });
  const text = card.text();
  assert.match(text, /新收录套餐/);
  assert.match(text, /月付价：30/);
  assert.doesNotMatch(text, /→|未记录|fieldRefs|windowPeriod|plan-0215/);
  card.unmount();
  const edit = mount(ChangeCard, { props: { change: merged } });
  assert.match(edit.text(), /并入主条目：无 → xAI X Subscription Free/);
  assert.doesNotMatch(edit.text(), /plan-0213|sameAs/);
  edit.unmount();
});
