#!/usr/bin/env node
/* 零依赖用户流程回归：按 index.html 加载真实页面脚本和 app-init。
 * DOM / ECharts / 存储 / 定时器是边界替身；推荐、渲染、事件、URL 与启动代码均为真实实现。
 * 轴宽度测试检查配置预算，不代替真实浏览器的像素和可访问性检查。 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Blob } = require("node:buffer");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="(js\/[^"?]+)(?:\?[^"]*)?"[^>]*>/g)].map((m) => m[1]);
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
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
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
    documentElement, body: allElements.find((e) => e.tagName === "BODY"),
    getElementById: (id) => elements.get(id) || null,
    activeElement: allElements.find((e) => e.tagName === "BODY"),
    querySelectorAll: (selector) => [documentElement, ...documentElement.descendants()].filter((e) => matchesSelector(e, selector)),
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    createElement: (name) => new Element(name),
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
  for (const file of scripts) {
    if (file === "js/app-init.js") {
      sandbox.countAudit = () => auditCalls++;
      run("const originalTestAudit = auditProfiles; auditProfiles = function () { countAudit(); return originalTestAudit(); };");
    }
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file, timeout: 30000 });
  }
  return { run, elements, charts, timeline, scrolls, errors, warnings, downloads, location, history, fire, fireWindow, get auditCalls() { return auditCalls; },
    flushTimeouts() { for (const id of [...timeoutIds]) { const fn = timers.get(id); timers.delete(id); timeoutIds.delete(id); if (fn) fn(); } },
    flushAnimationFrames() { for (const fn of animationFrames.splice(0)) fn(0); },
    anchor: (hash) => allElements.find((e) => e.tagName === "A" && e.getAttribute("href") === hash) };
}

function healthy(app) { assert.deepEqual(app.errors, [], "页面启动/渲染发生异常：" + app.errors.join("\n")); }
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("完整启动恢复 URL，debug 仅运行一次、保留筛选并清除退役country参数", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?debug=1&country=IN&region=intl&budget=500&tool=cursor&task=daily&plimit=all&cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x" });
  healthy(app);
  assert.equal(app.auditCalls, 1);
  const params = new URLSearchParams(app.location.search);
  for (const [key, value] of Object.entries({ debug: "1", region: "intl", budget: "500", tool: "cursor", task: "daily", plimit: "all" })) assert.equal(params.get(key), value, key);
  assert.equal(params.has("country"), false, "旧购买资格参数不应继续分享");
  assert.equal(app.run('Object.hasOwn(pickerState, "country")'), false, "推荐只保留四维状态");
  assert.equal(app.run("pickerState.region"), "intl");
  assert.equal(app.run("pickerState.budget"), "500");
  assert.equal(app.run("state1.limit"), null);
  assert.equal(app.run("cmpState.items.length"), 2, "分享链接中的重复方案应合并");
  assert.equal(app.elements.get("cmpModal").open, true);
  assert.ok(app.elements.get("quickGrid").innerHTML);
  assert.ok(app.elements.get("metricsBody").innerHTML);
  assert.ok(app.elements.get("sourceList").innerHTML);
});

test("后退和前进恢复URL对应筛选，缺省参数还原默认且不抢焦点", () => {
  const app = createApp(), initial = app.location.href;
  app.fire(app.anchor("#table"), "click");
  const search = app.elements.get("searchInput");
  search.value = "Cursor";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.equal(app.history.length, 2, "筛选replaceState不会新增历史条目");
  const filtered = app.location.href;
  const filteredIds = app.run("computeTableRows().map(p => p.id).join(';')");
  assert.equal(new URLSearchParams(app.location.search).get("q"), "Cursor");
  search.focus();
  app.history.back();
  assert.equal(app.location.href, initial);
  assert.equal(app.run("tableState.search"), "");
  assert.equal(search.value, "");
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
  assert.equal(app.run("document.activeElement"), search, "恢复历史不移动用户当前焦点");
  app.history.forward();
  assert.equal(app.location.href, filtered);
  assert.equal(app.run("tableState.search"), "Cursor");
  assert.equal(search.value, "Cursor");
  assert.equal(app.run("computeTableRows().map(p => p.id).join(';')"), filteredIds, "前进恢复完全相同的搜索结果");
  assert.equal(app.run("document.activeElement"), search);
  const refreshed = createApp({ url: app.location.href });
  assert.equal(refreshed.run("tableState.search"), app.run("tableState.search"), "前进后的分享URL和当前视图一致");
  app.history.back();
  app.fire(app.anchor("#s1"), "click");
  assert.equal(app.history.length, 2, "后退后新导航截断原前进分支");
  app.history.forward();
  assert.equal(app.location.hash, "#s1");
  healthy(app);
});

test("同锚点popstate也恢复全部状态，push/replace不派发历史导航事件", () => {
  const app = createApp();
  app.run('globalThis.testHistoryEvents = []; window.addEventListener("popstate", e => testHistoryEvents.push(e.type)); window.addEventListener("hashchange", e => testHistoryEvents.push(e.type));');
  const savedUrl = "?budget=500&region=intl&tool=codex&task=daily&pcat=tool&pregion=intl&pbilling=Y&pq=Cursor&plimit=all&rank=all&rscope=credits&q=Cursor&tcat=tool&tregion=intl&tsort=priceY:-1&mmodel=GPT-6.1+Sol&mver=V2&msort=twk:-1#table";
  app.history.pushState({ fixture: "saved" }, "", savedUrl);
  app.history.pushState({ fixture: "default" }, "", app.location.pathname + "#table");
  app.history.replaceState({ fixture: "replaced" }, "", app.location.href);
  assert.equal(app.run("testHistoryEvents.length"), 0);
  assert.equal(app.history.length, 3);
  app.history.back();
  assert.equal(app.history.state.fixture, "saved");
  assert.equal(app.run("testHistoryEvents.join(',')"), "popstate", "相同hash只产生popstate");
  assert.equal(app.run('JSON.stringify(pickerState)'), JSON.stringify({ budget: "500", region: "intl", tool: "codex", task: "daily" }));
  assert.equal(app.run('JSON.stringify(state1)'), JSON.stringify({ cat: "tool", region: "intl", billing: "Y", q: "Cursor", limit: null }));
  assert.equal(app.run('JSON.stringify(rankState)'), JSON.stringify({ tier: "all", scope: "credits" }));
  assert.equal(app.run('JSON.stringify(tableState)'), JSON.stringify({ search: "Cursor", cat: "tool", region: "intl", sortKey: "priceY", sortDir: -1 }));
  assert.equal(app.run('JSON.stringify(metricsState)'), JSON.stringify({ model: "GPT-6.1 Sol", ver: "V2", sortKey: "twk", sortDir: -1 }));
  assert.equal(app.elements.get("chartSearch").value, "Cursor");
  assert.equal(app.elements.get("searchInput").value, "Cursor");
  assert.equal(app.elements.get("metricsModel").value, "GPT-6.1 Sol");
  assert.equal(app.elements.get("metricsVer").value, "V2");
  const expectedSearch = new URL(savedUrl, "http://127.0.0.1:8123/index.html").search;
  assert.equal(app.location.search, expectedSearch, "历史恢复渲染不得重写目标URL");
  app.history.forward();
  assert.equal(app.history.state.fixture, "replaced");
  assert.equal(app.run('JSON.stringify(pickerState)'), JSON.stringify({ budget: "200", region: "cn", tool: "any", task: "both" }));
  assert.equal(app.run('JSON.stringify(state1)'), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20 }));
  assert.equal(app.run("rankState.tier + ':' + rankState.scope"), "flagship:official");
  assert.equal(app.run("tableState.search + ':' + tableState.sortKey + ':' + tableState.sortDir"), ":priceM:1");
  assert.equal(app.run("metricsState.model + ':' + metricsState.ver + ':' + metricsState.sortKey + ':' + metricsState.sortDir"), "all:all:cpm:1");
  assert.equal(app.location.search, "");
  app.history.back();
  app.history.back();
  assert.equal(app.run("testHistoryEvents.join(',')"), "popstate,popstate,popstate,popstate,hashchange", "hash变化在popstate恢复后派发");
  healthy(app);
});

test("历史重绘按稳定ID找回表格对比按钮，筛选移除该方案时返回搜索", () => {
  const app = createApp();
  app.fire(app.anchor("#table"), "click");
  const search = app.elements.get("searchInput");
  search.value = "Anthropic";
  app.fire(search, "input");
  app.flushTimeouts();
  const button = () => app.elements.get("tableBody").querySelector('.cmp-add[data-plan-id="plan-0002"]');
  const previous = button();
  previous.focus();
  app.history.back();
  assert.equal(previous.isConnected, false, "历史恢复确实重绘按钮");
  assert.equal(app.run("document.activeElement"), button(), "默认结果中仍是同一ID方案");
  app.history.forward();
  assert.equal(app.run("document.activeElement"), button(), "前进筛选结果也找回同一方案");
  app.history.pushState(null, "", "?q=Cursor#table");
  app.history.back();
  button().focus();
  app.history.forward();
  assert.equal(button(), null);
  assert.equal(app.run("document.activeElement"), search, "目标筛选隐藏方案时使用可操作的搜索框");
  assert.equal(app.run("document.activeElement.isConnected"), true);
  healthy(app);
});

test("搜索延迟重绘保留已进入方案按钮的焦点，历史恢复取消旧搜索任务", () => {
  const app = createApp();
  app.fire(app.anchor("#table"), "click");
  const search = app.elements.get("searchInput");
  const button = () => app.elements.get("tableBody").querySelector('.cmp-add[data-plan-id="plan-0002"]');
  search.value = "Anthropic";
  app.fire(search, "input");
  const previous = button();
  previous.focus();
  app.flushTimeouts();
  assert.equal(previous.isConnected, false);
  assert.equal(app.run("document.activeElement"), button(), "搜索防抖执行前快速Tab到按钮不应掉到body");
  search.value = "Cursor";
  app.fire(search, "input");
  button().focus();
  app.flushTimeouts();
  assert.equal(button(), null);
  assert.equal(app.run("document.activeElement"), search, "搜索结果移除原方案时返回搜索");
  search.value = "Anthropic";
  app.fire(search, "input");
  app.flushTimeouts();
  search.value = "Claude";
  app.fire(search, "input");
  button().focus();
  app.history.back();
  const restored = button();
  app.flushTimeouts();
  assert.equal(restored.isConnected, true, "历史恢复取消旧搜索timer，不能在恢复后再次销毁结果");
  assert.equal(app.run("document.activeElement"), restored);
  const personalSearch = app.elements.get("chartSearch");
  personalSearch.value = "Cursor";
  app.fire(personalSearch, "input");
  app.fireWindow("popstate");
  const restoredRenders = app.timeline.filter((entry) => entry === "render:chartPersonal").length;
  app.flushTimeouts();
  assert.equal(app.timeline.filter((entry) => entry === "render:chartPersonal").length, restoredRenders, "历史恢复也取消待执行的个人图搜索，不能在恢复后再次重绘");
  healthy(app);
});

test("历史锚点清空焦点后仅修复一帧，期间用户转到其它控件或URL时不抢焦点", () => {
  const app = createApp({ animationFrames: true, url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0003#table" });
  const close = app.elements.get("cmpCloseBtn"), dialog = app.elements.get("cmpModal");
  const button = () => dialog.querySelector('.cmp-remove[data-plan-id="plan-0003"]');
  app.fire(close, "click");
  app.fire(app.anchor("#s4"), "click");
  app.fire(app.elements.get("cmpOpenBtn"), "click");
  button().focus();
  app.history.back();
  app.run("document.activeElement = document.body;");
  app.flushAnimationFrames();
  assert.equal(app.run("document.activeElement"), button(), "模拟popstate后原生fragment导致失焦");
  app.history.forward();
  close.focus();
  app.flushAnimationFrames();
  assert.equal(app.run("document.activeElement"), close, "恢复帧之前用户已进入另一个控件，不能抢回移出按钮");
  button().focus();
  app.history.back();
  app.history.replaceState(null, "", "?cmp=plan-0002;plan-0003&budget=500#table");
  app.run("document.activeElement = document.body;");
  app.flushAnimationFrames();
  assert.equal(app.run("document.activeElement"), app.run("document.body"), "该帧的状态已过期，不再修复旧URL焦点");
  const rapid = createApp({ animationFrames: true, url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0003#table" });
  rapid.history.pushState(null, "", "?cmp=plan-0002;plan-0003#s4");
  rapid.elements.get("cmpModal").querySelector('.cmp-remove[data-plan-id="plan-0003"]').focus();
  rapid.history.back();
  rapid.history.forward();
  rapid.history.back();
  rapid.run("document.activeElement = document.body;");
  rapid.flushAnimationFrames();
  assert.equal(rapid.run("document.activeElement.dataset.planId"), "plan-0003", "连续返回同一URL时，只允许最新恢复帧生效");
  healthy(rapid);
  healthy(app);
});

test("旧名称历史URL的异步焦点和关闭事件不修改参数或history.state", () => {
  for (const noNativeDialog of [false, true]) {
    const app = createApp({ animationFrames: true, noNativeDialog, url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0003#table" });
    const legacy = "?cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x&budget=invalid&fixture=keep#table";
    app.history.replaceState({ marker: "preserve" }, "", legacy);
    app.history.pushState(null, "", "?cmp=plan-0002;plan-0003#s4");
    app.elements.get("cmpModal").querySelector('.cmp-remove[data-plan-id="plan-0003"]').focus();
    app.history.back();
    app.run("document.activeElement = document.body;");
    app.flushAnimationFrames();
    assert.equal(app.location.href, new URL(legacy, "http://127.0.0.1:8123/index.html").href);
    assert.equal(app.history.state.marker, "preserve", "程序性focusin不应走状态提交");
    app.fire(app.elements.get("cmpCloseBtn"), "keydown", { key: "Escape" });
    app.fire(app.elements.get("cmpModal"), "close");
    app.fire(app.elements.get("cmpOpenBtn"), "click");
    app.fire(app.elements.get("cmpCloseBtn"), "click");
    assert.equal(app.location.href, new URL(legacy, "http://127.0.0.1:8123/index.html").href);
    assert.equal(app.history.state.marker, "preserve", "开关弹窗、Escape以及延迟原生close不改变分享状态");
    app.fire(app.run("document.body"), "click");
    assert.equal(app.history.state.marker, "preserve", "没有识别到状态操作的委托click不提交历史");
    for (const id of ["tableColsToggle", "metricsToggle", "exportCsvBtn", "copyMdBtn"]) {
      app.fire(app.elements.get(id), "click");
      assert.equal(app.history.state.marker, "preserve", "只变更视图或导出不提交URL：" + id);
    }
    healthy(app);
  }
});

test("历史重绘保留原对比移出按钮；目标已移除或不足两档时安全回退", () => {
  for (const noNativeDialog of [false, true]) {
    const app = createApp({ noNativeDialog, url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0003;plan-0004#table" });
    const dialog = app.elements.get("cmpModal"), close = app.elements.get("cmpCloseBtn");
    const button = (id) => dialog.querySelector('.cmp-remove[data-plan-id="' + id + '"]');
    app.fire(close, "click");
    app.fire(app.anchor("#s4"), "click");
    app.fire(app.elements.get("cmpOpenBtn"), "click");
    const previous = button("plan-0003");
    previous.focus();
    app.history.back();
    assert.equal(previous.isConnected, false);
    assert.equal(app.run("document.activeElement"), button("plan-0003"));
    app.history.forward();
    assert.equal(app.run("document.activeElement"), button("plan-0003"));
    close.focus();
    app.history.back();
    assert.equal(app.run("document.activeElement"), close, "仍连接的静态关闭按钮不移动焦点");
    app.history.pushState(null, "", "?cmp=plan-0002;plan-0004#table");
    app.history.back();
    button("plan-0003").focus();
    app.history.forward();
    assert.equal(button("plan-0003"), null);
    assert.equal(app.run("isCmpModalOpen()"), true);
    assert.equal(app.run("document.activeElement"), close, "当前弹窗仍打开，缺失项返回关闭按钮");
    app.history.pushState(null, "", "?cmp=plan-0004#table");
    app.history.back();
    button("plan-0002").focus();
    app.history.forward();
    assert.equal(app.run("isCmpModalOpen()"), false);
    assert.equal(app.run("document.activeElement.id"), "s4", "关闭弹窗已经恢复有效的打开入口时保留该焦点");
    assert.equal(app.run("document.activeElement.isConnected"), true);
    healthy(app);
  }
});

test("初次load仅修复弹窗外焦点，保留已移入弹窗的操作位置", () => {
  for (const noNativeDialog of [false, true]) {
    for (const selector of [".cmp-remove", "a[href]", "#cmpCloseBtn"]) {
      const app = createApp({ noNativeDialog, url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0003#table" });
      const control = app.elements.get("cmpModal").querySelector(selector);
      assert.ok(control);
      control.focus();
      app.fireWindow("load");
      assert.equal(app.run("document.activeElement"), control, "已在弹窗内的焦点不能跳回关闭按钮：" + selector);
      healthy(app);
    }
    const app = createApp({ noNativeDialog, url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0003#table" });
    app.run("document.activeElement = document.body;");
    app.fireWindow("load");
    assert.equal(app.run("document.activeElement.id"), "cmpCloseBtn", "fragment导致焦点回body时仍修复");
    healthy(app);
  }
});

test("用户锚点跳转聚焦目标章节，初始分享锚点保持原焦点", () => {
  const app = createApp();
  const link = app.anchor("#s4");
  link.focus();
  app.fire(link, "click");
  assert.equal(app.run("document.activeElement.id"), "s4");
  assert.equal(app.elements.get("s4").getAttribute("tabindex"), "-1");
  const focus = app.timeline.indexOf("focus:s4"), scroll = app.timeline.indexOf("scroll:s4");
  assert.ok(focus >= 0 && scroll >= 0);
  for (const id of ["chartRank", "chartPersonal", "chartTeam", "chartTokens", "chartApi", "chartPower"]) assert.ok(app.timeline.indexOf("render:" + id) < scroll);
  const shared = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  assert.equal(shared.run("document.activeElement"), shared.run("document.body"), "初始加载不把读屏/键盘焦点抢到章节");
  assert.equal(shared.timeline.includes("focus:s4"), false);
  healthy(app);
  healthy(shared);
});

test("章节高亮按真实滚动间距及章节留白判断，字体完成只刷新用户当前位置", async () => {
  let finishFonts = () => {};
  const fontsReady = new Promise((resolve) => { finishFonts = () => resolve(null); });
  const app = createApp({ fontsReady, url: "http://127.0.0.1:8123/index.html#s3b" });
  app.run(`globalThis.navTops = { rank: -900, s3b: 79.8 };
    globalThis.sectionPadding = 56;
    getComputedStyle = (el) => ({ getPropertyValue: (name) => name === "scroll-padding-top" ? "69px" : name === "padding-top" && el.classList.contains("section") ? sectionPadding + "px" : "" });
    qs(".topbar").getBoundingClientRect = () => ({ height: 56.8 });
    qsa('.topnav a[href^="#"]').forEach(link => {
      const target = byId(link.getAttribute("href").slice(1));
      target.getBoundingClientRect = () => ({ top: navTops[target.id] ?? 10000 });
    });
    syncHeaderHeight(); updateActiveNav();`);
  const active = () => app.run('qs(\'.topnav a[aria-current="location"]\').getAttribute("href")');
  assert.equal(active(), "#s3b", "生产中section top=79.8、scroll-padding=69时标题已进入本节留白");
  app.run("sectionPadding = 40; navTops.s3b = 100; updateActiveNav();");
  assert.equal(active(), "#s3b", "窄屏使用自身padding而不是桌面固定值");
  app.run("navTops.s3b = 110; updateActiveNav();");
  assert.equal(active(), "#rank", "超出自身留白时仍按上一章节判断，不添加任意像素容差");
  app.run("navTops.rank = 80; navTops.s3b = 1000; window.scrollY = 4000;");
  const scrollCount = app.scrolls.length;
  finishFonts();
  await fontsReady;
  app.fireWindow("load");
  assert.equal(active(), "#rank", "fonts/load完成应按用户现在的位置判断，不能锁定旧hash");
  assert.equal(app.location.hash, "#s3b");
  assert.equal(app.run("window.scrollY"), 4000);
  assert.equal(app.scrolls.length, scrollCount, "字体/load刷新不追加锚点跳转");
  healthy(app);
});

test("比较链接写入稳定planId，旧名称链接规范化，显示名改动不破坏身份", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?cmp=plan-0002;plan-0002;unknown;plan-0003" });
  assert.equal(app.run("cmpState.items.map(p => p.id).join(';')"), "plan-0002;plan-0003");
  assert.equal(new URLSearchParams(app.location.search).get("cmp"), "plan-0002;plan-0003");
  assert.equal(app.elements.get("cmpModal").open, true);
  app.run('closeCmpModal(); const renamedPlan = findPlanReference("plan-0002"); renamedPlan.vendor = "改名厂商"; renamedPlan.plan = "改名套餐"; cmpState.items = []; applyUrlState(); renderCmpBar(); renderCmpModal();');
  assert.equal(app.run("cmpState.items.map(p => p.id).join(';')"), "plan-0002;plan-0003");
  assert.match(app.elements.get("cmpTable").innerHTML, /改名厂商|改名套餐/);
  const legacy = createApp({ url: "http://127.0.0.1:8123/index.html?cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x" });
  assert.equal(legacy.run("cmpState.items.map(p => p.id).join(';')"), "plan-0002;plan-0003");
  assert.equal(new URLSearchParams(legacy.location.search).get("cmp"), "plan-0002;plan-0003", "旧链接成功恢复后用稳定ID分享");
  const mixed = createApp({ url: "http://127.0.0.1:8123/index.html?cmp=plan-0002%3BAnthropic%7CClaude+Pro%3Bplan-0003" });
  assert.equal(mixed.run("cmpState.items.length"), 2, "新旧身份混用也应去重");
  healthy(app);
  healthy(legacy);
  healthy(mixed);
});

test("额度引用按稳定ID跟随主计划更名和调序，保留模型口径并兼容旧ref", () => {
  const app = createApp();
  const result = app.run(`(() => {
    const raw = METRICS_RAW.find(m => typeof m.ref === "string");
    const plan = findPlanReference(raw.ref);
    const oldRef = [plan.vendor, plan.plan];
    const legacy = resolvePlan({ ...raw, ref: oldRef });
    plan.vendor = "稳定ID新厂商";
    plan.plan = "稳定ID新套餐";
    plan.priceM = 321;
    plan.cur = "USD";
    PLANS.reverse();
    const resolved = resolvePlan(raw);
    const renamedLegacy = resolvePlan({ ...raw, ref: [plan.vendor, plan.plan] });
    return { legacyVendor: legacy.vendor, legacyPlan: legacy.plan, oldRef, resolved, renamedLegacy, model: raw.model, rawVendor: raw.vendor, rawPlan: raw.plan };
  })()`);
  assert.equal(result.legacyVendor, result.oldRef[0]);
  assert.equal(result.legacyPlan, result.oldRef[1]);
  for (const row of [result.resolved, result.renamedLegacy]) {
    assert.equal(row.vendor, "稳定ID新厂商");
    assert.equal(row.plan, "稳定ID新套餐");
    assert.equal(row.model, result.model, "主计划显示名同步不应覆盖额度行的模型变体");
    assert.equal(row.priceM, 321);
    assert.equal(row.cur, "USD");
  }
  assert.notEqual(result.rawVendor, "稳定ID新厂商", "原始额度行没有被原地改写");
  assert.notEqual(result.rawPlan, "稳定ID新套餐");
  healthy(app);
});

test("纯渲染与主题缩放不写历史，用户筛选才提交URL状态", () => {
  const app = createApp();
  app.history.replaceState({ renderSentinel: true }, "", app.location.href);
  app.run("renderPicker(); renderTable(); renderMetricsTable(); renderPersonalChart(); renderRankChart(); renderTokensChart(); renderApiChart(); renderTeamChart();");
  assert.equal(app.history.state.renderSentinel, true, "render函数不能调用replaceState");
  app.fire(app.elements.get("themeBtn"), "click");
  app.fireWindow("resize");
  app.flushTimeouts();
  assert.equal(app.history.state.renderSentinel, true, "主题和缩放不覆盖历史state");
  const search = app.elements.get("searchInput");
  search.value = "Cursor";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.equal(app.history.state, null, "用户筛选入口提交状态");
  assert.equal(new URLSearchParams(app.location.search).get("q"), "Cursor");
  healthy(app);
});

test("存储受限及file直开仍正常启动，主题切换保持图表懒加载", () => {
  for (const options of [{ storageReadThrows: true }, { storageWriteThrows: true }, { storageReadThrows: true, storageWriteThrows: true }, { storageGetterThrows: true }]) {
    const app = createApp(options);
    healthy(app);
    assert.equal(app.run("document.documentElement.dataset.themeMode"), "system");
    assert.ok(app.run("PAL.text"));
    assert.ok(app.elements.get("themeBtn").listeners.get("click").length);
    assert.equal(app.charts.size, 0);
    app.fire(app.elements.get("themeBtn"), "click");
    assert.equal(app.run("document.documentElement.dataset.theme"), "dark");
    assert.equal(app.charts.size, 0);
    healthy(app);
  }
  const fileApp = createApp({ url: "file:///D:/coding-plan-comparison/index.html", historyThrows: true, storageGetterThrows: true });
  healthy(fileApp);
  fileApp.fire(fileApp.anchor("#s4"), "click");
  assert.equal(fileApp.location.hash, "#s4");
  assert.equal(fileApp.run("LAZY_DONE.size"), 5);
  healthy(fileApp);
});

test("首次导航及分享锚点先渲染前方五组图表，再定位 API 区", () => {
  for (const fromHash of [false, true]) {
    const app = createApp({ url: "http://127.0.0.1:8123/index.html" + (fromHash ? "#s4" : "") });
    if (!fromHash) {
      assert.equal(app.charts.size, 0);
      const event = app.fire(app.anchor("#s4"), "click");
      assert.equal(event.defaultPrevented, true);
    }
    healthy(app);
    assert.equal(app.location.hash, "#s4");
    assert.equal(app.run("LAZY_DONE.size"), 5);
    const scrollIndex = app.timeline.indexOf("scroll:s4");
    assert.ok(scrollIndex >= 0);
    for (const id of ["chartRank", "chartPersonal", "chartTeam", "chartTokens", "chartApi", "chartPower"]) {
      const renderIndex = app.timeline.indexOf("render:" + id);
      assert.ok(renderIndex >= 0 && renderIndex < scrollIndex, id + " 应在定位前渲染");
    }
  }
});

test("图表跳表清除旧 cloud/cn 条件并定位，清除按钮恢复默认表格", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?tcat=cloud&tregion=cn" });
  const search = app.elements.get("chartSearch");
  search.value = "Claude Team";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.match(app.elements.get("notePersonal").innerHTML, /在完整表里看/);
  app.fire(app.elements.get("showExcludedInTable"), "click");
  healthy(app);
  assert.equal(app.run("tableState.cat"), "all");
  assert.equal(app.run("tableState.region"), "all");
  assert.equal(app.run("computeTableRows().length"), 2);
  assert.equal(app.elements.get("selectCat").value, "all");
  assert.equal(app.elements.get("selectRegion").value, "all");
  assert.equal(app.location.hash, "#table");
  assert.equal(app.run("LAZY_DONE.size"), 5);
  const params = new URLSearchParams(app.location.search);
  assert.equal(params.get("q"), "Claude Team");
  assert.equal(params.has("tcat"), false);
  assert.equal(params.has("tregion"), false);
  app.fire(app.elements.get("tableResetBtn"), "click");
  assert.equal(app.run("tableState.search"), "");
  assert.equal(app.run("tableState.sortKey + ':' + tableState.sortDir"), "priceM:1");
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
});

test("个人图表显示全部可收起，空结果可清除并恢复20档与筛选按钮状态", () => {
  const app = createApp();
  app.run("renderPersonalChart();");
  const chart = () => app.charts.get("chartPersonal").option;
  assert.equal(chart().series[0].data.length, 20);
  assert.equal(app.elements.get("chartPersonalEmpty").hidden, true);
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.equal(app.run("state1.limit"), null);
  assert.ok(chart().series[0].data.length > 20);
  assert.match(app.elements.get("showAllPersonal").textContent, /收起为 20 档/);
  assert.equal(new URLSearchParams(app.location.search).get("plimit"), "all");
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.equal(chart().series[0].data.length, 20);
  assert.equal(new URLSearchParams(app.location.search).has("plimit"), false);
  for (const [id, key, value] of [["chipCat", "cat", "cloud"], ["chipRegion", "region", "cn"], ["chipBilling", "billing", "Y"]]) {
    const chip = app.elements.get(id).querySelectorAll(".chip").find((e) => e.dataset[key] === value);
    app.fire(chip, "click");
    assert.equal(chip.getAttribute("aria-pressed"), "true");
  }
  const search = app.elements.get("chartSearch");
  search.value = "__没有任何匹配套餐__";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.equal(chart().series[0].data.length, 0);
  assert.equal(app.elements.get("chartPersonal").hidden, true);
  assert.equal(app.elements.get("chartPersonalEmpty").hidden, false);
  assert.equal(app.elements.get("chartPersonalEmpty").getAttribute("role"), "status");
  app.fire(app.elements.get("personalResetBtn"), "click");
  assert.equal(app.run('JSON.stringify(state1)'), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20 }));
  assert.equal(search.value, "");
  assert.equal(app.run("document.activeElement.id"), "chartSearch");
  assert.equal(app.elements.get("chartPersonal").hidden, false);
  assert.equal(app.elements.get("chartPersonalEmpty").hidden, true);
  assert.equal(chart().series[0].data.length, 20);
  for (const [id, key, value] of [["chipCat", "cat", "all"], ["chipRegion", "region", "all"], ["chipBilling", "billing", "M"]]) {
    const chips = app.elements.get(id).querySelectorAll(".chip");
    assert.equal(chips.filter((e) => e.getAttribute("aria-pressed") === "true").length, 1);
    assert.equal(chips.find((e) => e.dataset[key] === value).getAttribute("aria-pressed"), "true");
  }
  healthy(app);
});

test("归一化后为空的图表搜索保持20档，显示全部和收起仍可用", () => {
  const app = createApp();
  const search = app.elements.get("chartSearch");
  for (const value of [" ", "\t\n", "---", " . / _ · "]) {
    search.value = value;
    app.fire(search, "input");
    app.flushTimeouts();
    assert.equal(app.charts.get("chartPersonal").option.series[0].data.length, 20, JSON.stringify(value));
    assert.equal(app.elements.get("chartPersonal").style.height, "730px");
    assert.ok(app.elements.get("showAllPersonal"), "无有效关键词时不能丢失展开/收起入口");
    assert.doesNotMatch(app.elements.get("notePersonal").innerHTML, /同名模型还有|在完整表里看/);
  }
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.ok(app.charts.get("chartPersonal").option.series[0].data.length > 20);
  app.fire(app.elements.get("showAllPersonal"), "click");
  assert.equal(app.charts.get("chartPersonal").option.series[0].data.length, 20);
  search.value = " Claude - Pro ";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.ok(app.charts.get("chartPersonal").option.series[0].data.some((d) => d._p.vendor === "Anthropic" && d._p.plan === "Claude Pro"), "真实关键词仍按相同归一化规则匹配");
  healthy(app);
});

test("tokens图区间由两组DOM图例完整切换，重绘保留隐藏状态；API图例与明细完整", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  /** @type {Array<[string, string, number]>} */
  const legendCases = [["chartTokens", "tokensLegend", 2], ["chartApi", "apiLegend", 1], ["chartPower", "powerLegend", 1]];
  for (const [chartId, legendId, segments] of legendCases) {
    const chart = app.charts.get(chartId);
    const chips = app.elements.get(legendId).querySelectorAll("[data-series]");
    assert.equal(chips.length, 2);
    assert.equal(chart.option.legend.show, false, "可键盘操作的DOM图例替代画布图例");
    for (const chip of chips) {
      assert.equal(chip.tagName, "BUTTON");
      assert.ok(chart.option.legend.data.includes(chip.dataset.series), "图例与series名称一致");
      assert.equal(chart.option.series.filter((s) => s.name === chip.dataset.series).length, segments);
      assert.equal(chip.getAttribute("aria-pressed"), "true");
      app.fire(chip, "click");
      assert.equal(chip.getAttribute("aria-pressed"), "false");
      assert.equal(chart.visibleSeries().some((s) => s.name === chip.dataset.series), false, "基础柱及区间上限段应一起隐藏");
      app.run(chartId === "chartTokens" ? "renderTokensChart();" : "renderApiChart();");
      assert.equal(chip.getAttribute("aria-pressed"), "false", "重绘不能重新选中图例");
      assert.equal(chart.visibleSeries().some((s) => s.name === chip.dataset.series), false);
      const priorActions = chart.actions.length;
      app.fire(chip, "click");
      assert.equal(chart.actions.length, priorActions + 1, "重绘不能叠加点击监听器");
      assert.equal(chip.getAttribute("aria-pressed"), "true");
      assert.equal(chart.visibleSeries().filter((s) => s.name === chip.dataset.series).length, segments);
    }
    chips.forEach((chip) => app.fire(chip, "click"));
    assert.equal(chart.visibleSeries().length, 0, "两组同时隐藏应没有残留柱段");
    app.run(chartId === "chartTokens" ? "renderTokensChart();" : "renderApiChart();");
    assert.equal(chart.visibleSeries().length, 0, "重绘时恢复两组隐藏，legendUnSelect不能误发legendselectchanged");
    assert.ok(chips.every((chip) => chip.getAttribute("aria-pressed") === "false"));
    app.fire(app.elements.get("themeBtn"), "click");
    assert.equal(chart.visibleSeries().length, 0, "主题重绘也保留两组隐藏");
    chips.forEach((chip) => app.fire(chip, "click"));
    assert.equal(chart.visibleSeries().length, 2 * segments);
  }
  const details = app.elements.get("apiDetailBody");
  assert.equal(details.querySelectorAll("tr").length, app.charts.get("chartApi").option.yAxis.data.length);
  assert.equal(details.querySelectorAll("tr").length, 36, "全部36项API报价都应可在明细表访问");
  const solRow = details.querySelectorAll("tr").find((row) => row.querySelector("th").textContent.includes("GPT-6.1 Sol"));
  assert.deepEqual(solRow.querySelectorAll("td").slice(1, 4).map((td) => td.textContent), ["$2", "$10", "1M"], "明细保留输入/输出每百万价格及10美元购买力");
  assert.match(details.innerHTML, /href="https:\/\//);
  healthy(app);
});

