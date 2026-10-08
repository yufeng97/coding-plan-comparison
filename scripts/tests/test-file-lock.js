"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const { acquireFileLock, withFileLock, withFileLockSync } = require("../lib/file-lock");

let passed = 0;
async function test(label, action) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-lock-test-"));
  try { await action(path.join(dir, ".test.lock")); passed++; console.log("  ✓ " + label); }
  finally {
    if (path.dirname(dir) !== fs.realpathSync(os.tmpdir()) || !path.basename(dir).startsWith("coding-plan-lock-test-")) throw new Error("未知锁测试目录");
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Two independent processes can both attempt the same abandoned lock. */
function contender(file) {
  return new Promise((resolve, reject) => {
    const code = `
      const {acquireFileLock}=require(${JSON.stringify(require.resolve("../lib/file-lock"))});
      try { const release=acquireFileLock(process.argv[1]); release(); process.stdout.write("acquired"); }
      catch(error) { if(!error.message.includes("人工检查")) throw error; process.stdout.write("blocked"); }
    `;
    const child = spawn(process.execPath, ["-e", code, file], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", bytes => { output += bytes; });
    child.stderr.on("data", bytes => { errors += bytes; });
    const timeout = setTimeout(() => child.kill(), 10000);
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      if (status !== 0 || signal) reject(new Error("锁竞争子进程失败：" + errors + (signal || status)));
      else resolve(output);
    });
  });
}

