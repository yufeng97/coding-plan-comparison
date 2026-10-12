import { byId, evtTarget, qs, qsa } from '../browser/dom';
import { chartLibraryReady, ensureChartLibrary, markChartsForResize } from '../browser/charts/host';
import { focusTableControl } from '../browser/interaction';
import { optionalDataLoaded } from '../browser/optional-data';
import { updateActiveNav } from '../browser/page-navigation';
import { boot } from './boot';
import { resizeVisibleCharts } from './chart-lifecycle';
import { LAZY_CHARTS, bootLazy, chartPrecedes, retryLazyChart } from './lazy-charts';
import { loadViewData, renderPublicBenchmarkChart } from './maintenance';

/* 主选购页和辅助资料按标签显示；锚点仍是可分享、可前进后退的入口。 */
const AUXILIARY_VIEWS = new Set(["updates", "benchmarks", "sources", "contribute"]);
let currentSiteView = "compare";

/** 当前显示的视图：主选购页为 compare，辅助资料为对应章节 id。 */
export function siteView() { return currentSiteView; }

export function activatePageForTarget(target: Element | null) {
    const section = target && (target.classList.contains("section") ? target : target.closest(".section"));
    const view = section && AUXILIARY_VIEWS.has(section.id) ? section.id : "compare";
    currentSiteView = view;
    qsa("main .section").forEach((item) => { item.hidden = AUXILIARY_VIEWS.has(item.id) ? item.id !== view : view !== "compare"; });
    const hero = qs(".hero");
    if (hero)
        hero.hidden = view !== "compare";
    qsa("[data-site-view]").forEach((link) => {
        const selected = link.dataset.siteView === view;
        link.classList.toggle("active", selected);
        if (selected)
            link.setAttribute("aria-current", "page");
        else
            link.removeAttribute("aria-current");
    });
    if (view === "updates")
        loadViewData("maintenance");
    if (view === "benchmarks")
        loadViewData("benchmark");
    /* 其他视图期间的主题、历史恢复或延迟加载可能已在隐藏容器里重绘图表。 */
    markChartsForResize();
    if (view === "benchmarks" && optionalDataLoaded("benchmark"))
        boot("publicBenchmarkChart", renderPublicBenchmarkChart);
    if (typeof requestAnimationFrame === "function")
        requestAnimationFrame(() => { resizeVisibleCharts(); updateActiveNav(); });
}

