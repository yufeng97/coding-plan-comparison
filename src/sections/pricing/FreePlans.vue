<script setup lang="ts">
import { computed } from "vue";
import { isFreeCodingEntry, META, PLANS, priceCheckOf, resolvedField } from "@generated/catalog";
import { freeKind, planPriceLabel, REGION_LABEL, safeLink, trunc } from "@domain/core";
import { freeState } from "@state/charts";
import ChipRadioGroup from "../../components/ChipRadioGroup.vue";
const state = freeState;
const regions = [["all", "全部地区"], ["cn", "国内"], ["intl", "国际"]] as const;
const kinds = [["all", "全部类型"], ["included", "含免费推理"], ["byok", "平台免费，推理另计"]] as const;
const all = computed(() => PLANS.filter(isFreeCodingEntry));
const rows = computed(() => all.value.filter((p) => (state.region === "all" || p.region === state.region)
  && (state.kind === "all" || freeKind(p) === state.kind)));
</script>
<template>
  <div class="controls free-controls">
    <ChipRadioGroup id="chipFreeRegion" class="chip-group" label="免费入口地区" data-key="free-region" :options="regions" :model-value="state.region" @select="state.region = $event" />
    <ChipRadioGroup id="chipFreeKind" class="chip-group" label="免费类型" data-key="free-kind" :options="kinds" :model-value="state.kind" @select="state.kind = $event" />
    <span class="table-count" id="freeCount" role="status" aria-live="polite">显示 {{ rows.length }} / {{ all.length }} 个免费入口</span>
  </div>
  <div class="free-grid" id="freeGrid">
    <p v-if="!rows.length" class="chart-empty">没有符合条件的免费入口，可以切换地区或类型。</p>
    <div v-for="plan in rows" :key="plan.id" class="free-card">
      <div class="fc-head"><span class="fc-vendor">{{ plan.vendor }}</span><span class="fc-region">{{ REGION_LABEL[plan.region] || "" }}</span></div>
      <div class="fc-plan">{{ plan.plan }}</div><div class="fc-cost">{{ planPriceLabel(plan) }}</div>
      <div class="fc-quota"><b>✓</b> {{ resolvedField(plan, "quota") }}</div>
      <div class="fc-tools">支持：{{ trunc(resolvedField(plan, "tools"), 100) }}</div>
      <div class="fc-footer"><a v-if="safeLink(plan.url)" class="fc-link" :href="safeLink(plan.url)" target="_blank" rel="noopener">官网来源 ↗</a><small class="checked-date">{{ priceCheckOf(plan)?.checkedAt ? `核查 ${priceCheckOf(plan)!.checkedAt}` : `数据截至 ${META.updated}` }}</small></div>
    </div>
  </div>
</template>
