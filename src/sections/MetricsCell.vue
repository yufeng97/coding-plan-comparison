<script setup lang="ts">
import { computed } from "vue";
import * as runtime from "@domain/runtime";
import TokenRange from "./TokenRange.vue";
import type { MetricViewRow } from "./metrics-view";
const props = defineProps<{ column: string; row: MetricViewRow }>();
const model = computed(() => props.row.m);
const metrics = computed(() => props.row.c);
const provenance = computed(() => props.row.payg ? runtime.isPriceConfirmed(model.value, "payg") ? { text: "官方按量", conf: "高" } : { text: "历史牌价 · 待核实", conf: "低" } : runtime.provenance(model.value));
const currency = computed(() => model.value.cur === "USD" ? "$" : "¥");
const costTitle = computed(() => props.row.payg ? "官方牌价按 80% 输入 / 20% 输出、95% 缓存命中折成每百万人民币。有峰谷的取低峰。不是套餐月费除以额度。" : "用尽参考月额度时的每百万 tokens 折算成本；主值按额度区间中点排序（统一折算人民币）");
const costRange = computed(() => props.row.payg ? "" : runtime.fullUseCostRangeText(metrics.value));
</script>

<template>
  <template v-if="column === 'plan'"><span v-if="model.isEst" class="est-badge" title="社区/推算估算值，非官方数字">≈估</span> <span class="metrics-vendor">{{ model.vendor }}</span><span class="metrics-plan">{{ model.plan }}</span></template>
  <span v-else-if="column === 'ver'" class="ver-tag" :class="model.ver === 'V3' ? 'ver-v3' : model.ver === 'V2' ? 'ver-v2' : 'ver-na'">{{ model.ver }}</span>
  <template v-else-if="column === 'model'">
    {{ runtime.displayModelName(model.model) }}<template v-if="model.note?.startsWith('对照')"><br><span class="model-reference-note">套餐列表未列 · 牌价对照</span></template>
    <span v-if="typeof model.apiIn === 'number'" class="model-price" title="模型牌价，每百万 tokens"><span>输入 {{ currency }}{{ runtime.fmtUnit(model.apiIn) }}</span> / <span>输出 {{ currency }}{{ runtime.fmtUnit(model.apiOut) }}</span> / <span>缓存 {{ currency }}{{ runtime.fmtUnit(model.apiCache) }}</span></span>
  </template>
  <template v-else-if="column === 'price'">{{ row.payg ? "按量" : runtime.fmtCNY(metrics.priceCNY) }}</template>
  <template v-else-if="column === 'tps'">{{ model.tps || "—" }}</template>
  <template v-else-if="column === 'cpm'"><span :style="{ fontWeight: 800, color: runtime.cpmColor(metrics.costPerM) }" :title="costTitle">{{ runtime.fmtCpm(metrics.costPerM) }}</span><template v-if="costRange"><br><span class="sub">{{ costRange }}</span></template></template>
  <template v-else-if="column === 't5h'"><template v-if="row.payg">—</template><TokenRange v-else :low="metrics.fLow" :high="metrics.fHigh" :empty-label="model.windowPeriod === 'none' ? '无5h上限' : model.windowPeriod === 'month' ? '月度池；无5h额度' : '未公布'" /></template>
  <template v-else-if="column === 'twk'"><template v-if="row.payg">—</template><TokenRange v-else :low="metrics.wkLowM" :high="metrics.wkHighM" /></template>
  <template v-else-if="column === 'tmo'"><span v-if="row.payg" style="color:var(--faint)">无套餐额度</span><TokenRange v-else :low="metrics.moLow" :high="metrics.moHigh" /></template>
  <template v-else-if="column === 'val5h'">{{ row.payg ? "—" : runtime.fmtVal(metrics.val5h, model.cur) }}</template>
  <template v-else-if="column === 'valWk'">{{ row.payg ? "—" : runtime.fmtVal(metrics.valWk, model.cur) }}</template>
  <template v-else-if="column === 'valMo'">{{ row.payg ? "—" : runtime.fmtVal(metrics.valMo, model.cur) }}</template>
  <template v-else-if="column === 'r5h'">{{ runtime.fmtRate(row.payg ? null : metrics.r5h) }}</template>
  <template v-else-if="column === 'rwk'">{{ runtime.fmtRate(row.payg ? null : metrics.rwk) }}</template>
  <template v-else-if="column === 'rmo'">{{ runtime.fmtRate(row.payg ? null : metrics.rmo) }}</template>
  <template v-else-if="column === 'prov'"><span class="conf" :class="provenance.conf === '高' ? 'conf-hi' : provenance.conf === '中' ? 'conf-mid' : 'conf-lo'">{{ provenance.conf }}</span>{{ provenance.text }}</template>
</template>
