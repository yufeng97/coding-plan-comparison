/* 完整权益窗口由 PlanDetails.vue 实现；挂载时登记打开入口，供推荐卡、数据表、关注列表与评测套餐链接调用。 */
export const planDetailsView: { show?: (id: string, trigger?: HTMLElement | null) => void } = {};

export function showPlanDetails(id: string, trigger: HTMLElement | null = null) {
    planDetailsView.show?.(String(id), trigger);
}
