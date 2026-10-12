<script setup lang="ts">
/* 选套餐视图的章节链接：帮我选下方的「更多比较」菜单与页头的「章节」下拉共用一份列表。
 * 站内锚点由 section-navigation 统一处理（预热图表、焦点与历史），当前章节由 page-navigation 标出。 */
defineProps<{ navClass: string; label: string }>();
const SECTIONS = [
  ["#quick", "帮我选"], ["#s1", "订阅价格"], ["#free", "免费入口"], ["#table", "数据表"], ["#rank", "性价比排行"],
  ["#s3b", "额度对比"], ["#s3", "每周 tokens"], ["#s2", "团队档"], ["#s4", "API 按量"], ["#dynamics", "重要动态"],
] as const;
</script>

<template>
  <nav :class="navClass" :aria-label="label">
    <a v-for="[hash, text] in SECTIONS" :key="hash" :href="hash">{{ text }}</a>
  </nav>
</template>
