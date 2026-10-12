<script setup lang="ts">
import { isOneTimePlan } from "@generated/catalog";
import { cnyOf, fmtCNY, planPriceLabel, priceText, priceUnit } from "@domain/core";
import { annualPaymentText } from "@domain/picker/payment";
import { pickerFirstPaymentText, priceLine } from "@state/picker";
withDefaults(defineProps<{ plan: Plan; annual?: boolean; selected?: boolean; compare?: boolean }>(), { annual: false, selected: false, compare: false });
</script>

<template>
  <template v-if="annual">
    <template v-if="plan.priceY == null"><template v-if="isOneTimePlan(plan)">—</template><span v-else class="sub">未列年付价</span></template>
    <template v-else>
      {{ planPriceLabel(plan, 'Y') }}<br>
      <span class="sub">≈{{ fmtCNY(cnyOf(plan, 'Y') ?? 0) }}/{{ plan.seat ? "席位/月" : "月" }}</span><br>
      <span class="sub">{{ annualPaymentText(plan) }}</span>
    </template>
  </template>
  <template v-else>
    {{ planPriceLabel(plan) }}
    <template v-if="plan.priceM != null && plan.priceM > 0"><br><span class="sub">≈{{ fmtCNY(cnyOf(plan, 'M') ?? 0) }}/{{ priceUnit(plan) }}</span></template>
    <template v-if="compare && plan.priceY != null"><span class="sub"> · {{ planPriceLabel(plan, 'Y') }}</span></template>
    <template v-if="!compare && plan.singleMonthPrice != null && plan.singleMonthPrice > 0"><br><span class="sub">连续包月价；单月一次购买 {{ priceText({ ...plan, priceM: plan.singleMonthPrice }, 'priceM') }}</span></template>
    <template v-if="selected"><br><span class="sub">选购口径：{{ priceLine(plan) }}；首次 {{ pickerFirstPaymentText(plan) }}</span></template>
  </template>
</template>
