<script setup lang="ts">
import { computed } from "vue";
import * as L from "@app/runtime";
import WatchButton from "../../components/WatchButton.vue";
import CompareButton from "../../components/CompareButton.vue";
import { paymentSummary, tierRows, usageLines, type PickerCardModel } from "./picker-view";

const props = defineProps<{ model: PickerCardModel }>();
const plan = computed(() => props.model.plan);
const quote = computed(() => L.pickerPaymentQuote(plan.value));
const check = computed(() => L.priceCheckOf(plan.value));
const sources = computed(() => check.value?.sourceIds.map((id) => L.PRICE_CHECKS.sources[id as keyof typeof L.PRICE_CHECKS.sources]).filter(Boolean) ?? []);
const verified = computed(() => check.value ? `${check.value.checkedAt} · ${L.priceCheckLabel(plan.value)}${check.value.reason ? "。" + L.displayPriceReason(check.value.reason) : ""}` : "暂无逐条核查记录，请在官网核对价格与权益。");
const hits = computed(() => {
  void L.dataRevision.benchmark;
  return props.model.role ? L.planCodingBenchmarks(plan.value, props.model.role).filter((hit): hit is NonNullable<typeof hit> => hit !== null) : [];
});
const tiers = computed(() => tierRows(props.model));
const tierRole = computed(() => props.model.role || (L.pickerState.task === "daily" ? props.model.tiers?.loose[0] || props.model.tiers?.headline : props.model.tiers?.headline || props.model.tiers?.loose[0]));
const hasExtra = computed(() => hits.value.length > 0 || tiers.value.length > 0);
const badges = computed(() => L.planBadges(plan.value));
const compactPayment = computed(() => paymentSummary(plan.value, true));
const fullPayment = computed(() => paymentSummary(plan.value));
const usage = computed(() => usageLines(plan.value));
const showNote = computed(() => /首购|新购|活动|优惠|续费|连续包|试用|折|限时|原价/.test(plan.value.note || ""));
function showDetails(event: MouseEvent) {
  L.showPlanDetails(plan.value.id, event.currentTarget as HTMLElement);
}
</script>

<template>
  <div class="quick-card" :style="{ '--qc-accent': model.accent }">
    <div class="qc-title"><span class="qc-title-label">{{ model.title }}</span><WatchButton :plan="plan" class="qc-watch" /></div>
    <b class="qc-plan">{{ L.planTitle(plan) }}</b>
    <div class="qc-value">
      <em v-if="plan.priceM === 0">免费</em>
      <em v-else-if="!quote.available">未列公开{{ quote.label }}价</em>
      <template v-else><em>{{ L.pickerMoney(quote.monthlyNative, plan.cur) }}</em>/月<template v-if="quote.mode === 'Y'">（年付折月）</template><small v-if="plan.cur !== 'CNY'" class="qc-converted">约 {{ L.fmtCNY(quote.monthlyCNY) }}/月</small></template>
    </div>
    <p v-if="compactPayment.length" class="qc-payment-summary">{{ compactPayment[0] }}</p>
    <ul class="qc-reasons"><li v-for="reason in model.reasons.slice(0, 3)" :key="reason">{{ reason }}</li></ul>
    <div class="qc-actions"><CompareButton :plan="plan" scope="quickGrid" class="qc-action" /><button type="button" class="qc-action" :data-view-plan="plan.id" :aria-label="`查看 ${L.planTitle(plan)} 完整权益`" @click.stop="showDetails">完整权益</button></div>
    <a v-if="L.safeLink(plan.url)" class="qc-action qc-primary" :href="L.safeLink(plan.url)" target="_blank" rel="noopener">去官网 <span class="qc-action-icon" aria-hidden="true">↗</span></a>
    <details class="qc-details">
      <summary>价格、额度{{ hasExtra ? '、评测' : '' }}与核查详情</summary>
      <div class="qc-sub">
        <div v-for="(item, index) in model.lines" :key="index" class="qc-line"><span class="k">{{ item.label }}</span>{{ item.text }}</div>
        <div v-for="(notice, index) in model.notices" :key="index" :class="`qc-${notice.kind}`">{{ notice.text }}<button v-if="notice.action" type="button" class="linkish" :data-set-picker="`${notice.action.key}=${notice.action.value}`" @click.stop="L.setPicker(notice.action.key, notice.action.value)">{{ notice.action.text }}</button></div>
        <div class="qc-line"><span class="k">本档核查</span>{{ verified }}</div>
        <details v-if="sources.length" class="qc-verification"><summary>查看核查依据（{{ sources.length }} 项）</summary><ul><li v-for="(source, index) in sources" :key="index">{{ L.displayPriceReason(source!.evidence) || '来源页面记录' }} <a v-if="L.safeLink(source!.url)" :href="L.safeLink(source!.url)" target="_blank" rel="noopener">核查来源 ↗</a></li></ul></details>
        <details class="qc-usage-guide"><summary>模型、工具与额度用完后的做法</summary><div v-for="item in usage" :key="item.label" class="qc-line"><span class="k">{{ item.label }}</span>{{ item.text }}</div></details>
        <div v-if="hits.length" class="qc-bench">
          <p class="qc-bench-title">公开编程评测<span>本档当前任务系列内的已测型号的最佳名次，{{ L.benchmarkRankingNote() }}</span></p>
          <ul><li v-for="hit in hits" :key="hit.protocol.id"><b>{{ hit.protocol.name }}</b> 第 {{ hit.row.rank }}/{{ hit.protocol.total }} 名 · {{ L.publicModelDisplayName(hit.row.model) }} {{ L.publicScoreText(hit.row.score, hit.protocol.unit) }}</li></ul>
          <p class="qc-bench-note">只对应成绩行标明的具体型号、推理与 Agent 配置，不套用于同系列其他版本；套餐内未必能用同样配置。<a href="#benchmarks">查看评测</a></p>
        </div>
        <table v-if="tiers.length" class="qc-tiers">
          <caption>{{ L.shortVendor(plan.vendor) }} 各档（{{ L.roleDisplayName(plan, tierRole) }} 所在系列）</caption>
          <thead><tr><th scope="col">档位</th><th scope="col">月费</th><th scope="col">额度依据</th><th scope="col">条件</th></tr></thead>
          <tbody><tr v-for="tier in tiers" :key="tier.plan.id" :class="{ 'is-current': tier.current }"><th scope="row">{{ tier.plan.plan }}</th><td class="qc-tier-price" :data-cny="tier.price.toFixed(2)">{{ L.priceLine(tier.plan) }}</td><td>{{ tier.quota }}</td><td>{{ tier.status }}</td></tr></tbody>
        </table>
        <p v-if="fullPayment.length" class="qc-payment-summary"><template v-for="(part, index) in fullPayment" :key="index"><br v-if="index">{{ part }}</template></p>
        <div class="badge-row"><span v-for="badge in badges" :key="badge.k" class="badge" :class="`badge-${badge.k}`">{{ badge.t }}</span></div>
        <template v-if="plan.priceM != null && plan.priceM > 0">
          <div class="qc-line"><span class="k">月付原价</span>{{ L.priceText(plan, 'priceM') }}/月{{ plan.seat ? '，每席位' : '' }}；按原币支付。</div>
          <div v-if="plan.priceY && plan.priceY > 0" class="qc-line"><span class="k">年付全年</span>{{ L.annualPaymentText(plan) }}</div>
          <details v-if="showNote" class="qc-payment-note"><summary>优惠与续费原文</summary><p>{{ plan.note }}</p></details>
        </template>
      </div>
    </details>
  </div>
</template>
