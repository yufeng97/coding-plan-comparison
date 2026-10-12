<script setup lang="ts">
import { computed } from "vue";
import { REGION_LABEL } from "@domain/core";
import { API_LEGEND, apiChartLabel, apiPriceRows, POWER_LEGEND } from "@browser/charts/api";
import ChartLegend from "../../components/ChartLegend.vue";
import CostCalculator from "../calculator/CostCalculator.vue";
import PriceCheck from "../../components/PriceCheck.vue";
import { useChartLifecycle } from "../../composables/chart-lifecycle";
useChartLifecycle("chartApi", "chartPower");
/* 明细表与图表共用 apiPriceRows：表里保留待核实条目（来源栏标明状态），图表只画已核实的。 */
const rows = computed(apiPriceRows);
const regionLabel = (region: string) => REGION_LABEL[region as keyof typeof REGION_LABEL] || "—";
</script>
<template>
  <CostCalculator />
  <div class="grid-2">
    <div class="chart-card"><ChartLegend id="apiLegend" chart="chartApi" label="API 价格图例" :items="API_LEGEND" /><div id="chartApi" class="chart chart-fixed"></div></div>
    <div class="chart-card"><ChartLegend id="powerLegend" chart="chartPower" label="输出购买力图例" :items="POWER_LEGEND" /><div id="chartPower" class="chart chart-fixed"></div></div>
  </div>
  <details class="method-box">
    <summary>查看 API 单价与 $10 输出购买力明细</summary>
    <div class="table-wrap api-detail-wrap" tabindex="0" role="region" aria-label="API 单价明细，可横向滚动"><table id="apiDetailTable">
      <caption class="sr-only">统一折算美元的每百万 tokens 价格和 $10 输出购买力</caption>
      <thead><tr><th scope="col">厂商 / 模型</th><th scope="col">地区</th><th scope="col">输入 / 1M</th><th scope="col">输出 / 1M</th><th scope="col">$10 输出 tokens</th><th scope="col">来源</th></tr></thead>
      <tbody id="apiDetailBody">
        <tr v-for="api in rows" :key="api.vendor + api.model">
          <th scope="row">{{ apiChartLabel(api) }}</th>
          <td>{{ regionLabel(api.region) }}</td>
          <td>${{ Number(api.inUSD.toFixed(4)) }}</td>
          <td>${{ Number(api.outUSD.toFixed(4)) }}</td>
          <td>{{ api.outUSD > 0 ? Number((10 / api.outUSD).toFixed(1)) + "M" : "—" }}</td>
          <td><PriceCheck :plan="api" kind="api" /></td>
        </tr>
      </tbody>
    </table></div>
  </details>
</template>