test("Plus区间按公式进入每周tokens图，普通请求与credits折算不混入", () => {
  const app = createApp();
  app.run(`
    const extraBase = { vendor: "回归厂商", plan: "测试档", ver: "—", cur: "CNY", priceM: 100, apiIn: 10, apiOut: 20, apiCache: 1, tps: "—", source: "https://example.test/pricing", note: "" };
    METRICS_ALL.push({ ...extraBase, model: "普通请求回归", reqPer5h: 100 });
    METRICS_ALL.push({ ...extraBase, model: "credits回归", creditCNY: 100 });
    renderTokensChart();
  `);
  assert.ok(app.run('computeMetrics(METRICS_ALL.find(m => m.model === "普通请求回归")).wkLowM') > 0, "普通请求虽可换算，仍不进入周tokens图");
  assert.ok(app.run('computeMetrics(METRICS_ALL.find(m => m.model === "credits回归")).wkLowM') > 0, "credits虽可换算，仍不进入周tokens图");
  const chart = app.charts.get("chartTokens").option;
  const rows = [...new Map(chart.series.flatMap((s) => s.data.filter(Boolean).map((d) => [d._r.label, d._r]))).values()];
  assert.equal(rows.some((r) => ["普通请求回归", "credits回归"].includes(r.model)), false);
  for (const [model, high] of [["GPT-6 Sol", 30], ["GPT-6.1 Sol", 32]]) {
    const row = rows.find((r) => r.label.includes("ChatGPT Plus") && r.model === model);
    assert.ok(row, model + " Plus区间不能因原始wkLowM缺省而消失");
    assert.equal(row.lowM, 1.5, "15次×20,000tokens×5窗口÷百万");
    assert.equal(row.highM, high, "150/160次×40,000tokens×5窗口÷百万");
    assert.equal(row.isOfficial, false, "公式推算不应显示成官方tokens额度");
    assert.equal(row.conf, "中");
    const tip = chart.tooltip.formatter({ data: { _r: row } });
    assert.ok(tip.includes(`1.5–${high}M`));
    assert.match(tip, /中/);
  }
  healthy(app);
});

