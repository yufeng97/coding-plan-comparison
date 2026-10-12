

/* 章节导航与历史恢复在 startup 里实现；业务模块经这两个钩子调用，避免反向依赖页面启动代码。 */
export const navigationHooks: {
    navigate?: (hash: string, updateHistory?: boolean, moveFocus?: boolean, allowInitialLayout?: boolean) => void;
    restore?: (search: string | Event, restoreAnchor?: boolean) => void;
} = {};

export function navigateToSection(hash: string, updateHistory?: boolean, moveFocus?: boolean, allowInitialLayout?: boolean) { navigationHooks.navigate?.(hash, updateHistory, moveFocus, allowInitialLayout); }

export function restoreHistoryState(search: string | Event, restoreAnchor?: boolean) { navigationHooks.restore?.(search, restoreAnchor); }
