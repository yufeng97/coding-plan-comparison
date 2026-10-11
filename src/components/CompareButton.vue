<script setup lang="ts">
import { computed } from "vue";
import { shortVendor } from "@domain/core";
import { CMP_MAX, cmpState } from "@state/app";
import { updateAppState } from "@browser/url-state";
import { cmpAdd, cmpRemove } from "@app/tables";
const props = withDefaults(defineProps<{ plan: Plan; scope?: string }>(), { scope: "tableBody" });
const on = computed(() => cmpState.items.some((item: Plan) => item.id === props.plan.id));
const full = computed(() => !on.value && cmpState.items.length >= CMP_MAX);
const action = computed(() => on.value ? "移出并排对比" : full.value ? `已满 ${CMP_MAX} 档，请先移出一档` : "加入并排对比，选满 2 档后可比较");
function toggle() {
  updateAppState(() => on.value ? cmpRemove(props.plan.id) : cmpAdd(props.plan.id));
}
</script>

<template>
  <button type="button" class="cmp-add" :class="{ on }" :data-plan-id="plan.id" :data-vendor="plan.vendor"
    :data-plan="plan.plan" :data-cmp-scope="scope" :aria-pressed="on" :disabled="full" :title="action"
    :aria-label="`${shortVendor(plan.vendor)} ${plan.plan}，${action}`" @click.stop="toggle">
    {{ on ? "✓ 对比中" : full ? "对比已满" : "＋对比" }}
  </button>
</template>
