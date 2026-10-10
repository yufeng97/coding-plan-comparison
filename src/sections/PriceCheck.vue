<script setup lang="ts">
import { computed } from "vue";
import * as runtime from "@domain/runtime";
type PriceItem = Plan | (typeof runtime.API_PRICES)[number] | (typeof runtime.PAYG_REFERENCES)[number];
const props = withDefaults(defineProps<{ plan: PriceItem; kind?: string }>(), { kind: "plan" });
const check = computed(() => runtime.priceCheckOf(props.plan, props.kind));
const urls = computed(() => runtime.priceCheckSources(props.plan, props.kind));
</script>

<template>
  <template v-if="urls.length">
    <template v-for="(url, index) in urls" :key="url">
      <template v-if="index"> · </template>
      <a :href="runtime.safeLink(url)" target="_blank" rel="noopener">核价来源{{ urls.length > 1 ? index + 1 : "" }}</a>
    </template>
  </template>
  <template v-else>—</template>
  <span class="sub">{{ runtime.priceCheckLabel(plan, kind) }}{{ check ? ` · ${check.checkedAt}` : "" }}</span>
  <details v-if="check?.status === 'unverified'" class="price-check-details">
    <summary>核查说明</summary><p>{{ runtime.displayPriceReason(check.reason) }}</p>
  </details>
</template>
