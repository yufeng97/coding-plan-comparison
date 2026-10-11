/* 整页回归：每次 openPage 重新载入业务模块并挂载真实 App，再按 main.ts 的顺序启动，相当于打开一次新页面。
 * 页面结构来自 index.html 的外壳与 App.vue 本身，不另外维护页面替身或旧渲染器。
 * 浏览器边界由测试控制：会话历史（前进后退同步派发 popstate，锚点不同再派发 hashchange）、假计时器、
 * 记录配置的 ECharts 替身、下载、剪贴板、本机存储与按需数据下载。真实布局、焦点时序与滚动由 Playwright 覆盖。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, vi } from "vitest";
import { createApp, nextTick, type App as VueApp } from "vue";
import { flushPromises } from "@vue/test-utils";

type Runtime = typeof import("@domain/runtime");
type Listener = [EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** index.html 的 body 外壳：加载提示、挂载点、ECharts 地址模板与按需数据入口；不含入口脚本。 */
const SHELL = (fs.readFileSync(path.join(root, "index.html"), "utf8").match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "")
  .replace(/<script type="module"[^>]*><\/script>/, "")
  .replace(/<noscript>[\s\S]*?<\/noscript>/, "");
/** 按需数据经典脚本：入口地址 → 定义的全局名称。 */
const OPTIONAL_DATA: Record<string, "MAINTENANCE" | "BENCHMARKS"> = { "js/maintenance-data.js": "MAINTENANCE", "js/benchmark-data.js": "BENCHMARKS" };
const dataGlobals = globalThis as unknown as Record<string, unknown>;
/** 每份数据只执行一次（数 MB），之后每次载入都解析出新的对象，页面之间不共享可变数据。 */
const optionalDataJson = new Map<string, string>();
function readOptionalData(src: string) {
  const name = OPTIONAL_DATA[src]!;
  let json = optionalDataJson.get(src);
  if (json === undefined) {
    const source = fs.readFileSync(path.join(root, src), "utf8");
    json = JSON.stringify(vm.runInNewContext(`${source}\n;${name};`));
    optionalDataJson.set(src, json);
  }
  return { name, value: JSON.parse(json) as unknown };
}

/** 测试用的 ECharts 实例：记下每次设置的配置与派发的动作，并像 ECharts 一样维护图例选择。
 * 每次 setOption 按新配置的图例重新全选（页面须自行恢复隐藏的系列）；图例动作派发与 ECharts 同名的事件。 */
