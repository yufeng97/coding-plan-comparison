<script setup lang="ts">
import { computed } from "vue";
import { chartLegendSelections } from "@state/charts";
import { chartCache } from "@browser/charts/host";
const props = defineProps<{ id: string; chart: string; label: string; items: { name: string; color: string }[] }>();
if (!chartLegendSelections[props.id]) chartLegendSelections[props.id] = {};
const selected = computed(() => chartLegendSelections[props.id]);
function toggle(name: string) {
  selected.value[name] = selected.value[name] === false;
  chartCache[props.chart]?.dispatchAction({ type: selected.value[name] ? "legendSelect" : "legendUnSelect", name });
}
</script>
<template>
  <div class="chart-legend" :id="id" role="group" :aria-label="label">
    <button v-for="item in items" :key="item.name" type="button" class="chip" :class="{ active: selected[item.name] !== false }" :data-series="item.name" :aria-pressed="selected[item.name] !== false" @click="toggle(item.name)"><i class="legend-swatch" :style="{ background: item.color }" aria-hidden="true"></i>{{ item.name }}</button>
  </div>
</template>
