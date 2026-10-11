<script setup lang="ts">
import { computed } from "vue";
import type { OptionalDataKind } from "@domain/core";
import { optionalViewState } from "@state/maintenance";
import { loadViewData } from "@app/maintenance";

const props = defineProps<{ id: string; kind: OptionalDataKind; hidden?: boolean }>();
const status = computed(() => optionalViewState[props.kind]);
</script>

<template>
  <p :id="id" class="table-feedback optional-data-status" role="status" aria-live="polite" :hidden="hidden">{{ status.message }}<button v-if="status.failed" type="button" class="chip" :data-retry-data="kind" @click="loadViewData(kind)">重新加载数据</button></p>
</template>
