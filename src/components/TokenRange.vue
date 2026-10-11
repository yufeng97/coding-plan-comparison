<script setup lang="ts">
import { computed } from "vue";
import * as runtime from "@app/runtime";
const props = withDefaults(defineProps<{ low: number | null | undefined; high?: number | null; emptyLabel?: string }>(), { emptyLabel: "credits制" });
const text = computed(() => {
  if (props.low == null) return props.emptyLabel;
  const low = runtime.fmtTok(props.low), high = props.high == null ? low : runtime.fmtTok(props.high);
  return props.high != null && props.high > props.low * 1.05 && low !== high ? `${low}–${high}` : low;
});
</script>

<template><span :style="low == null ? { color: 'var(--faint)' } : undefined">{{ text }}</span></template>
