import { qs, qsa, byId } from './dom';

/* 测量固定页头，供锚点间距和当前章节判断共用；不读取或渲染图表内容。 */
let headerHeight = 0;

let navigationInitialized = false;

export function syncHeaderHeight() {
    const header = qs(".topbar");
    if (!header || typeof header.getBoundingClientRect !== "function")
        return;
    const height = Math.ceil(header.getBoundingClientRect().height);
    if (!Number.isFinite(height) || height <= 0)
        return;
    headerHeight = height;
    const style = document.documentElement.style;
    if (style && typeof style.setProperty === "function")
        style.setProperty("--header-height", height + "px");
}

export function updateActiveNav() {
    const links = Array.from(qsa<HTMLAnchorElement>('.topnav a[href^="#"]'));
    const previous = links.find((link) => link.getAttribute("aria-current") === "location");
    const scrollPadding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top"));
    const readingTop = Number.isFinite(scrollPadding) ? scrollPadding : headerHeight;
    let active: HTMLAnchorElement | null = null, closestTop = -Infinity;
    links.forEach((link) => {
        const target = byId((link.getAttribute("href") || "").slice(1));
        if (!target || target.hidden || typeof target.getBoundingClientRect !== "function")
            return;
        const top = target.getBoundingClientRect().top;
        /* 章节顶部的实际留白进入阅读区即属于本节，容纳字体加载后的轻微布局变化。 */
        const paddingTop = parseFloat(getComputedStyle(target).getPropertyValue("padding-top")) || 0;
        if (Number.isFinite(top) && top <= readingTop + paddingTop && top >= closestTop) {
            closestTop = top;
            active = link;
        }
    });
    links.forEach((link) => {
        const on = link === active;
        link.classList.toggle("active", on);
        if (on)
            link.setAttribute("aria-current", "location");
        else
            link.removeAttribute("aria-current");
    });
    /* 窄屏导航横向滚动时让当前章节露出来，只在章节变化时调整。 */
    const nav = qs(".topnav");
    const current = active as HTMLAnchorElement | null;
    if (current && current !== previous && nav && nav.scrollWidth > nav.clientWidth) {
        const box = current.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
        if (box.left < bounds.left + 8)
            nav.scrollLeft += box.left - bounds.left - 8;
        else if (box.right > bounds.right - 8)
            nav.scrollLeft += box.right - bounds.right + 8;
    }
}

export function initPageNavigation() {
    if (navigationInitialized)
        return;
    navigationInitialized = true;
    let readingPosition: { target: HTMLElement; offset: number } | null = null;
    const rememberReadingPosition = () => {
        const active = qs('.topnav a[aria-current="location"]');
        const target = active && byId((active.getAttribute("href") || "").slice(1));
        const padding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top")) || headerHeight;
        readingPosition = target ? { target, offset: target.getBoundingClientRect().top - padding } : null;
    };
    const refreshHeader = () => { syncHeaderHeight(); updateActiveNav(); rememberReadingPosition(); };
    const refreshLayout = () => {
        const previous = readingPosition;
        syncHeaderHeight();
        if (previous && previous.target.isConnected !== false && window.scrollY > 0) {
            const padding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top")) || headerHeight;
            const delta = previous.target.getBoundingClientRect().top - padding - previous.offset;
            if (Math.abs(delta) > 1)
                window.scrollTo({ top: window.scrollY + delta, behavior: "instant" });
        }
        updateActiveNav();
        rememberReadingPosition();
    };
    refreshHeader();
    const header = qs(".topbar");
    if (header && typeof ResizeObserver === "function")
        new ResizeObserver(refreshLayout).observe(header);
    window.addEventListener("resize", refreshLayout, { passive: true });
    let pending = false;
    window.addEventListener("scroll", () => {
        if (pending)
            return;
        pending = true;
        const update = () => { pending = false; updateActiveNav(); rememberReadingPosition(); };
        if (typeof window.requestAnimationFrame === "function")
            window.requestAnimationFrame(update);
        else
            update();
    }, { passive: true });
    window.addEventListener("hashchange", updateActiveNav);
    /* 加载完成后只更新当前位置；用户已滚动时不重新跳到原分享锚点。 */
    window.addEventListener("load", refreshHeader, { once: true });
    if (document.fonts && document.fonts.ready)
        document.fonts.ready.then(refreshLayout, refreshHeader);
}
