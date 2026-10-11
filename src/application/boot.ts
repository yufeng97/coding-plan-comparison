/* ---------- 初始化与恢复的每一步单独容错：单块失败不阻断其余区块 ---------- */
export function boot(name: string, fn: () => unknown) {
    try {
        fn();
        return true;
    }
    catch (err) {
        console.error("[render] " + name, err);
        return false;
    }
}
