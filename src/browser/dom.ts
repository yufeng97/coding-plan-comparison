

/* ---------- DOM 助手：元素类型由调用处按页面结构约定给出 ---------- */
export function byId<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T | null; }

export function qsa<T extends HTMLElement = HTMLElement>(selector: string) { return document.querySelectorAll<T>(selector); }

export function qs<T extends HTMLElement = HTMLElement>(selector: string) { return document.querySelector<T>(selector); }

/** 事件目标元素（图标 SVG 也算）；文本节点等非元素目标返回 null。 */
export function evtTarget(e: Event) { return e.target instanceof Element ? e.target : null; }

/* 图表是 canvas，读屏不可见：渲染后写一句文字摘要进容器 */
export function describeChart(id: string, text: string) {
    const el = byId(id);
    if (!el)
        return;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", String(text).slice(0, 240));
}

/* 模板里读取表单控件的值：事件目标的类型在模板中无法收窄，集中在这里断言。 */
export function targetValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
