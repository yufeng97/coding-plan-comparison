#!/usr/bin/env node
/* 零依赖用户流程回归的测试入口：页面虚拟 DOM 在 scripts/lib/page-vm.js（构建期预渲染共用），
 * 这里只保留断言辅助与用例调度。各域用例见 test-app-*.js。 */
"use strict";

const assert = require("node:assert/strict");
const { createApp, decodeHtml, attributes } = require("../lib/page-vm");

function healthy(app) { assert.deepEqual(app.errors, [], "页面启动/渲染发生异常：" + app.errors.join("\n")); }
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function main() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("  ✓ " + name); }
    catch (err) { failed++; console.error("  ✗ " + name + "\n" + (err.stack || err)); }
  }
  console.log(`用户流程回归（本文件）：${tests.length - failed} 通过，${failed} 失败`);
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module) main();
module.exports = { createApp, decodeHtml, attributes, healthy, test, tests, main };
