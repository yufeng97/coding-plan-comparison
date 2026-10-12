import { planProtocolScore } from '../benchmarks';

/* 「模型能力优先」读首屏评测摘要中的单一协议成绩；同一轮渲染内按套餐与用途缓存。 */

/* 推荐偏好只改变同一候选池里的先后，不改变预算、地区、工具和任务等资格条件。
   额度优先是默认；模型能力只按 DeepSWE v1.1 已公布成绩比较，未上榜的排在后面，不跨评测合成分数；
   价格优先先比所选付款方式的月均价。 */
export const PICKER_PRIORITY_LABELS: Record<string, string> = { quota: "额度优先", ability: "模型能力优先", price: "价格优先" };

/* 同一轮渲染里反复比较同一档位，评测匹配要跑多个正则；按「套餐 + 角色」缓存，推荐区每次重算时清空。 */
export const pickerAbilityCache = new Map<string, ReturnType<typeof planProtocolScore>>();

export function abilityHit(p: Plan | null | undefined, role: ModelRole | null | undefined) {
    if (!p || !role)
        return null;
    const key = p.id + "|" + role.id;
    if (!pickerAbilityCache.has(key))
        pickerAbilityCache.set(key, planProtocolScore(p, role));
    return pickerAbilityCache.get(key) ?? null;
}

export function abilityValue(p: Plan, role: ModelRole | null | undefined) {
    const hit = abilityHit(p, role);
    return hit ? hit.row.score : -1;
}
