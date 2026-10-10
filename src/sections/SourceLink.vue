<script setup>
/* 评测来源链接：只认 https，其他协议（含 javascript:）按「来源未公布」显示。 */
import { computed } from "vue";
import * as legacy from "virtual:legacy-lib";

const props = defineProps({ url: { type: String, default: "" }, label: { type: String, required: true } });
const href = computed(() => legacy.publicBenchmarkSourceUrl(props.url));
</script>

<template>
  <a v-if="href" :href="href" target="_blank" rel="noopener" tabindex="0">{{ label }} ↗</a>
  <template v-else>来源未公布</template>
</template>
