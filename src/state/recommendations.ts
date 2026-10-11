import { createPickerRules } from '../domain/recommendations';
import { pickerState } from './app';
export type { PlanProfile, PaymentQuote, RoleMetric } from '../domain/recommendations';

/** Bind pure selectors to Vue's shared purchase conditions. */
export const {
    BUDGET_EPS, PICKER_BILLING_LABELS, renewsAtListPrice, pickerPaymentQuote, PICKER_UNKNOWN_PRICE,
    pickerMonthlyCNY, pickerFirstPaymentText, pickerAnnualExact, pickerAnnualNative, matchesPickerPurchase,
    pickerPlanForMetric, pickerMetricInput, TOOL_OWN_VENDOR, pickerToolRelationship, metricMatchesPlan,
    hasCodingSurface, recommendablePlan, matchesTool, priceLine, bandRank,
    catRank, multiplier, modelTextForRoles, modelRoleAccess, quotaWindowPeriod,
    quotaSharing, oneSharedWindow, roleUseText, roleDisplayName, quotaLabel,
    metricForRole, tokenEvidence, knownTokens, tokenEvidenceText, planProfile,
    windowStats, betterWindow, tokSpan, fullUseCostRange, fullUseCostRangeText,
    windowSentence, withinBudget, eligibleProfiles, representatives, betterDailyTier,
    PICKER_PRIORITY_LABELS, pickerPriority, pickerAbilityCache, abilityHit, abilityValue,
    cheaperThen, hardMainOrder, hardRepresentatives, chooseHardMain, priceDecidedMain,
    dailyRepresentatives, dailyOrder, dailyMainOrder, chooseDailyMain, chooseMain,
    rankedCandidates, candidateRole, abilityText, quotaEvidenceText, pickerSummaryText,
    cheaperTiers, peerNote, upgradeBudgetCeiling, nextTier, unlockText,
    dailyEntries, dailyRoleBit, dailyQuotaSignal, hasSeparateDaily, pickSupplement,
    sameWindowText, meteredText, pickerMoney, annualPaymentText, benchmarkRankingNote,
    ownVendorPlan, windowNoteShort, pickerEmptyReason, pickerChoiceReason, alternativeProfiles,
} = createPickerRules(pickerState);
