<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { findPlanReference, isOneTimePlan, isPriceConfirmed, resolvedField } from "@generated/catalog";
import { CAT_LABEL, cnyOf, planBadges, planPriceLabel, priceUnit, REGION_LABEL, shortVendor } from "@domain/core";
import { annualPaymentText } from "@domain/picker/payment";
import { CMP_MAX, cmpState } from "@state/app";
import { cmpFocusableElements, focusTableControl, isCmpModalOpen, setCmpBackgroundInert } from "@browser/interaction";
import { syncUrl, updateAppState } from "@browser/url-state";
import { copyCmpMarkdown, exportCmpCsv, registerTableView, tableFeedback } from "@app/tables";
import PlanBadges from "../../components/PlanBadges.vue";
import PlanPrice from "../../components/PlanPrice.vue";
import PriceCheck from "../../components/PriceCheck.vue";
const dialog = ref<HTMLDialogElement | null>(null);
const backdrop = ref<HTMLDivElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const feedback = ref("");
const labels = ref<Record<string, string>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let returnFocus: Element | null = null;
let needsFocusRestore = false;
const items = computed(() => cmpState.items as Plan[]);
const count = computed(() => items.value.length);
const names = computed(() => items.value.map((plan) => `${shortVendor(plan.vendor)} ${plan.plan}`).join("、"));
const barText = computed(() => `已选 ${count.value}/${CMP_MAX} 档${count.value === 1 ? '，再选 1 档可对比' : count.value >= CMP_MAX ? '，已满' : ''}${count.value ? '：' + names.value : ''}`);
const lowestPrice = computed(() => {
  const prices = items.value.map((plan) => cnyOf(plan, "M"));
  const sameUnit = new Set(items.value.map(priceUnit)).size === 1 && !items.value.some(isOneTimePlan);
  return sameUnit && items.value.every((plan) => isPriceConfirmed(plan)) && prices.every((price: number | null) => price != null && Number.isFinite(price) && price > 0) && new Set(prices).size > 1 ? Math.min(...prices as number[]) : null;
});
const compareRows = [
  { id: "position", label: "定位" }, { id: "price", label: "价格" }, { id: "annualTotal", label: "年付全年金额" },
  { id: "quota", label: "额度（官方口径）" }, { id: "models", label: "模型" }, { id: "tools", label: "支持工具" },
  { id: "note", label: "备注" }, { id: "check", label: "价格核查" },
] as const;
type CompareRowId = (typeof compareRows)[number]["id"];
/* 定位与价格核查行由模板渲染组件，不参与文字比较。 */
function rowValue(id: CompareRowId, plan: Plan) {
  if (id === "price") return planPriceLabel(plan) + "|" + (plan.priceY == null ? "" : planPriceLabel(plan, "Y"));
  if (id === "annualTotal") return annualPaymentText(plan);
  if (id === "position" || id === "check") return "";
  return resolvedField(plan, id) || (id === "note" ? "—" : "");
}
function differs(id: CompareRowId) { return ["price", "annualTotal", "quota", "models", "tools"].includes(id) && count.value > 1 && new Set(items.value.map((plan) => rowValue(id, plan))).size > 1; }
function flash(id: string, text: string) {
  labels.value[id] = text;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { delete labels.value[id]; timers.delete(id); }, 1800));
}
function add(reference: string, plan?: string) {
  const selected = findPlanReference(plan == null ? reference : [reference, plan]);
  if (!selected || items.value.some((item) => item.id === selected.id)) return;
  if (count.value >= CMP_MAX) {
    flash("cmpOpenBtn", `最多对比 ${CMP_MAX} 档`);
    tableFeedback(`最多对比 ${CMP_MAX} 档，请先移出一档再添加。`); return;
  }
  cmpState.items = [...items.value, selected];
  syncUrl(); feedback.value = "";
  tableFeedback(`已加入 ${shortVendor(selected.vendor)} ${selected.plan}。当前选择 ${count.value}/${CMP_MAX} 档${count.value === 1 ? '，再选一档即可比较' : ''}。`);
}
async function remove(reference: string, plan?: string) {
  const index = items.value.findIndex((item) => plan == null ? item.id === reference : item.vendor === reference && item.plan === plan);
  if (index < 0) return;
  const removed = items.value[index]!;
  const modalOpen = isCmpModalOpen();
  cmpState.items = items.value.filter((item) => item.id !== removed.id);
  syncUrl(); feedback.value = "";
  tableFeedback(`已移出 ${shortVendor(removed.vendor)} ${removed.plan}。当前选择 ${count.value}/${CMP_MAX} 档。`);
  if (!modalOpen) return;
  if (count.value < 2) close();
  else {
    await nextTick();
    const remaining = dialog.value?.querySelectorAll<HTMLButtonElement>(".cmp-remove");
    if (!focusTableControl(remaining?.[Math.min(index, (remaining?.length || 1) - 1)])) focusTableControl(closeButton.value);
  }
}
function clear() {
  if (!count.value) return;
  const focusInBar = document.activeElement?.closest("#cmpBar");
  cmpState.items = [];
  syncUrl(); feedback.value = "";
  close();
  if (focusInBar) focusTableControl(document.getElementById("searchInput"));
  tableFeedback("已清空对比选择。");
}
function restoreFocus() {
  if (!needsFocusRestore) return;
  needsFocusRestore = false;
  const previous = returnFocus; returnFocus = null;
  /* The Vue update disabling the opener follows the synchronous close. Its new
   * eligibility must be checked here so focus never lands on a soon-disabled button. */
  const previousAvailable = previous?.id !== "cmpOpenBtn" || count.value >= 2;
  if (previousAvailable && focusTableControl(previous)) return;
  if (count.value >= 2 && focusTableControl(document.getElementById("cmpOpenBtn"))) return;
  focusTableControl(document.getElementById("searchInput"));
}
function finishClose() {
  if (backdrop.value) backdrop.value.hidden = true;
  dialog.value?.removeAttribute("aria-modal");
  document.body.classList.remove("has-cmp-modal");
  setCmpBackgroundInert(false);
  restoreFocus();
}
function open() {
  const modal = dialog.value;
  if (!modal || count.value < 2 || isCmpModalOpen()) return;
  const active = document.activeElement;
  returnFocus = active && active !== document.body && !modal.contains(active) ? active : null;
  needsFocusRestore = true;
  const fallback = typeof modal.showModal !== "function";
  modal.classList.toggle("cmp-fallback", fallback);
  modal.setAttribute("aria-modal", "true");
  document.body.classList.add("has-cmp-modal");
  if (!fallback) modal.showModal();
  else { modal.setAttribute("open", ""); if (backdrop.value) backdrop.value.hidden = false; setCmpBackgroundInert(true); }
  focusTableControl(closeButton.value);
}
function close() {
  const modal = dialog.value;
  if (!modal || !isCmpModalOpen()) return;
  if (!modal.classList.contains("cmp-fallback") && typeof modal.close === "function") modal.close(); else modal.removeAttribute("open");
  finishClose();
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  if (event.key !== "Tab" || !dialog.value?.classList.contains("cmp-fallback") || !isCmpModalOpen()) return;
  const focusable = cmpFocusableElements() as HTMLElement[];
  const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement as HTMLElement | null;
  if (!first) { event.preventDefault(); focusTableControl(dialog.value); }
  else if (event.shiftKey && active === first || !event.shiftKey && active === last || !active || !focusable.includes(active)) { event.preventDefault(); focusTableControl(event.shiftKey ? last : first); }
}
function outsideClick(event: MouseEvent) {
  if (event.target !== dialog.value || !dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
}
const guardFocus = (event: FocusEvent) => { if (dialog.value?.classList.contains("cmp-fallback") && isCmpModalOpen() && !dialog.value.contains(event.target as Node)) focusTableControl(closeButton.value); };
watch(count, (value) => { document.body.classList.toggle("has-compare", value > 0); }, { immediate: true });
const release = registerTableView("compare", { render: () => { feedback.value = ""; }, add, remove, clear, open, close, finishClose, feedback: (message: string) => { feedback.value = message; }, flash, buttons: ["cmpOpenBtn", "copyCmpMdBtn", "exportCmpCsvBtn"] });
onMounted(() => document.addEventListener("focusin", guardFocus));
onBeforeUnmount(() => { close(); release(); timers.forEach(clearTimeout); document.removeEventListener("focusin", guardFocus); document.body.classList.remove("has-compare"); });
</script>

<template>
  <Teleport to="body">
    <div id="cmpBar" class="cmp-bar" :class="{ 'is-on': count > 0 }" :hidden="!count">
      <span id="cmpBarText" role="status" aria-live="polite" aria-atomic="true" :title="names">{{ barText }}</span>
      <button id="cmpOpenBtn" type="button" class="chip" :disabled="count < 2" :title="count < 2 ? '至少选择 2 档' : '并排查看已选档'" @click.stop="open">{{ labels.cmpOpenBtn || "对比" }}</button>
      <button id="cmpClearBtn" type="button" class="chip" @click.stop="updateAppState(clear)">清空</button>
    </div>
    <div id="cmpBackdrop" ref="backdrop" class="cmp-fallback-backdrop" hidden aria-hidden="true" @click.stop="close"></div>
    <dialog id="cmpModal" ref="dialog" class="cmp-modal" role="dialog" tabindex="-1" aria-labelledby="cmpModalTitle" @close="finishClose" @keydown.stop="keydown" @click.stop="outsideClick">
      <div class="cmp-head"><h3 id="cmpModalTitle">⚖️ 并排对比</h3><div class="cmp-head-actions">
        <button id="copyCmpMdBtn" type="button" class="chip" :disabled="count < 2" :title="count < 2 ? '至少选择 2 档后导出对比' : '复制已选方案的完整对比与核价元数据'" @click.stop="copyCmpMarkdown">{{ labels.copyCmpMdBtn || "复制对比 Markdown" }}</button>
        <button id="exportCmpCsvBtn" type="button" class="chip" :disabled="count < 2" :title="count < 2 ? '至少选择 2 档后导出对比' : '下载已选方案的完整对比与核价元数据'" @click.stop="exportCmpCsv">{{ labels.exportCmpCsvBtn || "导出对比 CSV" }}</button>
        <button id="cmpClearInModal" type="button" class="chip" @click.stop="updateAppState(clear)">清空对比</button>
        <button id="cmpCloseBtn" ref="closeButton" type="button" class="chip" @click.stop="close">关闭 ✕</button>
      </div></div>
      <p class="cmp-tip">各家「额度」口径不同（5 小时窗口 / 每周 tokens / credits），不能直接互比；此处保留官方口径原文对照。</p>
      <p id="cmpFeedback" class="table-feedback" role="status" aria-live="polite">{{ feedback }}</p>
      <div class="table-wrap cmp-wrap" tabindex="0" role="region" aria-label="套餐并排对比，可横向滚动"><table id="cmpTable">
        <thead><tr><th scope="col">厂商 · 计划</th><th v-for="plan in items" :key="plan.id" scope="col"><b>{{ plan.vendor }}</b><br>{{ plan.plan }}<br><button type="button" class="chip cmp-remove" :data-plan-id="plan.id" :data-vendor="plan.vendor" :data-plan="plan.plan" data-cmp-scope="cmpTable" :aria-label="`移出 ${shortVendor(plan.vendor)} ${plan.plan}`" @click.stop="updateAppState(() => { void remove(plan.id); })">移出对比</button></th></tr></thead>
        <tbody><tr v-for="row in compareRows" :key="row.id" :class="{ 'cmp-diff-row': differs(row.id) }"><th scope="row">{{ row.label }}<span v-if="differs(row.id)" class="cmp-diff-label">有差异</span></th><td v-for="plan in items" :key="plan.id" :class="{ 'cmp-best-price': row.id === 'price' && lowestPrice != null && cnyOf(plan, 'M') === lowestPrice }">
          <template v-if="row.id === 'position'"><span class="tag" :class="`tag-${plan.cat}`">{{ CAT_LABEL[plan.cat] || plan.cat }}</span> {{ REGION_LABEL[plan.region] || "" }}<div v-if="planBadges(plan).length" class="badge-row"><PlanBadges :plan="plan" /></div></template>
          <template v-else-if="row.id === 'price'"><PlanPrice :plan="plan" compare /><span v-if="lowestPrice != null && cnyOf(plan, 'M') === lowestPrice" class="cmp-price-label">同周期最低价</span></template>
          <PriceCheck v-else-if="row.id === 'check'" :plan="plan" />
          <template v-else>{{ rowValue(row.id, plan) }}</template>
        </td></tr></tbody>
      </table></div>
    </dialog>
  </Teleport>
</template>
