
/* 启动、URL 状态恢复与历史导航。原 scripts/tests/test-app-history.js（页面虚拟 DOM），现用真实 App 与 Vue 渲染。
 * Vue 按永久 ID 保留表格行，历史恢复不再重建节点；这里核对焦点仍落在同一方案上。真实浏览器的焦点与滚动时序另见 ui.browser.spec.js。 */
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { fire, openPage, type Page } from "../test/page";

const blur = () => (document.activeElement as HTMLElement | null)?.blur();
const planButton = (id = "plan-0002") => document.querySelector<HTMLElement>(`#tableBody .cmp-add[data-plan-id="${id}"]`);
const removeButton = (id: string) => document.querySelector<HTMLElement>(`#cmpModal .cmp-remove[data-plan-id="${id}"]`);
async function type(page: Page, id: string, value: string) {
  const input = page.byId<HTMLInputElement>(id);
  input.value = value;
  fire(input, "input");
  await page.settle();
  return input;
}

test("完整启动恢复 URL，debug 仅运行一次、保留筛选并清除退役country参数", async () => {
  const page = await openPage({
    url: "/index.html?debug=1&country=IN&region=intl&budget=500&tool=cursor&task=daily&plimit=all&cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x",
    mock: { "@app/picker": (original) => ({ auditProfiles: vi.fn(original.auditProfiles) }) },
  });
  const app = page.runtime;
  page.healthy();
  assert.equal(vi.mocked(app.auditProfiles).mock.calls.length, 1);
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries({ debug: "1", region: "intl", budget: "500", tool: "cursor", task: "daily", plimit: "all" })) assert.equal(params.get(key), value, key);
  assert.equal(params.has("country"), false, "旧购买资格参数不应继续分享");
  assert.equal(Object.hasOwn(app.pickerState, "country"), false, "推荐只保留四维状态");
  assert.equal(app.pickerState.region, "intl");
  assert.equal(app.pickerState.budget, "500");
  assert.equal(app.personalState.limit, null);
  assert.equal(app.cmpState.items.length, 2, "分享链接中的重复方案应合并");
  assert.equal(page.byId<HTMLDialogElement>("cmpModal").open, true);
  assert.ok(page.byId("quickGrid").innerHTML);
  assert.ok(page.byId("metricsBody").innerHTML);
  assert.ok(page.byId("sourceList").innerHTML);
});

test("后退和前进恢复URL对应筛选，缺省参数还原默认且不抢焦点", async () => {
  let page = await openPage();
  const app = page.runtime, initial = location.href;
  fire(page.anchor("#table"), "click");
  await page.settle();
  const search = await type(page, "searchInput", "Cursor");
  await page.flushTimers();
  assert.equal(history.length, 2, "筛选replaceState不会新增历史条目");
  const filtered = location.href;
  const filteredIds = app.computeTableRows().map((p) => p.id).join(";");
  assert.equal(new URLSearchParams(location.search).get("q"), "Cursor");
  search.focus();
  history.back();
  await page.settle();
  assert.equal(location.href, initial);
  assert.equal(app.tableState.search, "");
  assert.equal(search.value, "");
  assert.equal(app.computeTableRows().length, app.PLANS.filter(app.isOnSalePlan).filter((p) => !app.tableExtraHidden(p)).length);
  assert.equal(document.activeElement, search, "恢复历史不移动用户当前焦点");
  history.forward();
  await page.settle();
  assert.equal(location.href, filtered);
  assert.equal(app.tableState.search, "Cursor");
  assert.equal(search.value, "Cursor");
  assert.equal(app.computeTableRows().map((p) => p.id).join(";"), filteredIds, "前进恢复完全相同的搜索结果");
  assert.equal(document.activeElement, search);
  const shared = location.pathname + location.search + location.hash;
  history.back();
  fire(page.anchor("#s1"), "click");
  await page.settle();
  assert.equal(history.length, 2, "后退后新导航截断原前进分支");
  history.forward();
  assert.equal(location.hash, "#s1");
  page.healthy();
  page = await openPage({ url: shared });
  assert.equal(page.runtime.tableState.search, "Cursor", "前进后的分享URL和当前视图一致");
});

