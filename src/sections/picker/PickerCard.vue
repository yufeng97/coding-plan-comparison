<script setup lang="ts">
import { computed } from "vue";
import { displayPriceReason, PRICE_CHECKS, priceCheckOf } from "@generated/catalog";
import { planCodingBenchmarks, publicModelDisplayName, publicScoreText } from "@domain/benchmarks";
import { fmtCNY, planTitle, priceCheckLabel, priceText, safeLink, shortVendor } from "@domain/core";
import { annualPaymentText, pickerMoney } from "@domain/picker/payment";
import { roleDisplayName } from "@domain/picker/text";
import { checkAgeText } from "@domain/table-format";
import { dataRevision } from "@state/maintenance";
import { benchmarkRankingNote, pickerPaymentQuote, priceLine } from "@state/picker";
import { setPicker } from "@app/picker";
import { showPlanDetails } from "@app/plan-details";
import WatchButton from "../../components/WatchButton.vue";
import CompareButton from "../../components/CompareButton.vue";
import PlanBadges from "../../components/PlanBadges.vue";
import { paymentSummary, tierRole as cardTierRole, tierRows, usageLines, type PickerCardModel } from "./picker-view";

const props = defineProps<{ model: PickerCardModel }>();
const plan = computed(() => props.model.plan);
const quote = computed(() => pickerPaymentQuote(plan.value));
const check = computed(() => priceCheckOf(plan.value));
const sources = computed(() => check.value?.sourceIds.map((id) => PRICE_CHECKS.sources[id as keyof typeof PRICE_CHECKS.sources]).filter(Boolean) ?? []);
const verified = computed(() => check.value ? `${check.value.checkedAt}${checkAgeText(check.value.checkedAt)} · ${priceCheckLabel(plan.value)}${check.value.reason ? "。" + displayPriceReason(check.value.reason) : ""}` : "暂无逐条核查记录，请在官网核对价格与权益。");
/* 评测名次取自首屏评测摘要；摘要更新时 dataRevision.benchmark 递增，这里随之重算。 */
const hits = computed(() => {
  void dataRevision.benchmark;
  return props.model.role ? planCodingBenchmarks(plan.value, props.model.role).filter((hit): hit is NonNullable<typeof hit> => hit !== null) : [];
});
const tiers = computed(() => tierRows(props.model));
const tierRole = computed(() => cardTierRole(props.model));
const hasExtra = computed(() => hits.value.length > 0 || tiers.value.length > 0);
const compactPayment = computed(() => paymentSummary(plan.value, true));
const fullPayment = computed(() => paymentSummary(plan.value));
const usage = computed(() => usageLines(plan.value));
const showNote = computed(() => /首购|新购|活动|优惠|续费|连续包|试用|折|限时|原价/.test(plan.value.note || ""));
function showDetails(event: MouseEvent) {
  showPlanDetails(plan.value.id, event.currentTarget as HTMLElement);
}
</script>

