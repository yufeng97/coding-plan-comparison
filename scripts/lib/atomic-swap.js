"use strict";
const fs = require("node:fs");
const RENAME_RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
/* Windows 文件索引/扫描可短暂占用刚写出的目录；每次改名最多 5 次，等待合计 375ms。 */
const RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200];
const renameWait = new Int32Array(new SharedArrayBuffer(4));

/** @param {(from:string,to:string)=>void} rename */
function renameWithRetry(from, to, rename) {
  for (let attempt = 0; ; attempt++) {
    try { rename(from, to); return; }
    catch (error) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (delay == null || !RENAME_RETRY_CODES.has(error && error.code)) throw error;
      /* 调用方是同步构建 CLI；等待期间不提前清理 stage/backup，也不改变回滚判断。 */
      Atomics.wait(renameWait, 0, 0, delay);
    }
  }
}

/**
 * 目录级原子交换：旧产物整体移入 backup，stage 改名到位；切换失败把旧产物移回。
 * backup 必须是调用方 mkdtemp 出来的空目录路径（这里先 rmdir 腾出改名目标位置）。
 * @param {{
 *   stage: string,
 *   backup: string,
 *   destination: string,
 *   rename?: (from: string, to: string) => void,
 *   removeOwned: (dir: string) => void,
 * }} options
 *   rename 仅供失败注入测试；removeOwned 清理调用方自己的暂存路径并自校验归属。
 */
function swapDirectory({ stage, backup, destination, rename = fs.renameSync, removeOwned }) {
  let previous = false, committed = false;
  try {
    fs.rmdirSync(backup);
    if (fs.existsSync(destination)) { renameWithRetry(destination, backup, rename); previous = true; }
    try { renameWithRetry(stage, destination, rename); committed = true; }
    catch (error) {
      if (previous) {
        try { renameWithRetry(backup, destination, rename); previous = false; }
        catch (restoreError) {
          throw new AggregateError([error, restoreError], "目录切换和回滚均失败，旧目录备份保留在：" + backup);
        }
      }
      throw error;
    }
  } finally {
    if (!committed) removeOwned(stage);
    if (!previous || committed) removeOwned(backup);
  }
}

module.exports = { swapDirectory };