test("同锚点popstate也恢复全部状态，push/replace不派发历史导航事件", async () => {
  const page = await openPage();
  const app = page.runtime;
  const events: string[] = [];
  window.addEventListener("popstate", (e) => events.push(e.type));
  window.addEventListener("hashchange", (e) => events.push(e.type));
  const savedUrl = "?budget=500&region=intl&tool=codex&task=daily&pcat=tool&pregion=intl&pbilling=Y&pq=Cursor&plimit=all&rank=all&rscope=credits&q=Cursor&tcat=tool&tregion=intl&tsort=priceY:-1&mmodel=GPT-6.1+Sol&mver=V2&msort=twk:-1#table";
  history.pushState({ fixture: "saved" }, "", savedUrl);
  history.pushState({ fixture: "default" }, "", location.pathname + "#table");
  history.replaceState({ fixture: "replaced" }, "", location.href);
  assert.equal(events.length, 0);
  assert.equal(history.length, 3);
  history.back();
  await page.settle();
  assert.equal((history.state as { fixture: string }).fixture, "saved");
  assert.equal(events.join(","), "popstate", "相同hash只产生popstate");
  assert.equal(JSON.stringify(app.pickerState), JSON.stringify({ budget: "500", region: "intl", tool: "codex", task: "daily", billing: "M", priority: "quota" }));
  assert.equal(JSON.stringify(app.personalState), JSON.stringify({ cat: "tool", region: "intl", billing: "Y", q: "Cursor", limit: null, fromPicker: false }));
  assert.equal(JSON.stringify(app.rankState), JSON.stringify({ tier: "all", scope: "credits", vendor: "all", fromPicker: false }));
  assert.equal(JSON.stringify(app.tableState), JSON.stringify({ search: "Cursor", cat: "tool", region: "intl", vendor: "all", sortKey: "priceY", sortDir: -1, fromPicker: false, extra: false }));
  assert.equal(JSON.stringify(app.metricsState), JSON.stringify({ model: "GPT-6.1 Sol", ver: "V2", tier: "flagship", offer: "current", sortKey: "twk", sortDir: -1, fromPicker: false }));
  assert.equal(page.byId<HTMLInputElement>("chartSearch").value, "Cursor");
  assert.equal(page.byId<HTMLInputElement>("searchInput").value, "Cursor");
  assert.equal(page.byId<HTMLSelectElement>("metricsModel").value, "GPT-6.1 Sol");
  assert.equal(page.byId<HTMLSelectElement>("metricsVer").value, "V2");
  assert.equal(location.search, new URL(savedUrl, location.href).search, "历史恢复渲染不得重写目标URL");
  history.forward();
  await page.settle();
  assert.equal((history.state as { fixture: string }).fixture, "replaced");
  assert.equal(JSON.stringify(app.pickerState), JSON.stringify({ budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" }));
  assert.equal(JSON.stringify(app.personalState), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20, fromPicker: false }));
  assert.equal(app.rankState.tier + ":" + app.rankState.scope, "flagship:all");
  assert.equal(app.tableState.search + ":" + app.tableState.sortKey + ":" + app.tableState.sortDir, ":priceM:1");
  assert.equal(app.metricsState.model + ":" + app.metricsState.ver + ":" + app.metricsState.sortKey + ":" + app.metricsState.sortDir, "all:all:cpm:1");
  assert.equal(location.search, "");
  history.back();
  history.back();
  await page.settle();
  assert.equal(events.join(","), "popstate,popstate,popstate,popstate,hashchange", "hash变化在popstate恢复后派发");
  page.healthy();
});

test("历史恢复按稳定ID找回表格对比按钮，筛选移除该方案时返回搜索", async () => {
  const page = await openPage();
  fire(page.anchor("#table"), "click");
  await page.settle();
  const search = await type(page, "searchInput", "Anthropic");
  await page.flushTimers();
  planButton()!.focus();
  history.back();
  await page.settle();
  assert.equal(document.activeElement, planButton(), "默认结果中仍是同一ID方案");
  history.forward();
  await page.settle();
  assert.equal(document.activeElement, planButton(), "前进筛选结果也找回同一方案");
  history.pushState(null, "", "?q=Cursor#table");
  history.back();
  await page.settle();
  planButton()!.focus();
  history.forward();
  await page.settle();
  assert.equal(planButton(), null);
  assert.equal(document.activeElement, search, "目标筛选隐藏方案时使用可操作的搜索框");
  page.healthy();
});

test("搜索延迟重绘保留已进入方案按钮的焦点，历史恢复取消旧搜索任务", async () => {
  const page = await openPage();
  const app = page.runtime;
  fire(page.anchor("#table"), "click");
  app.revealTablePlan("plan-0002");
  await page.settle();
  const search = await type(page, "searchInput", "Anthropic");
  planButton()!.focus();
  await page.flushTimers();
  assert.equal(document.activeElement, planButton(), "搜索防抖执行前快速Tab到按钮不应掉到body");
  await type(page, "searchInput", "Cursor");
  planButton()!.focus();
  await page.flushTimers();
  assert.equal(planButton(), null);
  assert.equal(document.activeElement, search, "搜索结果移除原方案时返回搜索");
  await type(page, "searchInput", "Anthropic");
  await page.flushTimers();
  await type(page, "searchInput", "Claude");
  planButton()!.focus();
  history.back();
  await page.settle();
  const restored = planButton()!;
  await page.flushTimers();
  assert.equal(restored.isConnected, true, "历史恢复取消旧搜索timer，不能在恢复后再次销毁结果");
  assert.equal(document.activeElement, restored);
  await type(page, "chartSearch", "Cursor");
  page.fireWindow("popstate");
  await page.settle();
  const restoredRenders = page.timeline.filter((entry) => entry === "render:chartPersonal").length;
  await page.flushTimers();
  assert.equal(page.timeline.filter((entry) => entry === "render:chartPersonal").length, restoredRenders, "历史恢复也取消待执行的个人图搜索，不能在恢复后再次重绘");
  page.healthy();
});

test("历史锚点清空焦点后仅修复一帧，期间用户转到其它控件或URL时不抢焦点", async () => {
  let page = await openPage({ animationFrames: true, url: "/index.html?cmp=plan-0002;plan-0003#table" });
  const close = page.byId("cmpCloseBtn");
  fire(close, "click");
  fire(page.anchor("#s4"), "click");
  await page.settle();
  fire(page.byId("cmpOpenBtn"), "click");
  await page.settle();
  /* 每次历史遍历是独立的浏览器任务：popstate 的异步恢复先完成，原生 fragment 处理与用户操作在其后。 */
  removeButton("plan-0003")!.focus();
  history.back();
  await page.settle();
  blur();
  await page.flushAnimationFrames();
  assert.equal(document.activeElement, removeButton("plan-0003"), "模拟popstate后原生fragment导致失焦");
  history.forward();
  await page.settle();
  close.focus();
  await page.flushAnimationFrames();
  assert.equal(document.activeElement, close, "恢复帧之前用户已进入另一个控件，不能抢回移出按钮");
  removeButton("plan-0003")!.focus();
  history.back();
  await page.settle();
  history.replaceState(null, "", "?cmp=plan-0002;plan-0003&budget=500#table");
  blur();
  await page.flushAnimationFrames();
  assert.equal(document.activeElement, document.body, "该帧的状态已过期，不再修复旧URL焦点");
  page.healthy();

  page = await openPage({ animationFrames: true, url: "/index.html?cmp=plan-0002;plan-0003#table" });
  history.pushState(null, "", "?cmp=plan-0002;plan-0003#s4");
  removeButton("plan-0003")!.focus();
  for (const step of [-1, 1, -1]) {
    history.go(step);
    await page.settle();
  }
  blur();
  await page.flushAnimationFrames();
  assert.equal((document.activeElement as HTMLElement).dataset.planId, "plan-0003", "连续返回同一URL时，只允许最新恢复帧生效");
  page.healthy();
});

test("旧名称历史URL的异步焦点和关闭事件不修改参数或history.state", async () => {
  for (const noNativeDialog of [false, true]) {
    const page = await openPage({ animationFrames: true, noNativeDialog, url: "/index.html?cmp=plan-0002;plan-0003#table" });
    const legacy = "?cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x&budget=invalid&fixture=keep#table";
    history.replaceState({ marker: "preserve" }, "", legacy);
    history.pushState(null, "", "?cmp=plan-0002;plan-0003#s4");
    removeButton("plan-0003")!.focus();
    history.back();
    blur();
    await page.flushAnimationFrames();
    const legacyHref = new URL(legacy, location.href).href;
    assert.equal(location.href, legacyHref);
    assert.equal((history.state as { marker: string }).marker, "preserve", "程序性focusin不应走状态提交");
    fire(page.byId("cmpCloseBtn"), "keydown", { key: "Escape" });
    fire(page.byId("cmpModal"), "close");
    fire(page.byId("cmpOpenBtn"), "click");
    fire(page.byId("cmpCloseBtn"), "click");
    await page.settle();
    assert.equal(location.href, legacyHref);
    assert.equal((history.state as { marker: string }).marker, "preserve", "开关弹窗、Escape以及延迟原生close不改变分享状态");
    fire(document.body, "click");
    assert.equal((history.state as { marker: string }).marker, "preserve", "没有识别到状态操作的委托click不提交历史");
    for (const id of ["tableColsToggle", "metricsToggle", "exportCsvBtn", "copyMdBtn"]) {
      fire(page.byId(id), "click");
      await page.settle();
      assert.equal((history.state as { marker: string }).marker, "preserve", "只变更视图或导出不提交URL：" + id);
    }
    page.healthy();
  }
});

test("历史恢复保留原对比移出按钮；目标已移除或不足两档时安全回退", async () => {
  for (const noNativeDialog of [false, true]) {
    const page = await openPage({ noNativeDialog, url: "/index.html?cmp=plan-0002;plan-0003;plan-0004#table" });
    const app = page.runtime;
    const close = page.byId("cmpCloseBtn");
    fire(close, "click");
    fire(page.anchor("#s4"), "click");
    await page.settle();
    fire(page.byId("cmpOpenBtn"), "click");
    await page.settle();
    removeButton("plan-0003")!.focus();
    history.back();
    await page.settle();
    assert.equal(document.activeElement, removeButton("plan-0003"));
    history.forward();
    await page.settle();
    assert.equal(document.activeElement, removeButton("plan-0003"));
    close.focus();
    history.back();
    await page.settle();
    assert.equal(document.activeElement, close, "仍连接的静态关闭按钮不移动焦点");
    history.pushState(null, "", "?cmp=plan-0002;plan-0004#table");
    history.back();
    await page.settle();
    removeButton("plan-0003")!.focus();
    history.forward();
    await page.settle();
    assert.equal(removeButton("plan-0003"), null);
    assert.equal(app.isCmpModalOpen(), true);
    assert.equal(document.activeElement, close, "当前弹窗仍打开，缺失项返回关闭按钮");
    history.pushState(null, "", "?cmp=plan-0004#table");
    history.back();
    await page.settle();
    removeButton("plan-0002")!.focus();
    history.forward();
    await page.settle();
    assert.equal(app.isCmpModalOpen(), false);
    assert.equal(document.activeElement?.id, "s4", "关闭弹窗已经恢复有效的打开入口时保留该焦点");
    page.healthy();
  }
});

test("初次load仅修复弹窗外焦点，保留已移入弹窗的操作位置", async () => {
  for (const noNativeDialog of [false, true]) {
    for (const selector of [".cmp-remove", "a[href]", "#cmpCloseBtn"]) {
      const page = await openPage({ noNativeDialog, url: "/index.html?cmp=plan-0002;plan-0003#table" });
      const control = page.byId("cmpModal").querySelector<HTMLElement>(selector);
      assert.ok(control);
      control.focus();
      page.fireWindow("load");
      await page.settle();
      assert.equal(document.activeElement, control, "已在弹窗内的焦点不能跳回关闭按钮：" + selector);
      page.healthy();
    }
    const page = await openPage({ noNativeDialog, url: "/index.html?cmp=plan-0002;plan-0003#table" });
    blur();
    page.fireWindow("load");
    await page.settle();
    assert.equal(document.activeElement?.id, "cmpCloseBtn", "fragment导致焦点回body时仍修复");
    page.healthy();
  }
});

test("用户锚点跳转聚焦目标章节，初始分享锚点保持原焦点", async () => {
  let page = await openPage();
  const link = page.anchor("#s4");
  link.focus();
  fire(link, "click");
  await page.settle();
  assert.equal(document.activeElement?.id, "s4");
  assert.equal(page.byId("s4").getAttribute("tabindex"), "-1");
  const focus = page.timeline.indexOf("focus:s4"), scroll = page.timeline.indexOf("scroll:s4");
  assert.ok(focus >= 0 && scroll >= 0);
  for (const id of ["chartRank", "chartPersonal", "chartTeam", "chartTokens", "chartApi", "chartPower"]) assert.ok(page.timeline.indexOf("render:" + id) < scroll, id + " 应在定位前渲染");
  page.healthy();
  page = await openPage({ url: "/index.html#s4" });
  assert.equal(document.activeElement, document.body, "初始加载不把读屏/键盘焦点抢到章节");
  assert.equal(page.timeline.includes("focus:s4"), false);
  page.healthy();
});

test("初始分享锚点等待图表时容许布局滚动，用户滚轮或PageUp仍取消导航", async () => {
  for (const action of ["layout", "wheel", "PageUp"]) {
    let ready = false, finish = () => {};
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const page = await openPage({ mock: { "@browser/charts/host": () => ({ chartLibraryReady: () => ready, ensureChartLibrary: () => gate }) } });
    const before = page.timeline.filter((entry) => entry.startsWith("scroll:")).length;
    page.byId("s4").getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    /* 章节菜单的最后一项「重要动态」在 #s4 之后，仍位于阅读线下方。 */
    page.byId("dynamics").getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;
    page.runtime.navigateToSection("#s3b", false, false, true);
    window.scrollY = 4000;
    page.fireWindow("scroll");
    assert.equal(document.querySelector('.topnav a[aria-current="location"]')?.getAttribute("href"), "#s4", "模拟 SSR 行数与字体变化后位置暂时落在旧锚点下方");
    if (action === "wheel") page.fireWindow("wheel");
    if (action === "PageUp") page.fireWindow("keydown", { key: "PageUp" });
    ready = true;
    finish();
    await page.settle();
    const scrolls = page.timeline.filter((entry) => entry.startsWith("scroll:"));
    if (action === "layout") assert.equal(scrolls.at(-1), "scroll:s3b", "图表就绪后初始分享链接按最终布局重新对齐");
    else assert.equal(scrolls.length, before, action + " 明确取消待完成的初始导航");
    assert.equal(document.activeElement, document.body, "分享链接不抢键盘焦点");
    page.healthy();
  }
});

test("章节高亮按真实滚动间距及章节留白判断，字体完成只刷新用户当前位置", async () => {
  let finishFonts = () => {};
  const fontsReady = new Promise<void>((resolve) => { finishFonts = resolve; });
  const page = await openPage({ fontsReady, url: "/index.html#s3b" });
  const app = page.runtime;
  const navTops: Record<string, number> = { rank: -900, s3b: 79.8 };
  let sectionPadding = 56;
  const computed = window.getComputedStyle;
  const style = (element: Element) => {
    const real = computed(element);
    return new Proxy(real, { get: (target, key) => key === "getPropertyValue"
      ? (name: string) => name === "scroll-padding-top" ? "69px" : name === "padding-top" && element.classList.contains("section") ? sectionPadding + "px" : target.getPropertyValue(name)
      : Reflect.get(target, key) });
  };
  vi.spyOn(window, "getComputedStyle").mockImplementation(style);
  document.querySelector<HTMLElement>(".topbar")!.getBoundingClientRect = () => ({ height: 56.8 }) as DOMRect;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.topnav a[href^="#"]')) {
    const target = document.getElementById(link.getAttribute("href")!.slice(1));
    if (target) target.getBoundingClientRect = () => ({ top: navTops[target.id] ?? 10000 }) as DOMRect;
  }
  app.syncHeaderHeight();
  app.updateActiveNav();
  const active = () => document.querySelector('.topnav a[aria-current="location"]')?.getAttribute("href");
  assert.equal(active(), "#s3b", "生产中section top=79.8、scroll-padding=69时标题已进入本节留白");
  sectionPadding = 40; navTops.s3b = 100; app.updateActiveNav();
  assert.equal(active(), "#s3b", "窄屏使用自身padding而不是桌面固定值");
  navTops.s3b = 110; app.updateActiveNav();
  assert.equal(active(), "#rank", "超出自身留白时仍按上一章节判断，不添加任意像素容差");
  navTops.rank = 80; navTops.s3b = 1000; window.scrollY = 4000;
  const scrollCount = page.timeline.filter((entry) => entry.startsWith("scroll:")).length;
  finishFonts();
  await fontsReady;
  page.fireWindow("load");
  await page.settle();
  assert.equal(active(), "#rank", "fonts/load完成应按用户现在的位置判断，不能锁定旧hash");
  assert.equal(location.hash, "#s3b");
  assert.equal(window.scrollY, 4000);
  assert.equal(page.timeline.filter((entry) => entry.startsWith("scroll:")).length, scrollCount, "字体/load刷新不追加锚点跳转");
  page.healthy();
});

