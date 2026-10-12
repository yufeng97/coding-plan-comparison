import { qsa, byId } from './dom';

/* ---------- 数据表 ---------- */
export function focusTableControl(el: Element | null | undefined) {
    const target = el as (HTMLElement & { disabled?: boolean }) | null | undefined;
    if (!target || target.isConnected === false || target.disabled || typeof target.focus !== "function")
        return false;
    target.focus({ preventScroll: true });
    return document.activeElement === target;
}

/* 分页是主动进入新记录：先滚动其所在的表格和页面，再聚焦。
 * 其他焦点恢复仍用 preventScroll，避免筛选、关闭窗口或历史恢复改变阅读位置。 */
export function revealAndFocusTableControl(el: Element | null | undefined) {
    const target = el as (HTMLElement & { disabled?: boolean }) | null | undefined;
    if (!target || target.isConnected === false || target.disabled || typeof target.focus !== "function")
        return false;
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    const focused = focusTableControl(target);
    /* WebKit 冷加载时，嵌套表格滚动后会在首帧把外层窗口退回旧位置。
     * 等滚动提交后只补齐仍被裁剪的当前焦点；用户已换控件时不再滚动。 */
    if (focused && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            if (!target.isConnected || document.activeElement !== target || target.closest("[hidden], [inert]"))
                return;
            const box = target.getBoundingClientRect();
            const wrap = target.closest(".table-wrap")?.getBoundingClientRect();
            const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
            const top = Math.max(0, headerBottom, wrap?.top ?? 0), bottom = Math.min(window.innerHeight, wrap?.bottom ?? window.innerHeight);
            const left = Math.max(0, wrap?.left ?? 0), right = Math.min(window.innerWidth, wrap?.right ?? window.innerWidth);
            if (box.top < top - 1 || box.bottom > bottom + 1 || box.left < left - 1 || box.right > right + 1)
                target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        }));
    }
    return focused;
}

export function responsivePageSize() { return window.innerWidth < 768 ? 5 : 20; }

export function downloadCsvText(csv: string, filename: string) {
    /* ﻿ 让 Excel 正确识别 UTF-8 */
    downloadTextFile("﻿" + csv, filename, "text/csv;charset=utf-8");
}

export function downloadTextFile(text: string, filename: string, mime: string = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* 触屏设备且浏览器支持系统分享面板时优先用它分享；桌面和不支持的浏览器复制链接。 */
export function canNativeShare() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function" &&
        typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export async function copyTextToClipboard(text: string) {
    let ok = false;
    try {
        await navigator.clipboard.writeText(text);
        ok = true;
    }
    catch (e) {
        /* 剪贴板接口不可用时降级：隐藏 textarea + execCommand */
        const previousFocus = document.activeElement;
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        /* 原生模态窗口会让 body 内其它节点 inert；权益和比较窗口都在当前窗口内选择文本。 */
        const dialogs = [...qsa<HTMLDialogElement>("dialog")].filter((dlg) => dlg.open === true || dlg.getAttribute("open") != null);
        const focusedDialog = previousFocus ? previousFocus.closest("dialog") : null;
        const host = focusedDialog && dialogs.includes(focusedDialog) ? focusedDialog : dialogs[dialogs.length - 1] || document.body;
        host.appendChild(ta);
        ta.select();
        try {
            ok = document.execCommand("copy");
        }
        catch (e2) {
            ok = false;
        }
        ta.remove();
        focusTableControl(previousFocus);
    }
    return ok;
}

/* ---------- 并排对比：数据表内勾选 2–4 档，URL（cmp=）可分享 ---------- */
let cmpBackgroundState: { el: Element; inert: string | null; ariaHidden: string | null }[] = [];

export function isCmpModalOpen() {
    const dlg = byId<HTMLDialogElement>("cmpModal");
    return !!dlg && (dlg.open === true || dlg.getAttribute("open") != null);
}

export function cmpFocusableElements() {
    return modalFocusableElements(byId("cmpModal"));
}

/** 窗口内当前可用 Tab 到达的控件：跳过停用、隐藏、inert 以及收起的 details 里除 summary 外的内容。 */
export function modalFocusableElements(dlg: Element | null) {
    if (!dlg)
        return [];
    return [...dlg.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")].filter((el) => {
        if ((el as HTMLButtonElement).disabled || el.hidden || el.tabIndex < 0 || el.closest("[hidden], [inert]"))
            return false;
        for (let parent = el.parentElement; parent && parent !== dlg; parent = parent.parentElement) {
            if (parent.tagName === "DETAILS" && !(parent as HTMLDetailsElement).open) {
                const summary = parent.querySelector("summary");
                if (!summary || (el !== summary && !summary.contains(el)))
                    return false;
            }
        }
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && el.getClientRects().length > 0;
    });
}

/* 没有原生 dialog 的浏览器：打开对比时把 body 下其余元素设为 inert，关闭时精确还原原来的属性。 */
export function setCmpBackgroundInert(on: boolean) {
    if (on) {
        if (cmpBackgroundState.length)
            return;
        const dlg = byId("cmpModal"), backdrop = byId("cmpBackdrop");
        cmpBackgroundState = Array.from(document.body.children).filter((el) => el !== dlg && el !== backdrop && !/^(SCRIPT|STYLE)$/.test(el.tagName))
            .map((el) => ({ el, inert: el.getAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden") }));
        cmpBackgroundState.forEach(({ el }) => { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
    }
    else {
        cmpBackgroundState.forEach(({ el, inert, ariaHidden }) => {
            if (inert == null)
                el.removeAttribute("inert");
            else
                el.setAttribute("inert", inert);
            if (ariaHidden == null)
                el.removeAttribute("aria-hidden");
            else
                el.setAttribute("aria-hidden", ariaHidden);
        });
        cmpBackgroundState = [];
    }
}
