<script setup lang="ts">
/* 官方证据链接，只认 https。 */
import { computed } from "vue";
import * as legacy from "@domain/runtime";

const props = defineProps<{ urls?: unknown[] | null }>();
const links = computed(() => legacy.maintenanceSourceUrls(props.urls ?? []));
</script>

<template>
  <template v-for="(url, index) in links" :key="url">
    <template v-if="index"> · </template>
    <a :href="url" target="_blank" rel="noopener" tabindex="0">官方证据{{ index + 1 }} ↗</a>
  </template>
</template>