test("比较链接写入稳定planId，旧名称链接规范化，显示名改动不破坏身份", async () => {
  let page = await openPage({ url: "/index.html?cmp=plan-0002;plan-0002;unknown;plan-0003" });
  let app = page.runtime;
  assert.equal(app.cmpState.items.map((p) => p.id).join(";"), "plan-0002;plan-0003");
  assert.equal(new URLSearchParams(location.search).get("cmp"), "plan-0002;plan-0003");
  assert.equal(page.byId<HTMLDialogElement>("cmpModal").open, true);
  app.closeCmpModal();
  const renamed = app.findPlanReference("plan-0002")!;
  renamed.vendor = "改名厂商";
  renamed.plan = "改名套餐";
  app.cmpState.items = [];
  app.applyUrlState();
  app.openCmpModal();
  await page.settle();
  assert.equal(app.cmpState.items.map((p) => p.id).join(";"), "plan-0002;plan-0003");
  assert.match(page.byId("cmpTable").innerHTML, /改名厂商|改名套餐/);
  page.healthy();
  page = await openPage({ url: "/index.html?cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x" });
  app = page.runtime;
  assert.equal(app.cmpState.items.map((p) => p.id).join(";"), "plan-0002;plan-0003");
  assert.equal(new URLSearchParams(location.search).get("cmp"), "plan-0002;plan-0003", "旧链接成功恢复后用稳定ID分享");
  page.healthy();
  page = await openPage({ url: "/index.html?cmp=plan-0002%3BAnthropic%7CClaude+Pro%3Bplan-0003" });
  assert.equal(page.runtime.cmpState.items.length, 2, "新旧身份混用也应去重");
  page.healthy();
});

