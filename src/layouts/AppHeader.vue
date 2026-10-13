<script setup lang="ts">
/* 页头：滚动进度条、品牌、主要视图导航（选套餐 / 模型评测 / 我的关注）、本页章节跳转与主题按钮。
   关注的套餐有未读变更时，「我的关注」显示数量；完整维护数据到达后按同一口径重算。
   「章节」下拉只在选套餐视图显示（section-navigation 切换视图时控制 hidden），滚到任何位置都能跳到其他章节。 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { followUnreadCount } from '@app/maintenance';
import { fromData } from '../composables/optional-data';
import SectionLinks from '../components/SectionLinks.vue';
import ThemeButton from '../components/ThemeButton.vue';
const unread = fromData("maintenance", followUnreadCount);
const jump = ref<HTMLDetailsElement | null>(null);
function closeJump(focusSummary = false) {
  if (!jump.value?.open) return;
  jump.value.open = false;
  if (focusSummary) jump.value.querySelector<HTMLElement>("summary")?.focus();
}
/* 点在下拉以外或选中章节后收起；Esc 收起并把焦点还给「章节」按钮。 */
function onDocumentClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!jump.value?.open || !target) return;
  if (!jump.value.contains(target) || target.closest(".section-jump-list a")) closeJump();
}
onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>
<template>
<div class="scroll-progress" aria-hidden="true"><span id="scrollBar"></span></div>

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="#top"><span class="brand-mark">&lt;/&gt;</span> Coding Plan <em>比价中心</em></a>
    <nav class="primary-nav" aria-label="主要内容">
      <a href="#quick" data-site-view="compare" aria-current="page">选套餐</a>
      <a href="#benchmarks" data-site-view="benchmarks">模型评测</a>
      <a href="#updates" data-site-view="updates">我的关注<span id="followNavBadge" class="nav-badge" :hidden="!unread"><template v-if="unread"><span aria-hidden="true">{{ unread > 99 ? "99+" : unread }}</span><span class="sr-only">，{{ unread }} 条未读变更</span></template></span></a>
    </nav>
    <details id="sectionJump" ref="jump" class="section-jump" @keydown.esc.prevent="closeJump(true)">
      <summary>章节<span class="sr-only">：跳到本页其他章节</span></summary>
      <SectionLinks nav-class="section-jump-list" label="本页章节" />
    </details>
    <ThemeButton />
  </div>
</header>
</template>
