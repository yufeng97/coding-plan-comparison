<script setup lang="ts">
/* 页头：滚动进度条、品牌、主要视图导航（选套餐 / 模型评测 / 我的关注）与主题按钮。 */
import ThemeButton from '../components/ThemeButton.vue';
</script>
<template>
<div class="scroll-progress" aria-hidden="true"><span id="scrollBar"></span></div>

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="#top"><span class="brand-mark">&lt;/&gt;</span> Coding Plan <em>比价中心</em></a>
    <nav class="primary-nav" aria-label="主要内容">
      <a href="#quick" data-site-view="compare" aria-current="page">选套餐</a>
      <a href="#benchmarks" data-site-view="benchmarks">模型评测</a>
      <a href="#updates" data-site-view="updates">我的关注</a>
    </nav>
    <ThemeButton />
  </div>
</header>
</template>