export class FakeChart {
  option: any = null;
  actions: Record<string, unknown>[] = [];
  selected: Record<string, boolean> = {};
  disposed = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  constructor(readonly id: string, private readonly timeline: string[]) {}
  setOption(option: any) {
    this.option = option;
    this.selected = Object.fromEntries((option.legend?.data ?? []).map((item: string | { name: string }) => [typeof item === "string" ? item : item.name, true]));
    this.timeline.push("render:" + this.id);
  }
  getOption() { return this.option; }
  resize() {}
  getWidth() { return 0; }
  getHeight() { return 0; }
  dispatchAction(action: Record<string, unknown>) {
    this.actions.push(action);
    const name = String(action.name);
    const events: Record<string, [string, (current: boolean) => boolean]> = {
      legendSelect: ["legendselected", () => true],
      legendUnSelect: ["legendunselected", () => false],
      legendToggleSelect: ["legendselectchanged", (current) => !current],
    };
    const change = events[String(action.type)];
    if (!change) return;
    this.selected[name] = change[1](this.selected[name] !== false);
    for (const listener of this.listeners.get(change[0]) ?? []) listener({ name, selected: { ...this.selected } });
  }
  on(type: string, listener: (event: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  off(type: string) { this.listeners.delete(type); }
  dispose() { this.disposed = true; }
  /** 当前图例选择下仍显示的系列。 */
  visibleSeries(): { name: string }[] { return (this.option?.series ?? []).filter((series: { name: string }) => this.selected[series.name] !== false); }
}

export interface PageOptions {
  /** 打开的地址（路径、查询与锚点），默认 /index.html。 */
  url?: string;
  /** 打开前写入本机存储的条目。 */
  storage?: Record<string, string>;
  /** 本机存储不可用：读取或写入抛错，或访问 localStorage 本身抛错。 */
  storageFails?: "read" | "write" | "both" | "getter";
  /** 页面地址初始化后，应用写入会话历史（push/replaceState）时抛错；测试边界的前进后退仍正常。 */
  historyFails?: boolean;
  /** 视口宽度（影响分页条数与窄屏图表）。 */
  width?: number;
  /** 浏览器没有原生 dialog 接口（showModal/close），走降级弹窗。 */
  noNativeDialog?: boolean;
  /** 按需数据不预先载入：页面追加数据脚本后由 finishDataLoads 推进下载，failData 决定某次下载失败。 */
  lazyData?: boolean;
  failData?: (src: string, attempt: number) => boolean;
  /** document.fonts.ready（字体加载完成的时机）。 */
  fontsReady?: Promise<unknown>;
  /** 提供 requestAnimationFrame（由 flushAnimationFrames 推进）；默认不提供，页面走同步分支。 */
  animationFrames?: boolean;
  /** 替换业务模块的部分导出（启动代码与组件经模块导入时看到替换值；模块内部的直接调用不受影响）。 */
  override?: (original: Runtime) => Partial<Runtime>;
}

/** 与浏览器一致的会话历史：push/replace 只改地址，前进后退同步派发 popstate，锚点不同再派发 hashchange。 */
function installHistory() {
  const native = window.history;
  const replace = native.replaceState.bind(native);
  const entries = [{ url: location.href, state: native.state as unknown }];
  const ours = new WeakSet<Event>();
  let index = 0;
  const resolve = (url?: string | URL | null) => new URL(url ?? location.href, location.href).href;
  const fake = {
    get length() { return entries.length; },
    get state() { return entries[index]!.state; },
    scrollRestoration: "auto",
    replaceState(state: unknown, _title: string, url?: string | URL | null) {
      const next = resolve(url);
      replace(state, "", next);
      entries[index] = { url: next, state };
    },
    pushState(state: unknown, _title: string, url?: string | URL | null) {
      const next = resolve(url);
      replace(state, "", next);
      entries.splice(index + 1, entries.length, { url: next, state });
      index = entries.length - 1;
    },
    go(delta = 0) {
      const target = index + delta;
      if (!delta || target < 0 || target >= entries.length) return;
      /* hashchange 只看两条历史记录的地址：popstate 处理函数随后改写地址不影响是否派发。 */
      const oldURL = entries[index]!.url, newURL = entries[target]!.url;
      index = target;
      replace(entries[target]!.state, "", newURL);
      window.dispatchEvent(new PopStateEvent("popstate", { state: entries[target]!.state }));
      if (new URL(oldURL).hash !== new URL(newURL).hash) {
        const event = new HashChangeEvent("hashchange", { oldURL, newURL });
        ours.add(event);
        window.dispatchEvent(event);
      }
    },
    back() { this.go(-1); },
    forward() { this.go(1); },
  };
  /* happy-dom 在 push/replaceState 改变 hash 时会用真实计时器补发 hashchange，浏览器不会这样做；只放行上面 go 派发的事件。 */
  const dropNative = (event: Event) => { if (!ours.has(event)) event.stopImmediatePropagation(); };
  window.addEventListener("hashchange", dropNative, true);
  for (const target of [window, globalThis]) Object.defineProperty(target, "history", { configurable: true, get: () => fake });
  return () => {
    window.removeEventListener("hashchange", dropNative, true);
    for (const target of [window, globalThis]) Object.defineProperty(target, "history", { configurable: true, get: () => native });
  };
}

/** 临时替换对象上的属性，返回还原函数。
 * 页面边界不用 vi.spyOn：间谍会保留每次调用的参数（监听函数连同整份业务模块），重复打开页面时内存随之累积。 */
function replaceProperty(target: object, key: string, descriptor: PropertyDescriptor) {
  const own = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  return () => { if (own) Object.defineProperty(target, key, own); else delete (target as Record<string, unknown>)[key]; };
}
/** 临时替换方法；make 收到原实现，返回替换后的函数。 */
function replaceMethod<T extends object, K extends keyof T & string>(target: T, key: K, make: (original: T[K]) => T[K]) {
  return replaceProperty(target, key, { writable: true, value: make(target[key]) });
}

/** 记录启动期间注册的窗口与文档监听，关闭页面时一并移除，避免影响下一个用例。 */
function trackListeners() {
  const added: Listener[] = [];
  const restores = ([window, document] as EventTarget[]).map((target) => replaceMethod(target, "addEventListener", (original) =>
    function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (listener) added.push([target, type, listener, options]);
      original.call(target, type, listener, options);
    }));
  return () => {
    for (const restore of restores) restore();
    for (const [target, type, listener, options] of added.splice(0)) target.removeEventListener(type, listener, options);
  };
}

/** 按事件类型构造带冒泡的事件，返回事件本身以便检查 defaultPrevented。 */
export function fire(target: EventTarget, type: string, init: Record<string, unknown> = {}) {
  const options = { bubbles: true, cancelable: true, ...init };
  const event = /^(click|pointerdown|mousedown)$/.test(type) ? new MouseEvent(type, options)
    : /^key/.test(type) ? new KeyboardEvent(type, options)
    : new Event(type, options);
  target.dispatchEvent(event);
  return event;
}

let current: { close(): void } | undefined;
afterEach(() => {
  current?.close();
  current = undefined;
});

/** 打开一次页面：返回刚载入的业务模块与页面边界的观察点。 */
export async function openPage(options: PageOptions = {}) {
  current?.close();
  const restores: (() => void)[] = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"] });
  vi.resetModules();
  document.body.innerHTML = SHELL;
  document.documentElement.removeAttribute("data-theme");
  /* happy-dom 把 summary 当成普通 HTMLElement，默认 tabIndex 为 -1；浏览器里 details 的
   * 首个 summary 可自然进入 Tab 顺序。补齐这项边界，仍保留显式 tabindex 与其它元素的原实现。 */
  const tabIndex = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "tabIndex")!;
  restores.push(replaceProperty(HTMLElement.prototype, "tabIndex", {
    ...tabIndex,
    get(this: HTMLElement) {
      if (this.tagName === "SUMMARY" && this.getAttribute("tabindex") == null &&
        this.parentElement?.tagName === "DETAILS" && this.parentElement.querySelector("summary") === this) return 0;
      return tabIndex.get!.call(this) as number;
    },
  }));
  restores.push(replaceProperty(window, "innerWidth", { writable: true, value: options.width ?? 1280 }));
  /* 滚动位置由测试直接设定（happy-dom 没有布局，scrollY 只读）。 */
  restores.push(replaceProperty(window, "scrollY", { writable: true, value: 0 }));
  restores.push(installHistory());
  history.replaceState(null, "", options.url ?? "/index.html");
  /* 地址已由测试边界设好再拒绝应用写入；installHistory 的前进后退用内部原生实现恢复地址。 */
  if (options.historyFails) restores.push(
    replaceMethod(history, "pushState", () => () => { throw new Error("history writes denied"); }),
    replaceMethod(history, "replaceState", () => () => { throw new Error("history writes denied"); }),
  );
  localStorage.clear();
  for (const [key, value] of Object.entries(options.storage ?? {})) localStorage.setItem(key, value);
  if (options.storageFails === "getter") restores.push(replaceProperty(window, "localStorage", { get() { throw new Error("storage denied"); } }), replaceProperty(globalThis, "localStorage", { get() { throw new Error("storage denied"); } }));
  else {
    /* happy-dom 的 localStorage 是代理对象，方法只能在 Storage 原型上替换。 */
    if (options.storageFails === "read" || options.storageFails === "both") restores.push(replaceMethod(Storage.prototype, "getItem", () => () => { throw new Error("storage read denied"); }));
    if (options.storageFails === "write" || options.storageFails === "both") restores.push(replaceMethod(Storage.prototype, "setItem", () => () => { throw new Error("storage write denied"); }));
  }
  if (options.noNativeDialog) {
    for (const key of ["showModal", "close"]) restores.push(replaceProperty(HTMLDialogElement.prototype, key, { writable: true, value: undefined }));
  }
  if (options.fontsReady) restores.push(replaceProperty(document, "fonts", { value: { ready: options.fontsReady } }));
  /* happy-dom 的 MediaQueryList 会在内部窗口对象上注册 resize 监听，关闭页面时无法移除；这里的媒体条件都不成立且不会变化。 */
  restores.push(replaceProperty(window, "matchMedia", { writable: true, value: (media: string) => ({
    matches: false, media, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  }) }));
  if (!options.animationFrames) for (const target of [window, globalThis]) restores.push(replaceProperty(target, "requestAnimationFrame", { writable: true, value: undefined }));

