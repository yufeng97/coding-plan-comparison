import { PLANS } from '../generated/catalog';
import { personalState, tableState, metricsState, rankState, pickerState } from '../state/app';
import { renderPersonalChart } from '../browser/charts/personal';
import { renderRankChart } from '../browser/charts/rank';
import { renderTable, renderMetricsTable } from './tables';
import type { PickerState } from '../state/app';
import { updateAppState } from '../browser/url-state';

import { planProfile, TOOL_NAMES } from '../domain/picker/profile';
import { cheaperTiers } from '../state/picker';
import { renderCostCalculator } from './calculator';
import { fmtCNY, REGION_LABEL } from '../domain/core';

/* 选购条件的文字说明：价格图、额度表、数据表与排行应用条件时显示，费用计算器也沿用工具标签。 */
export const PICKER_TOOL_LABELS: Record<string, string> = { any: "不限工具", ...TOOL_NAMES, own: "自家客户端" };

const SCOPE_BILLING_LABELS: Record<string, string> = { M: "月付标价", A: "自动续费", Y: "年付折月" };

export function pickerScopeText() {
    const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "月均预算 ≤" + fmtCNY(Number(pickerState.budget));
    const billing = SCOPE_BILLING_LABELS[pickerState.billing] || "月付标价";
    return `${budget} · ${REGION_LABEL[pickerState.region as keyof typeof REGION_LABEL] || "不限地区"} · ${PICKER_TOOL_LABELS[pickerState.tool] || "不限工具"} · ${billing}`;
}

/** 在价格图、额度表、数据表与排行上应用或取消「帮我选」的付款与预算条件。 */
export function applyPickerScope(name: string) {
    const scopes: Record<string, { state: { fromPicker: boolean }; render: () => void }> = {
        personal: { state: personalState, render: renderPersonalChart },
        metrics: { state: metricsState, render: renderMetricsTable },
        table: { state: tableState, render: renderTable },
        rank: { state: rankState, render: renderRankChart },
    };
    const scope = scopes[name];
    if (!scope)
        return;
    updateAppState(() => {
        scope.state.fromPicker = !scope.state.fromPicker;
        if (name === "table") {
            tableState.sortKey = tableState.fromPicker ? "selectedMonthly" : "priceM";
            tableState.sortDir = 1;
        }
    }, scope.render);
}

export function refreshPickerScopes() {
    if (personalState.fromPicker)
        renderPersonalChart();
    if (tableState.fromPicker)
        renderTable();
    if (metricsState.fromPicker)
        renderMetricsTable();
    if (rankState.fromPicker)
        renderRankChart();
}

/* 供卡片里的按钮一键放宽筛选（data-set-picker="region=all"） */
export function setPicker(rowKey: keyof PickerState, value: string) {
    pickerState[rowKey] = value;
    updateAppState(() => {}, renderPicker);
}

export function renderPicker() {
    /* Vue derives recommendation cards from shared reactive state. Only notify applied scopes. */
    renderCostCalculator();
    refreshPickerScopes();
}

export function auditProfiles() {
    /* 断言隐含「国内 + 不限预算 + 不限工具」的筛选前提（如智谱省钱档），先锁定状态，
       结束后还原，避免 ?debug=1 时污染页面正在展示的推荐。 */
    const saved = { ...pickerState };
    Object.assign(pickerState, { budget: "any", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
    try {
        /* 按永久 ID 查找：档位改名（如加注「老用户续费」）不影响断言。 */
        const by = (id: string) => PLANS.find((p) => p.id === id);
        const idOf = (p: Plan | undefined) => { const h = p ? planProfile(p).headline : null; return h ? h.id : ""; };
        const expect = (planId: string, id: string) => {
            const plan = by(planId);
            const got = idOf(plan);
            if (got !== id)
                console.error("[picker]", plan ? plan.vendor + " " + plan.plan : planId, "headline", got || "(none)", "expected", id || "(none)");
        };
        expect("plan-0002", "claude-opus"); // Claude Pro
        expect("plan-0001", ""); // Claude Free
        expect("plan-0003", "claude-opus"); // Claude Max 5x
        expect("plan-0098", ""); // Cursor Pro（老用户续费）
        expect("plan-0215", ""); // X Subscription Premium：附赠 Grok / Composer，第三方旗舰按量
        expect("plan-0010", "gpt-sol"); // ChatGPT Plus
        expect("plan-0157", "glm-5"); // GLM Coding V3 Lite
        expect("plan-0158", "glm-5"); // GLM Coding V3 Pro
        expect("plan-0159", "glm-5"); // GLM Coding V3 Max
        /* 不限预算时主计划会跳过中档，「省钱档」行必须能把 GLM V3 Pro 补回来 */
        const max = by("plan-0159");
        if (!max || !cheaperTiers(planProfile(max)).some((x) => x.p.id === "plan-0158")) {
            console.error("[picker] GLM V3 Max 的省钱档应列出 GLM Coding V3 Pro");
        }
        const cursorPlan = by("plan-0098");
        const cursor = cursorPlan ? planProfile(cursorPlan) : null;
        if (!cursor || !cursor.internalDaily.some((r) => r.id === "grok"))
            console.error("[picker] Cursor Pro 应把 Grok 当成分开的日常额度");
        if (!cursor || cursor.metered.every((r) => r.id !== "claude-opus"))
            console.error("[picker] Cursor Pro 的 Opus 应在按量池");
        const xPremium = by("plan-0215");
        if (!xPremium || planProfile(xPremium).metered.every((r) => r.id !== "claude-opus"))
            console.error("[picker] X Subscription Premium 的 Claude Opus 应在按量部分");
    }
    finally {
        Object.assign(pickerState, saved);
    }
}
