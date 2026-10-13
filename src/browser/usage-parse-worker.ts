/* 用量导入的后台解析：收到若干份文件文本，返回合并后的用量摘要或错误说明。只依赖不含价格目录的解析模块。 */
import { parseUsageExport } from "../domain/usage-import";

type WorkerScope = { onmessage: ((event: MessageEvent<string[]>) => void) | null; postMessage(message: unknown): void };
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
    try {
        scope.postMessage({ ok: true, usage: parseUsageExport(event.data) });
    }
    catch (error) {
        scope.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
};