  const timeline: string[] = [];
  const charts = new Map<string, FakeChart>();
  const errors: string[] = [];
  const warnings: string[] = [];
  const downloads: { filename: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  let copied: string | undefined;
  let clipboardDenied = false;
  const fallbackCopies: { command: string; text: string | undefined; dialog: string }[] = [];
  let nextUrl = 0;
  dataGlobals.echarts = {
    init(element: HTMLElement) {
      const chart = new FakeChart(element.id, timeline);
      charts.set(element.id, chart);
      return chart;
    },
  };
  /* 按需数据：默认在启动前就绪（同页面已下载）；lazyData 时拦截页面追加的数据脚本。 */
  const scriptLoads: string[] = [];
  const pendingScripts: { script: HTMLScriptElement; src: string; attempt: number }[] = [];
  const loadData = (src: string) => { const { name, value } = readOptionalData(src); dataGlobals[name] = value; };
  if (!options.lazyData) for (const src of Object.keys(OPTIONAL_DATA)) loadData(src);
  restores.push(
    replaceMethod(document.head, "appendChild", (appendChild) => function <T extends Node>(node: T): T {
      if (node instanceof HTMLScriptElement && node.dataset.optionalData) {
        const src = (node.getAttribute("src") || "").replace(/[?#].*$/, "");
        scriptLoads.push(src);
        pendingScripts.push({ script: node, src, attempt: scriptLoads.filter((item) => item === src).length });
        return node;
      }
      return appendChild.call(document.head, node) as T;
    }),
    replaceMethod(console, "error", () => (...args: unknown[]) => { errors.push(args.map(String).join(" ")); }),
    replaceMethod(console, "warn", () => (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); }),
    replaceMethod(URL, "createObjectURL", () => (blob: Blob | MediaSource) => {
      const url = "blob:page-" + ++nextUrl;
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    }),
    replaceMethod(URL, "revokeObjectURL", () => () => {}),
    replaceMethod(HTMLAnchorElement.prototype, "click", (click) => function (this: HTMLAnchorElement) {
      if (this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href)! });
      else click.call(this);
    }),
    replaceProperty(navigator, "clipboard", { value: { writeText: async (text: string) => {
      if (clipboardDenied) throw new Error("clipboard denied");
      copied = text;
    } } }),
    /* 剪贴板接口不可用时页面改用选中文本框 + execCommand("copy")：记下当时文本框的内容和所在窗口。 */
    replaceProperty(document, "execCommand", { writable: true, value: (command: string) => {
      const area = Array.from(document.querySelectorAll("textarea")).find((item) => item.value && item.selectionStart === 0 && item.selectionEnd === item.value.length);
      fallbackCopies.push({ command, text: area?.value, dialog: area?.closest("dialog")?.id ?? "" });
      return !!area;
    } }),
    replaceMethod(Element.prototype, "scrollIntoView", () => function (this: Element) { timeline.push("scroll:" + this.id); }),
  );
  const stopListening = trackListeners();
  document.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement;
    timeline.push("focus:" + (target.id || target.dataset.planId || target.tagName));
  });

  const override = options.override;
  if (override) vi.doMock("@domain/runtime", async (importOriginal) => {
    const original = await importOriginal<Runtime>();
    /* 模板会探测导入对象的 Vue 内部标记；替身模块对未定义的名称会报错，这里显式给出并让 Vue 跳过代理。 */
    return { ...original, ...override(original), __v_isRef: false, __v_skip: true, __v_isReactive: false, __v_isReadonly: false };
  });
  const runtime: Runtime = await import("@domain/runtime");
  const { startApplication } = await import("@domain/startup");
  const { default: App } = await import("../App.vue");
  runtime.applyUrlState();
  runtime.loadFollowState();
  runtime.refreshPalette();
  const app: VueApp = createApp(App);
  app.mount("#app");
  await nextTick();
  startApplication();
  await flushPromises();

  let closed = false;
  const page = {
    runtime,
    charts,
    timeline,
    errors,
    warnings,
    downloads,
    get copied() { return copied; },
    /** 降级复制（execCommand）时的文本框内容与所在窗口 id。 */
    fallbackCopies,
    /** 之后的剪贴板写入被拒绝，页面需走降级复制。 */
    failClipboard() { clipboardDenied = true; },
    get scriptLoads() { return scriptLoads.slice(); },
    /** 页面里的元素（缺失时报错，避免断言落空）。 */
    byId<T extends HTMLElement = HTMLElement>(id: string) {
      const element = document.getElementById(id);
      if (!element) throw new Error("页面缺少 #" + id);
      return element as T;
    },
    /** 站内锚点链接（导航或章节菜单）。 */
    anchor(hash: string) {
      const link = document.querySelector<HTMLAnchorElement>(`a[href="${hash}"]`);
      if (!link) throw new Error("页面缺少链接 " + hash);
      return link;
    },
    fire,
    /** 在 window 上派发事件（popstate、load、scroll、resize 等）。 */
    fireWindow(type: string, init: Record<string, unknown> = {}) {
      const event = type === "popstate" ? new PopStateEvent(type, { state: history.state, ...init })
        : /^key/.test(type) ? new KeyboardEvent(type, init) : new Event(type, init);
      window.dispatchEvent(event);
      return event;
    },
    /** 推进所有待执行的计时器与动画帧（防抖、延迟重绘），再等 Vue 更新。 */
    async flushTimers() {
      vi.runOnlyPendingTimers();
      await flushPromises();
    },
    /** 执行已排队的动画帧（需 animationFrames）。 */
    async flushAnimationFrames() {
      vi.advanceTimersToNextFrame();
      await flushPromises();
    },
    /** 完成页面追加的按需数据下载（failData 决定成败），再等页面更新。 */
    async finishDataLoads() {
      for (const { script, src, attempt } of pendingScripts.splice(0)) {
        if (options.failData?.(src, attempt)) { script.onerror?.(new Event("error")); continue; }
        loadData(src);
        script.onload?.(new Event("load"));
      }
      await flushPromises();
    },
    /** 等 Vue 与 Promise 链完成当前更新。 */
    settle: flushPromises,
    /** 页面启动与渲染没有报错。 */
    healthy() {
      if (errors.length) throw new Error("页面报错：" + errors.join("\n"));
    },
    /** 关闭页面并还原所有替换；重复调用无效果。某一步失败时其余步骤照常执行，最后报告第一个错误。 */
    close() {
      if (closed) return;
      closed = true;
      if (current === page) current = undefined;
      const failures: unknown[] = [];
      const attempt = (step: () => void) => { try { step(); } catch (error) { failures.push(error); } };
      attempt(() => app.unmount());
      if (override) attempt(() => vi.doUnmock("@domain/runtime"));
      attempt(stopListening);
      for (const restore of restores.reverse()) attempt(restore);
      for (const name of ["echarts", ...Object.values(OPTIONAL_DATA)]) delete dataGlobals[name];
      attempt(() => { vi.clearAllTimers(); vi.useRealTimers(); });
      attempt(() => vi.restoreAllMocks());
      attempt(() => localStorage.clear());
      document.body.innerHTML = "";
      if (failures.length) throw failures[0];
    },
  };
  current = page;
  return page;
}
export type Page = Awaited<ReturnType<typeof openPage>>;
