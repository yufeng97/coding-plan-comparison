import { nextTick } from 'vue';
import { calcState, cmpState, metricsState, personalState, pickerState, rankState, tableState } from '../state/app';
import { byId, evtTarget, qsa } from '../browser/dom';
import { cancelPersonalSearch } from '../browser/charts/personal';
import { focusTableControl, isCmpModalOpen } from '../browser/interaction';
import { applyUrlState, setUrlRestoring } from '../browser/url-state';
import { boot } from './boot';
import { renderCostCalculator, syncControlsFromState } from './calculator';
import { rerenderCharts } from './chart-lifecycle';
import { renderPicker } from './picker';
import { activatePageForTarget, cancelPendingSectionNavigation, navigateToSection } from './section-navigation';
import { cancelTableSearch, closeCmpModal, hasPendingSearch, populateModelFilter, renderCmpBar, renderMetricsTable, renderTable, revealTablePlan } from './tables';

/* ============ 前进 / 后退：恢复整份可分享状态并找回方案按钮的焦点 ============ */

/* Firefox 可能在 popstate 前清掉 fragment 内的焦点；保留最近的方案按钮身份。 */
let historicalPlanFocus: { element: HTMLElement; url: string } | null = null;

function isPlanButton(el: Element | null): el is HTMLElement {
    return el instanceof HTMLElement && (el.classList.contains("cmp-add") || el.classList.contains("cmp-remove"));
}

function isCurrentFragmentTarget(target: Element | null) {
    try {
        return !!location.hash && target === byId(decodeURIComponent(location.hash.slice(1)));
    }
    catch (err) {
        return false;
    }
}

export function rememberPlanFocus(e: FocusEvent) {
    const target = evtTarget(e);
    /* WebKit 历史 fragment 会在 popstate 前聚焦章节；显式点击已由 pointerdown 清除缓存。 */
    if (historicalPlanFocus && historicalPlanFocus.url !== location.href && isCurrentFragmentTarget(target))
        return;
    historicalPlanFocus = isPlanButton(target) ? { element: target, url: location.href } : null;
}

export function forgetPlanFocus(e: PointerEvent) {
    const target = evtTarget(e);
    if (!target || !target.closest(".cmp-add,.cmp-remove"))
        historicalPlanFocus = null;
}

/* Back/Forward 恢复整份状态。恢复期间视图不允许写回 URL。 */
let historyRestoreVersion = 0;
/* popstate 恢复已处理过的锚点；紧随其后的 hashchange（hash 前进/后退会先 popstate 再 hashchange）不再二次滚动/抢焦点 */
let restoredAnchorHash: string | null = null;

/* 六块可分享状态 + 对比选择的快照：纯锚点前进/后退时 URL 查询串不变，跳过全量重渲染 */
function shareableStateSignature() {
    return JSON.stringify([personalState, rankState, pickerState, tableState, metricsState, calcState, cmpState.items.map((p) => p.id)]);
}

