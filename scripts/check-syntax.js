#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const files = fs.readdirSync(path.join(root, "js")).filter((name) => name.endsWith(".js"));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, "js", file)], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status) { process.exitCode = result.status; break; }
}
if (!process.exitCode) console.log("✅ " + files.length + " 个页面脚本语法通过");
