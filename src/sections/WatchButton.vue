<script setup>
/* 关注按钮。点击由页面统一委托处理（data-watch-plan → toggleFollowPlan），这里只按关注状态渲染。 */
import { computed } from "vue";
import * as legacy from "virtual:legacy-lib";

const props = defineProps({ plan: { type: Object, required: true } });
const on = computed(() => legacy.followState.planIds.includes(props.plan.id));
</script>

<template>
  <button type="button" class="watch-plan" :class="{ on }" :data-watch-plan="plan.id" :aria-pressed="on"
    :aria-label="`${on ? '取消关注' : '关注'} ${legacy.planTitle(plan)}`">{{ on ? "已关注" : "关注" }}</button>
</template>
