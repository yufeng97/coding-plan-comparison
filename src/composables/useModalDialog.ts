/* 降级模态窗口的共用流程：原生 <dialog>.showModal() 不可用时，用 open 属性 + 独立遮罩 +
 * 祖先链兄弟 inert 模拟；两种窗口（并排对比、套餐权益）原本各自实现且已偏移。
 * 焦点管理约定：打开时记住触发控件，关闭后回到它，不可用时退回各窗口的兜底控件。 */
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { focusTableControl, modalFocusableElements } from "@browser/interaction";

export interface ModalDialogOptions {
  dialog: Ref<HTMLDialogElement | null>;
  backdrop: Ref<HTMLElement | null>;
  /** 打开期间挂在 body 上的标记类（样式与回归测试按它识别窗口状态）。 */
  bodyClass: string;
  /** 打开后初始聚焦的控件。 */
  initialFocus: () => HTMLElement | null;
  /** 触发控件不可用时，关闭后的兜底聚焦控件。 */
  fallbackFocus: () => HTMLElement | null;
  /** 关闭前确认触发控件仍适合接收焦点（如打开按钮即将被停用而 DOM 尚未更新）。 */
  canReturnFocus?: (previous: Element | null) => boolean;
}

export function useModalDialog({ dialog, backdrop, bodyClass, initialFocus, fallbackFocus, canReturnFocus }: ModalDialogOptions) {
  let returnFocus: Element | null = null;
  let needsFocusRestore = false;
  let background: { element: Element; inert: string | null; hidden: string | null }[] = [];

  const isOpen = () => {
    const element = dialog.value;
    return !!element && (element.open === true || element.hasAttribute("open"));
  };
  const isFallback = () => !!dialog.value?.classList.contains("cmp-fallback");

  function makeBackgroundInert(element: Element) {
    // 沿祖先链逐层隐藏兄弟分支，保留窗口所在的祖先路径可用。
    let branch: Element | null = element;
    while (branch?.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling === branch || sibling === backdrop.value || /^(SCRIPT|STYLE|TEMPLATE)$/.test(sibling.tagName)) continue;
        background.push({ element: sibling, inert: sibling.getAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
        sibling.setAttribute("inert", ""); sibling.setAttribute("aria-hidden", "true");
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
  }
  function restoreBackground() {
    for (const entry of background) {
      if (entry.inert == null) entry.element.removeAttribute("inert"); else entry.element.setAttribute("inert", entry.inert);
      if (entry.hidden == null) entry.element.removeAttribute("aria-hidden"); else entry.element.setAttribute("aria-hidden", entry.hidden);
    }
    background = [];
  }

  function restoreFocus() {
    if (!needsFocusRestore) return;
    needsFocusRestore = false;
    const previous = returnFocus; returnFocus = null;
    if ((canReturnFocus?.(previous) ?? true) && previous && focusTableControl(previous)) return;
    focusTableControl(fallbackFocus());
  }

  /* 幂等：原生 close 事件与调用方的同步收尾可能各进一次。 */
  function finishClose() {
    if (backdrop.value) backdrop.value.hidden = true;
    dialog.value?.removeAttribute("aria-modal");
    document.body.classList.remove(bodyClass);
    restoreBackground();
    restoreFocus();
  }

  /** 打开窗口；已打开时不动作（各窗口自行处理「已打开」分支）。 */
  function open(returnFocusTarget?: HTMLElement | null) {
    const element = dialog.value;
    if (!element || isOpen()) return;
    const active = document.activeElement;
    returnFocus = returnFocusTarget ?? (active && active !== document.body && !element.contains(active) ? active : null);
    needsFocusRestore = true;
    const fallback = typeof element.showModal !== "function";
    element.classList.toggle("cmp-fallback", fallback);
    element.setAttribute("aria-modal", "true");
    document.body.classList.add(bodyClass);
    if (!fallback) element.showModal();
    else { element.setAttribute("open", ""); if (backdrop.value) backdrop.value.hidden = false; makeBackgroundInert(element); }
    focusTableControl(initialFocus());
  }

  function close() {
    const element = dialog.value;
    if (!element || !isOpen()) return;
    if (!isFallback() && typeof element.close === "function") element.close();
    else element.removeAttribute("open");
    finishClose();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab" || !isFallback() || !isOpen()) return;
    const focusable = modalFocusableElements(dialog.value) as HTMLElement[];
    const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement as HTMLElement | null;
    if (!first) { event.preventDefault(); focusTableControl(dialog.value); }
    else if (event.shiftKey && active === first || !event.shiftKey && active === last || !active || !focusable.includes(active)) { event.preventDefault(); focusTableControl(event.shiftKey ? last : first); }
  }

  /* 点在窗口框外（遮罩上）关闭。降级模式的遮罩是单独元素，已绑定 close。 */
  function outsideClick(event: MouseEvent) {
    const element = dialog.value;
    if (!element || event.target !== element) return;
    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }

  /* 降级模式没有原生焦点圈禁：焦点被程序化移出窗口时拉回初始控件。 */
  function guardFocus(event: FocusEvent) {
    if (!isFallback() || !isOpen()) return;
    const element = dialog.value;
    if (element && !element.contains(event.target as Node)) focusTableControl(initialFocus());
  }

  onMounted(() => document.addEventListener("focusin", guardFocus));
  onBeforeUnmount(() => { close(); document.removeEventListener("focusin", guardFocus); });

  return { isOpen, isFallback, open, close, finishClose, keydown, outsideClick, guardFocus };
}
