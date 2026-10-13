import { computed, watch } from 'vue';
import { pickerAbilityCache } from '../domain/picker/ability';
import { createPickerRules } from '../domain/picker/rules';
import { pickerState } from './app';
import { dataRevision } from './maintenance';

/* 「模型能力优先」按套餐缓存首屏评测摘要里的成绩；摘要更新（dataRevision.benchmark 递增）时同步作废，
   推荐计算本身不再负责清缓存。 */
watch(() => dataRevision.benchmark, () => pickerAbilityCache.clear(), { flush: "sync" });

/** 把依赖选购条件的推荐规则绑定到共享的「帮我选」条件；不依赖条件的套餐画像与付款口径直接从 domain/picker 导入。 */
export const {
    pickerPaymentQuote, pickerMonthlyCNY, pickerFirstPaymentText, matchesPickerPurchase, pickerMetricInput, pickerToolRelationship, priceLine, windowStats, betterWindow, withinBudget, eligibleProfiles, representatives, betterDailyTier, pickerPriority, cheaperThen, hardMainOrder, hardRepresentatives, chooseHardMain, priceDecidedMain, dailyRepresentatives, dailyOrder, dailyMainOrder, chooseDailyMain, chooseMain, rankedCandidates, candidateRole, abilityText, quotaEvidenceText, pickerSummaryText, cheaperTiers, peerNote, upgradeBudgetCeiling, nextTier, unlockText, dailyEntries, pickSupplement, benchmarkRankingNote, ownVendorPlan, pickerEmptyReason, pickerChoiceReason, alternativeProfiles,
} = createPickerRules(pickerState);

/* 当前条件下的候选池与主计划只算一遍：推荐卡、费用计算的额度对照与「按我的用量核对」共用。
   评测数据到达会改变「模型能力优先」的排序，一并作为依赖（缓存已由上面的同步监听作废）。 */
const selection = computed(() => {
    void dataRevision.benchmark;
    const pool = eligibleProfiles();
    return { pool, main: chooseMain(pool) };
});

/** 当前选购条件下的候选池与主计划；候选池由多处共用，不要原地修改。 */
export function currentPickerSelection() {
    return selection.value;
}
