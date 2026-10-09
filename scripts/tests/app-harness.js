#!/usr/bin/env node
/* 零依赖用户流程回归的共享替身：按 index.html 加载真实页面脚本和 app-init。
 * 拆分自 test-app.js；各域用例见 test-app-*.js。
 * DOM / ECharts / 存储 / 定时器是边界替身；推荐、渲染、事件、URL 与启动代码均为真实实现。
 * 轴宽度测试检查配置预算，不代替真实浏览器的像素和可访问性检查。 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Blob } = require("node:buffer");
const root = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
/* type="application/json" 的脚本是按需数据的入口描述，页面在访问相应标签时才下载。 */
const scriptTags = [...html.matchAll(/<script\b([^>]*)\bsrc="(js\/[^"?]+)(?:\?[^"]*)?"([^>]*)>/g)]
  .map((m) => ({ file: m[2], optional: /\btype="application\/json"/.test(m[1] + m[3]) }));
const scripts = scriptTags.map((tag) => tag.file);
assert.equal(scripts.at(-1), "js/app-init.js", "页面启动脚本必须按真实顺序加载");

function decodeHtml(s) {
  return String(s).replace(/&(?:amp|lt|gt|quot|#39);/g, (v) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[v]));
}
function attributes(source) {
  return [...source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map((m) => [m[1].toLowerCase(), decodeHtml(m[2] ?? m[3] ?? m[4] ?? "")]);
}

function createApp(options = {}) {
  const elements = new Map(), allElements = [], charts = new Map();
  const timeline = [], scrolls = [], errors = [], warnings = [], downloads = [], objectUrls = new Map();
  const documentEvents = new Map(), windowEvents = new Map(), timers = new Map(), timeoutIds = new Set(), animationFrames = [];
  const width = options.width || 1280;
  const lazyData = !!options.lazyData;
  const scriptLoads = [], pendingScripts = [];
  /* 只模拟页面运行时追加的脚本（按需数据）；解析 index.html 得到的 <script> 不在这里执行。
     下载完成与页面的超时计时器相互独立：finishDataLoads 推进下载，flushTimeouts 推进超时。
     failData(src, attempt) 返回 true 时，该次下载触发 onerror。 */
  function loadScriptElement(script) {
    if (!lazyData || !script.dynamic) return;
    const src = String(script.src || script.getAttribute("src") || "").replace(/[?#].*$/, "");
    if (!/^js\/[\w.-]+\.js$/.test(src)) return;
    scriptLoads.push(src);
    pendingScripts.push({ script, src, attempt: scriptLoads.filter((item) => item === src).length });
  }
  function finishDataLoads() {
    for (const { script, src, attempt } of pendingScripts.splice(0)) {
      if (options.failData && options.failData(src, attempt)) { if (typeof script.onerror === "function") script.onerror(); continue; }
      const source = fs.readFileSync(path.join(root, src), "utf8");
      vm.runInContext(source, sandbox, { filename: src, timeout: 30000 });
      /* Node vm 的全局带拦截器：已预热的函数看不到之后脚本新声明的顶层 const（浏览器可以）。
         把数据脚本的顶层绑定镜像到全局对象上，恢复与浏览器一致的可见性；值是同一对象。 */
      for (const [, name] of source.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) sandbox[name] = vm.runInContext(name, sandbox);
      if (typeof script.onload === "function") script.onload();
    }
  }
  let nextTimer = 0, nextObjectUrl = 0, auditCalls = 0, documentRoot = null;
  let currentUrl = new URL(options.url || "http://127.0.0.1:8123/index.html");
  const historyEntries = [{ url: currentUrl.href, state: null }];
  let historyIndex = 0;
  const location = {};
  for (const key of ["href", "pathname", "search", "hash", "origin"]) {
    Object.defineProperty(location, key, { get: () => currentUrl[key], set: (v) => { currentUrl[key] = v; } });
  }
  const addListener = (map, type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };

  /* 只实现页面实际用到的选择器，动态表头、移出按钮和筛选绑定也走真实事件。 */
  function matchesSimple(e, selector) {
    for (const m of selector.matchAll(/:not\(([^()]*)\)/g)) if (matchesSimple(e, m[1])) return false;
    selector = selector.replace(/:not\([^()]*\)/g, "");
    const base = selector.replace(/\[[^\]]+\]/g, "");
    const tag = base.match(/^[\w:-]+/);
    if (tag && e.tagName !== tag[0].toUpperCase()) return false;
    for (const m of base.matchAll(/#([\w-]+)/g)) if (e.id !== m[1]) return false;
    for (const m of base.matchAll(/\.([\w-]+)/g)) if (!e.classList.contains(m[1])) return false;
    for (const m of selector.matchAll(/\[([\w:-]+)(?:\s*(\^?=)\s*["']?([^"'\]]*)["']?)?\]/g)) {
      const value = e.getAttribute(m[1]);
      if (value == null || (m[2] === "=" && value !== m[3]) || (m[2] === "^=" && !value.startsWith(m[3]))) return false;
    }
    return true;
  }
  function matchesSelector(e, selector) {
    return selector.split(",").some((group) => {
      const parts = group.trim().split(/\s+/);
      if (!matchesSimple(e, parts.pop())) return false;
      let ancestor = e.parentNode;
      while (parts.length) {
        const part = parts.pop();
        while (ancestor && !matchesSimple(ancestor, part)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    });
  }
  const voidTags = new Set(["AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT", "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"]);
  function parseMarkup(source, parent = null) {
    const stack = parent ? [parent] : [], base = stack.length;
    let previousEnd = 0;
    for (const m of source.matchAll(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi)) {
      if (stack.length > base) stack.at(-1).textContent += decodeHtml(source.slice(previousEnd, m.index).replace(/<[^>]*>/g, ""));
      previousEnd = m.index + m[0].length;
      if (m[0].startsWith("</")) {
        const tag = m[1].toUpperCase();
        const index = stack.findLastIndex((e) => e.tagName === tag);
        if (index >= base) stack.length = index;
        continue;
      }
      const e = new Element(m[1], attributes(m[2]));
      if (stack.length) stack.at(-1).appendChild(e);
      if (!voidTags.has(e.tagName) && !m[0].endsWith("/>")) stack.push(e);
    }
  }
  function detach(e) {
    for (const child of e.children) detach(child);
    if (e.id && elements.get(e.id) === e) elements.delete(e.id);
    e.parentNode = null;
  }

  class Element {
    constructor(tagName, attrs = []) {
      this.tagName = tagName.toUpperCase();
      this.attrs = new Map(attrs);
      this.id = this.attrs.get("id") || "";
      this.order = allElements.length;
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.style = { setProperty(name, value) { this[name] = String(value); }, getPropertyValue(name) { return this[name] || ""; }, removeProperty(name) { delete this[name]; } };
      this.value = this.attrs.get("value") || "";
      this.href = this.attrs.get("href") || "";
      this.download = "";
      this.textContent = "";
      this._html = "";
      this.listeners = new Map();
      this.dynamic = false; /* document.createElement 创建的节点；只有这些 <script> 会模拟下载 */
      this.open = false;
      this.hidden = this.attrs.has("hidden");
      this.disabled = this.attrs.has("disabled");
      this.tabIndex = Number(this.attrs.get("tabindex") ?? (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(this.tagName) ? 0 : -1));
      if (this.tagName === "DIALOG" && options.noNativeDialog) { this.open = undefined; this.showModal = undefined; this.close = undefined; }
      const classes = new Set((this.attrs.get("class") || "").split(/\s+/).filter(Boolean));
      this.classList = {
        contains: (name) => classes.has(name),
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle: (name, force) => { const on = force == null ? !classes.has(name) : !!force; on ? classes.add(name) : classes.delete(name); return on; },
      };
      for (const [name, value] of attrs) if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      allElements.push(this);
      if (this.id) elements.set(this.id, this);
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = String(value);
      for (const child of this.children) detach(child);
      this.children = [];
      parseMarkup(this._html, this);
      if (this.tagName === "SELECT") {
        if (!this.options.some((o) => o.value === this.value)) this.value = this.options[0]?.value || "";
      }
    }
    get isConnected() { for (let e = this; e; e = e.parentNode) if (e === documentRoot) return true; return false; }
    get options() { return this.descendants().filter((e) => e.tagName === "OPTION"); }
    descendants() { return this.children.flatMap((e) => [e, ...e.descendants()]); }
    appendChild(child) { child.parentNode = this; this.children.push(child); if (child.tagName === "SCRIPT") loadScriptElement(child); return child; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); detach(this); }
    addEventListener(type, fn) { addListener(this.listeners, type, fn); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter((listener) => listener !== fn)); }
    setAttribute(name, value) {
      this.attrs.set(name, String(value));
      if (name === "open" && !(this.tagName === "DIALOG" && options.noNativeDialog)) this.open = true;
      if (name === "hidden") this.hidden = true;
      if (name === "tabindex") this.tabIndex = Number(value);
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); if (name === "open" && !(this.tagName === "DIALOG" && options.noNativeDialog)) this.open = false; if (name === "hidden") this.hidden = false; }
    contains(other) { for (let e = other; e; e = e.parentNode) if (e === this) return true; return false; }
    compareDocumentPosition(other) { return this === other ? 0 : this.order < other.order ? 4 : 2; }
    querySelectorAll(selector) { return this.descendants().filter((e) => matchesSelector(e, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) {
      for (let e = this; e; e = e.parentNode) if (matchesSelector(e, selector)) return e;
      return null;
    }
    getBoundingClientRect() {
      const height = Number.parseFloat(this.style.height) || 420;
      return { top: 100000 + this.order * 20, bottom: 100000 + this.order * 20 + height, left: 36, right: width - 36, width: width - 72, height };
    }
    getClientRects() { for (let e = this; e; e = e.parentNode) if (e.hidden) return []; return this.isConnected ? [this.getBoundingClientRect()] : []; }
    scrollIntoView(opts) {
      timeline.push("scroll:" + this.id);
      scrolls.push({ id: this.id, options: opts, rendered: [...charts.keys()] });
    }
    showModal() { this.open = true; }
    close() { const wasOpen = this.open; this.open = false; if (wasOpen) fire(this, "close"); }
    focus() {
      for (let e = this; e; e = e.parentNode) if (e.hidden || e.attrs.has("inert")) return;
      if (this.isConnected && !this.disabled) {
        document.activeElement = this;
        timeline.push("focus:" + (this.id || this.dataset.plan || this.tagName));
        fire(this, "focusin");
      }
    }
    select() {}
    click() { if (this.disabled) return; if (this.tagName === "A" && this.download) downloads.push({ filename: this.download, blob: objectUrls.get(this.href) }); fire(this, "click"); }
  }

  /* 从真实 HTML 构造 id、文档顺序和父子关系，导航不能依赖测试硬编码顺序。 */
  parseMarkup(html);
  const documentElement = allElements.find((e) => e.tagName === "HTML");
  documentRoot = documentElement;
  documentElement.scrollHeight = 120000;
  documentElement.clientHeight = 800;
  documentElement.scrollTop = 0;
  const document = {
    documentElement, body: allElements.find((e) => e.tagName === "BODY"), head: allElements.find((e) => e.tagName === "HEAD"),
    getElementById: (id) => elements.get(id) || null,
    activeElement: allElements.find((e) => e.tagName === "BODY"),
    querySelectorAll: (selector) => [documentElement, ...documentElement.descendants()].filter((e) => matchesSelector(e, selector)),
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    createElement: (name) => { const element = new Element(name); element.dynamic = true; return element; },
    addEventListener: (type, fn) => addListener(documentEvents, type, fn),
    removeEventListener(type, fn) { documentEvents.set(type, (documentEvents.get(type) || []).filter((listener) => listener !== fn)); },
    execCommand: () => true,
  };
  if (options.fontsReady) Object.defineProperty(document, "fonts", { value: { ready: options.fontsReady } });
  function fire(target, type, extra = {}) {
    const event = { target, type, button: 0, defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...extra };
    if (type === "click" && target.disabled) return event;
    for (let e = target; e; e = e.parentNode) {
      for (const fn of e.listeners.get(type) || []) fn(event);
      if (typeof e["on" + type] === "function") e["on" + type](event);
      if (event.propagationStopped || type === "close") break;
    }
    if (!event.propagationStopped && type !== "close") for (const fn of documentEvents.get(type) || []) fn(event);
    return event;
  }
  const matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  function fireWindow(type, extra = {}) {
    const event = { type, target: window, ...extra };
    for (const fn of windowEvents.get(type) || []) fn(event);
  }
  const window = { innerWidth: width, innerHeight: 800, scrollY: 0, addEventListener: (type, fn) => addListener(windowEvents, type, fn), matchMedia, scrollTo() {} };
  const savedStorage = new Map(Object.entries(options.storage || {}));
  const localStorage = {
    getItem(key) { if (options.storageReadThrows) throw new Error("storage read denied"); return savedStorage.get(key) ?? null; },
    setItem(key, value) { if (options.storageWriteThrows) throw new Error("storage write denied"); savedStorage.set(key, String(value)); },
  };
  const history = {
    get length() { return historyEntries.length; },
    get state() { return historyEntries[historyIndex].state; },
    replaceState(state, _title, url) {
      if (options.historyThrows) throw new Error("history unavailable");
      currentUrl = new URL(url, currentUrl);
      historyEntries[historyIndex] = { url: currentUrl.href, state };
    },
    pushState(state, _title, url) {
      if (options.historyThrows) throw new Error("history unavailable");
      currentUrl = new URL(url, currentUrl);
      historyEntries.splice(historyIndex + 1);
      historyEntries.push({ url: currentUrl.href, state });
      historyIndex = historyEntries.length - 1;
    },
    go(delta) {
      const index = historyIndex + delta;
      if (index < 0 || index >= historyEntries.length || index === historyIndex) return;
      const oldURL = currentUrl.href, oldHash = currentUrl.hash;
      historyIndex = index;
      currentUrl = new URL(historyEntries[index].url);
      const newURL = currentUrl.href, changedHash = oldHash !== currentUrl.hash;
      fireWindow("popstate", { state: historyEntries[index].state });
      if (changedHash) fireWindow("hashchange", { oldURL, newURL });
    },
    back() { this.go(-1); }, forward() { this.go(1); },
  };
  const sandbox = {
    console: { log() {}, warn: (...args) => warnings.push(args.map(String).join(" ")), error: (...args) => errors.push(args.map(String).join(" ")) },
    document, window, location, history, localStorage, matchMedia, URLSearchParams, Blob,
    URL: { createObjectURL(blob) { const url = "blob:test-" + ++nextObjectUrl; objectUrls.set(url, blob); return url; }, revokeObjectURL: (url) => objectUrls.delete(url) },
    navigator: { clipboard: { writeText: async (text) => { sandbox.copiedText = text; } } },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    setTimeout(fn) { timers.set(++nextTimer, fn); timeoutIds.add(nextTimer); return nextTimer; },
    clearTimeout(id) { timers.delete(id); timeoutIds.delete(id); },
    setInterval(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearInterval(id) { timers.delete(id); },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    echarts: { init(e) {
      const listeners = new Map();
      const chart = {
        option: null, selected: {}, actions: [], resize() {}, dispose() { charts.delete(e.id); },
        setOption(option) { this.option = option; this.selected = Object.fromEntries((option.legend?.data || []).map((name) => [name, true])); timeline.push("render:" + e.id); },
        on: (type, fn) => addListener(listeners, type, fn), off: (type) => listeners.delete(type),
        dispatchAction(action) {
          this.actions.push(action);
          if (!["legendToggleSelect", "legendUnSelect"].includes(action.type)) return;
          this.selected[action.name] = action.type === "legendUnSelect" ? false : this.selected[action.name] === false;
          const event = action.type === "legendUnSelect" ? "legendunselected" : "legendselectchanged";
          for (const fn of listeners.get(event) || []) fn({ name: action.name, selected: this.selected });
        },
        visibleSeries() { return this.option.series.filter((series) => this.selected[series.name] !== false); },
      };
      charts.set(e.id, chart);
      return chart;
    } },
  };
  if (options.animationFrames) Object.defineProperty(sandbox, "requestAnimationFrame", { value: (fn) => animationFrames.push(fn) });
  if (options.storageGetterThrows) Object.defineProperty(sandbox, "localStorage", { get() { throw new Error("storage unavailable"); } });
  vm.createContext(sandbox);
  const run = (code) => vm.runInContext(code, sandbox, { filename: "app-flow-test", timeout: 30000 });
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) run(m[1]);
  for (const { file, optional } of scriptTags) {
    /* lazyData：按需数据不在启动时载入，由页面追加 <script> 后经 loadScriptElement 模拟下载。 */
    if (lazyData && optional) continue;
    if (file === "js/app-init.js") {
      sandbox.countAudit = () => auditCalls++;
      run("const originalTestAudit = auditProfiles; auditProfiles = function () { countAudit(); return originalTestAudit(); };");
    }
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file, timeout: 30000 });
  }
  return { run, elements, charts, timeline, scrolls, errors, warnings, downloads, location, history, fire, fireWindow, get auditCalls() { return auditCalls; },
    get scriptLoads() { return scriptLoads.slice(); }, finishDataLoads,
    flushTimeouts() { for (const id of [...timeoutIds]) { const fn = timers.get(id); timers.delete(id); timeoutIds.delete(id); if (fn) fn(); } },
    flushAnimationFrames() { for (const fn of animationFrames.splice(0)) fn(0); },
    anchor: (hash) => allElements.find((e) => e.tagName === "A" && e.getAttribute("href") === hash) };
}

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
