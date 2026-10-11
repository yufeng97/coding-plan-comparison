<script setup lang="ts">
import { SOURCES, UNCERTAIN, RATE_USD_CNY, currentPriceSources, displayPriceReason, PLANS, API_PRICES, PAYG_REFERENCES, priceCheckOf } from '@app/runtime';
import PriceCheck from '../../components/PriceCheck.vue';
const priceSources = currentPriceSources();
const pendingPrices = [...PLANS.map(p => ({ p, kind: 'plan' as const })), ...API_PRICES.map(p => ({ p, kind: 'api' as const })), ...PAYG_REFERENCES.map(p => ({ p, kind: 'payg' as const }))].filter(({ p, kind }) => priceCheckOf(p, kind)?.status === 'unverified');
</script>
<template>
  <div class="grid-2">
    <div class="source-card" id="sourceList"><h3>📖 全部来源（官方定价页 / 权威报道）</h3><details v-for="source in SOURCES" :key="source.group" class="source-group"><summary>{{ source.group }} <span class="sub">{{ source.urls.length }} 个来源</span></summary><ul><li v-for="url in source.urls.filter(url => /^https?:/.test(url))" :key="url"><a :href="url" tabindex="0" target="_blank" rel="noopener">{{ url }}</a></li></ul></details><details class="method-box audit-sources"><summary>本次逐条核价来源（{{ priceSources.length }} 页）</summary><ul><li v-for="source in priceSources" :key="source.url"><a :href="source.url" tabindex="0" target="_blank" rel="noopener">{{ source.url }}</a> — {{ displayPriceReason(source.evidence) }}</li></ul></details></div>
    <div class="source-card"><h3>⚠️ 不确定性与口径说明</h3><details class="method-box" id="uncertainWrap"><summary>展开全部不确定性说明（{{ pendingPrices.length }} 条价格待核实，另 {{ UNCERTAIN.length }} 条口径说明）</summary><ul class="uncertain-list" id="uncertainList"><li v-for="{ p, kind } in pendingPrices" :key="p.vendor + ('plan' in p ? p.plan : p.model)"><b>{{ p.vendor }} · {{ 'plan' in p ? p.plan : p.model }}</b>：{{ displayPriceReason(priceCheckOf(p, kind)?.reason) }} <PriceCheck :plan="p" :kind="kind" /></li><li v-for="text in UNCERTAIN" :key="text">{{ text }}</li></ul></details><h3>📌 阅读提示</h3><ul class="uncertain-list"><li>各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文。</li><li>USD 价格按 1 USD ≈ <span id="rateText2">{{ RATE_USD_CNY }}</span> CNY 折算；原价和币种保留，汇率日期与来源见价格图及导出。</li><li>「定制」表示需联系销售，无公开定价。</li><li>价格随官方随时调整，购买前请以官网为准。</li></ul></div>
  </div>
</template>
