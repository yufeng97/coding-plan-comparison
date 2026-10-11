<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(defineProps<{ label: string; sortKey: string; currentKey: string; direction: number; firstDirection?: number }>(), { firstDirection: 1 });
const emit = defineEmits<{ sort: [key: string, firstDirection: number] }>();
const active = computed(() => props.sortKey === props.currentKey);
const directionText = (direction: number) => direction === 1 ? "从低到高" : "从高到低";
const next = computed(() => directionText(active.value ? -props.direction : props.firstDirection));
function sort() { emit("sort", props.sortKey, props.firstDirection); }
</script>

<template>
  <th scope="col" class="sortable" :class="{ 'sort-active': active }" :data-sort="sortKey" tabindex="0"
    :aria-sort="active ? direction === 1 ? 'ascending' : 'descending' : undefined"
    :title="`点击或按 Enter / 空格，按${label}${next}排序`"
    :aria-label="`${label}${active ? '，当前' + directionText(direction) : ''}，激活后${next}排序`"
    @click.stop="sort" @keydown.enter.prevent.stop="sort" @keydown.space.prevent.stop="sort">
    <span>{{ label }}{{ active ? direction === 1 ? " ↑" : " ↓" : "" }}</span>
  </th>
</template>
