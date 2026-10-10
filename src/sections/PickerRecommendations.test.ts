import { useMount } from "../test/setup";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as runtime from "@domain/runtime";
import { pickerOracle } from "../test/picker-oracle";
import PickerRecommendations from "./PickerRecommendations.vue";
import PickerControls from "./PickerControls.vue";

function host() {
  const el = document.createElement("div");
  el.setAttribute("data-v-app", "");
  document.body.append(el);
  return el;
}
const recommendations = useMount(PickerRecommendations, host);
const controls = useMount(PickerControls, host);

beforeEach(() => {
  Object.assign(runtime.pickerState, runtime.APP_DEFAULTS.picker);
  runtime.cmpState.items = [];
  runtime.followState.planIds = [];
  runtime.personalState.fromPicker = false;
  runtime.tableState.fromPicker = false;
  runtime.metricsState.fromPicker = false;
  runtime.rankState.fromPicker = false;
  runtime.pickerAbilityCache.clear();
});
afterEach(() => { runtime.serviceViewHooks.showDetails = undefined; });

test.each([
  { budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" },
  { budget: "any", region: "intl", tool: "claude", task: "both", billing: "M", priority: "quota" },
  { budget: "200", region: "intl", tool: "codex", task: "hard", billing: "Y", priority: "price" },
  { budget: "100", region: "cn", tool: "cursor", task: "hard", billing: "Y", priority: "quota" },
  { budget: "0", region: "all", tool: "any", task: "daily", billing: "M", priority: "quota" },
  { budget: "any", region: "all", tool: "any", task: "hard", billing: "M", priority: "ability" },
])("preserves recommendation cards and disclosure text for $region/$tool/$task/$billing/$priority", async (state) => {
  Object.assign(runtime.pickerState, state);
  const pool = runtime.eligibleProfiles();
  const main = runtime.chooseMain(pool);
  const expected = document.createElement("div");
  expected.innerHTML = main
    ? [pickerOracle.mainCard(main, pool), pickerOracle.dailyCard(main, pool), pickerOracle.upgradeCard(main), pickerOracle.ownVendorCard(main)].filter(Boolean).join("")
    : pickerOracle.ownVendorCard(null) || "";
  const wrapper = await recommendations.render();
  const cards = wrapper.findAll("#quickGrid > .quick-card");
  const expectedCards = Array.from(expected.querySelectorAll(".quick-card"));
  expect(cards).toHaveLength(expectedCards.length);
  for (let i = 0; i < cards.length; i++) {
    const original = expectedCards[i]!;
    for (const selector of [".qc-title-label", ".qc-plan", ".qc-value", ".qc-reasons li", ".qc-line", ".qc-payment-summary", ".qc-tiers tbody tr"]) {
      const normalize = (text: string | null) => (text || "").replace(/\s+/g, "").trim();
      expect(cards[i]!.findAll(selector).map((node) => normalize(node.text()))).toEqual(Array.from(original.querySelectorAll(selector)).map((node) => normalize(node.textContent)));
    }
  }
  expect(wrapper.get("#quickGrid").attributes("data-card-count")).toBe(String(cards.length));
  if (main) expect(wrapper.get("#pickerNote").text()).toContain(`符合条件 ${pool.length} 档`);
  else expect(wrapper.get(".picker-empty").text()).toBe(runtime.pickerEmptyReason(pool));
});

test("reacts to external filter restoration and follow/compare state without replacing the card DOM", async () => {
  const wrapper = await recommendations.render();
  const first = wrapper.get("#quickGrid > .quick-card");
  const id = first.get(".cmp-add").attributes("data-plan-id")!;
  const plan = runtime.PLANS.find((entry) => entry.id === id)!;
  const originalNode = first.element;
  runtime.followState.planIds = [id];
  runtime.cmpState.items = [plan];
  await flushPromises();
  expect(first.get(".watch-plan").attributes("aria-pressed")).toBe("true");
  expect(first.get(".cmp-add").text()).toBe("✓ 对比中");
  expect(wrapper.get("#quickGrid > .quick-card").element).toBe(originalNode);
  Object.assign(runtime.pickerState, { budget: "0", task: "daily" });
  runtime.renderPicker();
  await flushPromises();
  const freePool = runtime.eligibleProfiles();
  expect(wrapper.get("#pickerNote").text()).toContain(`符合条件 ${freePool.length} 档`);
});

test("controls own chip selection, payment disclosure and URL state", async () => {
  await recommendations.render();
  const wrapper = await controls.render();
  await wrapper.get('[data-pick="billing"] [data-value="Y"]').trigger("click");
  expect(runtime.pickerState.billing).toBe("Y");
  expect(wrapper.get('[data-pick="billing"] [data-value="Y"]').attributes("aria-pressed")).toBe("true");
  expect(wrapper.get("#pickerPaymentSummary").text()).toBe("付款：年付（按折月预算）");
  expect(wrapper.get("#pickerBillingNote").text()).toContain("首次一次支付全年");
  Object.assign(runtime.pickerState, { tool: "codex", priority: "ability" });
  await flushPromises();
  expect(wrapper.get('[data-pick="tool"] [data-value="codex"]').classes()).toContain("active");
  expect(wrapper.get('[data-pick="priority"] [data-value="ability"]').attributes("aria-pressed")).toBe("true");
});

test("shared payment modes open the disclosure initially and preserve a manual collapse", async () => {
  runtime.pickerState.billing = "Y";
  const wrapper = await controls.render();
  const disclosure = wrapper.get<HTMLDetailsElement>("#pickerPayment").element;
  expect(disclosure.open).toBe(true);
  disclosure.open = false;
  runtime.pickerState.billing = "A";
  await flushPromises();
  expect(disclosure.open).toBe(false);
  expect(wrapper.get("#pickerPaymentSummary").text()).toBe("付款：自动续费");
});

test("native card and workload buttons call the shared actions with their current plan", async () => {
  const showDetails = vi.fn();
  runtime.serviceViewHooks.showDetails = showDetails;
  runtime.pickerState.budget = "100";
  const wrapper = await recommendations.render();
  const button = wrapper.get<HTMLButtonElement>("#quickGrid > .quick-card [data-view-plan]");
  await button.trigger("click");
  expect(showDetails).toHaveBeenCalledExactlyOnceWith(button.attributes("data-view-plan"), button.element);
  await wrapper.get("#checkWorkloadBtn").trigger("click");
  expect(runtime.calcState.budget).toBe("100");
  expect(runtime.serviceUiState.feedback).toContain("已带入当前月均预算");
});
