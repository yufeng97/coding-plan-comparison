<script setup lang="ts">
import { computed } from "vue";
import { isFreeCodingEntry, META, PLANS, resolvedField } from "@generated/catalog";
import { freeKind, planPriceLabel, REGION_LABEL, safeLink, trunc } from "@domain/core";
import { freeState } from "@state/charts";
const state = freeState;
const regions = [["all", "全部地区"], ["cn", "国内"], ["intl", "国际"]];
const kinds = [["all", "全部类型"], ["included", "含免费推理"], ["byok", "平台免费，推理另计"]];
const all = computed(() => PLANS.filter(isFreeCodingEntry));
const rows = computed(() => all.value.filter((p) => (state.region === "all" || p.region === state.region)
  && (state.kind === "all" || freeKind(p) === state.kind)));
</script>
<template>
  <div class="controls free-controls">
    <div class="chip-group" id="chipFreeRegion" role="group" aria-label="免费入口地区">
      <button v-for="[id, label] in regions" :key="id" type="button" class="chip" :class="{ active: state.region === id }" :data-free-region="id" :aria-pressed="state.region === id" @click="state.region = id">{{ label }}</button>
    </div>
    <div class="chip-group" id="chipFreeKind" role="group" aria-label="免费类型">
      <button v-for="[id, label] in kinds" :key="id" type="button" class="chip" :class="{ active: state.kind === id }" :data-free-kind="id" :aria-pressed="state.kind === id" @click="state.kind = id">{{ label }}</button>
    </div>
    <span class="table-count" id="freeCount" role="status" aria-live="polite">显示 {{ rows.length }} / {{ all.length }} 个免费入口</span>
  </div>
  <div class="free-grid" id="freeGrid">
    <p v-if="!rows.length" class="chart-empty">没有符合条件的免费入口，可以切换地区或类型。</p>
    <div v-for="plan in rows" :key="plan.id" class="free-card">
      <div class="fc-head"><span class="fc-vendor">{{ plan.vendor }}</span><span class="fc-region">{{ REGION_LABEL[plan.region] || "" }}</span></div>
      <div class="fc-plan">{{ plan.plan }}</div><div class="fc-cost">{{ planPriceLabel(plan) }}</div>
      <div class="fc-quota"><b>✓</b> {{ resolvedField(plan, "quota") }}</div>
      <div class="fc-tools">支持：{{ trunc(resolvedField(plan, "tools"), 100) }}</div>
      <div class="fc-footer"><a v-if="safeLink(plan.url)" class="fc-link" :href="safeLink(plan.url)" target="_blank" rel="noopener">官网来源 ↗</a><small class="checked-date">数据截至 {{ META.updated }}</small></div>
    </div>
  </div>
</template>
