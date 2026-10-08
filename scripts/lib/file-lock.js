"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

/**
 * Existing locks, including abandoned or corrupt ones, require manual inspection.
 * Removing a stale lock after probing its PID can delete a concurrent owner's new lock.
 * @param {string} filename
 * @param {{busyMessage?:string}} options
 * @returns {()=>void}
 */
function acquireFileLock(filename, options = {}) {
  const file = path.resolve(filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let handle;
  try { handle = fs.openSync(file, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error((options.busyMessage || "操作正在进行或存在遗留锁") + "（" + file + "）；请稍后重试。遗留锁须人工检查，确认没有相关进程后再清理");
  }
  const ownerId = randomUUID();
  try {
    fs.writeFileSync(handle, JSON.stringify({ ownerId, pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() }));
  } catch (error) {
    // An incomplete lock is safer to retain than removing a path whose owner is unknown.
    fs.closeSync(handle);
    throw new Error("锁初始化失败，保留锁文件供人工检查：" + file, { cause: error });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fs.closeSync(handle);
    let current;
    try {
      if (!fs.lstatSync(file).isFile()) throw new Error("锁路径已被替换");
      current = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error("锁文件丢失或损坏，未清理未知所有者的锁：" + file, { cause: error });
    }
    if (current?.ownerId !== ownerId) throw new Error("锁所有权已变化，保留当前所有者的锁：" + file);
    fs.unlinkSync(file);
  };
}

/** Preserve both the action failure and any ownership error raised during cleanup. */
function releaseAfter(release, failed, failure) {
  try { release(); }
  catch (error) {
    if (failed) throw new AggregateError([failure, error], "操作失败且锁未能安全释放；请检查保留的锁");
    throw error;
  }
}

/** @template T @param {string} file @param {()=>Promise<T>|T} action @param {{busyMessage?:string}} options @returns {Promise<T>} */
async function withFileLock(file, action, options = {}) {
  const release = acquireFileLock(file, options);
  let failed = false, failure;
  try { return await action(); }
  catch (error) { failed = true; failure = error; throw error; }
  finally { releaseAfter(release, failed, failure); }
}

/** @template T @param {string} file @param {()=>T} action @param {{busyMessage?:string}} options @returns {T} */
function withFileLockSync(file, action, options = {}) {
  const release = acquireFileLock(file, options);
  let failed = false, failure;
  try { return action(); }
  catch (error) { failed = true; failure = error; throw error; }
  finally { releaseAfter(release, failed, failure); }
}

module.exports = { acquireFileLock, withFileLock, withFileLockSync };
