import { findPlanReference, isPriceConfirmed } from '../generated/catalog';


/** provenance 读取的额度行字段（额度行与按量参照行都满足）。 */
export interface ProvenanceInput {
    ref?: PlanRef; isEst?: boolean; method?: string; confidence?: string; referenceOnly?: boolean;
    creditCNY?: number; creditUSD?: number; apiIn?: number; note?: string; source?: string;
    reqPerWk?: number; reqPerMo?: number; reqPer5h?: number;
}

/* 数据来源标注：每行额度的出处与置信度 */
export function provenance(m: ProvenanceInput) {
    const plan = m.ref != null ? findPlanReference(m.ref) : null;
    if (plan && !isPriceConfirmed(plan))
        return { text: "历史价折算 · 价格待核", conf: "低" };
    if (m.referenceOnly)
        return { text: "模拟对照 · 非套餐额度", conf: "低" };
    if (m.isEst)
        return { text: m.method ?? "", conf: m.confidence ?? "" };
    if (m.creditCNY != null || m.creditUSD != null) {
        if (typeof m.apiIn === "number")
            return { text: "牌价折算", conf: "中" };
        return { text: "官方credits", conf: "高" };
    }
    if (m.note && m.note.includes("系数折算"))
        return { text: "官方系数", conf: "中" };
    if ((m.note && m.note.includes("第三方")) || (m.source && m.source.includes("第三方")))
        return { text: "第三方估算", conf: "低" };
    if (m.reqPerWk != null || m.reqPerMo != null || m.reqPer5h != null)
        return { text: "请求折算", conf: "低" };
    return { text: "官方估算", conf: "高" };
}
