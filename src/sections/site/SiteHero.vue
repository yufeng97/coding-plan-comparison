<script setup lang="ts">
/* 首屏标题：数据版本、参考汇率、核价概况与站点统计（收在可展开的说明里）。 */
import { META, RATE_USD_CNY, PRICE_CHECKS } from '@generated/catalog';
import SiteStats from './SiteStats.vue';

const entries = Object.values(PRICE_CHECKS.rows);
const pending = entries.filter((row) => row.status === 'unverified').length;
const retired = entries.filter((row) => row.status === 'retired').length;
const auditSummary = `价格逐条核查：${PRICE_CHECKS.checkedAt} · ${entries.length} 条记录，${entries.length - pending - retired} 条已确认（含询价），${pending} 条待核实，${retired} 条停售。待核实历史价仅保留作参考，不参与推荐与排行。`;
</script>
<template>
  <section class="hero">
    <div class="hero-inner">
      <span class="prompt-mark" aria-hidden="true">&gt;_</span>
      <h1>Coding Plan 比价中心</h1>
      <p class="hero-meta">数据版本 <strong id="heroDate">{{ META.updated }}</strong></p>
      <details class="hero-details" id="heroDetails">
        <summary>数据覆盖与核价信息</summary>
        <p class="hero-meta">参考汇率 USD/CNY <span id="rateText">{{ RATE_USD_CNY }}</span></p>
        <p class="hero-meta" id="priceAuditSummary">{{ auditSummary }}</p>
        <site-stats></site-stats>
      </details>
    </div>
  </section>
</template>
