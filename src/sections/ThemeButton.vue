<script setup lang="ts">
import { computed } from 'vue';
import { themeView, applyTheme, rerenderCharts } from '@domain/runtime';
const label = computed(() => {
  const name = themeView.mode === 'dark' ? '暗色' : themeView.mode === 'light' ? '亮色' : '跟随系统';
  const next = themeView.mode === 'dark' ? '亮色' : themeView.mode === 'light' ? '跟随系统' : '暗色';
  const current = themeView.mode === 'system' ? `${name}（当前${themeView.effective === 'dark' ? '暗色' : '亮色'}）` : name;
  return `当前主题：${current}；点击切换为${next}`;
});
function cycle() {
  const order = ['dark', 'light', 'system'] as const;
  applyTheme(order[(order.indexOf(themeView.mode) + 1) % order.length]);
  rerenderCharts();
}
</script>
<template>
  <button id="themeBtn" class="theme-btn" :title="label" :aria-label="label" @click="cycle">
    <i class="ric" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path v-if="themeView.mode === 'dark'" d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
      <template v-else-if="themeView.mode === 'light'"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></template>
      <template v-else><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M8 21h8m-4-5v5" /></template>
    </svg></i>
  </button>
</template>
