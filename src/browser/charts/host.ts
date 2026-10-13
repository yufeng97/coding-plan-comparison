import type { PlanCategory } from '../../domain/core';
import type { EChartsType } from 'echarts/core';
import { byId } from '../dom';
import { esc } from '../../domain/core';

/** 图表配色：随主题由 refreshPalette 从 CSS 变量重建。 */
export interface ChartPalette {
    text: string; dim: string; catLabel: string; faint: string; gold: string; green: string;
    red: string; info: string; axisLine: string; splitLine: string; tipBg: string;
    tipBorder: string; tipText: string;
    /** 系列色（--chart-*）：API 输入/输出、国际/国内与每周 tokens 的官方/估算，图例与图表同源。 */
    chartInput: string; chartOutput: string; chartIntl: string; chartCn: string; chartOfficial: string; chartEstimate: string;
}

/* 类别色值以 src/styles/theme.css 的 --cat-* 变量为单一数据源：图表、HTML 图例、类别标签共用。
   主题切换时 refreshPalette() 会重读变量（暗色取更亮的一组），图例与图表同步。 */
export let CAT_COLOR: Record<PlanCategory, string> = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };

export let RELAY_COLOR = "#d4534a";

export function refreshCategoryColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => (cs.getPropertyValue(name) || "").trim();
    CAT_COLOR = {
        official: v("--cat-official") || CAT_COLOR.official,
        tool: v("--cat-tool") || CAT_COLOR.tool,
        cloud: v("--cat-cloud") || CAT_COLOR.cloud,
        team: v("--cat-team") || CAT_COLOR.team,
    };
    RELAY_COLOR = v("--cat-relay") || RELAY_COLOR;
}

/* 宽屏严格限制轴标签占宽，完整名称在 tooltip 和数据表中查看。
   窄屏改为把类别名放在柱子上方整行显示：截成「阶跃 Step Plan Flash…」后几行无法区分。
   公开评测图另有两行标签方案，保持原样。 */
const NARROW_CHART_WIDTH = 480;

const chartNarrowMode = new Map<string, boolean>();

export function chartHostWidth(hostEl: HTMLElement, measuredWidth: number = 0) {
    return measuredWidth || hostEl.getBoundingClientRect().width || window.innerWidth - 72;
}

export function isNarrowChart(hostEl: HTMLElement, measuredWidth: number = 0) {
    return hostEl.id !== "chartPublicBenchmark" && chartHostWidth(hostEl, measuredWidth) < NARROW_CHART_WIDTH;
}

/* 名称放到柱子上方后，每行多留一行文字的高度。 */
export function chartRowHeight(hostEl: HTMLElement, per: number) { return isNarrowChart(hostEl) ? per + 16 : per; }

/* 轴标签按 ECharts 默认字体（sans-serif）量宽；量不了时按全角 1em、半角 0.55em 估算。 */
let measureContext: CanvasRenderingContext2D | null | undefined;
function labelTextWidth(text: string, fontSize: number) {
    if (measureContext === undefined) {
        try {
            measureContext = document.createElement("canvas").getContext("2d");
        }
        catch (err) {
            measureContext = null;
        }
    }
    if (measureContext && typeof measureContext.measureText === "function") {
        measureContext.font = fontSize + "px sans-serif";
        return measureContext.measureText(text).width;
    }
    return Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) < 0x2e80 ? 0.55 : 1) * fontSize, 0);
}

/** 「套餐 · 模型」这类标签超宽时保留最后一个「 · 」之后的模型名，套餐名从中间省略：
 *  开头保留厂商、末尾保留 Pro / Max 等档位，否则末尾截断会把区分同档的信息截掉。ECharts 的 truncate 仍然兜底。 */
