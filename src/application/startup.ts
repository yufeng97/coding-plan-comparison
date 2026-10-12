import { cmpState } from '../state/app';
import { byId, qsa } from '../browser/dom';
import { focusTableControl, isCmpModalOpen } from '../browser/interaction';
import { applyUrlState, debugModeEnabled, syncUrl } from '../browser/url-state';
import { boot } from './boot';
import { renderCostCalculator, syncControlsFromState } from './calculator';
import { bindChartResize, initTheme } from './chart-lifecycle';
import { forgetPlanFocus, onHashChange, rememberPlanFocus, restoreHistoryState } from './history-restore';
import { LAZY_CHARTS, LAZY_DONE, observeLazyCharts, renderLazyIfNeeded } from './lazy-charts';
import { navigationHooks } from './navigation';
import { bindBackToTop, bindScrollProgress, onScrollFrame } from './page-widgets';
import { auditProfiles, renderPicker } from './picker';
import { activatePageForTarget, navigateToSection, onDocumentClick } from './section-navigation';
import { syncPresetButtons } from './service-actions';
import { openCmpModal, populateModelFilter, renderCmpBar, renderMetricsTable, renderTable } from './tables';

/* ============ Coding Plan 比价中心 — 启动 ============ */
/* 章节导航、历史恢复、图表懒加载与页面小部件各在单独模块；这里按生产顺序登记监听并绘制首屏。 */

/* 初次载入的原生 fragment 导航可能清空降级窗口焦点；载入完成后恢复一次。 */
function restoreCmpFocusAfterLoad() {
    const restore = () => {
        const dialog = byId("cmpModal");
        if (isCmpModalOpen() && dialog && !dialog.contains(document.activeElement))
            focusTableControl(byId("cmpCloseBtn"));
    };
    if (typeof requestAnimationFrame === "function")
        requestAnimationFrame(restore);
    else
        restore();
}

/* Vue 挂载并恢复地址栏条件后调用：登记导航与历史入口，绘制首屏，并安排其余图表懒加载。 */
export function startApplication() {
    document.addEventListener("focusin", rememberPlanFocus);
    document.addEventListener("pointerdown", forgetPlanFocus, { passive: true });
    navigationHooks.navigate = navigateToSection;
    navigationHooks.restore = restoreHistoryState;
    applyUrlState();
    let initialSection = "quick";
    try {
        initialSection = decodeURIComponent(location.hash.slice(1)) || "quick";
    }
    catch (err) { /* 使用默认视图 */ }
    activatePageForTarget(byId(initialSection));
    syncControlsFromState();
    renderCmpBar();
    /* 分享的对比链接：≥2 档时自动弹出对比视图 */
    if (cmpState.items.length >= 2) {
        boot("cmpModal", openCmpModal);
        window.addEventListener("load", restoreCmpFocusAfterLoad, { once: true });
    }
    /* 首屏只画「帮我选」以上的内容；图表在滚动接近时再初始化（见 LAZY_CHARTS） */
    boot("theme", initTheme);
    boot("quick", renderPicker);
    boot("table", renderTable);
    boot("modelFilter", populateModelFilter);
    boot("metrics", renderMetricsTable);
    document.addEventListener("click", onDocumentClick);
    window.addEventListener("popstate", restoreHistoryState);
    window.addEventListener("hashchange", onHashChange);
    observeLazyCharts();
    window.addEventListener("scroll", onScrollFrame(renderLazyIfNeeded), { passive: true });
    window.addEventListener("resize", renderLazyIfNeeded, { passive: true });
    renderLazyIfNeeded();
    /* 有限首屏兜底；恢复前台时再检查，不在首屏持续轮询。 */
    let lazyAttempts = 0;
    const lazyTimer = setInterval(() => {
        renderLazyIfNeeded();
        if (++lazyAttempts >= 5 || LAZY_DONE.size >= LAZY_CHARTS.length)
            clearInterval(lazyTimer);
    }, 800);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden)
            renderLazyIfNeeded();
    });
    /* picker 的 headline 断言只在调试时跑：?debug=1 */
    if (debugModeEnabled())
        boot("audit", auditProfiles);
    bindScrollProgress();
    bindBackToTop();
    boot("services", () => {
        renderCostCalculator();
        syncPresetButtons();
    });
    boot("chartResize", bindChartResize);
    boot("syncUrl", syncUrl);
    /* 直接打开分享锚点时也先铺好上方布局。 */
    if (location.hash)
        navigateToSection(location.hash, false, false, true);
    /* Vue 已挂载并恢复当前条件；清除默认预渲染标记，让带参数链接显示当前结果。 */
    qsa("[data-prerendered]").forEach((el) => el.removeAttribute("data-prerendered"));
    document.documentElement.classList.remove("has-query");
    window.codingPlanReady = true;
}
