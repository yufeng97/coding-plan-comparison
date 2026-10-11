

/* 分享、常用条件、完整权益与工作量计算；纯静态运行，不发送或上传用户输入。 */

export const PRESET_KEY = "cp-filter-preset-v1";

/** 本机保存的常用条件（查询串）；格式不对或存储不可用时返回 null。 */
export function readPreset(): { version: 1; query: string } | null {
    try {
        const p = JSON.parse(localStorage.getItem(PRESET_KEY) || "null");
        return p && p.version === 1 && typeof p.query === "string" && p.query.length <= 16000 ? p : null;
    }
    catch (err) {
        return null;
    }
}

/** Storage failures are reported by the action that initiated the write. */
export function writePreset(query: string) {
    localStorage.setItem(PRESET_KEY, JSON.stringify({ version: 1, query }));
}
export function clearStoredPreset() {
    /* An explicit null also works with restricted-storage test doubles. */
    localStorage.setItem(PRESET_KEY, 'null');
}