export async function restoreHistoryState(search: string | Event, restoreAnchor: boolean = true) {
    if (!restoreAnchor)
        cancelPendingSectionNavigation();
    const restoreVersion = ++historyRestoreVersion;
    const activeElement = document.activeElement as HTMLElement | null;
    const remembered = historicalPlanFocus;
    /* 原生 fragment 导航已把焦点移到页面或章节时，改用最近记下的方案按钮。 */
    const focused = remembered && remembered.url !== location.href && (activeElement === document.body || isCurrentFragmentTarget(activeElement))
        ? remembered.element : activeElement;
    const focusedClass = focused && (focused.classList.contains("cmp-remove") ? "cmp-remove" : focused.classList.contains("cmp-add") ? "cmp-add" : "");
    const focusedPlanId = focused && focusedClass ? focused.dataset.planId : "";
    const focusedScope = focused && focusedClass ? focused.dataset.cmpScope : "";
    /* 状态已经写进 URL，但防抖视图可能还没有更新；不能把相同状态当作相同视图。 */
    const pendingSearch = hasPendingSearch();
    cancelPersonalSearch();
    cancelTableSearch();
    setUrlRestoring(true);
    try {
        const before = shareableStateSignature();
        applyUrlState(typeof search === "string" ? search : location.search);
        if (pendingSearch || shareableStateSignature() !== before) {
            /* 状态真的变了才重绘；每步独立容错，一步失败不拖垮其余恢复 */
            boot("restoreModelFilter", populateModelFilter);
            boot("restoreControls", syncControlsFromState);
            boot("restorePicker", renderPicker);
            boot("restoreTable", renderTable);
            boot("restoreMetrics", renderMetricsTable);
            boot("restoreCmpBar", renderCmpBar);
            boot("restoreCharts", rerenderCharts);
            boot("restoreCalculator", renderCostCalculator);
        }
        if (isCmpModalOpen()) {
            if (cmpState.items.length < 2)
                closeCmpModal();
            else
                boot("restoreCmpModal", renderCmpBar);
        }
        if (restoreAnchor && location.hash) {
            navigateToSection(location.hash, false, false);
            restoredAnchorHash = location.hash;
        }
        else if (restoreAnchor)
            activatePageForTarget(byId("quick"));
        /* 关闭窗口已找回可用入口时保留；仅修复被重绘或隐藏后丢失的方案按钮焦点。 */
        await nextTick();
        if (restoreVersion !== historyRestoreVersion)
            return;
        const currentFocus = document.activeElement;
        const modalClosed = focusedClass === "cmp-remove" && !isCmpModalOpen();
        const focusLostToPage = !currentFocus || currentFocus === document.body || currentFocus.isConnected === false || isCurrentFragmentTarget(currentFocus);
        /* 只修复落到页面或失效窗口的焦点；等待 Vue 更新时用户可能已转到其他控件。 */
        const focusLost = focusLostToPage || modalClosed && currentFocus === focused;
        if (focusedClass && focusLost) {
            const selector = focusedClass === "cmp-add" ? ".cmp-add" : isCmpModalOpen() ? "#cmpTable .cmp-remove" : "";
            if (focusedClass === "cmp-add" && focusedPlanId && focusedScope === "tableBody") {
                revealTablePlan(focusedPlanId);
                await nextTick();
                if (restoreVersion !== historyRestoreVersion)
                    return;
                const afterReveal = document.activeElement;
                if (afterReveal && afterReveal !== focused && afterReveal !== document.body && afterReveal.isConnected !== false && !isCurrentFragmentTarget(afterReveal))
                    return;
            }
            const replacement = selector && focusedPlanId ? [...qsa(selector)].find((btn) => btn.dataset.planId === focusedPlanId && (!focusedScope || btn.dataset.cmpScope === focusedScope)) : null;
            if (!focusTableControl(replacement))
                focusTableControl(byId(isCmpModalOpen() ? "cmpCloseBtn" : "searchInput"));
        }
        /* 原生历史锚点处理可能在 popstate 返回后再次清空焦点；只补回这一轮已恢复的位置。 */
        const restoredFocus = document.activeElement as HTMLElement | null;
        /* keyed 节点保留焦点时不会再次触发 focusin，缓存仍须跟随当前历史位置。 */
        if (isPlanButton(restoredFocus))
            historicalPlanFocus = { element: restoredFocus, url: location.href };
        if (focusedClass && restoredFocus && restoredFocus !== document.body && typeof requestAnimationFrame === "function") {
            const restoredUrl = location.href;
            requestAnimationFrame(() => {
                const active = document.activeElement;
                if (restoreVersion !== historyRestoreVersion || location.href !== restoredUrl || (active && active !== document.body && active.isConnected !== false && !isCurrentFragmentTarget(active)))
                    return;
                if (!focusTableControl(restoredFocus))
                    focusTableControl(byId(isCmpModalOpen() ? "cmpCloseBtn" : "searchInput"));
            });
        }
    }
    finally {
        setUrlRestoring(false);
    }
}

export function onHashChange() {
    /* hash 前进/后退会先 popstate（已做过完整恢复）再 hashchange；只处理用户手改地址栏的情况 */
    if (restoredAnchorHash !== null) {
        const same = location.hash === restoredAnchorHash;
        restoredAnchorHash = null;
        if (same)
            return;
    }
    navigateToSection(location.hash, false, false);
}