<template>
  <div class="quick-card" :style="{ '--qc-accent': model.accent }">
    <div class="qc-title"><span class="qc-title-label">{{ model.title }}</span><WatchButton :plan="plan" class="qc-watch" /></div>
    <h3 class="qc-plan">{{ planTitle(plan) }}</h3>
    <div class="qc-value">
      <em v-if="plan.priceM === 0">免费</em>
      <em v-else-if="!quote.available">未列公开{{ quote.label }}价</em>
      <template v-else><em>{{ pickerMoney(quote.monthlyNative, plan.cur) }}</em>/月<template v-if="quote.mode === 'Y'">（年付折月）</template><small v-if="plan.cur !== 'CNY'" class="qc-converted">约 {{ fmtCNY(quote.monthlyCNY) }}/月</small></template>
    </div>
    <p v-if="compactPayment.length" class="qc-payment-summary">{{ compactPayment[0] }}</p>
    <ul class="qc-reasons"><li v-for="reason in model.reasons.slice(0, 3)" :key="reason">{{ reason }}</li></ul>
    <div class="qc-actions"><CompareButton :plan="plan" scope="quickGrid" class="qc-action" /><button type="button" class="qc-action" :data-view-plan="plan.id" :aria-label="`查看 ${planTitle(plan)} 完整权益`" @click.stop="showDetails">完整权益</button></div>
    <a v-if="safeLink(plan.url)" class="qc-action qc-primary" :href="safeLink(plan.url)" target="_blank" rel="noopener">去官网 <span class="qc-action-icon" aria-hidden="true">↗</span></a>
    <details class="qc-details">
      <summary>价格、额度{{ hasExtra ? '、评测' : '' }}与核查详情</summary>
      <div class="qc-sub">
        <div v-for="(item, index) in model.lines" :key="index" class="qc-line"><span class="k">{{ item.label }}</span>{{ item.text }}</div>
        <div v-for="(notice, index) in model.notices" :key="index" :class="`qc-${notice.kind}`">{{ notice.text }}<button v-if="notice.action" type="button" class="linkish" :data-set-picker="`${notice.action.key}=${notice.action.value}`" @click.stop="setPicker(notice.action.key, notice.action.value)">{{ notice.action.text }}</button></div>
        <div class="qc-line"><span class="k">本档核查</span>{{ verified }}</div>
        <details v-if="sources.length" class="qc-verification"><summary>查看核查依据（{{ sources.length }} 项）</summary><ul><li v-for="(source, index) in sources" :key="index">{{ displayPriceReason(source!.evidence) || '来源页面记录' }} <a v-if="safeLink(source!.url)" :href="safeLink(source!.url)" target="_blank" rel="noopener">核查来源 ↗</a></li></ul></details>
        <details class="qc-usage-guide"><summary>模型、工具与额度用完后的做法</summary><div v-for="item in usage" :key="item.label" class="qc-line"><span class="k">{{ item.label }}</span>{{ item.text }}</div></details>
        <div v-if="hits.length" class="qc-bench">
          <p class="qc-bench-title">公开编程评测<span>本档当前任务系列内的已测型号的最佳名次，{{ benchmarkRankingNote() }}</span></p>
          <ul><li v-for="hit in hits" :key="hit.protocol.id"><b>{{ hit.protocol.name }}</b> 第 {{ hit.row.rank }}/{{ hit.protocol.total }} 名 · {{ publicModelDisplayName(hit.row.model) }} {{ publicScoreText(hit.row.score, hit.protocol.unit) }}</li></ul>
          <p class="qc-bench-note">只对应成绩行标明的具体型号、推理与 Agent 配置，不套用于同系列其他版本；套餐内未必能用同样配置。<a href="#benchmarks">查看评测</a></p>
        </div>
        <table v-if="tiers.length" class="qc-tiers">
          <caption>{{ shortVendor(plan.vendor) }} 各档（{{ roleDisplayName(plan, tierRole) }} 所在系列）</caption>
          <thead><tr><th scope="col">档位</th><th scope="col">月费</th><th scope="col">额度依据</th><th scope="col">条件</th></tr></thead>
          <tbody><tr v-for="tier in tiers" :key="tier.plan.id" :class="{ 'is-current': tier.current }"><th scope="row">{{ tier.plan.plan }}</th><td class="qc-tier-price" :data-cny="tier.price.toFixed(2)">{{ priceLine(tier.plan) }}</td><td>{{ tier.quota }}</td><td>{{ tier.status }}</td></tr></tbody>
        </table>
        <p v-if="fullPayment.length" class="qc-payment-summary"><template v-for="(part, index) in fullPayment" :key="index"><br v-if="index">{{ part }}</template></p>
        <div class="badge-row"><PlanBadges :plan="plan" /></div>
        <template v-if="plan.priceM != null && plan.priceM > 0">
          <div class="qc-line"><span class="k">月付原价</span>{{ priceText(plan, 'priceM') }}/月{{ plan.seat ? '，每席位' : '' }}；按原币支付。</div>
          <div v-if="plan.priceY && plan.priceY > 0" class="qc-line"><span class="k">年付全年</span>{{ annualPaymentText(plan) }}</div>
          <details v-if="showNote" class="qc-payment-note"><summary>优惠与续费原文</summary><p>{{ plan.note }}</p></details>
        </template>
      </div>
    </details>
  </div>
</template>