test("额度引用按稳定ID跟随主计划更名和调序，保留模型口径并兼容旧ref", async () => {
  const page = await openPage();
  const app = page.runtime;
  const raw = app.METRICS_RAW.find((m) => typeof m.ref === "string")!;
  const plan = app.findPlanReference(raw.ref)!;
  const oldRef: [string, string] = [plan.vendor, plan.plan];
  const legacy = app.resolvePlan({ ...raw, ref: oldRef })!;
  plan.vendor = "稳定ID新厂商";
  plan.plan = "稳定ID新套餐";
  plan.priceM = 321;
  plan.cur = "USD";
  app.PLANS.reverse();
  const resolved = app.resolvePlan(raw)!;
  const renamedLegacy = app.resolvePlan({ ...raw, ref: [plan.vendor, plan.plan] })!;
  assert.equal(legacy.vendor, oldRef[0]);
  assert.equal(legacy.plan, oldRef[1]);
  for (const row of [resolved, renamedLegacy]) {
    assert.equal(row.vendor, "稳定ID新厂商");
    assert.equal(row.plan, "稳定ID新套餐");
    assert.equal(row.model, raw.model, "主计划显示名同步不应覆盖额度行的模型变体");
    assert.equal(row.priceM, 321);
    assert.equal(row.cur, "USD");
  }
  assert.notEqual(raw.vendor, "稳定ID新厂商", "原始额度行没有被原地改写");
  assert.notEqual(raw.plan, "稳定ID新套餐");
  page.healthy();
});

