#!/usr/bin/env node
/* 构建期首屏预渲染：在页面虚拟 DOM 中运行真实页面脚本，把默认条件下由数据生成的内容写进发布用的 index.html。
 * 搜索引擎、链接预览和脚本尚未执行的访问者能直接看到推荐、套餐价格、免费入口、动态与来源；
 * 浏览器执行脚本后按当前条件重绘这些容器。带查询参数的链接在重绘前隐藏预渲染内容，避免先闪出默认推荐。 */
"use strict";
const { createApp } = require("../lib/page-vm");

/* 只预渲染「选套餐」视图里由数据决定、无需交互状态即可阅读的容器。来源清单、核对记录和不确定性说明
   体积大且默认折叠，留给脚本渲染，控制发布页 HTML 的体积。 */
const PRERENDER_TARGETS = [
  "priceAuditSummary", "statsRow", "quickGrid", "pickerNote", "pickerPolicy", "pickerRulesNote",
  "freeGrid", "freeCount", "tableBody", "tableCount", "dynamicsList", "apiDetailBody",
];
const escapeText = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

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

/** @param {string} html 已带缓存版本号的发布用 index.html @returns {string} */
function prerenderIndex(html) {
  const app = createApp({ width: 1280 });
  if (app.errors.length) throw new Error("预渲染时页面脚本报错：" + app.errors.join("；"));
  let out = html;
  for (const id of PRERENDER_TARGETS) {
    const element = app.elements.get(id);
    if (!element) throw new Error("页面虚拟 DOM 缺少预渲染目标：" + id);
    const content = element.innerHTML || escapeText(element.textContent || "");
    if (!content.trim()) continue;
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(content)) throw new Error("预渲染内容含可执行代码：" + id);
    out = injectContainer(out, id, content);
  }
  return out;
}

module.exports = { prerenderIndex, injectContainer, PRERENDER_TARGETS };