export function fitAxisLabel(label: string, maxWidth: number, fontSize: number) {
    const text = String(label ?? "");
    if (labelTextWidth(text, fontSize) <= maxWidth)
        return text;
    const at = text.lastIndexOf(" · ");
    if (at <= 0)
        return text;
    const tail = text.slice(at), head = Array.from(text.slice(0, at));
    const budget = maxWidth - labelTextWidth("…" + tail, fontSize);
    if (budget < fontSize * 3)
        return text;
    /* 约四成留给开头（厂商），其余留给末尾（档位名）。 */
    let start = "", end = "";
    for (const ch of head) {
        if (labelTextWidth(start + ch, fontSize) > budget * 0.4)
            break;
        start += ch;
    }
    for (let i = head.length - 1; i >= start.length; i--) {
        if (labelTextWidth(start + head[i] + end, fontSize) > budget)
            break;
        end = head[i] + end;
    }
    /* 末尾部分从词边界开始（空格或括号），不把「Pro」截成「o」。 */
    const cut = head.length - end.length;
    if (cut > 0 && !/[\s（(]/.test(head[cut - 1]!)) {
        const boundary = Array.from(end).findIndex((ch, index) => index > 0 && /[\s（(]/.test(ch));
        if (boundary > 0)
            end = Array.from(end).slice(boundary).join("");
    }
    return start.trimEnd() + "…" + end.trimStart() + tail;
}

export function chartAxisLabel(hostEl: HTMLElement, fontSize: number = 12.5, measuredWidth: number = 0) {
    const width = chartHostWidth(hostEl, measuredWidth);
    const narrow = isNarrowChart(hostEl, width);
    chartNarrowMode.set(hostEl.id, narrow);
    if (narrow) {
        const labelWidth = Math.max(120, width - 40);
        return { color: PAL.catLabel, fontSize: 11, inside: true, align: "left", verticalAlign: "bottom",
            padding: [0, 0, 11, 2], width: labelWidth, overflow: "truncate", margin: 0,
            formatter: (label: string) => fitAxisLabel(label, labelWidth, 11) };
    }
    const labelWidth = Math.max(60, Math.min(width < NARROW_CHART_WIDTH ? 110 : 260, width * 0.34));
    return { color: PAL.catLabel, fontSize, width: labelWidth, overflow: "truncate", margin: 8,
        formatter: (label: string) => fitAxisLabel(label, labelWidth, fontSize) };
}

/** 图表 id → ECharts 实例。 */
export const chartCache: Record<string, EChartsType> = {};

let chartLibraryPromise: Promise<void> | null = null;

/** 图表库下载期间，各图表最新一次的绘制请求。 */
export const queuedChartRenders = new Map<string, () => void>();

/* A queued render belongs to one host lifetime. A replacement component must not
 * inherit the callbacks of a host that unmounted while the library downloaded. */
const queuedChartRequests = new Map<string, { host: HTMLElement }>();

export function releaseChart(id: string) {
    queuedChartRenders.delete(id);
    queuedChartRequests.delete(id);
    if (chartCache[id]) {
        chartCache[id].dispose();
        delete chartCache[id];
    }
    pendingChartResizes.delete(id);
    offscreenResized.delete(id);
    chartNarrowMode.delete(id);
}

export function chartLibraryReady() { return typeof echarts !== "undefined" && typeof echarts.init === "function"; }

export function ensureChartLibrary(): Promise<void> {
    if (chartLibraryReady())
        return Promise.resolve();
    if (chartLibraryPromise)
        return chartLibraryPromise;
    chartLibraryPromise = new Promise<void>((resolve, reject) => {
        const template = byId<HTMLTemplateElement>("chartLibraryTemplate");
        const asset = template && template.content && template.content.querySelector("script[src]");
        if (!asset) {
            reject(new Error("图表资源地址缺失"));
            return;
        }
        const script = document.createElement("script");
        script.src = asset.getAttribute("src") ?? "";
        let done = false;
        const finish = (error: Error | null) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) {
                script.remove();
                reject(error);
            }
            else
                resolve();
        };
        const timer = setTimeout(() => finish(new Error("图表资源加载超时")), 15000);
        script.onload = () => finish(chartLibraryReady() ? null : new Error("图表资源未正确初始化"));
        script.onerror = () => finish(new Error("图表资源加载失败"));
        document.body.appendChild(script);
    }).catch((err: unknown) => { chartLibraryPromise = null; throw err; });
    return chartLibraryPromise;
}

export function showChartError(id: string, err: unknown) {
    const ids = id === "chartApi" ? [id, "chartPower"] : [id];
    ids.forEach((chartId) => {
        if (chartCache[chartId]) {
            chartCache[chartId].dispose();
            delete chartCache[chartId];
        }
        const el = byId(chartId);
        if (el) {
            el.removeAttribute("aria-busy");
            el.innerHTML = `<p class="render-error" role="alert">图表暂时无法显示，文字明细仍可查看。<button type="button" class="chip" data-retry-chart="${esc(id)}">重试</button></p>`;
        }
    });
    console.error("[chart] " + id, err);
}

