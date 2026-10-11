<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import * as L from "@app/runtime";
import PickerCard from "./PickerCard.vue";
import CompareButton from "../../components/CompareButton.vue";
import { pickerView, pickerPolicy, priorityLabel } from "./picker-view";

const view = computed(() => {
  void L.dataRevision.benchmark;
  Object.values(L.pickerState);
  L.pickerAbilityCache.clear();
  return pickerView();
});
const policy = computed(pickerPolicy);
const rules = `已包含的日常覆盖写在主卡中；可选补充列出合计月费。升级参考最多跨到下一预算档，其他候选和自家订阅供对照，无需同时购买。模型用途按 ${L.MODEL_ROLES_ASOF} 归类；未公开额度与共享规则请核对官网。中转站与国家限定套餐不参与通用推荐。`;
const columns = ["套餐", "所选付款月均", "主力模型", "月额度参考下限", "DeepSWE v1.1", "对比"];
const grid = ref<HTMLElement | null>(null);
let focusedPlan = "";
function rememberFocus(event: FocusEvent) {
  const target = event.target as HTMLElement | null;
  focusedPlan = target?.dataset.planId || target?.dataset.viewPlan || "";
}
watch(view, async () => {
  const active = document.activeElement;
  await nextTick();
  if (!focusedPlan || active?.isConnected) return;
  const replacement = Array.from(grid.value?.querySelectorAll<HTMLElement>("[data-plan-id], [data-view-plan]") ?? []).find((el) => el.dataset.planId === focusedPlan || el.dataset.viewPlan === focusedPlan);
  for (const selector of [".qc-details", ".picker-alternatives"]) replacement?.closest(selector)?.setAttribute("open", "");
  L.focusTableControl(replacement || document.getElementById("pickerPaymentSummary"));
});
</script>

<template>
  <div id="quickGrid" ref="grid" class="quick-grid" :data-card-count="view.cards.length" @focusin="rememberFocus">
    <div v-if="view.empty" class="picker-empty">{{ view.empty }}</div>
    <PickerCard v-for="card in view.cards" :key="`${card.title}:${card.plan.id}`" :model="card" />
    <div v-if="view.ranked.length > 1" class="picker-compare table-wrap" tabindex="0" role="region" aria-label="候选对比，可横向滚动"><table class="qc-compare"><caption>前 {{ view.ranked.length }} 档对比 · {{ priorityLabel() }}</caption><thead><tr><th v-for="label in columns" :key="label" scope="col">{{ label }}</th></tr></thead><tbody><tr v-for="(profile, index) in view.ranked" :key="profile.p.id" :class="{ 'is-current': index === 0 }"><th scope="row" data-label="套餐">{{ L.planTitle(profile.p) }}<span v-if="index === 0" class="qc-compare-tag">主计划</span></th><td data-label="所选付款月均">{{ L.priceLine(profile.p) }}</td><td data-label="主力模型">{{ L.candidateRole(profile) ? L.roleDisplayName(profile.p, L.candidateRole(profile)) : '—' }}</td><td data-label="月额度参考下限">{{ L.quotaEvidenceText(profile) }}</td><td data-label="DeepSWE v1.1">{{ L.abilityText(profile) }}</td><td data-label="对比"><CompareButton :plan="profile.p" scope="quickGrid" class="qc-action" /></td></tr></tbody></table></div>
    <details v-if="view.alternatives.length" class="picker-alternatives method-box"><summary>其他候选（{{ view.alternatives.length }} 档，均在预算内）</summary><div class="picker-alternatives-grid"><PickerCard v-for="card in view.alternatives" :key="card.plan.id" :model="card" /></div></details>
  </div>
  <div class="picker-after"><button id="checkWorkloadBtn" type="button" class="chip workload-check" @click.stop="L.openWorkloadCalculator()">按我的用量核对</button><p id="pickerNote" class="chart-note" role="status" aria-live="polite" aria-atomic="true">{{ view.note }}</p></div>
  <details id="pickerRules" class="method-box picker-rules"><summary>推荐规则与口径</summary><p id="pickerPolicy" class="maintenance-meta">{{ policy }}</p><p id="pickerRulesNote" class="maintenance-meta">{{ rules }}</p></details>
</template>
