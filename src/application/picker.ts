import { PLANS } from '../generated/catalog';
import { personalState, tableState, metricsState, rankState, pickerState } from '../state/app';
import { renderPersonalChart, renderRankChart } from '../browser/charts';
import { renderTable, renderMetricsTable } from './tables';
import type { PickerState } from '../domain/view-types';
import { updateAppState } from '../browser/url-state';

import { pickerAbilityCache, planProfile, cheaperTiers } from '../state/recommendations';
import { renderCostCalculator } from './service';

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
    pickerAbilityCache.clear();
    renderCostCalculator();
    refreshPickerScopes();
}

export function auditProfiles() {
    /* 断言隐含「国内 + 不限预算 + 不限工具」的筛选前提（如智谱省钱档），先锁定状态，
       结束后还原，避免 ?debug=1 时污染页面正在展示的推荐。 */
    const saved = { ...pickerState };
    Object.assign(pickerState, { budget: "any", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });
    try {
        const by = (vendor: string, plan: string) => PLANS.find((p) => p.vendor === vendor && p.plan === plan);
        const idOf = (p: Plan | undefined) => { const h = p ? planProfile(p).headline : null; return h ? h.id : ""; };
        const expect = (vendor: string, plan: string, id: string) => {
            const got = idOf(by(vendor, plan));
            if (got !== id)
                console.error("[picker]", vendor, plan, "headline", got || "(none)", "expected", id || "(none)");
        };
        expect("Anthropic", "Claude Pro", "claude-opus");
        expect("Anthropic", "Claude Free", "");
        expect("Anthropic", "Claude Max 5x", "claude-opus");
        expect("Cursor", "Pro", "");
        expect("OpenAI", "ChatGPT Plus", "gpt-sol");
        expect("智谱 BigModel", "GLM Coding V3 Lite", "glm-5");
        expect("智谱 BigModel", "GLM Coding V3 Pro", "glm-5");
        expect("智谱 BigModel", "GLM Coding V3 Max", "glm-5");
        /* 不限预算时主计划会跳过中档，「省钱档」行必须能把 GLM V3 Pro 补回来 */
        const max = by("智谱 BigModel", "GLM Coding V3 Max");
        if (!max || !cheaperTiers(planProfile(max)).some((x) => x.p.plan === "GLM Coding V3 Pro")) {
            console.error("[picker] GLM V3 Max 的省钱档应列出 GLM Coding V3 Pro");
        }
        const cursorPlan = by("Cursor", "Pro");
        const cursor = cursorPlan ? planProfile(cursorPlan) : null;
        if (!cursor || !cursor.internalDaily.some((r) => r.id === "grok"))
            console.error("[picker] Cursor Pro 应把 Grok 当成分开的日常额度");
        if (!cursor || cursor.metered.every((r) => r.id !== "claude-opus"))
            console.error("[picker] Cursor Pro 的 Opus 应在按量池");
    }
    finally {
        Object.assign(pickerState, saved);
    }
}