test("纯渲染与主题缩放不写历史，用户筛选才提交URL状态", async () => {
  const page = await openPage();
  const app = page.runtime;
  history.replaceState({ renderSentinel: true }, "", location.href);
  app.renderPicker(); app.renderTable(); app.renderMetricsTable(); app.renderPersonalChart(); app.renderRankChart(); app.renderTokensChart(); app.renderApiChart(); app.renderTeamChart();
  await page.settle();
  assert.equal((history.state as { renderSentinel: boolean }).renderSentinel, true, "render函数不能调用replaceState");
  fire(page.byId("themeBtn"), "click");
  page.fireWindow("resize");
  await page.flushTimers();
  assert.equal((history.state as { renderSentinel: boolean }).renderSentinel, true, "主题和缩放不覆盖历史state");
  await type(page, "searchInput", "Cursor");
  await page.flushTimers();
  assert.equal(history.state, null, "用户筛选入口提交状态");
  assert.equal(new URLSearchParams(location.search).get("q"), "Cursor");
  page.healthy();
});

test("存储受限时仍正常启动，主题切换保持图表懒加载", async () => {
  for (const storageFails of ["read", "write", "both", "getter"] as const) {
    const page = await openPage({ storageFails });
    page.healthy();
    assert.equal(document.documentElement.dataset.themeMode, "system");
    assert.ok(page.runtime.PAL.text);
    assert.equal(page.charts.size, 0);
    fire(page.byId("themeBtn"), "click");
    await page.settle();
    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(page.charts.size, 0);
    page.healthy();
  }
});

