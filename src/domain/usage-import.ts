/* 真实用量导入：解析 ccusage 的 --json 输出与 Claude Code / Codex 的 JSONL 会话日志，只读取 token 计数、日期和模型名。
 * 不依赖价格目录，可在 Web Worker 里运行（src/browser/usage-parse-worker.ts）；文件较大时页面在后台解析，避免卡住界面。 */

export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  activeDays: number;
  spanDays: number;
  months: number;
  inputShare: number;
  cacheRate: number;
  /** 用量最多的模型（日志的模型 ID 或 ccusage 只含一个模型的记录）；没有模型名时为空。 */
  model: string;
  /** 该模型占全部 tokens 的比例（0–1）。 */
  modelShare: number;
}

export const USAGE_IMPORT_MAX = 30 * 1024 * 1024;
export const USAGE_IMPORT_TOO_LARGE = "内容超过 30MB，请改用 ccusage 导出的按日 JSON（npx ccusage daily --json）。";

/** ccusage 记录与会话日志折出的逐条记录中读取的字段（各版本字段不全）。 */
type UsageRecord = { inputTokens?: unknown; outputTokens?: unknown; cacheReadTokens?: unknown; cacheCreationTokens?: unknown; cachedInputTokens?: unknown; date?: unknown; month?: unknown; model?: unknown; modelsUsed?: unknown };

const objectOrNull = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : null;

/* Claude Code（~/.claude/projects）与 Codex（~/.codex/sessions）的 JSONL 会话日志，折成与 ccusage 相同字段的逐条记录。
   Claude Code 会把同一次回复按流式片段重复写入，与 ccusage 一样按消息 ID + 请求 ID 去重；
   Codex 在限额信息更新时会重复发出 token_count，累计用量未变的事件不重复计入。 */
function usageRowsFromLog(text: string, seen: Set<string>): UsageRecord[] {
    const rows: UsageRecord[] = [];
    let parsed = 0, codexTotal = "", codexModel = "", codexSession = "";
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim())
            continue;
        let parsedLine: unknown;
        try {
            parsedLine = JSON.parse(line);
        }
        catch {
            continue;
        }
        parsed++;
        const event = objectOrNull(parsedLine);
        if (!event)
            continue;
        const date = typeof event.timestamp === "string" ? event.timestamp.slice(0, 10) : "";
        const message = objectOrNull(event.message), usage = message ? objectOrNull(message.usage) : null;
        if (message && usage) {
            const id = message.id && event.requestId ? `${message.id}:${event.requestId}` : "";
            if (id && seen.has(id))
                continue;
            if (id)
                seen.add(id);
            rows.push({ date, model: typeof message.model === "string" ? message.model : "", inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
                cacheCreationTokens: usage.cache_creation_input_tokens, cacheReadTokens: usage.cache_read_input_tokens });
            continue;
        }
        const payload = objectOrNull(event.payload) ?? {};
        if (event.type === "session_meta" && typeof payload.id === "string") {
            if (codexSession !== payload.id) {
                codexTotal = "";
                codexModel = "";
            }
            codexSession = payload.id;
        }
        if (event.type === "turn_context" && typeof payload.model === "string")
            codexModel = payload.model;
        const info = payload.type === "token_count" ? objectOrNull(payload.info) : null;
        if (!info || !info.last_token_usage)
            continue;
        const total = JSON.stringify(info.total_token_usage || null);
        if (info.total_token_usage && total === codexTotal)
            continue;
        codexTotal = total;
        /* 同一会话的累计快照可在备份/重叠文件中再次出现；不同会话的相同计数不能合并。
           缺少会话身份时只作文件内去重，不猜测两份日志是否属于同一次会话。 */
        if (codexSession && info.total_token_usage) {
            const id = JSON.stringify(["codex", codexSession, total]);
            if (seen.has(id))
                continue;
            seen.add(id);
        }
        const last = info.last_token_usage as Record<string, unknown>;
        rows.push({ date, model: codexModel, inputTokens: last.input_tokens, cachedInputTokens: last.cached_input_tokens, outputTokens: last.output_tokens });
    }
    if (!parsed)
        throw new Error("不是有效的 JSON 或 JSONL：请粘贴 ccusage 的 --json 输出，或 Claude Code / Codex 的会话日志。");
    return rows;
}

