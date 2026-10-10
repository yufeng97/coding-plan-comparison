<script setup>
/* 一条已确认变更：字段的前后值与官方证据。 */
import * as legacy from "virtual:legacy-lib";
import SourceLinks from "./SourceLinks.vue";

defineProps({ change: { type: Object, required: true }, unread: { type: Boolean, default: false } });
</script>

<template>
  <li class="change-card">
    <div><strong>{{ change.vendor }} · {{ change.name }}</strong><span v-if="unread" class="change-unread">未读</span></div>
    <p class="maintenance-meta">确认于 {{ change.checkedAt }} · {{ legacy.changeKindLabel(change.kind) }}</p>
    <ul class="change-fields">
      <li v-for="field in legacy.changeFields(change)" :key="field.label"><strong>{{ field.label }}</strong>：{{ field.before }} → {{ field.after }}</li>
    </ul>
    <p><SourceLinks :urls="change.sourceUrls" /></p>
  </li>
</template>