/** 图表库未就绪时登记绘制并开始下载，返回 true；就绪时返回 false，由调用方直接绘制。 */
export function deferChartRender(id: string, render: () => void) {
    const el = byId(id);
    if (!el)
        return true;
    if (chartLibraryReady())
        return false;
    const scheduled = queuedChartRequests.has(id);
    queuedChartRenders.set(id, render);
    el.setAttribute("aria-busy", "true");
    el.innerHTML = '<p class="chart-loading" role="status">正在加载图表…</p>';
    if (!scheduled) {
        const request = { host: el };
        queuedChartRequests.set(id, request);
        ensureChartLibrary().then(() => {
            if (queuedChartRequests.get(id) !== request)
                return;
            queuedChartRequests.delete(id);
            const latest = queuedChartRenders.get(id);
            queuedChartRenders.delete(id);
            if (!el.isConnected || byId(id) !== el)
                return;
            el.removeAttribute("aria-busy");
            el.innerHTML = "";
            try {
                if (latest)
                    latest();
                markChartsForResize();
                resizeVisibleCharts();
            }
            catch (err) {
                showChartError(id, err);
            }
        }, (err: unknown) => {
            if (queuedChartRequests.get(id) !== request)
                return;
            queuedChartRequests.delete(id);
            queuedChartRenders.delete(id);
            if (el.isConnected && byId(id) === el)
                showChartError(id, err);
        });
    }
    return true;
}

/** 取得（必要时创建）图表实例；调用前已确认图表库就绪且容器存在。 */
export function makeChart(id: string) {
    if (!chartCache[id]) {
        const el = byId(id)!;
        el.innerHTML = "";
        el.removeAttribute("aria-busy");
        chartCache[id] = echarts!.init(el, null, { renderer: "canvas" });
    }
    return chartCache[id];
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

export const pendingChartResizes = new Set<string>();

const CHART_AXIS_FONT_SIZE: Record<string, number> = { chartPersonal: 12.5, chartTeam: 12.5, chartTokens: 11.5, chartApi: 11, chartPower: 11, chartRank: 11.5, chartPublicBenchmark: 12 };

/** 已在屏幕外按新尺寸缩放、但轴标签宽度与窄屏布局尚未补齐的画布。 */
const offscreenResized = new Set<string>();

/* 缩放只更新实际尺寸变化的画布，不重新筛数据或重建图例。
   可见画布同时按新宽度重排轴标签与窄/宽布局；屏幕外画布只同步尺寸，避免旧宽度把整页撑出横向滚动，
   轴标签与布局保留待处理标记，滚入阅读区时再补齐。 */
export function resizeVisibleCharts(renderers: Record<string, () => void> = {}) {
    pendingChartResizes.forEach((id) => {
        const chart = chartCache[id], el = byId(id);
        if (!chart || !el) {
            pendingChartResizes.delete(id);
            offscreenResized.delete(id);
            return;
        }
        if (el.hidden)
            return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
        const sizeChanged = Math.abs(chart.getWidth() - rect.width) >= 1 || Math.abs(chart.getHeight() - rect.height) >= 1;
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
            if (!sizeChanged)
                return;
            try {
                chart.resize();
                offscreenResized.add(id);
            }
            catch (err) {
                console.error("[chart resize] " + id, err);
            }
            return;
        }
        pendingChartResizes.delete(id);
        const labelsStale = offscreenResized.delete(id);
        if (!sizeChanged && !labelsStale)
            return;
        try {
            const render = renderers[id];
            if (render && chartNarrowMode.has(id) && chartNarrowMode.get(id) !== isNarrowChart(el, rect.width)) {
                render();
                chart.resize();
                return;
            }
            chart.setOption({ yAxis: { axisLabel: chartAxisLabel(el, CHART_AXIS_FONT_SIZE[id], rect.width) } }, { lazyUpdate: true });
            chart.resize();
        }
        catch (err) {
            pendingChartResizes.add(id);
            console.error("[chart resize] " + id, err);
        }
    });
}

/* 隐藏视图里重绘的画布会按 100px 默认宽度绘制；重绘、视图切换和缩放后统一标记待测量，
   进入可视区时再按实际尺寸补齐，不依赖窗口缩放事件。 */
export function markChartsForResize(ids: string[] = Object.keys(chartCache)) {
    ids.forEach((id) => {
        if (chartCache[id])
            pendingChartResizes.add(id);
    });
}

export function bindChartResize(renderers: Record<string, () => void>) {
    window.addEventListener("resize", () => {
        markChartsForResize();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => resizeVisibleCharts(renderers), 150);
    }, { passive: true });
    let scrollQueued = false;
    window.addEventListener("scroll", () => {
        if (scrollQueued || pendingChartResizes.size === 0)
            return;
        scrollQueued = true;
        const update = () => { scrollQueued = false; resizeVisibleCharts(renderers); };
        if (typeof window.requestAnimationFrame === "function")
            window.requestAnimationFrame(update);
        else
            update();
    }, { passive: true });
}

