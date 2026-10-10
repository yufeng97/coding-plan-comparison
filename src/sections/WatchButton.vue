<script setup lang="ts">
/* 关注按钮按响应式关注状态渲染并提交本机关注变更。 */
import { computed } from "vue";
import * as legacy from "@domain/runtime";

const props = defineProps<{ plan: Plan }>();
const on = computed(() => legacy.followState.planIds.includes(props.plan.id));
</script>

<template>
  <button type="button" class="watch-plan" :class="{ on }" :data-watch-plan="plan.id" :aria-pressed="on"
    @click.stop="legacy.toggleFollowPlan(plan.id)" :aria-label="`${on ? '取消关注' : '关注'} ${legacy.planTitle(plan)}`">{{ on ? "已关注" : "关注" }}</button>
</template>
