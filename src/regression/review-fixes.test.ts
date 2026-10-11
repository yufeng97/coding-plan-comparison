/* 2026-10 审查回归：真实 Vue 整页、生产构建与数据校验接口，原 test-review-fixes.js。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { test } from "vitest";
import { openPage, type Page } from "../test/page";

const root = path.resolve(".");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const requireTool = createRequire(import.meta.url);
const { validateData } = requireTool("../../scripts/build/validate-data.js") as { validateData(options: { workspace: string; source: string }): { errors: string[]; warns: string[] } };
const validate = (source: string) => validateData({ workspace: root, source });
const badges = (page: Page, id: string) => page.runtime.planBadges(page.runtime.findPlanReference(id)!).map((b: { t: string }) => b.t);
const query = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  assert.ok(element, selector);
  return element;
};

test("风险标签只读结构字段，备注里的金额与支持 BYOK 不被误判", async () => {
  const page = await openPage();
  assert.equal(badges(page, "plan-0033").includes("访问不稳"), false);
  assert.ok(badges(page, "plan-0058").includes("访问不稳"));
  for (const id of ["plan-0101", "plan-0128"]) {
    assert.equal(badges(page, id).includes("要自备 Key"), false);
    assert.equal(badges(page, id).includes("推理另计"), false);
  }
  assert.ok(badges(page, "plan-0117").includes("要自备 Key"));
  assert.ok(badges(page, "plan-0114").includes("推理另计"));
  page.healthy();
});

test("中转站按名单判定，未登记转售被校验拒绝，否定说法不误报", () => {
  assert.deepEqual(validate(dataSource).errors, []);
  const anchor = 'note: "仅月付；高峰期优先访问"';
  const marked = dataSource.replace(anchor, 'note: "本站经中转站转售；高峰期优先访问"');
  assert.notEqual(marked, dataSource);
  assert.ok(validate(marked).errors.some((e) => /未登记到 RELAY_VENDORS/.test(e)));
  const negated = dataSource.replace(anchor, 'note: "官方直售，不是中转站；高峰期优先访问"');
  assert.deepEqual(validate(negated).errors, []);
});

test("单模块入口加载，主题同步先于样式，加载提示先于入口", () => {
  const tags = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"?]+)[^"]*"([^>]*)><\/script>/g)]
    .map((m) => ({ file: m[2]!, attrs: m[1]! + m[3]!, at: m.index }));
  assert.deepEqual(tags.filter((t) => t.file.startsWith("js/") && !/type="application\/json"/.test(t.attrs)).map((t) => t.file), ["js/theme-init.js", "js/app-loader.js"]);
  const theme = tags.find((t) => t.file === "js/theme-init.js")!, loader = tags.find((t) => t.file === "js/app-loader.js")!;
  const entries = tags.filter((t) => /\btype="module"/.test(t.attrs));
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.file, "src/main.ts");
  assert.doesNotMatch(entries[0]!.attrs, /\basync\b/);
  assert.doesNotMatch(theme.attrs, /\b(?:defer|async)\b/);
  assert.ok(theme.at < html.indexOf('rel="stylesheet"'));
  assert.match(loader.attrs, /\bdefer\b/);
  assert.ok(loader.at < html.indexOf("</head>"));
  assert.ok(fs.existsSync(path.join(root, "src/App.vue")));
  assert.ok(fs.existsSync(path.join(root, "src/domain/startup.ts")));
});

test("API 明细单一渲染来源，图表加载前后名称一致", async () => {
  const page = await openPage();
  const before = page.byId("apiDetailBody").innerHTML;
  assert.match(page.byId("apiDetailBody").textContent!, /DeepSeek · V4-Pro/);
  assert.doesNotMatch(before, /DeepSeek · DeepSeek|\(Z\.ai\)|\[硅基\]/);
  page.fire(page.anchor("#s4"), "click");
  await page.settle();
  assert.ok(page.charts.has("chartApi"));
  assert.equal(page.byId("apiDetailBody").innerHTML, before);
  page.healthy();
});

test("来源列表只展示当前记录引用的核价来源，历史证据保留在台账", async () => {
  const page = await openPage(), app = page.runtime;
  const referenced = new Set(Object.values(app.PRICE_CHECKS.rows).flatMap((row) => row.sourceIds)).size;
  const list = page.byId("sourceList").textContent!;
  assert.match(list, new RegExp("本次逐条核价来源（" + referenced + " 页）"));
  assert.doesNotMatch(page.byId("sourceList").innerHTML, /google-ai-plus-availability/);
  assert.equal("google-plus-us" in app.PRICE_CHECKS.sources, true);
  page.healthy();
});

test("默认费用模型按固定身份解析，校验器拒绝失效型号，标题年月错位给出警告", async () => {
  const page = await openPage(), app = page.runtime;
  assert.equal(app.APP_DEFAULTS.calc.model, app.CALC_DEFAULT_API.vendor + "|" + app.CALC_DEFAULT_API.model);
  const broken = dataSource.replace('const CALC_DEFAULT_API = { vendor: "Anthropic", model: "Claude Sonnet 5.5" };', 'const CALC_DEFAULT_API = { vendor: "Anthropic", model: "Claude Sonnet 4" };');
  assert.notEqual(broken, dataSource);
  assert.ok(validate(broken).errors.some((e) => /CALC_DEFAULT_API/.test(e)));
  const shifted = dataSource.replace(/updated: "\d{4}-\d{2}-\d{2}"/, 'updated: "2026-09-30"');
  assert.ok(validate(shifted).warns.some((w) => /<title> 的年月/.test(w)));
  assert.equal(validate(dataSource).warns.some((w) => /<title> 的年月/.test(w)), false);
  page.healthy();
});

test("推荐偏好只改变排序，价格优先最低月费、能力按 DeepSWE v1.1，偏好可分享", async () => {
  let page = await openPage({ url: "/?budget=200&region=cn&task=hard" });
  const app = page.runtime;
  assert.equal(app.chooseMain(app.eligibleProfiles())!.p.id, "plan-0168");
  app.pickerState.priority = "price";
  const pool = app.eligibleProfiles();
  const main = app.chooseMain(pool)!;
  assert.ok(Math.abs(app.pickerMonthlyCNY(main.p) - Math.min(...pool.filter((x: { headline: unknown }) => x.headline).map((x: { p: Plan }) => app.pickerMonthlyCNY(x.p)))) < 0.06);
  app.pickerState.priority = "ability";
  await page.settle();
  const abilityPool = app.eligibleProfiles(), abilityMain = app.chooseMain(abilityPool)!;
  const score = app.abilityValue(abilityMain.p, abilityMain.headline);
  assert.ok(score > 0 && app.hardRepresentatives(abilityPool).every((x) => app.abilityValue(x.p, x.headline) <= score));
  assert.match(page.byId("pickerPolicy").textContent!, /模型能力优先.*DeepSWE v1\.1.*不同评测不合成总分/);
  assert.match(page.byId("quickGrid").textContent!, /本次按 DeepSWE v1\.1 参与排序/);
  const chip = query('#picker .picker-row[data-pick="priority"] [data-value="price"]');
  page.fire(chip, "click");
  await page.settle();
  assert.equal(new URLSearchParams(location.search).get("priority"), "price");
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  const url = location.href;
  page.healthy();
  page = await openPage({ url });
  assert.equal(page.runtime.pickerState.priority, "price");
  page.healthy();
  page = await openPage({ url: "/?priority=hack" });
  assert.equal(page.runtime.pickerState.priority, "quota");
  page.healthy();
});

test("推荐前三档对比、手机字段标签与卡片对比按钮同步", async () => {
  const page = await openPage({ url: "/?budget=200&region=cn&task=hard" });
  const table = query("#quickGrid .qc-compare"), rows = Array.from(table.querySelectorAll("tbody tr"));
  assert.equal(rows.length, 3);
  assert.equal(rows[0]!.querySelector(".qc-compare-tag")!.textContent, "主计划");
  assert.equal(rows[1]!.querySelector(".qc-compare-tag"), null);
  assert.equal(rows[0]!.querySelector<HTMLButtonElement>(".cmp-add")!.dataset.planId, page.runtime.chooseMain(page.runtime.eligibleProfiles())!.p.id);
  for (const td of table.querySelectorAll("tbody td")) assert.ok(td.getAttribute("data-label"));
  assert.ok(Array.from(table.querySelectorAll('th[scope="col"]')).some((th) => th.textContent === "DeepSWE v1.1"));
  assert.equal(new Set(rows.map((row) => row.querySelector<HTMLButtonElement>(".cmp-add")!.dataset.planId)).size, 3);
  const control = rows[1]!.querySelector<HTMLButtonElement>(".cmp-add")!, id = control.dataset.planId!;
  page.fire(control, "click");
  await page.settle();
  assert.deepEqual(page.runtime.cmpState.items.map((p: Plan) => p.id), [id]);
  for (const control of page.byId("quickGrid").querySelectorAll(`.cmp-add[data-plan-id="${id}"]`)) assert.equal(control.getAttribute("aria-pressed"), "true");
  assert.match(page.byId("pickerNote").textContent!, /^符合条件 \d+ 档 · 额度优先/);
  assert.match(page.byId("pickerRulesNote").textContent!, /中转站与国家限定套餐不参与通用推荐/);
  page.healthy();
});

test("复制推荐摘要为纯文本，含条件、主计划、候选与当前链接", async () => {
  const page = await openPage({ url: "/?budget=200&region=cn&task=hard&priority=ability" });
  page.fire(page.byId("copySummaryBtn"), "click");
  await page.settle();
  const text = page.copied!;
  assert.match(text, /推荐摘要（数据版本 \d{4}-\d{2}-\d{2}）/);
  assert.match(text, /条件：≤¥200 · 国内 · 不限工具 · 复杂为主 · 月付标价 · 模型能力优先/);
  assert.match(text, /\n主计划：.+ — .+；.+；额度参考下限 .+；DeepSWE v1\.1 /);
  assert.match(text, /\n候选 2：/);
  assert.match(text, /\?task=hard&priority=ability#quick$/);
  assert.doesNotMatch(text, /<|&lt;|undefined|NaN/);
  assert.match(page.byId("serviceFeedback").textContent!, /已复制推荐摘要/);
  page.healthy();
});

test("表默认收起中转站与待核价格，开关可分享、重置与空态显示入口有效", async () => {
  let page = await openPage();
  const app = page.runtime, hidden = app.PLANS.filter(app.isOnSalePlan).filter(app.tableExtraHidden).length;
  assert.ok(hidden > 0);
  assert.equal(app.computeTableRows().some((p: Plan) => app.isRelay(p) || !app.isPriceConfirmed(p)), false);
  assert.match(page.byId("tableCount").textContent!, new RegExp(`另有 ${hidden} 档中转站或待核价格未显示`));
  const toggle = page.byId("tableExtraToggle");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  page.fire(toggle, "click");
  await page.settle();
  assert.equal(app.computeTableRows().length, app.PLANS.filter(app.isOnSalePlan).length);
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(new URLSearchParams(location.search).get("tall"), "1");
  assert.doesNotMatch(page.byId("tableCount").textContent!, /未显示/);
  const url = location.href;
  page.fire(page.byId("tableResetBtn"), "click");
  await page.settle();
  assert.equal(app.tableState.extra, false);
  app.tableState.search = "88code";
  await page.settle();
  assert.equal(app.computeTableRows().length, 0);
  page.fire(query("#tableBody [data-table-extra]"), "click");
  await page.settle();
  assert.ok(app.computeTableRows().length > 0);
  page.healthy();
  page = await openPage({ url });
  assert.equal(page.runtime.tableState.extra, true);
  page.healthy();
});

test("构建期 Vue 预渲染生成真实卡片与价格表，只有根容器标记且无重复 ID", async () => {
  const { prerenderIndex, injectContainer } = requireTool("../../scripts/build/prerender.js") as { prerenderIndex(html: string): Promise<string>; injectContainer(html: string, id: string, content: string): string };
  const { Window } = await import("happy-dom");
  const out = await prerenderIndex(html);
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  try {
    window.document.write(out);
    const document = window.document;
    assert.deepEqual(Array.from(document.querySelectorAll("[data-prerendered]")).map((node) => node.id), ["app"]);
    assert.ok(document.querySelectorAll("#tableBody tr").length > 0);
    assert.ok(document.querySelectorAll("#quickGrid > .quick-card .qc-plan").length > 0);
    assert.ok(document.querySelectorAll("#freeGrid .free-card").length > 0);
    const ids = Array.from(document.querySelectorAll("[id]")).map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length);
  } finally { await window.happyDOM.close(); }
  assert.doesNotMatch(out, /<script\b(?![^>]*\bsrc=)[^>]*>[^<]+<\/script>/);
  assert.throws(() => injectContainer('<div id="x"><p>old</p></div>', "x", "new"), /应为空/);
  assert.throws(() => injectContainer("<div></div>", "x", "new"), /缺失或重复/);
});

test.each(["/index.html", "/index.html?budget=500&tall=1#table"])("真实 Vue 启动按链接 %s 重绘并清理首屏标记", async (url) => {
  const page = await openPage({ url, override() {
    document.documentElement.classList.add("has-query");
    document.getElementById("app")!.setAttribute("data-prerendered", "");
    return {};
  } });
  assert.equal(document.querySelectorAll("[data-prerendered]").length, 0);
  assert.equal(document.documentElement.classList.contains("has-query"), false);
  assert.equal(page.runtime.pickerState.budget, new URL(url, "http://localhost").searchParams.get("budget") || "200");
  page.healthy();
});

test("发布静态文件白名单含分享图与订阅，跳过隐藏文件", () => {
  const { publicExtras } = requireTool("../../scripts/build/stage-site.js") as { publicExtras(root: string): string[] };
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(temporaryRoot, "cp-extras-")));
  assert.equal(path.dirname(directory), temporaryRoot);
  assert.ok(path.basename(directory).startsWith("cp-extras-"));
  try {
    fs.writeFileSync(path.join(directory, "index.html"), "<!doctype html>");
    fs.mkdirSync(path.join(directory, "img"));
    fs.mkdirSync(path.join(directory, "feeds"));
    fs.writeFileSync(path.join(directory, "img", "og-card.png"), "png");
    fs.writeFileSync(path.join(directory, "img", ".DS_Store"), "x");
    fs.writeFileSync(path.join(directory, "feeds", "vendor-test.xml"), "<rss/>");
    assert.deepEqual(publicExtras(directory).map((file) => path.relative(directory, file).split(path.sep).join("/")), ["img/og-card.png", "feeds/vendor-test.xml"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\/img\/og-card\.png">/);
  assert.ok(fs.existsSync(path.join(root, "img", "og-card.png")));
  assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/">/);
});

test("关注同步链接只带套餐 ID，打开后确认合并且地址立即清理参数", async () => {
  let page = await openPage({ storage: { "cp-followed-plans-v1": JSON.stringify({ version: 1, planIds: ["plan-0002"], readChangeIds: [] }) } });
  await page.runtime.copyFollowLink();
  assert.match(page.copied!, /\?follow=plan-0002#updates$/);
  assert.match(JSON.stringify(page.runtime.followFeeds(page.runtime.followedPlans())), /"feeds\/anthropic-[0-9a-f]{8}\.xml"/);
  page.healthy();
  page = await openPage({ url: "/?follow=plan-0003,plan-9999,../x,plan-0003#updates" });
  assert.deepEqual(page.runtime.followImportPlans().plans.map((p: Plan) => p.id), ["plan-0003"]);
  assert.deepEqual(page.runtime.followImportPlans().fresh.map((p: Plan) => p.id), ["plan-0003"]);
  assert.equal(new URLSearchParams(location.search).has("follow"), false);
  page.fire(query('[data-follow-import="merge"]'), "click");
  await page.settle();
  assert.deepEqual(JSON.parse(localStorage.getItem("cp-followed-plans-v1")!).planIds, ["plan-0003"]);
  assert.equal(page.runtime.followView.importIds.length, 0);
  page.healthy();
  page = await openPage({ url: "/?follow=plan-0004#updates" });
  page.fire(query('[data-follow-import="dismiss"]'), "click");
  await page.settle();
  assert.equal(page.runtime.followState.planIds.length, 0);
  page.healthy();
});

test("每个在库厂商有确定变更订阅，条目链接对应档位并用中文字段名", async () => {
  const maintenance = JSON.parse(fs.readFileSync(path.join(root, "data/maintenance.json"), "utf8")) as MaintenanceSnapshot;
  const { vendorFeedSlug } = requireTool("../../scripts/maintenance/build-maintenance.js") as { vendorFeedSlug(vendor: string): string };
  const page = await openPage(), app = page.runtime;
  const vendors = [...new Set([...app.PLANS, ...app.API_PRICES, ...app.PAYG_REFERENCES].map((r) => r.vendor))].sort();
  assert.deepEqual(maintenance.feeds!.map((feed) => feed.vendor), vendors);
  for (const feed of maintenance.feeds!) {
    assert.equal(feed.path, "feeds/" + vendorFeedSlug(feed.vendor) + ".xml");
    const xml = fs.readFileSync(path.join(root, feed.path), "utf8");
    assert.equal((xml.match(/<item>/g) || []).length, feed.changes, feed.vendor);
  }
  const busy = maintenance.feeds!.find((feed) => feed.changes > 0)!;
  assert.match(fs.readFileSync(path.join(root, busy.path), "utf8"), /\?q=[^<]+&amp;tall=1#table/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "changes.xml"), "utf8"), /<description>[^<]*\bprice[MY]：/);
  page.healthy();
});

test("ccusage 多种 JSON 本地解析，Claude 缓存分列与 Codex 缓存子集分别处理", async () => {
  const page = await openPage(), app = page.runtime;
  const parse = (value: unknown) => app.parseUsageExport(JSON.stringify(value));
  const day = (date: string) => ({ date, inputTokens: 1000, outputTokens: 2000, cacheCreationTokens: 1000, cacheReadTokens: 8000, totalTokens: 12000 });
  const claude = parse({ daily: [day("2026-10-01"), day("2026-10-02")], totals: {} });
  assert.equal(claude.total, 24000);
  assert.equal(claude.activeDays, 2);
  assert.ok(Math.abs(claude.inputShare - 20000 / 24000 * 100) < 1e-9);
  assert.ok(Math.abs(claude.cacheRate - 80) < 1e-9);
  const codex = parse({ daily: [{ date: "2026-10-01", inputTokens: 10000, cachedInputTokens: 9000, outputTokens: 1000 }] });
  assert.equal(codex.total, 11000);
  assert.ok(Math.abs(codex.cacheRate - 90) < 1e-9);
  assert.equal(parse([{ month: "2026-09", inputTokens: 5, outputTokens: 5 }]).months, 1);
  assert.equal(parse({ type: "monthly", data: [{ month: "2026-08", inputTokens: 1, outputTokens: 1 }] }).total, 2);
  assert.equal(parse({ projects: { a: [day("2026-10-03")], b: [day("2026-10-03")] } }).activeDays, 1);
  for (const bad of ["not json", "{}", '{"daily":[{"date":"2026-10-01"}]}']) assert.throws(() => app.parseUsageExport(bad), /JSON|token/);
  page.healthy();
});

test("导入用量换算计算器并写入链接，失败不改已有条件", async () => {
  const page = await openPage();
  const daily = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, inputTokens: 200000, outputTokens: 100000, cacheReadTokens: 1600000, cacheCreationTokens: 200000 })).filter((_, i) => i % 7 < 5);
  const text = page.byId<HTMLTextAreaElement>("usageImportText");
  text.value = JSON.stringify({ daily });
  page.fire(text, "input");
  page.fire(page.byId("usageImportBtn"), "click");
  await page.settle();
  const state = page.runtime.calcState;
  assert.equal(state.days, "25");
  assert.equal(state.input, "95.2");
  assert.equal(state.cache, "80");
  assert.equal(Number(state.requests) * Number(state.tokens), 2100000);
  assert.match(page.byId("usageImportFeedback").textContent!, /已导入 10 个有用量的日子/);
  assert.equal(new URLSearchParams(location.search).get("cdays"), "25");
  text.value = "[]";
  page.fire(text, "input");
  page.fire(page.byId("usageImportBtn"), "click");
  await page.settle();
  assert.match(page.byId("usageImportFeedback").textContent!, /没有读到 token 用量/);
  assert.equal(state.days, "25");
  page.healthy();
});

test("按用量反查可覆盖套餐，提供同模型按量费用与订阅回本点", async () => {
  const page = await openPage({ url: "/?region=all&budget=any" }), app = page.runtime;
  const rows = app.usageCoverageRows(30);
  assert.ok(rows.length >= 3);
  for (const row of rows) {
    assert.ok(row.c.moLow >= 30 && ["高", "中"].includes(row.conf));
    if (row.apiMonthlyCNY != null) assert.ok(Math.abs(row.breakEvenM! * row.apiMonthlyCNY / 30 - row.quote.monthlyCNY) < 1e-6);
  }
  const prices = rows.map((r) => r.quote.monthlyCNY);
  assert.deepEqual(prices, prices.slice().sort((a, b) => a - b));
  assert.equal(new Set(rows.map((r) => r.p.id)).size, rows.length);
  assert.match(page.byId("costResult").textContent!, /能覆盖这个用量的套餐/);
  assert.equal(app.usageCoverageRows(1e9).length, 0);
  Object.assign(app.calcState, { requests: "100000", tokens: "10000000", days: "31" });
  await page.settle();
  assert.match(page.byId("costResult").textContent!, /没有套餐的参考月额度下限/);
  page.healthy();
});

test("大陆可用性只按官方登记展示，不从厂商名推测，校验拒绝无效字段", async () => {
  const page = await openPage({ url: "/?region=intl&budget=any&task=hard" }), app = page.runtime;
  assert.ok(badges(page, "plan-0002").includes("不服务中国大陆"));
  assert.ok(badges(page, "plan-0017").includes("不服务中国大陆"));
  assert.equal(badges(page, "plan-0021").includes("不服务中国大陆"), false);
  assert.ok(badges(page, "plan-0098").includes("部分模型限地区"));
  assert.match(app.mainlandAccessText(app.findPlanReference("plan-0010")), /官方支持地区不含中国大陆（\d{4}-\d{2}-\d{2} 核查）/);
  assert.equal(app.mainlandAccessText(app.findPlanReference("plan-0157")), "国内服务");
  assert.equal(app.mainlandAccessText(app.findPlanReference("plan-0021")), "未核实官方支持地区");
  const csv = app.tableRowsCsv([app.findPlanReference("plan-0002")!]);
  assert.match(csv, /"中国大陆可用性"/);
  assert.match(csv, /官方支持地区不含中国大陆/);
  assert.match(page.byId("quickGrid").textContent!, /官方支持地区不含中国大陆；需要外币或国际账号支付/);
  const invalidEntries: [string, string, RegExp][] = [
    ['status: "restricted", checkedAt: "2026-10-10", url: "https://cursor.com/docs/account/regions"', 'status: "blocked", checkedAt: "2026-10-10", url: "https://cursor.com/docs/account/regions"', /status 只能是/],
    ['planIds: ["plan-0016", "plan-0017", "plan-0018", "plan-0019"]', 'planIds: ["plan-0016", "plan-0098"]', /planIds 须为该厂商/],
    ['url: "https://www.anthropic.com/supported-countries"', 'url: "http://www.anthropic.com/supported-countries"', /HTTPS/],
  ];
  for (const [from, to, pattern] of invalidEntries) {
    const mutated = dataSource.replace(from, to);
    assert.notEqual(mutated, dataSource, from);
    assert.ok(validate(mutated).errors.some((e) => pattern.test(e)), String(pattern));
  }
  page.healthy();
});

test("排行图宽转窄整图重绘，标签移到柱上方且每行增高", async () => {
  const page = await openPage({ url: "/#s4" });
  const element = page.byId("chartRank"), chart = page.charts.get("chartRank")!;
  assert.equal(chart.option.yAxis.axisLabel.inside, undefined);
  const wideHeight = parseFloat(element.style.height);
  element.getBoundingClientRect = () => ({ top: 10, bottom: 600, left: 0, right: 330, width: 330, height: 590, x: 0, y: 10, toJSON() { return {}; } });
  chart.getWidth = () => 1200;
  chart.getHeight = () => 590;
  page.runtime.markChartsForResize(["chartRank"]);
  page.runtime.resizeVisibleCharts();
  assert.equal(chart.option.yAxis.axisLabel.inside, true);
  assert.ok(parseFloat(element.style.height) > wideHeight);
  page.healthy();
});
