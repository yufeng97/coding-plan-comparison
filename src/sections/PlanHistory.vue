<script setup lang="ts">
/* 一档套餐的已确认历史。展开时才下载维护数据；数据到达后原地更新，不重建 details，展开状态与 summary 焦点保留。 */
import { computed, ref } from "vue";
import * as legacy from "@domain/runtime";
import ChangeCard from "./ChangeCard.vue";

const props = defineProps<{ planId: string }>();
const loadState = ref<"idle" | "loading" | "failed">("idle");
const loaded = computed(() => {
  void legacy.dataRevision.maintenance;
  return legacy.optionalDataLoaded("maintenance");
});
const changes = computed(() => loaded.value ? legacy.planChanges(props.planId) : []);
const summary = computed(() => {
  void legacy.dataRevision.maintenance;
  return legacy.planHistorySummary(props.planId);
});

function onToggle(event: Event) {
  if (!(event.target as HTMLDetailsElement).open || loaded.value) return;
  loadState.value = "loading";
  legacy.ensureOptionalData("maintenance").then(() => {
    loadState.value = "idle";
    legacy.refreshOptionalViews("maintenance");
  }, () => { loadState.value = "failed"; });
}
</script>

<template>
  <details class="method-box plan-history" @toggle="onToggle">
    <summary>{{ summary }}</summary>
    <div class="plan-history-body">
      <ul v-if="loaded && changes.length" class="change-list">
        <ChangeCard v-for="change in changes" :key="change.changeId" :change="change" />
      </ul>
      <p v-else-if="loaded">{{ legacy.PLAN_HISTORY_EMPTY }}</p>
      <p v-else-if="loadState === 'loading'">正在加载历史数据…</p>
      <p v-else-if="loadState === 'failed'">历史数据加载失败，请关闭后重新展开。</p>
      <p v-else>展开后加载本档的已确认变更。</p>
    </div>
  </details>
</template>
