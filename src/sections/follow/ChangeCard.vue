<script setup lang="ts">
/* 一条已确认变更：字段的前后值与官方证据。字段名与取值说法和 RSS 共用 data.js 的 changeDisplay。 */
import { computed } from "vue";
import { changeDisplay } from "@generated/catalog";
import { changeKindLabel } from "@app/maintenance";
import SourceLinks from "../../components/SourceLinks.vue";

const props = defineProps<{ change: MaintenanceChange; unread?: boolean }>();
const display = computed(() => changeDisplay(props.change));
</script>

<template>
  <li class="change-card">
    <div><strong>{{ change.vendor }} · {{ change.name }}</strong><span v-if="unread" class="change-unread">未读</span></div>
    <p class="maintenance-meta">确认于 {{ change.checkedAt }} · {{ display.addition ? "新收录" : "" }}{{ changeKindLabel(change.kind) }}</p>
    <ul class="change-fields">
      <li v-for="field in display.fields" :key="field.label"><strong>{{ field.label }}</strong>：<template v-if="!display.addition">{{ field.before }} → </template>{{ field.after }}</li>
      <li v-if="!display.fields.length">继承关系调整，价格与权益文字不变</li>
    </ul>
    <p><SourceLinks :urls="change.sourceUrls" /></p>
  </li>
</template>
