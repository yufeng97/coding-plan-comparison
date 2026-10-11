<script setup lang="ts">
import { computed } from "vue";
import * as runtime from "@app/runtime";
const props = withDefaults(defineProps<{ plan: Plan; scope?: string }>(), { scope: "tableBody" });
const on = computed(() => runtime.cmpState.items.some((item: Plan) => item.id === props.plan.id));
const full = computed(() => !on.value && runtime.cmpState.items.length >= runtime.CMP_MAX);
const action = computed(() => on.value ? "移出并排对比" : full.value ? `已满 ${runtime.CMP_MAX} 档，请先移出一档` : "加入并排对比，选满 2 档后可比较");
function toggle() {
  runtime.updateAppState(() => on.value ? runtime.cmpRemove(props.plan.id) : runtime.cmpAdd(props.plan.id));
}
</script>

<template>
  <button type="button" class="cmp-add" :class="{ on }" :data-plan-id="plan.id" :data-vendor="plan.vendor"
    :data-plan="plan.plan" :data-cmp-scope="scope" :aria-pressed="on" :disabled="full" :title="action"
    :aria-label="`${runtime.shortVendor(plan.vendor)} ${plan.plan}，${action}`" @click.stop="toggle">
    {{ on ? "✓ 对比中" : full ? "对比已满" : "＋对比" }}
  </button>
</template>
