<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import * as app from "@app/runtime";
import { targetValue } from "../../components/dom";
import { rankNote, rankVendors } from "./chart-models";
import PickerScope from "../../components/PickerScope.vue";
import { useChartLifecycle } from "../../components/charts/chart-lifecycle";
useChartLifecycle("chartRank");
const state = app.rankState;
const tiers = [["flagship", "只看旗舰"], ["all", "含轻量模型"]];
const scopes = [["credits", "官方口径折算"], ["all", "含全部估算"]];
const vendors = computed(rankVendors), rows = computed(() => app.rankRows()), note = computed(rankNote);
const details = ref<HTMLDetailsElement | null>(null);
function change(key: "tier" | "scope" | "vendor", value: string) { app.updateAppState(() => { state[key] = value; }); }
async function draw() {
  if (!app.chartCache.chartRank && !app.queuedChartRenders.has("chartRank")) return;
  await nextTick(); app.renderRankChart();
}
watch(rows, draw);
function expandDetails() {
  if (!details.value) return;
  details.value.open = true;
  details.value.querySelector("summary")?.focus();
  details.value.scrollIntoView({ block: "start", behavior: "smooth" });
}
</script>
<template>
  <div class="controls">
    <div class="chip-group" id="chipRank" role="group" aria-label="模型档"><button v-for="[id, label] in tiers" :key="id" type="button" class="chip" :class="{ active: state.tier === id }" :data-rank="id" :aria-pressed="state.tier === id" @click="change('tier', id)">{{ label }}</button></div>
    <div class="chip-group" id="chipRScope" role="group" aria-label="排行口径"><button v-for="[id, label] in scopes" :key="id" type="button" class="chip" :class="{ active: state.scope === id }" :data-rscope="id" :aria-pressed="state.scope === id" @click="change('scope', id)">{{ label }}</button></div>
    <select id="rankVendor" class="select" aria-label="排行厂商" :value="state.vendor" @change="change('vendor', targetValue($event))"><option value="all">全部厂商</option><option v-for="vendor in vendors" :key="vendor" :value="vendor">{{ app.rankVendorLabel(vendor) }}</option></select>
    <PickerScope name="rank" />
  </div>
  <PickerScope name="rank" paragraph />
  <div class="chart-card"><div id="chartRank" class="chart"></div></div>
  <p class="chart-note" id="rankNote">{{ note }} <button type="button" class="linkish" id="openRankDetails" @click="expandDetails">查看完整排行明细</button></p>
  <details class="method-box" id="rankDetails" ref="details">
    <summary id="rankDetailsSummary">查看当前口径的完整排行明细</summary>
    <p class="maintenance-meta">每百万 tokens 成本：绿色 ≤ ¥0.30、黄色 ≤ ¥1、红色 &gt; ¥1；与额度深度对比使用相同阈值。置信度另列高 / 中 / 低，不代表成本高低。</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="成本排行明细，可横向滚动"><table id="rankDetailTable">
      <caption class="sr-only">与当前模型档和排行口径一致的全部套餐</caption>
      <thead><tr><th scope="col">套餐 / 模型</th><th scope="col">月费</th><th scope="col">每百万 tokens</th><th scope="col">月 tokens 区间</th><th scope="col">依据 / 置信度</th></tr></thead>
      <tbody id="rankDetailBody">
        <template v-for="(row, index) in rows" :key="[row.m.ref || row.m.vendor, row.m.model, row.m.ver, index].join('|')">
          <tr v-if="app.rankIsEstimate(row.m) && index > 0 && !app.rankIsEstimate(rows[index - 1].m)" class="rank-divider"><th scope="rowgroup" colspan="5">{{ app.RANK_ESTIMATE_DIVIDER }}</th></tr>
          <tr><th scope="row">{{ app.planLabel(row.m) }}<br>{{ app.displayModelName(row.m.model) }}</th>
            <td class="td-price">{{ app.fmtCNY(row.c.priceCNY) }}/月<br><span class="sub">{{ app.rankRowPaymentLabel(row.m) }}</span></td>
            <td><span class="cost-value" :style="{ color: app.cpmColor(row.c.costPerM) }">¥{{ row.c.costPerM.toFixed(3) }}</span><template v-if="app.fullUseCostRangeText(row.c)"><br><span class="sub">{{ app.fullUseCostRangeText(row.c) }}</span></template></td>
            <td class="tok-cell">{{ app.tokSpan(row.c, 'moLow', 'moHigh') }}</td>
            <td class="prov-cell"><span class="conf" :class="app.provenance(row.m).conf === '高' ? 'conf-hi' : app.provenance(row.m).conf === '中' ? 'conf-mid' : 'conf-lo'">{{ app.provenance(row.m).conf }}</span>{{ app.provenance(row.m).text }}</td>
          </tr>
        </template>
        <tr v-if="!rows.length"><td colspan="5" class="table-empty">当前口径没有可比较的套餐，请调整模型档或排行口径。</td></tr>
      </tbody>
    </table></div>
  </details>
</template>