test("tokens图使用稳定套餐引用取得价格，稳定ID与旧数组都能排除重复估算", () => {
  const app = createApp();
  app.run(`
    globalThis.tokenReferencePlan = findPlanReference(PLAN_TOKENS[0].ref);
    const tokenReferenceMetric = METRICS_ALL.find(m => findPlanReference(m.ref) === tokenReferencePlan);
    METRICS_ALL.push({ ...tokenReferenceMetric, ref: tokenReferencePlan.id, model: "ID重复回归", wkLowM: 1, wkHighM: 2 });
    METRICS_ALL.push({ ...tokenReferenceMetric, ref: [tokenReferencePlan.vendor, tokenReferencePlan.plan], model: "旧数组重复回归", wkLowM: 1, wkHighM: 2 });
    tokenReferencePlan.priceM += 10;
    renderTokensChart();
  `);
  const rows = [...new Map(app.charts.get("chartTokens").option.series.flatMap((s) => s.data.filter(Boolean).map((d) => [d._r.label, d._r]))).values()];
  assert.equal(rows.some((r) => ["ID重复回归", "旧数组重复回归"].includes(r.model)), false, "同套餐的官方tokens和估算行不重复展示");
  const expectedPrice = app.run("tokenReferencePlan.priceM * (tokenReferencePlan.cur === 'USD' ? RATE : 1)");
  const label = app.run("PLAN_TOKENS[0].plan");
  const official = rows.find((r) => r.isOfficial && r.label.startsWith(label + "·"));
  assert.ok(official);
  assert.equal(official.priceCNY, expectedPrice, "官方图表价格直接从当前套餐身份取得");
  app.run("PLAN_TOKENS[0].ref = [tokenReferencePlan.vendor, tokenReferencePlan.plan]; renderTokensChart();");
  const after = app.charts.get("chartTokens").option.series.flatMap((s) => s.data.filter(Boolean)).find((d) => d._r.isOfficial && d._r.label.startsWith(label + "·"));
  assert.equal(after._r.priceCNY, expectedPrice, "旧数组引用仍兼容");
  healthy(app);
});

