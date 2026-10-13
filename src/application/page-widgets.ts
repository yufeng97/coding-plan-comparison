import { byId, qs } from '../browser/dom';
import { cancelPendingSectionNavigation, siteView } from './section-navigation';

/* 三个滚动回调共用一帧调度：scroll 高频触发时每个回调每帧至多执行一次 */
export function onScrollFrame(fn: () => void) {
    let queued = false;
    return () => {
        if (queued)
            return;
        queued = true;
        const run = () => { queued = false; fn(); };
        if (typeof window.requestAnimationFrame === "function")
            window.requestAnimationFrame(run);
        else
            run();
    };
}

/* ---------- 滚动进度条 ---------- */
export function bindScrollProgress() {
    const bar = byId("scrollBar");
    if (!bar)
        return;
    const update = () => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        /* transform 只触发合成；宽度保持 100%，按比例缩放。 */
        bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, h.scrollTop / max) : 0) + ")";
    };
    window.addEventListener("scroll", onScrollFrame(update), { passive: true });
    update();
}

/* ---------- 回到顶部（贴在右侧滚动条旁） ---------- */
export function bindBackToTop() {
    const btn = byId("toTop");
    if (!btn)
        return;
    const toggle = () => btn.classList.toggle("is-on", window.scrollY > 480);
    btn.addEventListener("click", () => {
        cancelPendingSectionNavigation();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        const view = siteView();
        const title = view === "compare" ? qs(".hero h1") : byId(view)?.querySelector<HTMLElement>(".section-head h1");
        if (title) {
            title.setAttribute("tabindex", "-1");
            title.focus({ preventScroll: true });
        }
    });
    window.addEventListener("scroll", onScrollFrame(toggle), { passive: true });
    toggle();
}