test("历史写入与存储访问均受限时仍启动、筛选并导航至图表", async () => {
  const page = await openPage({ url: "/index.html?budget=200#table", storageFails: "getter", historyFails: true });
  const app = page.runtime;
  assert.equal(app.pickerState.budget, "200", "历史写入限制不能阻止初始 URL 恢复");
  assert.throws(() => history.replaceState(null, "", "?q=blocked"), /history writes denied/);
  assert.throws(() => history.pushState(null, "", "#blocked"), /history writes denied/);
  assert.throws(() => window.localStorage, /storage denied/);
  await type(page, "searchInput", "Cursor");
  await page.flushTimers();
  assert.equal(app.tableState.search, "Cursor");
  assert.ok(app.computeTableRows().length > 0, "地址无法写入时筛选仍在当前页面生效");
  assert.equal(new URLSearchParams(location.search).get("q"), null, "被拒绝的历史写入不修改测试初始化的查询串");
  fire(page.byId("themeBtn"), "click");
  await page.settle();
  assert.equal(document.documentElement.dataset.theme, "dark");
  fire(page.anchor("#s4"), "click");
  await page.settle();
  assert.equal(location.hash, "#s4", "历史写入失败后通过原生锚点导航");
  assert.equal(document.activeElement, page.byId("s4"));
  assert.ok(page.timeline.includes("scroll:s4"));
  for (const id of ["chartRank", "chartPersonal", "chartTeam", "chartTokens", "chartApi"]) assert.ok(page.charts.has(id), id + " 仍应按需渲染");
  page.healthy();
});

