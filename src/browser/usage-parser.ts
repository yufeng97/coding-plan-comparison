import { parseUsageExport, type UsageSummary } from "../domain/usage-import";

/* 会话日志可达数十 MB，在主线程逐行 JSON.parse 会卡住页面：超过 1MB 的内容交给 Worker 解析。
 * 不支持 Worker、Worker 启动或运行失败时退回主线程解析，结果与错误说明相同。 */
const WORKER_THRESHOLD = 1024 * 1024;

type WorkerReply = { ok: true; usage: UsageSummary } | { ok: false; message: string };

export function parseUsageInBackground(texts: readonly string[]): Promise<UsageSummary> {
    const size = texts.reduce((sum, text) => sum + text.length, 0);
    const inline = () => Promise.resolve().then(() => parseUsageExport(texts));
    if (size < WORKER_THRESHOLD || typeof Worker !== "function")
        return inline();
    let worker: Worker;
    try {
        worker = new Worker(new URL("./usage-parse-worker.ts", import.meta.url), { type: "module" });
    }
    catch {
        return inline();
    }
    return new Promise<UsageSummary>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
            worker.terminate();
            if (event.data.ok)
                resolve(event.data.usage);
            else
                reject(new Error(event.data.message));
        };
        worker.onerror = (event) => {
            event.preventDefault();
            worker.terminate();
            inline().then(resolve, reject);
        };
        worker.postMessage([...texts]);
    });
}