test("亮暗主题的图表tooltip读取当前语义配色，切换后已加载图表同步", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  const renderedCount = app.charts.size;
  const tooltipHtml = () => {
    const personal = app.run('personalTooltip(PLANS.find(p => p.vendor === "Anthropic" && p.plan === "Claude Pro"))');
    const formatItem = (id) => {
      const option = app.charts.get(id).option;
      return option.tooltip.formatter({ data: option.series.flatMap((s) => s.data).find(Boolean) });
    };
    return [personal, formatItem("chartTeam"), formatItem("chartTokens"), formatItem("chartRank"), app.charts.get("chartApi").option.tooltip.formatter([{ dataIndex: 0 }])];
  };
  const before = tooltipHtml();
  for (const theme of ["light", "dark"]) {
    assert.equal(app.run("document.documentElement.dataset.theme"), theme);
    const palette = app.run("Object.values(PAL)");
    for (const tip of tooltipHtml()) {
      const colors = [...tip.matchAll(/style="color:([^;"\s]+)/g)].map((m) => m[1]);
      assert.ok(colors.length > 0);
      assert.ok(colors.every((color) => palette.includes(color)), theme + " tooltip存在未随主题切换的颜色 " + colors.join(","));
    }
    for (const chart of app.charts.values()) if (chart.option.tooltip) {
      assert.equal(chart.option.tooltip.backgroundColor, app.run("PAL.tipBg"));
      assert.equal(chart.option.tooltip.textStyle.color, app.run("PAL.tipText"));
    }
    if (theme === "light") app.fire(app.elements.get("themeBtn"), "click");
  }
  assert.notEqual(tooltipHtml()[0], before[0], "额度和模型标签颜色随主题变化");
  assert.equal(app.charts.size, renderedCount);
  healthy(app);
});