test("相同查询串的历史恢复仍完成被取消的搜索防抖", async () => {
  const page = await openPage({ url: "/index.html#table" });
  const app = page.runtime;
  const assertPersonalSearch = (message: string) => {
    const data = page.charts.get("chartPersonal")!.option.series[0].data as { _p: Plan }[];
    assert.ok(data.length, "恢复后的个人图表应有 Claude 搜索结果");
    const unmatched = data.filter((point) => !/claude/i.test(app.planSearchBlob(point._p)));
    assert.deepEqual(unmatched.map((point) => point._p.id), [], message);
  };
  await type(page, "searchInput", "Cursor");
  fire(page.anchor("#s1"), "click");
  history.back();
  await page.settle();
  assert.equal(app.tableState.search, "Cursor");
  const shown = Math.min(app.responsivePageSize(), app.computeTableRows().length);
  assert.equal(document.querySelectorAll("#tableBody .cmp-add").length, shown, "历史恢复应立即完成相同查询的防抖，不能等旧计时器");
  assert.ok(app.computeTableRows().slice(0, app.responsivePageSize()).every((p) => app.planSearchBlob(p).toLowerCase().includes("cursor")));
  await page.flushTimers();
  assert.equal(document.querySelectorAll("#tableBody .cmp-add").length, shown, "旧计时器不能再改写恢复的表格");
  await type(page, "chartSearch", "Claude");
  /* 上一段已经退回 #table；导航到不同锚点，才能新增历史记录并真正触发后退恢复。 */
  fire(page.anchor("#s1"), "click");
  history.back();
  await page.settle();
  assert.equal(app.personalState.q, "Claude");
  assertPersonalSearch("历史恢复应立即完成相同查询的个人图表防抖");
  await page.flushTimers();
  assertPersonalSearch("旧计时器不能再改写恢复的个人图表");
  page.healthy();
});

