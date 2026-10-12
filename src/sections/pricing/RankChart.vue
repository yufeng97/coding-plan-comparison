<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { displayModelName, fmtCNY, planLabel } from "@domain/core";
import { fullUseCostRangeText, tokSpan } from "@domain/picker/text";
import { provenance } from "@domain/provenance";
import { RANK_ESTIMATE_DIVIDER, rankIsEstimate, rankVendorLabel } from "@domain/rank";
import { cpmColor, fmtCpm } from "@domain/table-format";
import { rankState } from "@state/app";
import { rankRowPaymentLabel, rankRows } from "@state/rank";
import { chartCache, queuedChartRenders } from "@browser/charts/host";
import { renderRankChart } from "@browser/charts/rank";
import { updateAppState } from "@browser/url-state";
import { targetValue } from "@browser/dom";
import { rankNote, rankVendors } from "./chart-models";
import ChipRadioGroup from "../../components/ChipRadioGroup.vue";
import PickerScope from "../../components/PickerScope.vue";
import { useChartLifecycle } from "../../composables/chart-lifecycle";
useChartLifecycle("chartRank");
const state = rankState;
const tiers = [["flagship", "只看旗舰"], ["all", "含轻量模型"]] as const;
const scopes = [["credits", "官方口径折算"], ["all", "含全部估算"]] as const;
const vendors = computed(rankVendors), rows = computed(() => rankRows()), note = computed(rankNote);
const details = ref<HTMLDetailsElement | null>(null);
function change(key: "tier" | "scope" | "vendor", value: string) { updateAppState(() => { state[key] = value; }); }
async function draw() {
  if (!chartCache.chartRank && !queuedChartRenders.has("chartRank")) return;
  await nextTick(); renderRankChart();
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
    <ChipRadioGroup id="chipRank" class="chip-group" label="模型档" data-key="rank" :options="tiers" :model-value="state.tier" @select="change('tier', $event)" />
    <ChipRadioGroup id="chipRScope" class="chip-group" label="排行口径" data-key="rscope" :options="scopes" :model-value="state.scope" @select="change('scope', $event)" />
    <select id="rankVendor" class="select" aria-label="排行厂商" :value="state.vendor" @change="change('vendor', targetValue($event))"><option value="all">全部厂商</option><option v-for="vendor in vendors" :key="vendor" :value="vendor">{{ rankVendorLabel(vendor) }}</option></select>
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
          <tr v-if="rankIsEstimate(row.m) && index > 0 && !rankIsEstimate(rows[index - 1].m)" class="rank-divider"><th scope="rowgroup" colspan="5">{{ RANK_ESTIMATE_DIVIDER }}</th></tr>
          <tr><th scope="row">{{ planLabel(row.m) }}<br>{{ displayModelName(row.m.model) }}</th>
            <td class="td-price">{{ fmtCNY(row.c.priceCNY) }}/月<br><span class="sub">{{ rankRowPaymentLabel(row.m) }}</span></td>
            <td><span class="cost-value" :style="{ color: cpmColor(row.c.costPerM) }">{{ fmtCpm(row.c.costPerM) }}</span><template v-if="fullUseCostRangeText(row.c)"><br><span class="sub">{{ fullUseCostRangeText(row.c) }}</span></template></td>
            <td class="tok-cell">{{ tokSpan(row.c, 'moLow', 'moHigh') }}</td>
            <td class="prov-cell"><span class="conf" :class="provenance(row.m).conf === '高' ? 'conf-hi' : provenance(row.m).conf === '中' ? 'conf-mid' : 'conf-lo'">{{ provenance(row.m).conf }}</span>{{ provenance(row.m).text }}</td>
          </tr>
        </template>
        <tr v-if="!rows.length"><td colspan="5" class="table-empty">当前口径没有可比较的套餐，请调整模型档或排行口径。</td></tr>
      </tbody>
    </table></div>
  </details>
</template>