test("390px 视口所有图表限制轴标签宽度并保留绘图区预算", () => {
  const app = createApp({ width: 390, url: "http://127.0.0.1:8123/index.html#s4" });
  healthy(app);
  assert.equal(app.charts.size, 6);
  for (const [id, chart] of app.charts) {
    const option = chart.option, label = option.yAxis.axisLabel, grid = option.grid;
    assert.ok(label.width > 0 && label.width <= 110, id + " 标签宽度应不超过110px");
    assert.equal(label.overflow, "truncate", id);
    const available = app.elements.get(id).getBoundingClientRect().width - grid.left - grid.right - label.width - label.margin;
    assert.ok(available > 70, id + " 配置下至少保留70px绘图区，实际为 " + available);
  }
});

test("比较和导出保留一次性/席位/4周单位、数据日期/汇率和展开字段", async () => {
  const app = createApp();
  app.run(`
    globalThis.testOnce = PLANS.find(p => p.vendor === "88code" && p.priceM === 66);
    globalThis.testSeat = PLANS.find(p => p.seat && isOnSalePlan(p));
    globalThis.testFourWeek = PLANS.find(p => /4\\s*周/.test(p.plan));
    globalThis.testMirror = PLANS.find(p => p.vendor === "AICodeMirror" && p.plan === "MAX");
    cmpState.items = [testOnce, testSeat]; openCmpModal();
  `);
  const compare = app.elements.get("cmpTable").innerHTML;
  assert.match(compare, /¥66\/一次性/);
  assert.match(compare, /席位\/月/);
  assert.doesNotMatch(compare, /¥66\/月|cmp-best-price/);
  assert.match(compare, /cmp-diff-row/);
  assert.equal(app.run("isPersonalMonthly(testFourWeek)"), false, "4周费用不能当作自然月月费");
  app.run('Object.assign(state1, { cat: "all", region: "all", q: "", limit: null }); renderPersonalChart(); resetTableFilters();');
  assert.equal(app.run("chartCache.chartPersonal.option.series[0].data.some(d => isFourWeekPlan(d._p))"), false, "个人月费图不应混入4周档");
  assert.equal(app.run("computeTableRows().includes(testFourWeek)"), true, "4周档仍应保留在完整数据表");
  app.run('cmpState.items = PLANS.filter(p => p.vendor === "Anthropic" && ["Claude Pro", "Claude Max 5x"].includes(p.plan)); renderCmpModal();');
  assert.match(app.elements.get("cmpTable").innerHTML, /cmp-best-price/);
  const csv = app.run("tableRowsCsv([testOnce, testSeat, testFourWeek, testMirror])");
  const markdown = app.run("tableRowsMarkdown([testOnce, testSeat, testFourWeek, testMirror])");
  for (const value of ["参考汇率", "一次性", "席位/月", "4周", "Claude Code", app.run("META.updated"), String(app.run("RATE"))]) {
    assert.ok(csv.includes(value), "CSV 缺少 " + value);
    assert.ok(markdown.includes(value), "Markdown 缺少 " + value);
  }
  assert.match(csv, /数据更新日期|数据截至/);
  assert.match(markdown, /数据更新日期|数据截至/);
  assert.doesNotMatch(csv, /同 PRO 档/);
  app.run('tableState.search = "AICodeMirror MAX"; renderTable();');
  app.fire(app.elements.get("exportCsvBtn"), "click");
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].filename, /^coding-plans-.*\.csv$/);
  assert.match(await app.downloads[0].blob.text(), /数据更新日期|数据截至/);
  await app.run("copyTableMarkdown()");
  assert.match(app.run("copiedText"), /参考汇率/);
  healthy(app);
});

