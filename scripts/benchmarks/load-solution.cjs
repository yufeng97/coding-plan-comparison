"use strict";
const path = require("node:path");
const { fork } = require("node:child_process");
const { MAX_BYTES, validateValue } = require("./solution-values.cjs");
// Only the independent checker can print its completion marker.
// Solutions retain local OS permissions; this is not a security sandbox.
module.exports = async function loadSolution(directory) {
  const child = fork(path.join(__dirname, "solution-worker.cjs"), [directory], {
    cwd: directory, silent: true, serialization: "advanced", detached: false,
  });
  let closed = false, sequence = 0, pending = null, outputBytes = 0;
  const failure = message => Object.assign(new Error(message), { code: "SOLUTION_WORKER" });
  function close() {
    if (closed) return;
    closed = true;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(failure("解答进程已结束"));
      pending = null;
    }
    if (child.connected) child.disconnect();
    child.kill();
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }
  function fail(error) {
    if (closed) return;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = null;
    }
    close();
  }
  child.on("error", error => fail(failure("解答进程失败：" + error.message)));
  child.on("exit", () => fail(failure("解答进程提前退出")));
  child.on("disconnect", () => { if (!closed) fail(failure("解答通信中断")); });
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", chunk => {
    outputBytes += chunk.length;
    if (outputBytes > MAX_BYTES) fail(failure("解答输出过大"));
  });
  child.on("message", message => {
    if (closed) return;
    if (!pending) { fail(failure("解答返回了额外消息")); return; }
    try { validateValue(message); }
    catch (error) { fail(failure(error.message)); return; }
    if (pending.id === 0 && message?.type === "ready" && Object.keys(message).length === 1) {
      const current = pending;
      pending = null; clearTimeout(current.timer); current.resolve(); return;
    }
    if (message?.id !== pending.id || !["return", "throw"].includes(message?.type) || Object.keys(message).length !== 3) {
      fail(failure("解答返回了无效消息")); return;
    }
    if (message.type === "throw" && (typeof message.message !== "string" || message.message.length > 2000)) {
      fail(failure("解答异常文本无效")); return;
    }
    if (message.type === "return" && !Object.hasOwn(message, "value")) {
      fail(failure("解答缺少返回值")); return;
    }
    const current = pending;
    pending = null; clearTimeout(current.timer);
    if (message.type === "throw") current.reject(Object.assign(new Error(message.message), { code: "SOLUTION_THROW" }));
    else current.resolve(message.value);
  });
  function wait(id, timeout = 1000) {
    return new Promise((resolve, reject) => {
      pending = { id, resolve, reject, timer: setTimeout(() => fail(failure("解答调用超时")), timeout) };
    });
  }
  await wait(0, 2000);
  return {
    async call(method, args) {
      if (closed || pending) throw failure("解答进程不可调用");
      if (!["default", "encode", "decode"].includes(method) || !Array.isArray(args) || args.length !== 1) throw failure("无效解答调用");
      validateValue(args);
      const id = ++sequence, result = wait(id);
      try {
        child.send({ type: "call", id, method, args }, error => {
          if (error) fail(failure("解答发送失败：" + error.message));
        });
      } catch (error) { fail(failure("解答发送失败：" + error.message)); }
      return result;
    },
    close,
  };
};
