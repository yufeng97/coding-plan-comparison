<script setup lang="ts">
/* 套餐链接列表，用 · 分隔。普通点击打开完整权益，修饰键保留链接原行为。 */
import * as legacy from "@app/runtime";

defineProps<{
  plans: Plan[];
  /** 留空时免费入口跳到免费区、其余跳到数据表 */
  section?: string;
}>();
function showPlan(event: MouseEvent, plan: Plan) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  legacy.showPlanDetails(plan.id, event.currentTarget as HTMLElement);
}
</script>

<template>
  <template v-for="(plan, index) in plans" :key="plan.id">
    <template v-if="index"> · </template>
    <a :href="legacy.publicPlanLink(plan, section)" :data-benchmark-plan="plan.id" @click="showPlan($event, plan)">{{ legacy.planTitle(plan) }}</a>
  </template>
</template>
