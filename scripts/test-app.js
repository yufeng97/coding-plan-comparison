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
  const documentEvents = new Map(), windowEvents = new Map(), timers = new Map(), timeoutIds = new Set();
  const width = options.width || 1280;
  let nextTimer = 0, nextObjectUrl = 0, auditCalls = 0, documentRoot = null;
  let currentUrl = new URL(options.url || "http://127.0.0.1:8123/index.html");
  const location = {};
  for (const key of ["href", "pathname", "search", "hash", "origin"]) {
    Object.defineProperty(location, key, { get: () => currentUrl[key], set: (v) => { currentUrl[key] = v; } });
  }
  const addListener = (map, type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };

  /* 只实现页面实际用到的选择器，动态表头、移出按钮和筛选绑定也走真实事件。 */
  function matchesSimple(e, selector) {
    const tag = selector.match(/^[\w:-]+/);
    if (tag && e.tagName !== tag[0].toUpperCase()) return false;
    for (const m of selector.matchAll(/#([\w-]+)/g)) if (e.id !== m[1]) return false;
    for (const m of selector.matchAll(/\.([\w-]+)/g)) if (!e.classList.contains(m[1])) return false;
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
      this.style = {};
      this.value = this.attrs.get("value") || "";
      this.textContent = "";
      this._html = "";
      this.listeners = new Map();
      this.open = false;
      this.hidden = this.attrs.has("hidden");
      this.disabled = this.attrs.has("disabled");
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
    setAttribute(name, value) { this.attrs.set(name, String(value)); if (name === "open") this.open = true; }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); if (name === "open") this.open = false; }
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
    scrollIntoView(opts) {
      timeline.push("scroll:" + this.id);
      scrolls.push({ id: this.id, options: opts, rendered: [...charts.keys()] });
    }
    showModal() { this.open = true; }
    close() { const wasOpen = this.open; this.open = false; if (wasOpen) fire(this, "close"); }
    focus() { if (this.isConnected && !this.disabled) { document.activeElement = this; timeline.push("focus:" + (this.id || this.dataset.plan || this.tagName)); } }
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
    execCommand: () => true,
  };
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
  const window = { innerWidth: width, innerHeight: 800, scrollY: 0, addEventListener: (type, fn) => addListener(windowEvents, type, fn), matchMedia, scrollTo() {} };
  const savedStorage = new Map(Object.entries(options.storage || {}));
  const localStorage = {
    getItem(key) { if (options.storageReadThrows) throw new Error("storage read denied"); return savedStorage.get(key) ?? null; },
    setItem(key, value) { if (options.storageWriteThrows) throw new Error("storage write denied"); savedStorage.set(key, String(value)); },
  };
  const history = {
    replaceState(_state, _title, url) { if (options.historyThrows) throw new Error("history unavailable"); currentUrl = new URL(url, currentUrl); },
    pushState(_state, _title, url) { if (options.historyThrows) throw new Error("history unavailable"); currentUrl = new URL(url, currentUrl); },
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
          for (const fn of listeners.get("legendselectchanged") || []) fn({ name: action.name, selected: this.selected });
        },
        visibleSeries() { return this.option.series.filter((series) => this.selected[series.name] !== false); },
      };
      charts.set(e.id, chart);
      return chart;
    } },
  };
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
  return { run, elements, charts, timeline, scrolls, errors, warnings, downloads, location, fire, get auditCalls() { return auditCalls; },
    flushTimeouts() { for (const id of [...timeoutIds]) { const fn = timers.get(id); timers.delete(id); timeoutIds.delete(id); if (fn) fn(); } },
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

test("tokens图区间由两组DOM图例完整切换，重绘保留隐藏状态；API图例与明细完整", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  for (const [chartId, legendId, segments] of [["chartTokens", "tokensLegend", 2], ["chartApi", "apiLegend", 1], ["chartPower", "powerLegend", 1]]) {
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