test("数据表空态保留对比选择、禁用空导出，清除筛选取消待执行搜索并回到搜索框", async () => {
  const app = createApp();
  app.run('cmpAdd("Anthropic", "Claude Pro");');
  const search = app.elements.get("searchInput");
  search.value = "__没有任何匹配方案__";
  app.fire(search, "input");
  app.flushTimeouts();
  assert.equal(app.run("computeTableRows().length"), 0);
  assert.match(app.elements.get("tableBody").innerHTML, /没有匹配的在售方案|已选的对比方案仍保留/);
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(app.elements.get("exportCsvBtn").disabled, true);
  assert.equal(app.elements.get("copyMdBtn").disabled, true);
  app.fire(app.elements.get("exportCsvBtn"), "click");
  app.fire(app.elements.get("copyMdBtn"), "click");
  assert.equal(app.downloads.length, 0);
  assert.equal(app.run('typeof copiedText'), "undefined");
  app.run("exportTableCsv();");
  await app.run("copyTableMarkdown();");
  assert.equal(app.downloads.length, 0, "直接调用也不能生成只有表头的导出");
  assert.match(app.elements.get("tableFeedback").textContent, /没有可复制的方案/);
  assert.equal(app.elements.get("tableFeedback").getAttribute("role"), "status");
  search.value = "__另一个尚未执行的搜索__";
  app.fire(search, "input");
  app.fire(app.elements.get("tableEmptyResetBtn"), "click");
  app.flushTimeouts();
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
  assert.equal(search.value, "");
  assert.equal(app.run("document.activeElement.id"), "searchInput");
  assert.equal(app.elements.get("exportCsvBtn").disabled, false);
  assert.equal(app.elements.get("copyMdBtn").disabled, false);
  assert.equal(app.elements.get("tableResetBtn").disabled, true);
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(new URLSearchParams(app.location.search).has("q"), false);
  healthy(app);
});

test("并排对比支持逐项移出，重绘聚焦相邻按钮，关闭或入口失联有焦点恢复", () => {
  const app = createApp();
  app.run('tableState.search = "Anthropic"; renderTable();');
  const additions = app.elements.get("tableBody").querySelectorAll(".cmp-add");
  assert.ok(additions.length >= 3);
  additions.slice(0, 3).forEach((button) => app.fire(button, "click"));
  assert.equal(app.run("cmpState.items.length"), 3);
  assert.ok(additions.slice(0, 3).every((button) => button.getAttribute("aria-pressed") === "true"));
  const opener = app.elements.get("cmpOpenBtn");
  opener.focus();
  app.fire(opener, "click");
  assert.equal(app.elements.get("cmpModal").open, true);
  assert.equal(app.run("document.activeElement.id"), "cmpCloseBtn");
  let removals = app.elements.get("cmpTable").querySelectorAll(".cmp-remove");
  assert.equal(removals.length, 3);
  assert.equal(app.elements.get("cmpTable").querySelectorAll("thead th[scope=col]").length, 4);
  const adjacent = removals[2].dataset.plan;
  const removed = removals[1];
  removed.focus();
  app.fire(removed, "click");
  assert.equal(removed.isConnected, false, "重绘移除旧按钮");
  assert.equal(app.run("cmpState.items.length"), 2);
  assert.equal(app.elements.get("cmpModal").open, true);
  assert.equal(app.run("document.activeElement.dataset.plan"), adjacent);
  assert.equal(new URLSearchParams(app.location.search).get("cmp").split(";").length, 2);
  removals = app.elements.get("cmpTable").querySelectorAll(".cmp-remove");
  app.fire(removals[0], "click");
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(app.elements.get("cmpModal").open, false);
  assert.equal(opener.disabled, true);
  assert.equal(app.run("document.activeElement.id"), "searchInput", "只剩一档，禁用的比较入口不能接收焦点");
  assert.equal(app.elements.get("cmpBar").hidden, false);
  assert.match(app.elements.get("cmpBarText").textContent, /再选 1 档/);

  const entry = additions.find((button) => button.getAttribute("aria-pressed") === "false");
  app.fire(entry, "click");
  entry.focus();
  app.fire(opener, "click");
  const escaped = app.fire(app.elements.get("cmpCloseBtn"), "keydown", { key: "Escape" });
  assert.equal(escaped.defaultPrevented, true);
  assert.equal(app.elements.get("cmpModal").open, false);
  assert.equal(app.run("document.activeElement"), entry, "Escape返回原操作入口");
  entry.focus();
  app.fire(opener, "click");
  app.elements.get("cmpModal").close();
  assert.equal(app.run("document.activeElement"), entry, "原生close事件也还原焦点");
  entry.focus();
  app.fire(opener, "click");
  app.run('tableState.search = "__入口失联__"; renderTable();');
  assert.equal(entry.isConnected, false);
  app.fire(app.elements.get("cmpCloseBtn"), "click");
  assert.equal(app.run("document.activeElement"), opener, "原入口失联时返回仍可用的比较入口");
  healthy(app);
});

