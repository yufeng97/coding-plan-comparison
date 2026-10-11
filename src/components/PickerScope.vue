<script setup lang="ts">
import { computed } from "vue";
import * as app from "@app/runtime";
const props = defineProps<{ name: "personal" | "rank"; paragraph?: boolean }>();
const state = computed(() => props.name === "personal" ? app.personalState : app.rankState);
const text = computed(() => state.value.fromPicker
  ? "已应用选购条件：" + app.pickerScopeText() + "。" + (props.name === "personal"
    ? "图中金额为所选支付方式的月均价。本区月付/年付暂不可切换；取消选购条件后恢复原支付选择。"
    : "按所选支付方式月均价重算满额成本，额度不因折扣放大；继续按参考月量区间中点计算。") + "继续叠加本区筛选。"
  : "当前仅使用本区筛选，尚未应用选购条件。应用后会叠加预算、地区、工具与支付方式。");
const disabled = computed(() => app.pickerState.budget === "0" && !state.value.fromPicker);
</script>
<template>
  <p v-if="paragraph" :id="name + 'Scope'" class="maintenance-meta">{{ text }}</p>
  <button v-else type="button" class="chip" :class="{ active: state.fromPicker }" :data-apply-picker="name"
    :aria-pressed="state.fromPicker" :disabled="disabled" @click.stop="app.applyPickerScope(name)"
    :title="disabled ? '选购预算为「免费」：这里只列付费档，免费档见「免费 Coding 入口」' : ''">{{ state.fromPicker ? "取消选购条件" : "应用当前选购条件" }}</button>
</template>
