import { byId } from '../browser/dom';
import { chartCache, showChartError } from '../browser/charts/host';
import { renderPersonalChart } from '../browser/charts/personal';
import { renderTeamChart } from '../browser/charts/team';
import { renderTokensChart } from '../browser/charts/tokens';
import { renderApiChart } from '../browser/charts/api';
import { renderRankChart } from '../browser/charts/rank';

/* 首屏以下的图表进入视口再画，缩短首屏主线程占用；rootMargin 提前 200px 预热 */
interface LazyChart { name: string; el: string; fn: () => void }
export const LAZY_CHARTS: LazyChart[] = [
    { name: "rank", el: "chartRank", fn: renderRankChart },
    { name: "personal", el: "chartPersonal", fn: renderPersonalChart },
    { name: "team", el: "chartTeam", fn: renderTeamChart },
    { name: "tokens", el: "chartTokens", fn: renderTokensChart },
    { name: "api", el: "chartApi", fn: renderApiChart },
];
export const LAZY_DONE = new Set<string>();

function chartHostAvailable(host: Element | null) {
    return !!host && !(host as HTMLElement).hidden && !host.closest<HTMLElement>(".section")?.hidden && !host.closest("[hidden]");
}

/* 图表在目标章节之内或之前：跳到目标前先画好，滚动途中不再增高顶偏目标。 */
export function chartPrecedes(item: LazyChart, target: HTMLElement) {
    const chart = byId(item.el);
    return !!chart && chartHostAvailable(chart) && (target.contains(chart) || (chart.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
}

export function bootLazy(item: LazyChart) {
    if (LAZY_DONE.has(item.el) || !chartHostAvailable(byId(item.el)))
        return;
    LAZY_DONE.add(item.el);
    try {
        item.fn();
    }
    catch (err) {
        showChartError(item.el, err);
    }
}

/* 图表错误卡的重试：释放旧画布后重新绘制；不是懒加载图表时返回 false。 */
export function retryLazyChart(id: string | undefined) {
    const item = LAZY_CHARTS.find((x) => x.el === id);
    if (!item)
        return false;
    const chart = chartCache[item.el];
    if (chart) {
        chart.dispose();
        delete chartCache[item.el];
    }
    const host = byId(item.el);
    if (host)
        host.innerHTML = "";
    LAZY_DONE.delete(item.el);
    bootLazy(item);
    return true;
}

export function observeLazyCharts() {
    if (typeof IntersectionObserver !== "function")
        return;
    const lazyIo = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting || !chartHostAvailable(e.target) || e.boundingClientRect.width <= 0 || e.boundingClientRect.height <= 0)
                return;
            lazyIo.unobserve(e.target);
            const item = LAZY_CHARTS.find((x) => byId(x.el) === e.target);
            if (item)
                bootLazy(item);
        });
    }, { rootMargin: "200px 0px" });
    LAZY_CHARTS.forEach((x) => {
        const el = byId(x.el);
        if (el)
            lazyIo.observe(el);
    });
}

/* 兜底：后台标签页等环境里 IO 可能不产生帧，滚动/缩放时按位置补渲染（LAZY_DONE 防重复） */
export function renderLazyIfNeeded() {
    LAZY_CHARTS.forEach((item) => {
        if (LAZY_DONE.has(item.el))
            return;
        const el = byId(item.el);
        if (!el || !chartHostAvailable(el))
            return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.top < window.innerHeight + 200 && r.bottom > -200)
            bootLazy(item);
    });
}
