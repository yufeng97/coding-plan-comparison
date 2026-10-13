<script setup lang="ts">
/* 可排序表头：th 只给出列名与 aria-sort（读屏在每个单元格前朗读的列标题保持简短），
 * 整格按钮负责点击与键盘操作；「激活后按什么方向排序」作为按钮的描述，不进入列名。 */
import { computed, useId } from "vue";
const props = withDefaults(defineProps<{ label: string; sortKey: string; currentKey: string; direction: number; firstDirection?: number }>(), { firstDirection: 1 });
const emit = defineEmits<{ sort: [key: string, firstDirection: number] }>();
const hintId = useId();
const active = computed(() => props.sortKey === props.currentKey);
const directionText = (direction: number) => direction === 1 ? "从低到高" : "从高到低";
const next = computed(() => directionText(active.value ? -props.direction : props.firstDirection));
function sort() { emit("sort", props.sortKey, props.firstDirection); }
</script>

<template>
  <th scope="col" class="sortable" :class="{ 'sort-active': active }" :data-sort="sortKey"
    :aria-sort="active ? direction === 1 ? 'ascending' : 'descending' : undefined">
    <button type="button" class="sort-btn" :title="`按${label}${next}排序`" :aria-describedby="hintId" @click.stop="sort">
      {{ label }}<span v-if="active" aria-hidden="true">{{ direction === 1 ? " ↑" : " ↓" }}</span>
    </button>
    <span :id="hintId" hidden>{{ active ? `当前${directionText(direction)}，` : "" }}激活后{{ next }}排序</span>
  </th>
</template>