/* 兼容 ccusage 不同版本与子命令的 JSON：{daily:[…]}、{monthly:[…]}、{type, data:[…]}、{projects:{名称:[…]}}、直接数组；
   其余内容按 JSONL 会话日志解析。可传入多份文件的文本，合并统计。
   只读取 token 计数、日期 / 月份和模型名。Claude 记录的缓存读写与输入分开计；Codex 的缓存输入计在输入之内。 */
export function parseUsageExport(texts: string | readonly string[]): UsageSummary {
    const sources = (typeof texts === "string" ? [texts] : texts).map(String);
    if (sources.reduce((n, text) => n + text.length, 0) > USAGE_IMPORT_MAX)
        throw new Error(USAGE_IMPORT_TOO_LARGE);
    const seen = new Set<string>();
    const rows = sources.flatMap((source): unknown[] => {
        let json: unknown;
        try {
            json = JSON.parse(source);
        }
        catch {
            return usageRowsFromLog(source, seen);
        }
        const record = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : null;
        /* 只有一行的会话日志本身就是合法 JSON。 */
        if (record && (record.message || record.payload || record.type === "turn_context"))
            return usageRowsFromLog(source, seen);
        return Array.isArray(json) ? json
            : !record ? []
                : Array.isArray(record.daily) ? record.daily
                    : Array.isArray(record.monthly) ? record.monthly
                        : Array.isArray(record.data) ? record.data
                            : Array.isArray(record.sessions) ? record.sessions
                                : record.projects && typeof record.projects === "object" ? Object.values(record.projects).filter(Array.isArray).flat() : [];
    });
    const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
    const days = new Set<string>(), months = new Set<string>(), byModel = new Map<string, number>();
    for (const item of rows) {
        if (!item || typeof item !== "object")
            continue;
        const row = item as UsageRecord;
        const rowInput = count(row.inputTokens), rowOutput = count(row.outputTokens);
        const read = count(row.cacheReadTokens), write = count(row.cacheCreationTokens), cached = count(row.cachedInputTokens);
        /* Codex 的 cachedInputTokens 是输入的子集；Claude 的缓存读写不含在 inputTokens 里。 */
        const codexCached = !row.cacheReadTokens && cached > 0 && cached <= rowInput;
        const rowAll = (codexCached ? rowInput : rowInput + read + write + (cached > rowInput ? cached : 0)) + rowOutput;
        input += rowAll - rowOutput;
        cacheRead += codexCached ? cached : read + (cached > rowInput ? cached : 0);
        cacheWrite += write;
        output += rowOutput;
        /* ccusage 的 modelsUsed 只有一项时才能归到单一模型。 */
        const models = Array.isArray(row.modelsUsed) ? row.modelsUsed : [];
        const model = typeof row.model === "string" && row.model ? row.model : models.length === 1 && typeof models[0] === "string" ? models[0] : "";
        if (model && rowAll > 0)
            byModel.set(model, (byModel.get(model) || 0) + rowAll);
        const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(date))
            days.add(date);
        const month = typeof row.month === "string" ? row.month.slice(0, 7) : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}-\d{2}$/.test(month))
            months.add(month);
    }
    if (days.size && months.size)
        throw new Error("不能混合按日记录与按月记录：请分别导入，或将所有文件统一导出为 ccusage daily --json 后再合并。");
    const total = input + output;
    if (!(total > 0))
        throw new Error("没有读到 token 用量；请确认粘贴的是 ccusage daily 或 monthly 的 --json 输出，或含 token 记录的会话日志。");
    const sortedDays = [...days].sort();
    const spanDays = sortedDays.length ? Math.round((Date.parse(sortedDays[sortedDays.length - 1] + "T00:00:00Z") - Date.parse(sortedDays[0] + "T00:00:00Z")) / 86400000) + 1 : 0;
    const top = [...byModel].sort((a, b) => b[1] - a[1])[0];
    return { input, output, cacheRead, cacheWrite, total, activeDays: days.size, spanDays, months: months.size,
        inputShare: input / total * 100, cacheRate: input > 0 ? cacheRead / input * 100 : 0,
        model: top ? top[0] : "", modelShare: top ? top[1] / total : 0 };
}
