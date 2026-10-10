<script setup lang="ts">
import { computed } from "vue";
import * as app from "@domain/runtime";
const props = defineProps<{ monthlyM: number }>();
const rows = computed(() => app.usageCoverageRows(props.monthlyM));
const basis = computed(() => Number(app.calcState.input) === 80 && Number(app.calcState.cache) === 95 ? "" : "你修改了输入占比或缓存率；参考额度仍按页面 80% 输入、95% 缓存折算，只作量级参考。");
function saving(api: number | null, quote: number) {
  return api == null ? "—" : api > quote
    ? `约 ${app.fmtCalcCNY(api)}，订阅每月省约 ${app.fmtCalcCNY(api - quote)}`
    : `约 ${app.fmtCalcCNY(api)}，按量更省`;
}
</script>
<template>
  <div class="usage-coverage">
    <h4>能覆盖这个用量的套餐<template v-if="rows.length">（{{ rows.length }} 档，列前 5）</template></h4>
    <p v-if="!rows.length">按当前地区与工具，没有套餐的参考月额度下限（官方或中置信折算）能覆盖约 {{ app.fmtTok(monthlyM) }} tokens/月。可以减少用量假设，或按上方 API 按量费用估算。{{ basis }}</p>
    <template v-else>
      <div class="table-wrap" tabindex="0" role="region" aria-label="能覆盖用量的套餐，可横向滚动"><table class="mini-table usage-coverage-table">
        <caption class="sr-only">参考月额度下限不低于约 {{ app.fmtTok(monthlyM) }} tokens/月的套餐</caption>
        <thead><tr><th scope="col">套餐</th><th scope="col">模型</th><th scope="col">所选付款月均</th><th scope="col">参考月额度下限</th><th scope="col">同模型按量</th><th scope="col">订阅回本点</th></tr></thead>
        <tbody><tr v-for="row in rows.slice(0, 5)" :key="row.p.id">
          <th scope="row" data-label="套餐">{{ app.planTitle(row.p) }}</th><td data-label="模型">{{ app.displayModelName(row.m.model) }}</td><td data-label="所选付款月均">{{ app.priceLine(row.p) }}</td><td data-label="参考月额度下限">{{ app.fmtTok(row.c.moLow) }}（置信{{ row.conf }}）</td><td data-label="同模型按量">{{ saving(row.apiMonthlyCNY, row.quote.monthlyCNY) }}</td><td data-label="订阅回本点">{{ row.breakEvenM == null ? "—" : `超过约 ${app.fmtTok(row.breakEvenM)} tokens/月` }}</td>
        </tr></tbody>
      </table></div>
      <p class="maintenance-meta">沿用帮我选的地区、工具和付款方式；只统计官方或中置信折算的额度，第三方与请求次数估算不列入。不同模型的 token 不等价，参考额度不保证可用量。「订阅回本点」指同模型按量费用追平月费所需的用量。{{ basis }}</p>
    </template>
  </div>
</template>
