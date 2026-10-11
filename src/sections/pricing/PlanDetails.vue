<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { findPlanReference } from "@generated/catalog";
import { planTitle, safeLink } from "@domain/core";
import { followView } from "@state/maintenance";
import { focusTableControl, isCmpModalOpen, modalFocusableElements } from "@browser/interaction";
import { planDetailsView } from "@app/plan-details";
import { closeCmpModal, PLAN_COLUMNS } from "@app/tables";
import PlanHistory from "../follow/PlanHistory.vue";
import WatchButton from "../../components/WatchButton.vue";
const planId = ref(""), dialog = ref<HTMLDialogElement | null>(null), backdrop = ref<HTMLElement | null>(null);
const followFeedback = ref("");
watch(() => followView.feedback, message => { if (dialog.value?.open) followFeedback.value = message; });
const plan = computed(() => findPlanReference(planId.value));
const fields = computed(() => {
  const current = plan.value;
  return current ? PLAN_COLUMNS.filter((column) => column.markdown !== false).map((column) => ({ label: column.label, value: column.value(current) || "—" })) : [];
});
let returnFocus: HTMLElement | null = null;
let openRequest = 0;
let background: { element: Element; inert: string | null; hidden: string | null }[] = [];
function restoreBackground() {
  for (const entry of background) {
    if (entry.inert == null) entry.element.removeAttribute("inert"); else entry.element.setAttribute("inert", entry.inert);
    if (entry.hidden == null) entry.element.removeAttribute("aria-hidden"); else entry.element.setAttribute("aria-hidden", entry.hidden);
  }
  background = [];
}
function finishClose() {
  dialog.value?.removeAttribute("aria-modal");
  if (backdrop.value) backdrop.value.hidden = true;
  restoreBackground();
  document.body.classList.remove("has-plan-details");
  if (returnFocus && !focusTableControl(returnFocus)) focusTableControl(document.getElementById("shareResultsBtn"));
  returnFocus = null;
}
function close() {
  openRequest++;
  const element = dialog.value;
  if (!element?.open) return;
  if (typeof element.close === "function") element.close();
  else { element.removeAttribute("open"); finishClose(); }
}
function makeBackgroundInert(element: Element) {
  // Hide sibling branches at every level, leaving the modal's ancestry available.
  let branch: Element | null = element;
  while (branch?.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling === branch || sibling === backdrop.value || /^(SCRIPT|STYLE|TEMPLATE)$/.test(sibling.tagName)) continue;
      background.push({ element: sibling, inert: sibling.getAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
      sibling.setAttribute("inert", ""); sibling.setAttribute("aria-hidden", "true");
    }
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
}
async function show(id: string, trigger: HTMLElement | null = null) {
  if (!findPlanReference(id)) return;
  const request = ++openRequest;
  if (isCmpModalOpen()) closeCmpModal();
  if (!dialog.value?.open) returnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  planId.value = id;
  followFeedback.value = followView.storageMessage;
  await nextTick();
  const element = dialog.value;
  if (!element || request !== openRequest) return;
  if (element.open) { focusTableControl(document.getElementById("planDetailsCloseBtn")); return; }
  element.setAttribute("aria-modal", "true");
  if (typeof element.showModal === "function") element.showModal();
  else {
    element.classList.add("cmp-fallback"); element.setAttribute("open", "");
    if (backdrop.value) backdrop.value.hidden = false;
    makeBackgroundInert(element);
  }
  document.body.classList.add("has-plan-details");
  focusTableControl(document.getElementById("planDetailsCloseBtn"));
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  const element = dialog.value;
  if (event.key !== "Tab" || !element?.classList.contains("cmp-fallback")) return;
  const focusable = modalFocusableElements(element), first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); focusTableControl(last); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); focusTableControl(first); }
}
onMounted(() => { planDetailsView.show = show; });
onBeforeUnmount(() => { finishClose(); planDetailsView.show = undefined; });
</script>
<template>
  <div id="planDetailsBackdrop" ref="backdrop" class="cmp-fallback-backdrop" hidden aria-hidden="true" @click="close"></div>
  <dialog id="planDetailsModal" ref="dialog" class="cmp-modal plan-details-modal" tabindex="-1" aria-labelledby="planDetailsTitle" @close="finishClose" @cancel.prevent="close" @keydown="keydown">
    <div class="cmp-head"><h3 id="planDetailsTitle">{{ plan ? planTitle(plan) : "完整套餐权益" }}</h3><button type="button" class="chip" id="planDetailsCloseBtn" @click="close">关闭 ✕</button></div>
    <div id="planDetailsBody" v-if="plan"><dl class="plan-detail-fields"><div v-for="field in fields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div></dl>
      <div class="maintenance-plan-actions"><WatchButton :plan="plan" /><a v-if="safeLink(plan.url)" :href="safeLink(plan.url)" target="_blank" rel="noopener">官网购买与权益规则 ↗</a></div>
      <p id="planFollowFeedback" class="table-feedback" role="status" aria-live="polite">{{ followFeedback }}</p><PlanHistory :key="plan.id" :plan-id="plan.id" />
    </div>
  </dialog>
</template>
