import { themeView, type ThemeMode } from '../state/app';

import { refreshPalette } from './charts/host';
import { qsa } from './dom';

/* ---------- 明暗主题切换（暗 → 亮 → 跟随系统 循环） ---------- */

const THEME_KEY = "cp-theme";

const isThemeMode = (value: unknown): value is ThemeMode => value === "dark" || value === "light" || value === "system";

export let themeMode: ThemeMode = "system";

export function readThemeMode(): ThemeMode {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return isThemeMode(saved) ? saved : "system";
    }
    catch (e) {
        return "system";
    }
}

export function applyTheme(requested: string) {
    const mode = isThemeMode(requested) ? requested : "system";
    themeMode = mode;
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const eff = mode === "system" ? (sysDark ? "dark" : "light") : mode;
    themeView.mode = mode;
    themeView.effective = eff;
    document.documentElement.dataset.theme = eff;
    document.documentElement.dataset.themeMode = mode;
    try {
        localStorage.setItem(THEME_KEY, mode);
    }
    catch (e) { /* 存储受限只影响回访记忆。 */ }
    refreshPalette();
    const browserColor = (getComputedStyle(document.documentElement).getPropertyValue("--paper") || "").trim()
        || (eff === "dark" ? "#131511" : "#fbfbf8");
    /* 两个带系统 media 的标签都写实际主题色，手动选择主题也能更新浏览器外观。 */
    qsa('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", browserColor));
}