async function main() {
  await test("正常初始化后立即释放句柄，保留锁路径供所有者校验", file => {
    const nativeWrite = fs.writeFileSync;
    let handle = -1, release;
    try {
      fs.writeFileSync = (target, data, options) => {
        if (typeof target === "number") handle = target;
        return nativeWrite(target, data, options);
      };
      release = acquireFileLock(file);
      assert.ok(handle >= 0);
      assert.throws(() => fs.fstatSync(handle), error => error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === "EBADF");
      assert.equal(fs.existsSync(file), true);
    } finally { fs.writeFileSync = nativeWrite; release?.(); }
    assert.equal(fs.existsSync(file), false);
  });
  await test("初始化写入或关闭失败不进入业务，仍尝试关闭句柄并保留全部错误", file => {
    const nativeWrite = fs.writeFileSync, nativeClose = fs.closeSync;
    for (const failed of ["write", "close", "both"]) {
      const writeFailure = new Error("injected metadata write failure"), closeFailure = new Error("injected descriptor close failure");
      let handle = -1, closeCalls = 0, entered = false;
      try {
        fs.writeFileSync = (target, data, options) => {
          if (typeof target === "number") {
            handle = target;
            if (failed !== "close") throw writeFailure;
          }
          return nativeWrite(target, data, options);
        };
        fs.closeSync = target => {
          closeCalls++;
          nativeClose(target);
          if (failed !== "write") throw closeFailure;
        };
        assert.throws(() => withFileLockSync(file, () => { entered = true; }), error => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /锁初始化失败/);
          if (failed === "both") {
            assert.ok(error.cause instanceof AggregateError);
            assert.deepEqual(error.cause.errors, [writeFailure, closeFailure]);
          } else assert.equal(error.cause, failed === "write" ? writeFailure : closeFailure);
          return true;
        });
      } finally { fs.writeFileSync = nativeWrite; fs.closeSync = nativeClose; }
      assert.equal(entered, false); assert.equal(closeCalls, 1);
      assert.throws(() => fs.fstatSync(handle), error => error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === "EBADF");
      assert.equal(fs.existsSync(file), true);
      assert.throws(() => acquireFileLock(file), /人工检查/);
      fs.unlinkSync(file);
    }
  });
  await test("锁记录唯一所有者，正常释放幂等且不删除后来的锁", file => {
    const release = acquireFileLock(file), original = fs.readFileSync(file);
    const metadata = JSON.parse(original.toString());
    assert.equal(metadata.pid, process.pid); assert.equal(metadata.hostname, os.hostname());
    assert.match(metadata.ownerId, /^[a-f\d-]{36}$/);
    assert.throws(() => acquireFileLock(file), /人工检查/);
    assert.deepEqual(fs.readFileSync(file), original);
    release(); assert.equal(fs.existsSync(file), false);
    const nextRelease = acquireFileLock(file), next = fs.readFileSync(file);
    assert.notEqual(JSON.parse(next.toString()).ownerId, metadata.ownerId);
    release(); assert.deepEqual(fs.readFileSync(file), next);
    nextRelease(); assert.equal(fs.existsSync(file), false);
  });
  await test("异步与同步操作成功及抛错都释放自己的锁，保留返回值与原始错误", async file => {
    assert.equal(await withFileLock(file, async () => "async result"), "async result");
    assert.equal(fs.existsSync(file), false);
    const asyncFailure = new Error("async action failed");
    await assert.rejects(withFileLock(file, async () => { throw asyncFailure; }), error => error === asyncFailure);
    assert.equal(fs.existsSync(file), false);
    assert.equal(withFileLockSync(file, () => "sync result"), "sync result");
    assert.equal(fs.existsSync(file), false);
    const syncFailure = new Error("sync action failed");
    assert.throws(() => withFileLockSync(file, () => { throw syncFailure; }), error => error === syncFailure);
    assert.equal(fs.existsSync(file), false);
  });
  await test("两个独立进程同时遇到已退出进程的锁均拒绝，不改锁或进入临界区", async file => {
    const exited = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    assert.equal(exited.status, 0);
    const stale = JSON.stringify({ pid: Number(exited.stdout), hostname: os.hostname(), startedAt: "2026-10-08T00:00:00Z" });
    fs.writeFileSync(file, stale);
    assert.deepEqual(await Promise.all([contender(file), contender(file)]), ["blocked", "blocked"]);
    assert.equal(fs.readFileSync(file, "utf8"), stale);
  });
  await test("关闭句柄后真实子进程仍被活动锁阻挡，正常释放后可重新取得锁", async file => {
    const release = acquireFileLock(file), original = fs.readFileSync(file);
    try {
      assert.equal(await contender(file), "blocked");
      assert.deepEqual(fs.readFileSync(file), original);
    } finally { release(); }
    assert.equal(await contender(file), "acquired");
    assert.equal(fs.existsSync(file), false);
  });
  await test("损坏和未知格式的既有锁也保留供人工检查", file => {
    for (const bytes of ["corrupt lock", JSON.stringify({ pid: 0 }), ""]) {
      fs.writeFileSync(file, bytes);
      assert.throws(() => acquireFileLock(file), /人工检查/);
      assert.equal(fs.readFileSync(file, "utf8"), bytes);
    }
  });
  await test("同一PID重新取得锁后，旧所有者释放不能删除新所有者的锁", file => {
    const oldRelease = acquireFileLock(file);
    fs.unlinkSync(file);
    const newRelease = acquireFileLock(file), replacement = fs.readFileSync(file);
    try {
      assert.throws(oldRelease, /所有权已变化/);
      assert.deepEqual(fs.readFileSync(file), replacement);
      assert.throws(() => acquireFileLock(file), /人工检查/);
    } finally { newRelease(); }
    assert.equal(fs.existsSync(file), false);
  });
  await test("锁在执行中损坏或消失时报告所有权问题，保留损坏内容", file => {
    const release = acquireFileLock(file);
    fs.writeFileSync(file, "replacement is corrupt");
    assert.throws(release, /丢失或损坏/);
    assert.equal(fs.readFileSync(file, "utf8"), "replacement is corrupt");
    fs.unlinkSync(file);
    const missingRelease = acquireFileLock(file);
    fs.unlinkSync(file);
    assert.throws(missingRelease, /丢失或损坏/);
  });
  await test("业务失败同时失去锁所有权时保留两项错误和另一所有者的锁", async file => {
    const failure = new Error("action failed before cleanup"), replacement = JSON.stringify({ ownerId: "another-owner", pid: process.pid });
    await assert.rejects(withFileLock(file, async () => { fs.writeFileSync(file, replacement); throw failure; }), error => {
      assert.ok(error instanceof AggregateError); assert.equal(error.errors[0], failure);
      assert.match(error.errors[1].message, /所有权已变化/); return true;
    });
    assert.equal(fs.readFileSync(file, "utf8"), replacement);
    fs.unlinkSync(file);
    assert.throws(() => withFileLockSync(file, () => { fs.writeFileSync(file, replacement); throw failure; }), error => {
      assert.ok(error instanceof AggregateError); assert.equal(error.errors[0], failure); return true;
    });
    assert.equal(fs.readFileSync(file, "utf8"), replacement);
  });
  console.log("文件锁回归通过：" + passed + " 项");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
