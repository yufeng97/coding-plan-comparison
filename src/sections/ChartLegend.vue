<script setup lang="ts">
import { computed } from "vue";
import * as app from "@domain/runtime";
const props = defineProps<{ id: string; chart: string; label: string; items: { name: string; color: string }[] }>();
if (!app.chartLegendSelections[props.id]) app.chartLegendSelections[props.id] = {};
const selected = computed(() => app.chartLegendSelections[props.id]);
function toggle(name: string) {
  selected.value[name] = selected.value[name] === false;
  app.chartCache[props.chart]?.dispatchAction({ type: selected.value[name] ? "legendSelect" : "legendUnSelect", name });
}
</script>
<template>
  <div class="chart-legend" :id="id" role="group" :aria-label="label">
    <button v-for="item in items" :key="item.name" type="button" class="chip" :class="{ active: selected[item.name] !== false }" :data-series="item.name" :aria-pressed="selected[item.name] !== false" @click="toggle(item.name)"><i class="legend-swatch" :style="{ background: item.color }" aria-hidden="true"></i>{{ item.name }}</button>
  </div>
</template>