test("没有原生dialog接口时对比可显示、焦点循环、逐档移出并精确还原背景", () => {
  const app = createApp({ noNativeDialog: true });
  const dialog = app.elements.get("cmpModal"), backdrop = app.elements.get("cmpBackdrop");
  assert.equal(dialog.showModal, undefined);
  assert.equal(dialog.close, undefined);
  assert.equal(dialog.open, undefined, "兼容未知dialog元素，不能依赖open布尔属性");
  const header = app.run('qs(".topbar")'), hero = app.run('qs(".hero")');
  header.setAttribute("aria-hidden", "false");
  hero.setAttribute("inert", "");
  hero.setAttribute("aria-hidden", "true");
  app.run('cmpState.items = ["plan-0002", "plan-0003", "plan-0004"].map(findPlanReference); renderCmpBar();');
  const opener = app.elements.get("cmpOpenBtn");
  opener.focus();
  app.fire(opener, "click");
  assert.equal(app.run("isCmpModalOpen()"), true);
  assert.notEqual(dialog.getAttribute("open"), null);
  assert.equal(dialog.classList.contains("cmp-fallback"), true);
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(backdrop.hidden, false);
  assert.equal(app.run('document.body.classList.contains("has-cmp-modal")'), true);
  assert.notEqual(header.getAttribute("inert"), null);
  assert.equal(header.getAttribute("aria-hidden"), "true");
  assert.equal(app.run("document.activeElement.id"), "cmpCloseBtn");
  const controls = dialog.querySelectorAll("button, a[href], [tabindex]").filter((e) => !e.disabled && e.tabIndex >= 0);
  const first = controls[0], last = controls.at(-1);
  last.focus();
  const tab = app.fire(last, "keydown", { key: "Tab" });
  assert.equal(tab.defaultPrevented, true);
  assert.equal(app.run("document.activeElement"), first);
  const shiftTab = app.fire(first, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(shiftTab.defaultPrevented, true);
  assert.equal(app.run("document.activeElement"), last);
  app.elements.get("searchInput").focus();
  assert.equal(app.run("document.activeElement"), last, "inert背景不能抢走焦点");
  let removes = dialog.querySelectorAll(".cmp-remove");
  app.fire(removes[1], "click");
  assert.equal(app.run("cmpState.items.length"), 2);
  assert.equal(app.run("isCmpModalOpen()"), true);
  assert.ok(app.run('document.activeElement.classList.contains("cmp-remove")'));
  removes = dialog.querySelectorAll(".cmp-remove");
  app.fire(removes[0], "click");
  assert.equal(app.run("cmpState.items.length"), 1);
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(dialog.getAttribute("open"), null);
  assert.equal(dialog.getAttribute("aria-modal"), null);
  assert.equal(backdrop.hidden, true);
  assert.equal(app.run('document.body.classList.contains("has-cmp-modal")'), false);
  assert.equal(header.getAttribute("inert"), null);
  assert.equal(header.getAttribute("aria-hidden"), "false", "关闭恢复原来的aria-hidden而非一律删除");
  assert.equal(hero.getAttribute("inert"), "", "既有inert保留");
  assert.equal(hero.getAttribute("aria-hidden"), "true");
  assert.equal(app.run("document.activeElement.id"), "searchInput");
  app.run('cmpState.items = ["plan-0002", "plan-0003"].map(findPlanReference); renderCmpBar();');
  opener.focus();
  app.fire(opener, "click");
  app.fire(app.elements.get("cmpCloseBtn"), "keydown", { key: "Escape" });
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(app.run("document.activeElement"), opener);
  app.fire(opener, "click");
  app.fire(backdrop, "click");
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(app.run("document.activeElement"), opener);
  app.fire(opener, "click");
  app.fire(app.elements.get("cmpCloseBtn"), "click");
  assert.equal(app.run("isCmpModalOpen()"), false);
  assert.equal(app.run("document.activeElement"), opener);
  healthy(app);
});

test("表格排序键盘操作与aria说明一致，明细开关同步展开状态；额度空态恢复默认", () => {
  const app = createApp();
  const price = app.run('qs("#planTable th[data-sort=priceM]")');
  const annual = app.run('qs("#planTable th[data-sort=priceY]")');
  assert.equal(price.tabIndex, 0);
  assert.equal(price.getAttribute("aria-sort"), "ascending");
  assert.equal(annual.getAttribute("aria-sort"), null);
  assert.match(price.getAttribute("aria-label"), /当前从低到高.*激活后从高到低/);
  const event = app.fire(price, "keydown", { key: "Enter" });
  assert.equal(event.defaultPrevented, true);
  assert.equal(price.getAttribute("aria-sort"), "descending");
  app.fire(annual, "keydown", { key: " " });
  assert.equal(app.run("tableState.sortKey + ':' + tableState.sortDir"), "priceY:1");
  assert.equal(price.getAttribute("aria-sort"), null);
  assert.equal(annual.getAttribute("aria-sort"), "ascending");
  for (const [control, target] of [["tableColsToggle", "planTable"], ["metricsToggle", "metricsTable"]]) {
    const button = app.elements.get(control);
    assert.equal(button.getAttribute("aria-controls"), target);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    app.fire(button, "click");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    app.fire(button, "click");
    assert.equal(button.getAttribute("aria-expanded"), "false");
  }
  const weekly = app.run('qs("#metricsTable th[data-sort=twk]")');
  assert.equal(weekly.tabIndex, 0);
  assert.equal(weekly.getAttribute("aria-sort"), null);
  assert.match(weekly.getAttribute("aria-label"), /激活后从高到低/);
  app.fire(weekly, "keydown", { key: " " });
  assert.equal(app.run("metricsState.sortKey + ':' + metricsState.sortDir"), "twk:-1");
  assert.equal(weekly.getAttribute("aria-sort"), "descending");
  assert.match(app.elements.get("metricsNote").innerHTML, /按Tokens\/周从高到低排序/);
  const model = app.elements.get("metricsModel"), version = app.elements.get("metricsVer");
  model.value = "GPT-6.1 Sol";
  app.fire(model, "change");
  version.value = "V2";
  app.fire(version, "change");
  assert.match(app.elements.get("metricsBody").innerHTML, /当前模型与版本没有可展示的额度/);
  app.fire(app.elements.get("metricsEmptyResetBtn"), "click");
  assert.equal(app.run('JSON.stringify(metricsState)'), JSON.stringify({ model: "all", ver: "all", sortKey: "cpm", sortDir: 1 }));
  assert.equal(model.value, "all");
  assert.equal(version.value, "all");
  assert.equal(app.run("document.activeElement.id"), "metricsModel");
  assert.equal(app.elements.get("metricsResetBtn").disabled, true);
  assert.ok(app.elements.get("metricsBody").querySelectorAll("tr").length > 1);
  assert.equal(new URLSearchParams(app.location.search).has("mver"), false);
  healthy(app);
});

test("国家限定套餐始终不入通用推荐，过期country链接清理后完整表仍保留限定徽章", () => {
  for (const country of ["", "IN", "CN", "US", "invalid"]) {
    const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=100&region=intl&tool=cursor&task=daily&country=" + country });
    healthy(app);
    assert.equal(new URLSearchParams(app.location.search).has("country"), false, country + " 退役参数应清除");
    assert.equal(app.run('Object.hasOwn(pickerState, "country")'), false);
    assert.equal(app.run('eligibleProfiles().some(x => x.p.purchaseCountries?.length)'), false, country + " 限定档不能入候选");
    assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /Start（印度专属）/);
    app.run('Object.assign(pickerState, { budget: "any", region: "all", tool: "cursor", task: "daily" }); renderPicker();');
    assert.equal(app.run('eligibleProfiles().some(x => x.p.purchaseCountries?.length)'), false, "提高预算也不应恢复限定档");
    assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /Start（印度专属）/);
    app.run('tableState.search = "Cursor Start"; renderTable();');
    assert.equal(app.run('computeTableRows().some(p => p.vendor === "Cursor" && p.plan === "Start（印度专属）")'), true);
    assert.match(app.elements.get("tableBody").innerHTML, /仅限印度/);
    healthy(app);
  }
});

