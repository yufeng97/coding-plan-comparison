<script setup lang="ts">
import * as runtime from "@app/runtime";
withDefaults(defineProps<{ plan: Plan; annual?: boolean; selected?: boolean; compare?: boolean }>(), { annual: false, selected: false, compare: false });
</script>

<template>
  <template v-if="annual">
    <template v-if="plan.priceY == null"><template v-if="runtime.isOneTimePlan(plan)">—</template><span v-else class="sub">未列年付价</span></template>
    <template v-else>
      {{ runtime.planPriceLabel(plan, 'Y') }}<br>
      <span class="sub">≈{{ runtime.fmtCNY(runtime.cnyOf(plan, 'Y') ?? 0) }}/{{ plan.seat ? "席位/月" : "月" }}</span><br>
      <span class="sub">{{ runtime.annualPaymentText(plan) }}</span>
    </template>
  </template>
  <template v-else>
    {{ runtime.planPriceLabel(plan) }}
    <template v-if="plan.priceM != null && plan.priceM > 0"><br><span class="sub">≈{{ runtime.fmtCNY(runtime.cnyOf(plan, 'M') ?? 0) }}/{{ runtime.priceUnit(plan) }}</span></template>
    <template v-if="compare && plan.priceY != null"><span class="sub"> · {{ runtime.planPriceLabel(plan, 'Y') }}</span></template>
    <template v-if="!compare && plan.singleMonthPrice != null && plan.singleMonthPrice > 0"><br><span class="sub">连续包月价；单月一次购买 {{ runtime.priceText({ ...plan, priceM: plan.singleMonthPrice }, 'priceM') }}</span></template>
    <template v-if="selected"><br><span class="sub">选购口径：{{ runtime.priceLine(plan) }}；首次 {{ runtime.pickerFirstPaymentText(plan) }}</span></template>
  </template>
</template>
