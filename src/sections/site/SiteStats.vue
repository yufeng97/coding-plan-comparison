<script setup lang="ts">
import { API_PRICES, isFreeCodingEntry, isOnSalePlan, isPersonalMonthly, isPriceConfirmed, PLANS } from '@generated/catalog';
import { cnyOf, fmtCNY, planLabel } from '@domain/core';
interface Stat { icon: string; num: string | number; lbl: string; sub: string }
const paid = PLANS.filter(plan => isPriceConfirmed(plan) && isPersonalMonthly(plan));
const prices = paid.map(plan => cnyOf(plan, 'M') as number);
const minimum = prices.length ? Math.min(...prices) : null;
const maximum = prices.length ? Math.max(...prices) : null;
const minimumPlan = minimum == null ? null : paid.find(plan => cnyOf(plan, 'M') === minimum);
const maximumPlan = maximum == null ? null : paid.find(plan => cnyOf(plan, 'M') === maximum);
const stats: Stat[] = [
  { icon: 'globe', num: new Set(PLANS.map(plan => plan.vendor)).size, lbl: '覆盖厂商', sub: '官方 / 云厂商 / 第三方' },
  { icon: 'stack', num: PLANS.filter(isOnSalePlan).length, lbl: '公开标价记录', sub: '含待核实历史价，见来源栏' },
  { icon: 'gift', num: PLANS.filter(isFreeCodingEntry).length, lbl: '免费可用入口', sub: '见「免费 Coding 入口」' },
  { icon: 'tag', num: API_PRICES.length, lbl: 'API 模型单价', sub: '输入 / 输出对比' },
];
if (minimumPlan && minimum != null) stats.push({ icon: 'down', num: fmtCNY(minimum), lbl: '最低月费', sub: '/月 · ' + planLabel(minimumPlan) });
if (maximumPlan && maximum != null) stats.push({ icon: 'up', num: fmtCNY(maximum), lbl: '最高月费', sub: '/月 · ' + planLabel(maximumPlan) });
</script>

<template>
  <dl id="statsRow" class="stats-row">
    <div v-for="stat in stats" :key="stat.lbl">
      <dt><i class="ric" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <template v-if="stat.icon === 'globe'"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></template>
        <template v-else-if="stat.icon === 'stack'"><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 17 9 5 9-5" /></template>
        <template v-else-if="stat.icon === 'gift'"><rect x="3.5" y="7.5" width="17" height="4.5" rx="1" /><path d="M5.5 12v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-7M12 7.5V21" /><path d="M12 7.5C9 7.5 7.2 6.6 7.2 5.2 7.2 4 8.2 3 9.4 3c1.7 0 2.6 2 2.6 4.5C12 5 12.9 3 14.6 3c1.2 0 2.2 1 2.2 2.2 0 1.4-1.8 2.3-4.8 2.3Z" /></template>
        <template v-else-if="stat.icon === 'tag'"><path d="M3 3h8l10 10-8 8L3 11V3Z" /><circle cx="8" cy="8" r="1.7" /></template>
        <template v-else><circle cx="12" cy="12" r="9" /><path :d="stat.icon === 'down' ? 'M12 7v10m0 0 4-4m-4 4-4-4' : 'M12 17V7m0 0 4 4m-4-4-4 4'" /></template>
      </svg></i>{{ stat.lbl }}</dt>
      <dd>{{ stat.num }}<small :title="stat.sub">{{ stat.sub }}</small></dd>
    </div>
  </dl>
</template>
