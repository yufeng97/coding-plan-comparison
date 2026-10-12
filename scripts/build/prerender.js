#!/usr/bin/env node
/* 构建期首屏预渲染：隔离运行真实 Vue App，把默认状态生成的内容写进发布用的 index.html。
 * 搜索引擎、链接预览和脚本尚未执行的访问者能直接看到推荐、套餐价格、免费入口、动态与来源；
 * 浏览器执行脚本后按当前条件重绘这些容器。带查询参数的链接在重绘前隐藏预渲染内容，避免先闪出默认推荐。 */
"use strict";
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { realTempRoot } = require('../lib/temp-dir');
const run = promisify(execFile);

/** 把容器的渲染结果写入空的同名元素，并标记 data-prerendered。容器在源文件中必须为空，避免误替换嵌套内容。
 * @param {string} html @param {string} id @param {string} content */
function injectContainer(html, id, content) {
  const marker = ` id="${id}"`;
  const at = html.indexOf(marker);
  if (at < 0 || html.indexOf(marker, at + marker.length) >= 0) throw new Error("预渲染目标缺失或重复：" + id);
  const open = html.lastIndexOf("<", at);
  const openEnd = html.indexOf(">", at);
  const tag = /^<([a-z][\w-]*)/i.exec(html.slice(open, openEnd))?.[1];
  if (!tag) throw new Error("预渲染目标标签无法识别：" + id);
  const close = `</${tag}>`;
  const closeAt = html.indexOf(close, openEnd);
  if (closeAt < 0 || html.slice(openEnd + 1, closeAt).trim()) throw new Error("预渲染目标在源文件中应为空：" + id);
  const opening = html.slice(open, openEnd).replace(/\s*\/$/, "") + " data-prerendered";
  return html.slice(0, open) + opening + ">" + content + html.slice(closeAt);
}

/** @param {string} html 已带缓存版本号的发布用 index.html @returns {Promise<string>} */
async function prerenderIndex(html) {
  const temporaryRoot = realTempRoot();
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'coding-plan-ssr-'));
  const output = path.join(directory, 'render.json');
  try {
    await run(process.execPath, [path.join(__dirname, 'render-vue.mjs'), output], { cwd: path.resolve(__dirname, '../..'), timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const { rendered, teleports } = JSON.parse(fs.readFileSync(output, 'utf8'));
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(rendered + teleports)) throw new Error('Vue 预渲染含可执行内容');
    // Dialogs are closed in the static default view. Client mounting creates their
    // Teleport nodes once; inserting server Teleports here would leave duplicate IDs.
    return injectContainer(html, 'app', rendered);
  } finally {
    if (path.dirname(directory) !== temporaryRoot || !path.basename(directory).startsWith('coding-plan-ssr-')) throw new Error('拒绝清理未知预渲染目录');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { prerenderIndex, injectContainer };
