"use strict";
/* 在带超时的独立 VM 上下文里执行仓库内的受信数据输入（data/sources/data.js 含业务函数），
 * 工具脚本按需取全局名。同一进程内按源码内容缓存上下文：维护构建等流程对同一份源码
 * 只做一次解析，各调用方（校验、台账、读者文字、统计）共享结果；候选源码自然得到独立上下文。
 * 顶层 const 声明只属于上下文的声明环境、不会挂上 globalThis，因此取值在同一上下文里再求值。 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DATA_FILE = path.join("data", "sources", "data.js");
const MAX_CONTEXTS = 8;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** @type {Map<string, vm.Context>} */
const contexts = new Map();

/** @param {string} source */
function contextFor(source) {
  let context = contexts.get(source);
  if (context) return context;
  context = vm.createContext({ console });
  vm.runInContext(source, context, { filename: DATA_FILE.replace(/\\/g, "/"), timeout: 2000 });
  contexts.set(source, context);
  /* 核价同步/测试会给候选源码各建一个上下文；只保留最近几个，避免长进程累积。 */
  while (contexts.size > MAX_CONTEXTS) contexts.delete(/** @type {string} */ (contexts.keys().next().value));
  return context;
}

/**
 * @param {string} source data.js 源码
 * @param {string[]} names 要取出的全局声明名
 * @param {{optional?: string[]}} [options] optional 中的声明缺失时取 undefined（精简夹具可不声明）
 * @returns {Record<string, any>} 按名取出的值（函数与正则保持可调用）
 */
function loadData(source, names, options = {}) {
  const context = contextFor(source);
  for (const name of names) if (!IDENTIFIER.test(name)) throw new Error("非法全局名：" + name);
  const optional = new Set(options.optional || []);
  for (const name of optional) if (!names.includes(name)) throw new Error("可选声明必须同时列在取用名单里：" + name);
  const values = Object.fromEntries(names.map((name) => [name, vm.runInContext("typeof " + name + " === 'undefined' ? undefined : " + name, context, { timeout: 2000 })]));
  const missing = names.filter((name) => values[name] === undefined && !optional.has(name));
  if (missing.length) throw new Error("data.js 缺少全局声明：" + missing.join("、"));
  return values;
}

/**
 * @param {string} workspace 仓库根目录
 * @param {string[]} names 要取出的全局声明名
 * @param {{optional?: string[]}} [options]
 * @returns {Record<string, any>} */
function loadRepoData(workspace, names, options) {
  const file = path.join(path.resolve(workspace), DATA_FILE);
  return loadData(fs.readFileSync(file, "utf8"), names, options);
}

module.exports = { loadData, loadRepoData, DATA_FILE };
