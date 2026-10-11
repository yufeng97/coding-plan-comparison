<script setup lang="ts">
import * as runtime from "@app/runtime";
defineProps<{ plan: Plan }>();
</script>

<template>
  <span v-for="badge in runtime.planBadges(plan)" :key="badge.k + badge.t" class="badge" :class="`badge-${badge.k}`">{{ badge.t }}</span>
</template>
