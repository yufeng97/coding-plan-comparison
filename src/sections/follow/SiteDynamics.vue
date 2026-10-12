<script setup lang="ts">
import { DYNAMICS } from '@generated/catalog';
import { safeLink } from '@domain/core';
import { dynamicStatus, dynamicText } from '@domain/table-format';
const sorted = DYNAMICS.slice().sort((a, b) => b.date.localeCompare(a.date));
function view(row: typeof DYNAMICS[number]) {
  return { ...row, status: dynamicStatus(row), text: dynamicText(row), href: safeLink(row.url) };
}
const announcements = sorted.filter(row => !row.checked).map(view);
const checks = sorted.filter(row => row.checked).map(view);
</script>
<template>
  <ul class="dynamics-list" id="dynamicsList">
    <li v-for="row in announcements" :key="row.date + row.text" :class="row.status.key ? `dyn-${row.status.key}` : undefined">
      <span class="dyn-date" title="来源写明的发生日期">{{ row.date }}</span>
      <div class="dyn-body"><span v-if="row.status.label" class="dyn-status" :class="`dyn-${row.status.key}`">{{ row.status.label }}</span> {{ row.text }} <a v-if="row.href" class="dyn-src" :href="row.href" target="_blank" rel="noopener" :title="`打开来源：${row.href}`">{{ row.source || '来源' }} ↗</a></div>
    </li>
  </ul>
  <details class="method-box">
    <summary>本站核对记录（日期是核对日，不是厂商公告日）</summary>
    <ul class="dynamics-list" id="checkList">
      <li v-for="row in checks" :key="row.date + row.text" :class="row.status.key ? `dyn-${row.status.key}` : undefined">
        <span class="dyn-date is-checked" title="本站这一天核对到该状态，不是厂商公告日">核实 {{ row.date }}</span>
        <div class="dyn-body"><span v-if="row.status.label" class="dyn-status" :class="`dyn-${row.status.key}`">{{ row.status.label }}</span> {{ row.text }} <a v-if="row.href" class="dyn-src" :href="row.href" target="_blank" rel="noopener">{{ row.source || '来源' }} ↗</a></div>
      </li>
    </ul>
  </details>
</template>