/* 锚点跳转前完成目标前方图表的布局；滚动期间不再被懒加载增高顶偏。 */
function prepareSection(hash: string) {
    let id;
    try {
        id = decodeURIComponent(String(hash || "").replace(/^#/, ""));
    }
    catch (e) {
        return null;
    }
    const target = byId(id);
    if (!target)
        return null;
    if (id === "top")
        return target;
    LAZY_CHARTS.forEach((item) => {
        if (chartPrecedes(item, target))
            bootLazy(item);
    });
    return target;
}

let sectionNavigationVersion = 0;
/* 新的导航、历史恢复或回到顶部让尚在等待图表的旧导航失效。 */
export function cancelPendingSectionNavigation() { ++sectionNavigationVersion; }

export function navigateToSection(hash: string, updateHistory: boolean = true, moveFocus: boolean = true, allowInitialLayout: boolean = false) {
    const version = ++sectionNavigationVersion;
    let id = String(hash || "").slice(1) || "top";
    try {
        id = decodeURIComponent(id);
    }
    catch (err) {
        return;
    }
    const target = byId(id);
    if (!target)
        return;
    activatePageForTarget(target);
    /* 先提交有效的导航意图，后续输入不会把尚在下载图表的历史入口覆盖掉。 */
    if (updateHistory && location.hash !== hash) {
        try {
            history.pushState(null, "", location.pathname + location.search + hash);
        }
        catch (e) {
            location.hash = hash;
        }
    }
    const needsCharts = id !== "top" && LAZY_CHARTS.some((item) => chartPrecedes(item, target));
    if (!chartLibraryReady() && needsCharts) {
        const initialScroll = window.scrollY;
        const initialFocus = document.activeElement;
        let abandoned = false;
        const focusChanged = () => document.activeElement !== initialFocus && document.activeElement !== document.body;
        const abandonOnInput = () => { abandoned = true; };
        const scrollKeys = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "]);
        const abandonOnKey = (event: KeyboardEvent) => {
            if (scrollKeys.has(event.key))
                abandoned = true;
        };
        const inputEvents = ["wheel", "touchmove", "pointerdown"];
        const trackReading = () => {
            updateActiveNav();
            const active = qs('.topnav a[aria-current="location"]');
            if (!allowInitialLayout && !moveFocus && Math.abs(window.scrollY - initialScroll) > 2 && active && active.getAttribute("href") !== hash)
                abandoned = true;
        };
        window.addEventListener("scroll", trackReading, { passive: true });
        inputEvents.forEach((type) => window.addEventListener(type, abandonOnInput, { passive: true }));
        window.addEventListener("keydown", abandonOnKey);
        const stopTracking = () => {
            window.removeEventListener("scroll", trackReading);
            inputEvents.forEach((type) => window.removeEventListener(type, abandonOnInput));
            window.removeEventListener("keydown", abandonOnKey);
        };
        /* 先排空已排队的图表渲染，再测量锚点；否则上方图表增高会顶偏目标。 */
        ensureChartLibrary().then(() => {
            trackReading();
            const active = qs('.topnav a[aria-current="location"]');
            /* 显式键盘导航的来源链接可能在下一帧才滚入视口；不能把这个滚动当作放弃导航。 */
            /* 初次分享链接的 SSR/客户端行数和字体布局会触发原生 fragment 滚动；只有用户输入才取消这次对齐。 */
            const movedAway = !allowInitialLayout && !moveFocus && Math.abs(window.scrollY - initialScroll) > 2 && !!active && active.getAttribute("href") !== hash;
            return Promise.resolve(abandoned || movedAway || focusChanged());
        }).then((movedAway) => {
            stopTracking();
            /* 历史入口已在上方提交，图表就绪后的重入不再写历史。 */
            if (!movedAway && version === sectionNavigationVersion)
                navigateToSection(hash, false, moveFocus, allowInitialLayout);
        }, () => {
            stopTracking();
            /* 图表不可用时仍让用户进入文字明细；本地错误卡可独立重试。 */
            if (!abandoned && !focusChanged() && version === sectionNavigationVersion)
                navigateToSectionReady(hash, moveFocus);
        });
        return;
    }
    navigateToSectionReady(hash, moveFocus);
}

function navigateToSectionReady(hash: string, moveFocus: boolean) {
    const previousFocus = document.activeElement as HTMLElement | null;
    const target = prepareSection(hash);
    if (!target)
        return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (moveFocus) {
        if (target.getAttribute("tabindex") == null)
            target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
    }
    else if (previousFocus && previousFocus !== document.body && previousFocus.isConnected !== false) {
        /* Firefox 的 fragment 滚动可能清空按钮焦点；历史恢复保留刚找回的控件。 */
        focusTableControl(previousFocus);
    }
}

/* 站内锚点走章节导航（懒加载预热与焦点管理）；图表错误卡的重试按钮重画对应图表。 */
export function onDocumentClick(e: MouseEvent) {
    const target = evtTarget(e);
    const link = target ? target.closest('a[href^="#"]') : null;
    if (link && !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        const hash = link.getAttribute("href") || "";
        /* 判定与导航都用解码后的锚点，非 ASCII 章节名才能命中懒加载预热与焦点管理 */
        let anchorId = hash.slice(1);
        try {
            anchorId = decodeURIComponent(anchorId);
        }
        catch (err) { /* 保留原值 */ }
        if (!byId(anchorId))
            return;
        e.preventDefault();
        navigateToSection(hash);
    }
    const retry = target ? target.closest<HTMLElement>("[data-retry-chart]") : null;
    if (retry) {
        const id = retry.dataset.retryChart;
        if (id === "chartPublicBenchmark") {
            boot("publicBenchmarkChart", renderPublicBenchmarkChart);
            return;
        }
        retryLazyChart(id);
    }
}
