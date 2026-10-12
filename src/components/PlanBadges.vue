<script setup lang="ts">
import { planBadges } from "@domain/core";
defineProps<{ plan: Plan }>();
</script>

<template>
  <span v-for="badge in planBadges(plan)" :key="badge.k + badge.t" class="badge" :class="`badge-${badge.k}`">{{ badge.t }}</span>
</template>
