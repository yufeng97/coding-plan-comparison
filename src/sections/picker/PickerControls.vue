<script setup lang="ts">
import { computed } from "vue";
import { PICKER_BILLING_LABELS } from "@domain/picker/payment";
import { pickerState } from "@state/app";
import { setPicker } from "@app/picker";
import ChipRadioGroup from "../../components/ChipRadioGroup.vue";

type PickerKey = keyof typeof pickerState;
type Row = { key: PickerKey; label: string; aria?: string; options: readonly (readonly [string, string])[] };
const basic: Row[] = [
  { key: "budget", label: "预算", options: [["0", "免费"], ["100", "≤ ¥100"], ["200", "≤ ¥200"], ["500", "≤ ¥500"], ["any", "不限"]] },
  { key: "region", label: "地区", options: [["cn", "国内"], ["intl", "国际"], ["all", "不限"]] },
];
const advanced: Row[] = [
  { key: "tool", label: "工具", options: [["any", "不限"], ["claude", "Claude Code"], ["codex", "Codex"], ["cursor", "Cursor"], ["own", "自家工具"]] },
  { key: "task", label: "任务", options: [["hard", "复杂为主"], ["both", "复杂和日常"], ["daily", "日常为主"]] },
  { key: "priority", label: "优先", aria: "推荐优先", options: [["quota", "额度"], ["ability", "模型能力"], ["price", "价格"]] },
];
const billing = [["M", "月付标价"], ["A", "自动续费"], ["Y", "年付"]] as const;
const state = pickerState;
const paymentInitiallyOpen = state.billing !== "M";
const paymentLabel = computed(() => "付款：" + PICKER_BILLING_LABELS[state.billing as keyof typeof PICKER_BILLING_LABELS] + (state.billing === "Y" ? "（按折月预算）" : ""));
const billingNote = computed(() => state.billing === "Y" ? "预算按年付月均比较；首次一次支付全年，金额见卡片。" : state.billing === "A" ? "有单列连续包月价时按该价比较；未单列的普通月订阅按标价计作为上限。购买资格与续费规则见卡片。" : "按公开月价比较；部分月价附有连续包月或优惠条件，购买前请核对。");
</script>

<template>
  <div id="picker" class="picker">
    <div v-for="row in basic" :key="row.key" class="picker-row" :data-pick="row.key">
      <span :id="`pickerLabel-${row.key}`" class="picker-label">{{ row.label }}</span>
      <ChipRadioGroup class="picker-options" :labelledby="`pickerLabel-${row.key}`" :options="row.options" :model-value="state[row.key]" @select="setPicker(row.key, $event)" />
    </div>
    <div class="picker-task-controls picker-advanced-grid">
      <div v-for="row in advanced" :key="row.key" class="picker-row" :data-pick="row.key">
        <span :id="`pickerLabel-${row.key}`" class="picker-label" :aria-hidden="row.aria ? 'true' : undefined">{{ row.label }}</span>
        <ChipRadioGroup class="picker-options" :label="row.aria" :labelledby="row.aria ? undefined : `pickerLabel-${row.key}`" :options="row.options" :model-value="state[row.key]" @select="setPicker(row.key, $event)" />
      </div>
      <p class="picker-hint">Claude Code / Codex 包含第三方兼容接入。「模型能力」按 DeepSWE v1.1 已公布成绩排序。</p>
    </div>
    <details id="pickerPayment" class="picker-payment" :open="paymentInitiallyOpen">
      <summary id="pickerPaymentSummary">{{ paymentLabel }}</summary>
      <div class="picker-row" data-pick="billing">
        <span id="pickerLabel-billing" class="picker-label">支付方式</span>
        <ChipRadioGroup class="picker-options" labelledby="pickerLabel-billing" :options="billing" :model-value="state.billing" @select="setPicker('billing', $event)" />
      </div>
      <p id="pickerBillingNote" class="maintenance-meta">{{ billingNote }}</p>
    </details>
  </div>
</template>
