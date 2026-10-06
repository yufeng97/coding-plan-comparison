#!/usr/bin/env node
/* URL 状态、历史导航、锚点与启动回归（拆分自 test-app.js；共享替身见 app-harness.js） */
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");

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
  assert.equal(app.run("personalState.limit"), null);
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
  assert.equal(app.run('JSON.stringify(personalState)'), JSON.stringify({ cat: "tool", region: "intl", billing: "Y", q: "Cursor", limit: null }));
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
  assert.equal(app.run('JSON.stringify(personalState)'), JSON.stringify({ cat: "all", region: "all", billing: "M", q: "", limit: 20 }));
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

test("相同查询串的历史恢复仍完成被取消的搜索防抖", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#table" });
  const input = app.elements.get("searchInput");
  input.value = "Cursor";
  app.fire(input, "input");
  app.fire(app.anchor("#s1"), "click");
  app.history.back();
  app.flushTimeouts();
  assert.equal(app.run("tableState.search"), "Cursor");
  assert.equal((app.elements.get("tableBody").innerHTML.match(/<tr>/g) || []).length,
    app.run("computeTableRows().length"), "相同状态不能让旧表格永久留在页面");
  const search = app.elements.get("chartSearch");
  search.value = "Claude";
  app.fire(search, "input");
  app.fire(app.anchor("#table"), "click");
  app.history.back();
  app.flushTimeouts();
  assert.equal(app.run("personalState.q"), "Claude");
  assert.ok(app.run("chartCache.chartPersonal.option.series[0].data.every(x => /claude/i.test(planSearchBlob(x._p)))"));
  healthy(app);
});

test("历史事件前原生fragment清空焦点仍找回方案按钮，主动离开则不抢回", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/index.html#table" });
  const button = () => app.elements.get("tableBody").querySelectorAll(".cmp-add").find((e) => e.dataset.planId === "plan-0002");
  button().focus();
  app.history.pushState(null,"","?q=Anthropic#s4");
  app.run("document.activeElement = document.body;");
  app.fireWindow("popstate");
  assert.equal(app.run("document.activeElement"),button());
  app.history.pushState(null,"","?q=Anthropic#table");
  app.elements.get("table").focus();
  app.fireWindow("popstate");
  assert.equal(app.run("document.activeElement"),button(),"原生锚点提前取得焦点也保留方案身份");
  app.fire(app.elements.get("shareResultsBtn"),"pointerdown");
  app.history.pushState(null,"","?q=Anthropic#s4");
  app.run("document.activeElement = document.body;");
  app.fireWindow("popstate");
  assert.equal(app.run("document.activeElement"),app.run("document.body"));
  healthy(app);
});

if (require.main === module) main();
