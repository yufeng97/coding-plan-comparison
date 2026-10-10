<script setup lang="ts">
import { DYNAMICS, dynamicStatus } from '@domain/runtime';
const sorted = DYNAMICS.slice().sort((a, b) => b.date.localeCompare(a.date));
const announcements = sorted.filter(row => !row.checked);
const checks = sorted.filter(row => row.checked);
function view(row: typeof DYNAMICS[number]) {
  const status = dynamicStatus(row);
  return { ...row, status, text: status.key === 'upcoming' ? row.text.replace(/于 (\d{4}-\d{2}-\d{2}) 退役/, '计划于 $1 退役') : row.text };
}
</script>
<template>
  <ul class="dynamics-list" id="dynamicsList"><li v-for="row in announcements.map(view)" :key="row.date + row.text" :class="row.status.key ? `dyn-${row.status.key}` : undefined"><span class="dyn-date" title="来源写明的发生日期">{{ row.date }}</span><div class="dyn-body"><span v-if="row.status.label" class="dyn-status" :class="`dyn-${row.status.key}`">{{ row.status.label }}</span> {{ row.text }} <a class="dyn-src" v-if="/^https?:/.test(row.url)" :href="row.url" target="_blank" rel="noopener" :title="`打开来源：${row.url}`">{{ row.source || '来源' }} ↗</a></div></li></ul>
  <details class="method-box"><summary>本站核对记录（日期是核对日，不是厂商公告日）</summary><ul class="dynamics-list" id="checkList"><li v-for="row in checks.map(view)" :key="row.date + row.text" :class="row.status.key ? `dyn-${row.status.key}` : undefined"><span class="dyn-date is-checked" title="本站这一天核对到该状态，不是厂商公告日">核实 {{ row.date }}</span><div class="dyn-body"><span v-if="row.status.label" class="dyn-status" :class="`dyn-${row.status.key}`">{{ row.status.label }}</span> {{ row.text }} <a class="dyn-src" v-if="/^https?:/.test(row.url)" :href="row.url" target="_blank" rel="noopener">{{ row.source || '来源' }} ↗</a></div></li></ul></details>
</template>
