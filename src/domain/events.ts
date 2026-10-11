import { updateAppState } from './state';
import { personalViewHooks } from './charts';
import { tableViews } from './tables';

/* ============ Coding Plan 比价中心 — 用户操作 ============ */

export let personalSearchTimer = null, tableSearchTimer = null;
export function cancelPersonalSearch() { clearTimeout(personalSearchTimer); personalSearchTimer = null; personalViewHooks.cancelSearch?.(); }
export function cancelTableSearch() { clearTimeout(tableSearchTimer); tableSearchTimer = null; tableViews.plan?.cancelSearch?.(); }
export function hasPendingSearch() {
    return personalSearchTimer != null || tableSearchTimer != null
        || !!personalViewHooks.hasPendingSearch?.() || !!tableViews.plan?.hasPendingSearch?.();
}
/* 用户操作持久化一次；图表重绘不写 URL。 */
export function onState(target: any, type: any, handler: any) {
    target.addEventListener(type, (event: any) => updateAppState(() => handler(event)));
}
/* 排序表头共用绑定：点击/键盘翻转同列方向，换列时按 firstDir 起排（数据表从低到高，额度表按列定义） */
export function bindSortableHeader(th: any, state: any, render: any, firstDir: number = 1) {
    th.tabIndex = 0;
    const sort = () => {
        if (state.sortKey === th.dataset.sort)
            state.sortDir *= -1;
        else {
            state.sortKey = th.dataset.sort;
            state.sortDir = firstDir;
        }
        render();
    };
    onState(th, "click", sort);
    onState(th, "keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        sort();
    } });
}
/* ---------- 事件绑定 ---------- */
export function bindEvents() { /* Vue components bind their controls directly. */ }
export function bindMetricsEvents(){}
