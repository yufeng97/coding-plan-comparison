<script setup lang="ts">
import { computed } from "vue";
import { fTokCell } from "@domain/table-format";
const props = withDefaults(defineProps<{ low: number | null | undefined; high?: number | null; emptyLabel?: string }>(), { emptyLabel: "credits制" });
/* 与额度表文字、导出同一规则：上下限相差不足 5% 只显示一个值。 */
const text = computed(() => fTokCell(props.low, props.high, props.emptyLabel));
</script>

<template><span :class="{ 'token-empty': low == null }">{{ text }}</span></template>
