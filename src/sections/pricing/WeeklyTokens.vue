<script setup lang="ts">
import { computed } from "vue";
import { fmtCNY } from "@domain/core";
import { TOKEN_EST_COLOR, TOKEN_EST_SERIES, TOKEN_OFFICIAL_COLOR, TOKEN_OFFICIAL_SERIES } from "@browser/charts/tokens";
import { weeklyRows } from "./chart-models";
import ChartLegend from "../../components/ChartLegend.vue";
import { useChartLifecycle } from "../../composables/chart-lifecycle";
useChartLifecycle("chartTokens");
const rows = computed(weeklyRows);
const legend = [{ name: TOKEN_OFFICIAL_SERIES, color: TOKEN_OFFICIAL_COLOR }, { name: TOKEN_EST_SERIES, color: TOKEN_EST_COLOR }];
function per100(midM: number, priceCNY: number) { return priceCNY > 0 ? (midM / priceCNY * 100).toFixed(1) + "M" : "—"; }
</script>
<template>
  <div class="grid-2">
    <div class="chart-card"><ChartLegend id="tokensLegend" chart="chartTokens" label="每周 tokens 图例" :items="legend" /><div id="chartTokens" class="chart chart-fixed"></div></div>
    <div class="chart-card card-text" id="tokenInsight">
      <div class="token-insight-list" tabindex="0" role="region" aria-label="全部厂商的每周 tokens 性价比明细">
        <h3>💡 性价比：每 ¥100/月 能买到多少每周 tokens（全部厂商）</h3>
        <p class="token-insight-count">共 {{ rows.length }} 档，按性价比排序；列表可在框内滚动查看。</p>
        <table class="mini-table"><tbody><tr v-for="row in rows" :key="row.label"><td>{{ row.label }}<br><span style="color: var(--muted); font-size: 11px">{{ fmtCNY(row.priceCNY) }}/月 · <span v-if="row.isOfficial" class="conf conf-hi">官方额度折算</span><span v-else class="conf" :class="row.conf === '低' ? 'conf-lo' : 'conf-mid'">估算·{{ row.conf || "低" }}</span></span></td><td><b>{{ per100(row.midM, row.priceCNY) }}</b> tokens/周</td></tr></tbody></table>
      </div>
      <p class="token-insight-note">公平比较提示：不同模型的 token 数不能代表产出质量。<span class="text-green">绿色柱</span>为官方每周额度按官方积分系数折算（80/20、95% 缓存；上限含非高峰 5 折），<span class="text-gold">黄色柱</span>为其他折算或社区推算。厂商自己的估算另见提示。横轴为对数刻度，相邻主刻度为十倍。估算受单次用量、缓存率和动态限流影响，仅供量级参考；完整方法与置信度见「额度深度对比」。</p>
    </div>
  </div>
</template>
