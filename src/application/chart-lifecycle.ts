import { renderPersonalChart, renderTeamChart, renderTokensChart, renderApiChart, renderRankChart } from '../browser/charts';
import { renderPublicBenchmarkChart } from './maintenance';
import { chartCache, markChartsForResize } from '../browser/chart-host';
import { applyTheme, readThemeMode, themeMode } from '../browser/theme-control';
import { initPageNavigation } from '../browser/page-navigation';

import { resizeVisibleCharts as resizeBrowserCharts, bindChartResize as bindBrowserChartResize } from '../browser/chart-host';
/* 宽窄布局切换（如手机横竖屏）需要整图重绘：行高与标签位置都要变。 */
const CHART_RENDERERS: Record<string, () => void> = { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart, chartTokens: renderTokensChart,
    chartApi: renderApiChart, chartPower: renderApiChart, chartRank: renderRankChart };

export function rerenderCharts() {
    const renderers: Record<string, () => void> = { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart,
        chartTokens: renderTokensChart, chartApi: renderApiChart, chartRank: renderRankChart, chartPublicBenchmark: renderPublicBenchmarkChart };
    Object.entries(renderers).forEach(([id, render]) => {
        if (!chartCache[id])
            return;
        /* 单图失败不中断其余图的重绘（主题切换/历史恢复会一次重画全部） */
        try {
            render();
        }
        catch (err) {
            console.error("[chart] " + id, err);
        }
    });
    markChartsForResize();
    resizeBrowserCharts(CHART_RENDERERS);
}

export function initTheme() {
    applyTheme(readThemeMode());
    initPageNavigation();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
        if (themeMode === "system") {
            applyTheme("system");
            rerenderCharts();
        }
    };
    /* 旧版 Safari（<14）只支持 addListener，此处做回退 */
    if (mq.addEventListener)
        mq.addEventListener("change", onSchemeChange);
    else if (mq.addListener)
        mq.addListener(onSchemeChange);
}
export function resizeVisibleCharts() { resizeBrowserCharts(CHART_RENDERERS); }
export function bindChartResize() { bindBrowserChartResize(CHART_RENDERERS); }

