#!/usr/bin/env node
"use strict";
/* 在独立 Node 进程里注入 spawnSync 结果，验证信号/异常不会造成 CI 假绿。 */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

for (const script of [require.resolve("./run"), require.resolve("../build/check-syntax")]) {
  for (const outcome of [
    { status: 0, signal: null, expected: 0 },
    { status: 7, signal: null, expected: 7 },
    { status: null, signal: "SIGKILL", expected: 1 },
    { status: null, signal: "SIGTERM", expected: 1 },
    { status: null, signal: null, expected: 1 },
    { status: null, signal: null, error: "runner spawn fixture failed", expected: 1 },
  ]) {
    const code = `
      const cp = require("node:child_process");
      const outcome = ${JSON.stringify(outcome)};
      let calls = 0;
      cp.spawnSync = () => {
        calls++;
        return { status: outcome.status, signal: outcome.signal,
          error: outcome.error ? new Error(outcome.error) : undefined };
      };
      process.on("exit", () => console.log("FIXTURE_CALLS=" + calls));
      require(${JSON.stringify(script)});
    `;
    const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 10000 });
    if (result.error) throw result.error;
    assert.equal(result.signal, null);
    assert.equal(result.status, outcome.expected, result.stderr);
    const calls = /FIXTURE_CALLS=(\d+)/.exec(result.stdout);
    assert.ok(calls);
    if (outcome.expected === 0) {
      assert.ok(Number(calls[1]) > 1);
      assert.match(result.stdout, /通过/);
    } else {
      assert.equal(Number(calls[1]), 1);
      assert.doesNotMatch(result.stdout, /通过/);
      if (outcome.signal) assert.ok(result.stderr.includes(outcome.signal));
      if (outcome.error) assert.ok(result.stderr.includes(outcome.error));
    }
  }
}
console.log("检查进程回归：正常退出、非零退出、信号终止、未知状态与启动失败全部通过");
