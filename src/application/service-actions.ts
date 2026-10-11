import { serviceUiState } from '../state/app';
import { readPreset, writePreset, clearStoredPreset } from '../browser/presets';
import { appQueryString, syncUrl, currentResultsUrl, pushQueryHistory } from '../browser/url-state';
import { pickerSummaryText } from '../state/picker';
import { restoreHistoryState } from './navigation';
import { copyTextToClipboard } from '../browser/interaction';

/* 「帮我选」下方的操作栏（ServiceActions.vue）：复制方案链接与推荐摘要、在本机保存或恢复常用条件，提示写在 #serviceFeedback。 */

export function serviceFeedback(message: string) {
    serviceUiState.feedback = String(message);
}

export function syncPresetButtons() {
    serviceUiState.presetSaved = !!readPreset();
}

/* 推荐摘要是纯文本，方便贴到聊天或文档；链接带上当前条件并回到「帮我选」。 */
export async function copyPickerSummary() {
    const query = appQueryString();
    const url = currentResultsUrl(query, "#quick");
    const ok = await copyTextToClipboard(pickerSummaryText(url));
    serviceFeedback(ok ? "已复制推荐摘要，可直接粘贴到聊天或文档；价格以官网为准。" : "复制失败，请改用「复制当前方案链接」。");
}

export async function shareCurrentResults() {
    const query = appQueryString();
    const url = currentResultsUrl(query);
    const ok = await copyTextToClipboard(url);
    serviceFeedback(ok ? "已复制当前方案链接，包含筛选、对比与费用计算条件。" : "复制失败，请从地址栏复制当前链接。");
}

export function savePreset() {
    const query = appQueryString();
    if (query.length > 16000) {
        serviceFeedback("筛选条件过长，请缩短搜索词后再保存。");
        return;
    }
    try {
        writePreset(query);
        syncPresetButtons();
        serviceFeedback("已在本机保存当前筛选、对比和计算条件。");
    }
    catch (err) {
        serviceFeedback("浏览器无法保存本地条件，仍可复制方案链接。");
    }
}

export function restorePreset() {
    const preset = readPreset();
    if (!preset) {
        syncPresetButtons();
        serviceFeedback("没有可恢复的条件，请先保存。");
        return;
    }
    const query = preset.query ? "?" + preset.query : "";
    try {
        pushQueryHistory(query);
    }
    catch (err) { /* 地址栏不可写时仍在本页恢复条件。 */ }
    restoreHistoryState(query, false);
    syncUrl();
    serviceFeedback("已恢复常用条件。");
}

export function clearPreset() {
    try {
        /* 空值与删除等效，兼容受限存储和页面测试替身。 */
        clearStoredPreset();
        syncPresetButtons();
        serviceFeedback("已删除本机保存的条件。");
    }
    catch (err) {
        serviceFeedback("浏览器不允许修改本地保存的条件。");
    }
}