/* ---------- 主题（暗/亮/跟随系统）与图表调色板 ---------- */
/** 随主题由 refreshPalette 重建。 */
export let PAL: ChartPalette = {} as ChartPalette;

export function refreshPalette() {
    const light = document.documentElement.dataset.theme === "light";
    const cs = getComputedStyle(document.documentElement);
    const color = (name: string, fallback: string) => (cs.getPropertyValue(name) || "").trim() || fallback;
    PAL = light ? {
        text: "#10110f", dim: "#6f726b", catLabel: "#3a3d38", faint: color("--faint", "#6b6f66"),
        gold: color("--gold", "#996100"), green: color("--green", "#287c3e"),
        red: color("--red", "#b52a25"), info: color("--info", "#2458ae"),
        axisLine: "rgba(16,17,15,.22)", splitLine: "rgba(16,17,15,.07)",
        tipBg: "rgba(255,255,255,.98)", tipBorder: "rgba(16,17,15,.18)", tipText: "#10110f",
        chartInput: color("--chart-input", "#4f46e5"), chartOutput: color("--chart-output", "#c0266d"),
        chartIntl: color("--chart-intl", "#0e7490"), chartCn: color("--chart-cn", "#047857"),
        chartOfficial: color("--chart-official", "#287c3e"), chartEstimate: color("--chart-estimate", "#996100"),
    } : {
        text: "#eceee8", dim: "#9fa39a", catLabel: "#c8ccc2", faint: color("--faint", "#868a83"),
        gold: color("--gold", "#e9b117"), green: color("--green", "#4cbf6b"),
        red: color("--red", "#ef554f"), info: color("--info", "#6d9bff"),
        axisLine: "rgba(236,238,232,.2)", splitLine: "rgba(236,238,232,.08)",
        tipBg: "rgba(22,24,21,.97)", tipBorder: "rgba(236,238,232,.16)", tipText: "#eceee8",
        chartInput: color("--chart-input", "#818cf8"), chartOutput: color("--chart-output", "#f472b6"),
        chartIntl: color("--chart-intl", "#22d3ee"), chartCn: color("--chart-cn", "#34d399"),
        chartOfficial: color("--chart-official", "#4cbf6b"), chartEstimate: color("--chart-estimate", "#e9b117"),
    };
    refreshCategoryColors();
}

/** 十六进制颜色加透明度（ECharts 的 opacity 会连描边一起变淡，半透明填充改用 rgba）。 */
export function withAlpha(color: string, alpha: number) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
    return m ? `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})` : color;
}

export function axisStyle() {
    return {
        axisLine: { lineStyle: { color: PAL.axisLine } },
        axisLabel: { color: PAL.dim, fontSize: 12 },
        splitLine: { lineStyle: { color: PAL.splitLine } },
    };
}

export function tipStyle(hostEl: HTMLElement, viewportFixed: boolean = false) {
    return {
        backgroundColor: PAL.tipBg,
        borderColor: PAL.tipBorder,
        borderWidth: 1,
        textStyle: { color: PAL.tipText, fontSize: 12.5 },
        // 随图表所属标签收起，避免旧提示坐标撑高切换后的页面。
        appendToBody: false,
        extraCssText: "max-width: min(420px, calc(100vw - 24px)); white-space: normal; overflow-wrap: anywhere; z-index: 2000;",
        position(point: number[], _params: unknown, _el: unknown, _rect: unknown, size: { contentSize: number[] }) {
            const box = hostEl.getBoundingClientRect();
            const bw = Math.min(size.contentSize[0] || 280, window.innerWidth - 24);
            const bh = size.contentSize[1] || 72;
            let x = box.left + point[0]! + 14;
            let y = box.top + point[1]! + 12;
            if (x + bw > window.innerWidth - 8)
                x = box.left + point[0]! - bw - 14;
            if (x < 8)
                x = 8;
            if (x + bw > window.innerWidth - 8)
                x = Math.max(8, window.innerWidth - bw - 8);
            if (y + bh > window.innerHeight - 8)
                y = box.top + point[1]! - bh - 12;
            if (y < 8)
                y = 8;
            if (y + bh > window.innerHeight - 8)
                y = Math.max(8, window.innerHeight - bh - 8);
            return viewportFixed ? [x, y] : [x - box.left, y - box.top];
        },
    };
}