test("225组四维推荐满足资格、预算、工具和地区；升级/补充均排除国家限定", () => {
  const app = createApp();
  const checks = app.run(`(() => {
    let total = 0;
    const failures = [];
    const check = (ok, label) => { if (!ok) failures.push(label + " " + JSON.stringify(pickerState)); };
    const allowed = (p, label) => {
      check(!isRelay(p) && !isRetiredPlan(p) && !isOneTimePlan(p) && !isRenewalOnly(p), label + " 不可购买/中转");
      check(!p.seat && p.cat !== "team", label + " 非个人档");
      check(p.includedModelQuota !== false && p.modelAccess !== "byok" && hasCodingSurface(p), label + " 无附赠编程推理额度");
      check(!p.purchaseCountries?.length, label + " 国家限定档不应进入通用推荐");
      check(pickerState.region === "all" || p.region === pickerState.region, label + " 地区不符");
      check(matchesTool(p, pickerState.tool), label + " 工具不符");
    };
    for (const budget of ["0", "100", "200", "500", "any"])
    for (const region of ["all", "cn", "intl"])
    for (const tool of ["any", "claude", "codex", "cursor", "own"])
    for (const task of ["hard", "both", "daily"]) {
      Object.assign(pickerState, { budget, region, tool, task });
      total++;
      const pool = eligibleProfiles(), main = chooseMain(pool);
      const cap = budget === "any" ? Infinity : Number(budget);
      for (const x of pool) {
        allowed(x.p, "候选 " + x.p.plan);
        check(cnyOf(x.p, "M") <= cap + 0.05, "候选超预算");
        check(budget === "0" ? x.p.priceM === 0 : x.p.priceM > 0, "候选免费/付费口径不符");
      }
      if (!main) continue;
      check(pool.includes(main), "主计划超出候选池");
      check(task === "hard" ? !!main.headline : task === "daily" ? !!main.loose.length : !!(main.headline || main.loose.length), "主计划模型不符任务");
      const next = nextTier(main);
      if (next) {
        allowed(next.p, "升级 " + next.p.plan);
        check(next.p.vendor === main.p.vendor && cnyOf(next.p, "M") > cnyOf(main.p, "M"), "升级厂商/价格不符");
      }
      const supplement = pickSupplement(main, pool).chosen;
      if (supplement) {
        allowed(supplement.p, "补充 " + supplement.p.plan);
        check(pool.includes(supplement) && supplement.p.vendor !== main.p.vendor, "补充重复或超出候选");
        check(cnyOf(main.p, "M") + cnyOf(supplement.p, "M") <= cap + 0.05, "补充合计超预算");
      }
    }
    return { total, failures };
  })()`);
  assert.equal(checks.total, 225);
  assert.equal(checks.failures.length, 0, checks.failures.slice(0, 12).join("\n"));
  healthy(app);
});

test("Pro无5h上限不触发Go Plus加购，平台免费及非编程订阅不进入推荐", () => {
  const app = createApp();
  app.run('Object.assign(pickerState, { budget: "any", region: "all", tool: "any", task: "both" });');
  for (const price of [100, 200, 500]) {
    const result = app.run(`(() => {
      const plan = PLANS.find(p => p.vendor === "OpenAI" && p.priceM === ${price} && p.plan.startsWith("ChatGPT Pro"));
      const profile = planProfile(plan);
      return { period: profile.windowPeriod, shared: profile.shared, card: dailyCard(profile, eligibleProfiles()), window: windowSentence(plan, profile.headline) };
    })()`);
    assert.equal(result.period, "none");
    assert.equal(result.shared, false);
    assert.match(result.card, /已包含/);
    assert.doesNotMatch(result.card, /OpenCode Go Plus|可选补充|另付/);
    assert.match(result.window, /没有 5 小时上限/);
  }
  for (const [vendor, plan] of [["xAI", "SuperGrok"], ["Canopy Wave", "Coding Plan Pro Bundle"]]) {
    const found = app.run("PLANS.find(p => p.vendor === " + JSON.stringify(vendor) + " && p.plan === " + JSON.stringify(plan) + ")");
    assert.ok(found, vendor + " 测试方案存在");
    assert.equal(app.run("eligibleProfiles().some(x => x.p.vendor === " + JSON.stringify(vendor) + " && x.p.plan === " + JSON.stringify(plan) + ")"), true, vendor + " 编程入口不应被通用工具正则误排除");
  }
  assert.equal(app.run('recommendablePlan(PLANS.find(p => p.vendor === "Kilo Code" && p.priceM === 0))'), false);
  assert.equal(app.run('recommendablePlan(PLANS.find(p => p.vendor === "Google" && p.plan === "Google AI Plus"))'), false);
  app.run('Object.assign(pickerState, { budget: "0", region: "all", tool: "any", task: "daily" }); renderPicker();');
  for (const vendor of ["Kilo Code", "Zed", "Cline", "Roo Code"]) {
    const eligibility = app.run("PLANS.filter(p => p.priceM === 0 && p.vendor.startsWith(" + JSON.stringify(vendor) + ")).map(p => ({ plan: p.plan, inPool: eligibleProfiles().some(x => x.p === p) }))");
    assert.ok(eligibility.length > 0, vendor + " 免费平台测试方案存在");
    assert.ok(eligibility.every((p) => !p.inPool), vendor + " 未附赠推理额度，不能进入免费主计划候选");
  }
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /<b>(?:Kilo Code|Zed|Cline|Roo Code)/);
  healthy(app);
});

test("附加模型权益可检索，窗口缺省展示不编造5h额度", () => {
  const app = createApp();
  app.run('tableState.search = "Astra Ultrafast"; renderTable();');
  assert.equal(app.run('computeTableRows().some(p => p.vendor === "OpenAI" && p.priceM === 500)'), true);
  assert.match(app.elements.get("tableBody").innerHTML, /Astra Ultrafast/);
  const placeholder = (period) => app.run(`METRICS_COLUMNS.find(c => c.id === "t5h").cell({ m: { windowPeriod: ${JSON.stringify(period)} }, c: { fLow: null }, isPayg: false })`);
  assert.match(placeholder("none"), /无5h上限/);
  assert.match(placeholder("month"), /月度池；无5h额度/);
  assert.match(placeholder("unknown"), /未公布/);
  assert.equal(app.run('fmtVal(null, "USD")'), "—");
  assert.equal(app.run("rateClass(null)"), "");
  const mimo = app.run('windowNoteShort(planProfile(PLANS.find(p => p.vendor === "小米 MiMo" && p.plan === "Token Plan Lite")))');
  assert.match(mimo, /共用同一额度池/);
  assert.match(mimo, /周期或窗口上限未公开/);
  assert.doesNotMatch(mimo, /共享情况未公开|5 小时/);
  app.run('Object.assign(pickerState, { region: "cn", budget: "200", tool: "cursor", task: "daily" }); renderPicker();');
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /没赢|没拿下|复杂任务主计划/);
  healthy(app);
});

async function main() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("  ✓ " + name); }
    catch (err) { failed++; console.error("  ✗ " + name + "\n" + (err.stack || err)); }
  }
  console.log(`用户流程回归：${tests.length - failed} 通过，${failed} 失败`);
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module) main();
module.exports = { createApp };
