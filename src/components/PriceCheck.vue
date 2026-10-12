<script setup lang="ts">
import { computed } from "vue";
import { API_PRICES, displayPriceReason, PAYG_REFERENCES, priceCheckOf } from "@generated/catalog";
import { type PriceCheckKind, priceCheckLabel, priceCheckSources, safeLink } from "@domain/core";
import { checkAgeText, checkIsStale } from "@domain/table-format";
type PriceItem = Plan | (typeof API_PRICES)[number] | (typeof PAYG_REFERENCES)[number];
const props = withDefaults(defineProps<{ plan: PriceItem; kind?: PriceCheckKind }>(), { kind: "plan" });
const check = computed(() => priceCheckOf(props.plan, props.kind));
const urls = computed(() => priceCheckSources(props.plan, props.kind));
</script>

<template>
  <template v-if="urls.length">
    <template v-for="(url, index) in urls" :key="url">
      <template v-if="index"> · </template>
      <a :href="safeLink(url)" target="_blank" rel="noopener">核价来源{{ urls.length > 1 ? index + 1 : "" }}</a>
    </template>
  </template>
  <template v-else>—</template>
  <span class="sub" :class="{ 'check-stale': check && checkIsStale(check.checkedAt) }">{{ priceCheckLabel(plan, kind) }}{{ check ? ` · ${check.checkedAt}${checkAgeText(check.checkedAt)}` : "" }}</span>
  <details v-if="check?.status === 'unverified'" class="price-check-details">
    <summary>核查说明</summary><p>{{ displayPriceReason(check.reason) }}</p>
  </details>
</template>
