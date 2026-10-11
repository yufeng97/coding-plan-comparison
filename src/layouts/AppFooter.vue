<script setup lang="ts">
/* 页脚：辅助资料入口（来源说明 / 提交纠错）、数据日期与备用访问地址。 */
import { META } from '@generated/catalog';
</script>
<template>
<footer class="footer">
  <nav class="view-tabs" aria-label="资料与反馈">
    <a class="view-tab" href="#sources" data-site-view="sources">来源说明</a>
    <a class="view-tab" href="#contribute" data-site-view="contribute">提交纠错</a>
  </nav>
  <p>Coding Plan 全球比价中心 · 数据调研与核实日期 <span id="footDate">{{ META.updated }}</span> · 仅供参考，以各厂商官方页面为准 · 纯静态页面：无统计、无跟踪，主题、常用条件与关注记录仅存于本机</p>
  <p class="footer-mirror">访问地址：<a href="https://coding-plan-comparison-tau.vercel.app/" rel="noopener">主站（Vercel）</a> · <a href="https://yufeng97.github.io/coding-plan-comparison/" rel="noopener">备用（GitHub Pages）</a>，两处内容相同，一处打不开或较慢时可换另一处；分享链接的筛选条件在两处都有效。</p>
</footer>
</template>
