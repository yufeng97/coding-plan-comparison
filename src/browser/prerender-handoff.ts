/* 挂载会清空预渲染的 #app 再重建。脚本到达前用户已展开的折叠、已聚焦的控件和已改动的输入，在挂载后找回。
 * 只处理默认首屏（没有页面状态参数）：此时客户端结构与预渲染一致，折叠按文档顺序的序号即可对应，数量对不上就放弃；
 * 输入按 id 对应，只记与预渲染默认值不同的项。 */
export interface PrerenderHandoff { open: number[]; total: number; focusId: string; values: [id: string, value: string | boolean][] }

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const SKIPPED_INPUTS = new Set(["file", "button", "submit", "reset", "hidden", "image"]);
const isToggle = (control: FormControl): control is HTMLInputElement => control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio");

/** 用户在脚本到达前改过的值；未改动的控件交给挂载后的状态。 */
function changedValue(control: FormControl): string | boolean | null {
    if (control instanceof HTMLSelectElement) {
        const initial = Array.from(control.options).find((option) => option.defaultSelected) ?? control.options[0];
        return initial && control.value !== initial.value ? control.value : null;
    }
    if (isToggle(control))
        return control.checked !== control.defaultChecked ? control.checked : null;
    if (control instanceof HTMLInputElement && SKIPPED_INPUTS.has(control.type))
        return null;
    return control.value !== control.defaultValue ? control.value : null;
}

export function capturePrerenderState(root: HTMLElement | null): PrerenderHandoff | null {
    if (!root || !root.hasAttribute("data-prerendered") || document.documentElement.classList.contains("has-query"))
        return null;
    const details = Array.from(root.querySelectorAll("details"));
    const active = document.activeElement;
    const values = Array.from(root.querySelectorAll<FormControl>("input[id], select[id], textarea[id]")).flatMap((control): [string, string | boolean][] => {
        const value = changedValue(control);
        return value === null ? [] : [[control.id, value]];
    });
    return {
        open: details.flatMap((element, index) => element.open ? [index] : []),
        total: details.length,
        focusId: active instanceof HTMLElement && root.contains(active) ? active.id : "",
        values,
    };
}

/** 挂载后、启动前：找回折叠与焦点，章节导航据此计算位置。 */
export function restorePrerenderState(handoff: PrerenderHandoff | null, root: HTMLElement | null = document.getElementById("app")) {
    if (!handoff || !root || (!handoff.open.length && !handoff.focusId))
        return;
    const details = Array.from(root.querySelectorAll("details"));
    if (details.length === handoff.total)
        handoff.open.forEach((index) => details[index]?.setAttribute("open", ""));
    if (handoff.focusId)
        document.getElementById(handoff.focusId)?.focus({ preventScroll: true });
}

/** 启动后：把改过的输入写回并派发与用户操作相同的事件，由组件自己的处理函数更新状态与地址。 */
export function restorePrerenderInputs(handoff: PrerenderHandoff | null, root: HTMLElement | null = document.getElementById("app")) {
    if (!handoff || !root)
        return;
    for (const [id, value] of handoff.values) {
        const control = document.getElementById(id);
        if (!control || !root.contains(control) || !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || control.disabled)
            continue;
        if (isToggle(control)) {
            /* 单选组只需写回选中的一项：取消选中的那项由同组的 change 带走，不单独派发。 */
            if (typeof value !== "boolean" || control.checked === value || (control.type === "radio" && !value))
                continue;
            control.checked = value;
        }
        else {
            if (typeof value !== "string" || control.value === value)
                continue;
            const previous = control.value;
            control.value = value;
            /* 选项已不存在时浏览器会清空 select：恢复挂载后的值。 */
            if (control.value !== value) {
                control.value = previous;
                continue;
            }
        }
        const type = control instanceof HTMLSelectElement || isToggle(control) ? "change" : "input";
        control.dispatchEvent(new Event(type, { bubbles: true }));
    }
}
