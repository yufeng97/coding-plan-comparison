import { createPickerRules } from '../domain/picker/rules';
import { pickerState } from './app';

/** 把依赖选购条件的推荐规则绑定到共享的「帮我选」条件；不依赖条件的套餐画像与付款口径直接从 domain/picker 导入。 */
export const {
    pickerPaymentQuote, pickerMonthlyCNY, pickerFirstPaymentText, matchesPickerPurchase, pickerMetricInput, pickerToolRelationship, priceLine, windowStats, betterWindow, withinBudget, eligibleProfiles, representatives, betterDailyTier, pickerPriority, cheaperThen, hardMainOrder, hardRepresentatives, chooseHardMain, priceDecidedMain, dailyRepresentatives, dailyOrder, dailyMainOrder, chooseDailyMain, chooseMain, rankedCandidates, candidateRole, abilityText, quotaEvidenceText, pickerSummaryText, cheaperTiers, peerNote, upgradeBudgetCeiling, nextTier, unlockText, dailyEntries, pickSupplement, benchmarkRankingNote, ownVendorPlan, pickerEmptyReason, pickerChoiceReason, alternativeProfiles,
} = createPickerRules(pickerState);