test("历史事件前原生fragment清空焦点仍找回方案按钮，主动离开则不抢回", async () => {
  const page = await openPage({ url: "/index.html#table" });
  const app = page.runtime;
  app.revealTablePlan("plan-0002");
  await page.settle();
  planButton()!.focus();
  history.pushState(null, "", "?q=Anthropic#s4");
  blur();
  page.fireWindow("popstate");
  await page.settle();
  assert.equal(document.activeElement, planButton(), "原生清空焦点后应找回同一方案入口");
  history.pushState(null, "", "?q=Anthropic#table");
  page.byId("table").focus();
  page.fireWindow("popstate");
  await page.settle();
  assert.equal(document.activeElement, planButton(), "原生锚点提前取得焦点也保留方案身份");
  /* fragment-only URL 会保留旧查询串；显式给 pathname 才清空关键词筛选。 */
  history.pushState(null, "", location.pathname + "#table");
  blur();
  page.fireWindow("popstate");
  await page.settle();
  assert.equal(app.tableState.search, "", "应实际恢复无关键词筛选的大表");
  assert.ok(document.querySelectorAll("#tableBody .cmp-add").length > app.responsivePageSize(), "恢复目标在后续页时应实际展开表格");
  assert.equal(document.activeElement, planButton(), "恢复无筛选的大表时展开同一方案所在页，保留原方案焦点");
  fire(page.byId("shareResultsBtn"), "pointerdown");
  history.pushState(null, "", "?q=Anthropic#s4");
  blur();
  page.fireWindow("popstate");
  await page.settle();
  assert.equal(document.activeElement, document.body, "主动离开方案按钮后不抢回焦点");
  page.healthy();
});

test("历史恢复保留的方案节点失焦到页面或锚点时补回焦点，其他控件保留用户选择", async () => {
  /* 模拟浏览器在这轮更新或 fragment 导航中清空焦点：替换启动代码调用的表格重绘与展开入口。 */
  let renderTable: () => void = () => {};
  let revealTablePlan: ((id: string) => boolean) | undefined;
  const page = await openPage({
    url: "/index.html#table",
    mock: { "@app/tables": (original) => ({ renderTable: () => renderTable(), revealTablePlan: (id: string) => (revealTablePlan ?? original.revealTablePlan)(id) }) },
  });
  /* 无搜索的默认分页可能不含该方案：每轮开始前展开到它所在的行。焦点留在其他控件时页面不会替用户展开。 */
  const showPlan = async () => {
    if (planButton()) return;
    page.runtime.revealTablePlan("plan-0002");
    await page.settle();
  };
  for (const lostBeforeEvent of [false, true]) for (const destination of ["body", "table", "shareResultsBtn"]) {
    await showPlan();
    planButton()!.focus();
    history.pushState(null, "", location.search ? location.pathname + "#table" : "?q=Anthropic#table");
    if (lostBeforeEvent) blur();
    renderTable = () => { if (destination === "body") blur(); else page.byId(destination).focus(); };
    page.fireWindow("popstate");
    await page.settle();
    const expected = destination === "shareResultsBtn" ? page.byId("shareResultsBtn") : planButton();
    assert.equal(document.activeElement, expected, `${lostBeforeEvent ? "事件前已失焦" : "重绘时失焦"} → ${destination}`);
  }
  await showPlan();
  planButton()!.focus();
  history.pushState(null, "", location.search ? location.pathname + "#table" : "?q=Anthropic#table");
  renderTable = blur;
  revealTablePlan = () => { page.byId("shareResultsBtn").focus(); return true; };
  page.fireWindow("popstate");
  await page.settle();
  assert.equal(document.activeElement, page.byId("shareResultsBtn"), "展开目标页期间用户转到其他控件时不能抢回");
  page.healthy();
});

test("后退保留keyed方案节点且不触发focusin，前进清焦时仍找回同一方案", async () => {
  for (const destination of ["body", "table"]) {
    let renderTable: () => void = () => {};
    const page = await openPage({ url: "/index.html?q=Anthropic#table", mock: { "@app/tables": () => ({ renderTable: () => renderTable() }) } });
    const button = planButton()!;
    button.focus();
    /* 保留实际节点和焦点：这次历史恢复不会产生新的 focusin。 */
    history.pushState(null, "", location.pathname + "#table");
    page.fireWindow("popstate");
    await page.settle();
    assert.equal(document.activeElement, button);
    history.pushState(null, "", "?q=Anthropic#table");
    renderTable = () => {};
    if (destination === "body") blur(); else page.byId("table").focus();
    page.fireWindow("popstate");
    await page.settle();
    assert.equal(document.activeElement, button, "再次进入旧 URL 时不能因过时缓存丢失方案身份");
    page.healthy();
  }
});
