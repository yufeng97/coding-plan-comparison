<script setup lang="ts">
/* 单选的筛选标签：role=radiogroup + role=radio。只有选中项在 Tab 顺序里，方向键 / Home / End 在组内移动并立即选中，
 * 与原生单选按钮一致；不可用的选项跳过。选项按钮带 data 属性（dataKey，默认 data-value），便于测试与样式定位。 */
import { nextTick, ref } from "vue";
const props = withDefaults(defineProps<{
  label?: string;
  labelledby?: string;
  options: readonly (readonly [string, string])[];
  modelValue: string;
  /** 选项按钮上的 data 属性名（不含 data- 前缀），值为选项值。 */
  dataKey?: string;
  /** 整组不可用（如应用选购条件时本区的计费周期）。 */
  disabled?: boolean;
  /** 单个不可用的选项值。 */
  disabledOptions?: readonly string[];
  describedby?: string;
}>(), { dataKey: "value", disabled: false, disabledOptions: () => [] });
const emit = defineEmits<{ select: [value: string] }>();
const group = ref<HTMLElement | null>(null);
const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const optionDisabled = (value: string) => props.disabled || props.disabledOptions.includes(value);
async function onKeydown(event: KeyboardEvent, index: number) {
  const count = props.options.length;
  const enabled = props.options.map(([value]) => !optionDisabled(value));
  let next = -1;
  if (event.key in STEP) {
    for (let step = 1; step <= count; step++) {
      const candidate = (index + STEP[event.key]! * step + count * step) % count;
      if (enabled[candidate]) { next = candidate; break; }
    }
  }
  else if (event.key === "Home") next = enabled.indexOf(true);
  else if (event.key === "End") next = enabled.lastIndexOf(true);
  if (next < 0) return;
  event.preventDefault();
  if (next === index) return;
  emit("select", props.options[next]![0]);
  await nextTick();
  group.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
}
/* 当前值不在可用选项里时，第一个可用选项保留在 Tab 顺序中，组仍可用键盘进入。 */
function tabbable(value: string) {
  if (optionDisabled(value)) return false;
  if (value === props.modelValue) return true;
  const current = props.options.some(([option]) => option === props.modelValue && !optionDisabled(option));
  return !current && props.options.find(([option]) => !optionDisabled(option))?.[0] === value;
}
</script>

<template>
  <div ref="group" role="radiogroup" :aria-label="labelledby ? undefined : label" :aria-labelledby="labelledby" :aria-disabled="disabled ? 'true' : undefined">
    <button v-for="([value, text], index) in options" :key="value" type="button" role="radio" class="chip"
      :class="{ active: value === modelValue }" :aria-checked="value === modelValue" :tabindex="tabbable(value) ? 0 : -1"
      :disabled="optionDisabled(value)" :aria-describedby="describedby" v-bind="{ ['data-' + dataKey]: value }"
      @click="emit('select', value)" @keydown="onKeydown($event, index)">{{ text }}</button>
  </div>
</template>
