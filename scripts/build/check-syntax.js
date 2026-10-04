#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..", "..");
const files = fs.readdirSync(path.join(root, "js")).filter((name) => name.endsWith(".js"));
/* js 目录为空几乎总是路径/检出错误：零检查不允许静默通过。scripts/ 的语法由 tsc checkJs 覆盖。 */
if (!files.length) throw new Error("js/ 目录没有任何页面脚本，请检查项目检出是否完整");
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, "js", file)], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    const reason = result.signal ? "信号 " + result.signal : "退出码 " + result.status;
    console.error(file + " 语法检查未完成：" + reason);
    break;
  }
}
if (!process.exitCode) console.log("✅ " + files.length + " 个页面脚本语法通过");
