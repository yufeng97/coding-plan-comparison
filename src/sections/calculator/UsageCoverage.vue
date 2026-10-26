<script setup lang="ts">
import { computed } from "vue";
import { displayModelName, planTitle } from "@domain/core";
import { fmtTok } from "@domain/metrics";
import { fmtCalcCNY } from "@domain/workload";
import { calcState } from "@state/app";
import { priceLine } from "@state/picker";
import { usageCoverageRows } from "@app/calculator";
const props = defineProps<{ monthlyM: number }>();
const rows = computed(() => usageCoverageRows(props.monthlyM));
const basis = computed(() => `Credits 月池按当前输入 ${calcState.input}%、缓存 ${calcState.cache}% 和该模型的官方单价折算；其他额度标为页面基准参考，仍按 80% 输入、95% 缓存，只作量级对照。`);
function saving(api: number | null, quote: number) {
  return api == null ? "—" : api > quote
    ? `约 ${fmtCalcCNY(api)}，订阅每月省约 ${fmtCalcCNY(api - quote)}`
    : `约 ${fmtCalcCNY(api)}，按量更省`;
}
</script>
<template>
  <div class="usage-coverage">
    <h3>套餐额度对照<template v-if="rows.length">（{{ rows.length }} 档，列前 5）</template></h3>
    <p v-if="!rows.length">按当前地区与工具，没有套餐的月额度折算或基准参考下限不低于约 {{ fmtTok(monthlyM) }} tokens/月。可以减少用量假设，或按上方 API 按量费用估算。{{ basis }}</p>
    <template v-else>
      <div class="table-wrap" tabindex="0" role="region" aria-label="套餐额度对照，可横向滚动"><table class="mini-table usage-coverage-table">
        <caption class="sr-only">月额度折算或基准参考下限不低于约 {{ fmtTok(monthlyM) }} tokens/月的套餐</caption>
        <thead><tr><th scope="col">套餐</th><th scope="col">模型</th><th scope="col">所选付款月均</th><th scope="col">月额度折算 / 基准参考</th><th scope="col">同模型按量</th><th scope="col">订阅回本点</th></tr></thead>
        <tbody><tr v-for="row in rows.slice(0, 5)" :key="row.p.id">
          <th scope="row" data-label="套餐">{{ planTitle(row.p) }}</th><td data-label="模型">{{ displayModelName(row.m.model) }}</td><td data-label="所选付款月均">{{ priceLine(row.p) }}</td><td data-label="月额度折算 / 基准参考">{{ fmtTok(row.c.moLow) }}（置信{{ row.conf }}）<br>{{ row.quotaBasis === "workload" ? "按当前比例折算" : "页面基准参考下限" }}</td><td data-label="同模型按量">{{ saving(row.apiMonthlyCNY, row.quote.monthlyCNY) }}</td><td data-label="订阅回本点">{{ row.breakEvenM == null ? "—" : `超过约 ${fmtTok(row.breakEvenM)} tokens/月` }}</td>
        </tr></tbody>
      </table></div>
      <p class="maintenance-meta">沿用帮我选的地区、工具和付款方式；只统计套餐明确包含模型的官方或中置信折算额度，第三方、请求次数估算和模拟对照不列入。不同模型的 token 不等价，参考额度不保证可用量。「订阅回本点」指同模型按量费用追平月费所需的用量。{{ basis }}</p>
    </template>
  </div>
</template>
