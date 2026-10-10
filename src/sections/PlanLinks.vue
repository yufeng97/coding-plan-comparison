<script setup>
/* 套餐链接列表，用 · 分隔。点击由页面统一委托处理（data-benchmark-plan → 完整权益窗口）。 */
import * as legacy from "virtual:legacy-lib";

defineProps({
  plans: { type: Array, required: true },
  /* 留空时免费入口跳到免费区、其余跳到数据表 */
  section: { type: String, default: undefined },
});
</script>

<template>
  <template v-for="(plan, index) in plans" :key="plan.id">
    <template v-if="index"> · </template>
    <a :href="legacy.publicPlanLink(plan, section)" :data-benchmark-plan="plan.id">{{ legacy.planTitle(plan) }}</a>
  </template>
</template>
