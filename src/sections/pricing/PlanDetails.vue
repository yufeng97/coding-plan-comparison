<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { findPlanReference } from "@generated/catalog";
import { planTitle, safeLink } from "@domain/core";
import { followView } from "@state/maintenance";
import { focusTableControl, isCmpModalOpen } from "@browser/interaction";
import { useModalDialog } from "../../composables/useModalDialog";
import { planDetailsView } from "@app/plan-details";
import { closeCmpModal, PLAN_COLUMNS } from "@app/tables";
import PlanHistory from "../follow/PlanHistory.vue";
import WatchButton from "../../components/WatchButton.vue";
import CompareButton from "../../components/CompareButton.vue";
const planId = ref(""), dialog = ref<HTMLDialogElement | null>(null), backdrop = ref<HTMLElement | null>(null);
const followFeedback = ref("");
const modal = useModalDialog({
  dialog, backdrop, bodyClass: "has-plan-details",
  initialFocus: () => document.getElementById("planDetailsCloseBtn"),
  fallbackFocus: () => document.getElementById("shareResultsBtn"),
});
watch(() => followView.feedback, message => { if (modal.isOpen()) followFeedback.value = message; });
const plan = computed(() => findPlanReference(planId.value));
const fields = computed(() => {
  const current = plan.value;
  /* 选购口径行只在应用选购条件后有值，空值不列；网址列显示为链接。 */
  return current ? PLAN_COLUMNS.filter((column) => column.markdown !== false && !(column.pickerOnly && !column.value(current)))
    .map((column) => ({ label: column.label, value: column.value(current) || "—", links: column.detailLinks?.(current) ?? null })) : [];
});
async function show(id: string, trigger: HTMLElement | null = null) {
  if (!findPlanReference(id)) return;
  const wasOpen = modal.isOpen();
  if (isCmpModalOpen()) closeCmpModal();
  const active = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  planId.value = id;
  followFeedback.value = followView.storageMessage;
  await nextTick();
  if (wasOpen || modal.isOpen()) { focusTableControl(document.getElementById("planDetailsCloseBtn")); return; }
  modal.open(active);
}
onMounted(() => { planDetailsView.show = show; });
onBeforeUnmount(() => { planDetailsView.show = undefined; });
</script>
<template>
  <div id="planDetailsBackdrop" ref="backdrop" class="cmp-fallback-backdrop" hidden aria-hidden="true" @click="modal.close"></div>
  <dialog id="planDetailsModal" ref="dialog" class="cmp-modal plan-details-modal" tabindex="-1" aria-labelledby="planDetailsTitle" @close="modal.finishClose" @cancel.prevent="modal.close" @keydown="modal.keydown" @click="modal.outsideClick">
    <div class="cmp-head"><h3 id="planDetailsTitle">{{ plan ? planTitle(plan) : "完整套餐权益" }}</h3><button type="button" class="chip" id="planDetailsCloseBtn" @click="modal.close">关闭 <span aria-hidden="true">✕</span></button></div>
    <div id="planDetailsBody" v-if="plan"><dl class="plan-detail-fields"><div v-for="field in fields" :key="field.label"><dt>{{ field.label }}</dt><dd v-if="field.links && field.links.length"><template v-for="(link, index) in field.links" :key="link.href + index"><template v-if="index"> · </template><a :href="link.href" target="_blank" rel="noopener">{{ link.text }}</a></template></dd><dd v-else-if="field.links">—</dd><dd v-else>{{ field.value }}</dd></div></dl>
      <div class="maintenance-plan-actions"><CompareButton :plan="plan" scope="planDetails" /><WatchButton :plan="plan" /><a v-if="safeLink(plan.url)" :href="safeLink(plan.url)" target="_blank" rel="noopener">官网购买与权益规则 ↗</a></div>
      <p id="planFollowFeedback" class="table-feedback" role="status" aria-live="polite">{{ followFeedback }}</p><PlanHistory :key="plan.id" :plan-id="plan.id" />
    </div>
  </dialog>
</template>
