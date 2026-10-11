<script setup lang="ts">
import { computed } from "vue";
import * as app from "@app/runtime";
import { apiRows } from "./chart-models";
import ChartLegend from "../../components/charts/ChartLegend.vue";
import CostCalculator from "./CostCalculator.vue";
import PriceCheck from "../../components/PriceCheck.vue";
import { useChartLifecycle } from "../../components/charts/chart-lifecycle";
useChartLifecycle("chartApi", "chartPower");
const rows = computed(apiRows);
const regionLabel = (region: string) => app.REGION_LABEL[region as keyof typeof app.REGION_LABEL] || "—";
const priceLegend = [{ name: "输入 / 1M tokens", color: "#6366f1" }, { name: "输出 / 1M tokens", color: "#f472b6" }];
const powerLegend = [{ name: "国际模型", color: "#22d3ee" }, { name: "国内模型", color: "#34d399" }];
</script>
<template>
  <CostCalculator />
  <div class="grid-2">
    <div class="chart-card"><ChartLegend id="apiLegend" chart="chartApi" label="API 价格图例" :items="priceLegend" /><div id="chartApi" class="chart chart-fixed"></div></div>
    <div class="chart-card"><ChartLegend id="powerLegend" chart="chartPower" label="输出购买力图例" :items="powerLegend" /><div id="chartPower" class="chart chart-fixed"></div></div>
  </div>
  <details class="method-box">
    <summary>查看 API 单价与 $10 输出购买力明细</summary>
    <div class="table-wrap api-detail-wrap" tabindex="0" role="region" aria-label="API 单价明细，可横向滚动"><table id="apiDetailTable">
      <caption class="sr-only">统一折算美元的每百万 tokens 价格和 $10 输出购买力</caption>
      <thead><tr><th scope="col">厂商 / 模型</th><th scope="col">地区</th><th scope="col">输入 / 1M</th><th scope="col">输出 / 1M</th><th scope="col">$10 输出 tokens</th><th scope="col">来源</th></tr></thead>
      <tbody id="apiDetailBody"><tr v-for="api in rows" :key="api.vendor + api.model">
        <th scope="row">{{ app.apiChartLabel(api) }}</th><td>{{ regionLabel(api.region) }}</td><td>${{ Number(api.input.toFixed(4)) }}</td><td>${{ Number(api.output.toFixed(4)) }}</td><td>{{ api.output > 0 ? Number((10 / api.output).toFixed(1)) + "M" : "—" }}</td>
        <td><PriceCheck :plan="api" kind="api" /></td>
      </tr></tbody>
    </table></div>
  </details>
</template>
