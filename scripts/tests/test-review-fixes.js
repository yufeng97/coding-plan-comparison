#!/usr/bin/env node
/* 2026-10 全面审查修复的回归：风险标签、中转站名单、加载顺序、来源展示与默认值稳定性。 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createApp, healthy, test, main } = require("./app-harness");
const { validateData } = require("../build/validate-data");

const root = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const dataSource = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const badgesOf = (app, id) => JSON.parse(app.run(`JSON.stringify(planBadges(findPlanReference(${JSON.stringify(id)})).map((b) => b.t))`));

test("风险标签只读结构化字段，备注里的金额和「支持 BYOK」不再误判", () => {
  const app = createApp();
  assert.ok(!badgesOf(app, "plan-0033").includes("访问不稳"), "Z.ai V3 Max 的「季付 $403.2」不是访问异常");
  assert.ok(badgesOf(app, "plan-0058").includes("访问不稳"), "88code 实测 403 的档位仍要提示");
  for (const id of ["plan-0101", "plan-0128"]) {
    const badges = badgesOf(app, id);
    assert.ok(!badges.includes("要自备 Key") && !badges.includes("推理另计"), id + " 含模型用量，支持 BYOK 不等于必须自备");
  }
  assert.ok(badgesOf(app, "plan-0117").includes("要自备 Key"), "Cline 开源版需要自带推理");
  assert.ok(badgesOf(app, "plan-0114").includes("推理另计"), "Zed Business 托管推理按量另计");
  healthy(app);
});

test("中转站只按名单判定，备注写明中转却未登记时校验器报错", () => {
  const ok = validateData({ workspace: root, source: dataSource });
  assert.deepEqual(ok.errors, []);
  const marked = dataSource.replace('note: "仅月付；高峰期优先访问"', 'note: "本站经中转站转售；高峰期优先访问"');
  assert.notEqual(marked, dataSource, "测试锚点需要存在");
  assert.ok(validateData({ workspace: root, source: marked }).errors.some((e) => /未登记到 RELAY_VENDORS/.test(e)));
  const negated = dataSource.replace('note: "仅月付；高峰期优先访问"', 'note: "官方直售，不是中转站；高峰期优先访问"');
  assert.deepEqual(validateData({ workspace: root, source: negated }).errors, [], "否定说法不应误报");
});

test("首屏页面脚本使用 defer 保持顺序，主题脚本仍在样式前同步执行", () => {
  const tags = [...html.matchAll(/<script\b([^>]*)\bsrc="(js\/[^"?]+)[^"]*"([^>]*)><\/script>/g)]
    .map((m) => ({ file: m[2], attrs: m[1] + m[3] }));
  const page = tags.filter((t) => t.file !== "js/theme-init.js" && !/type="application\/json"/.test(t.attrs));
  assert.ok(page.length >= 10);
  for (const tag of page) assert.match(tag.attrs, /\bdefer\b/, tag.file + " 应 defer，避免 meta CSP 下逐个串行下载");
  assert.ok(page.every((t) => !/\basync\b/.test(t.attrs)), "async 会打乱依赖顺序");
  assert.doesNotMatch(tags.find((t) => t.file === "js/theme-init.js").attrs, /\b(?:defer|async)\b/, "主题脚本须在首帧前生效");
  assert.equal(page.at(-1).file, "js/app-init.js");
});

test("API 明细表只有一个渲染入口，图表加载前后名称一致", () => {
  const app = createApp();
  const before = app.elements.get("apiDetailBody").innerHTML;
  assert.match(before, /DeepSeek · V4-Pro/);
  assert.doesNotMatch(before, /DeepSeek · DeepSeek|\(Z\.ai\)|\[硅基\]/);
  app.fire(app.anchor("#s4"), "click");
  assert.ok(app.charts.has("chartApi"));
  assert.equal(app.elements.get("apiDetailBody").innerHTML, before);
  healthy(app);
});

test("页面来源列表只展示当前记录引用的核价来源，历史证据留在台账", () => {
  const app = createApp();
  const list = app.elements.get("sourceList").innerHTML;
  const referenced = app.run("new Set(Object.values(PRICE_CHECKS.rows).flatMap((row) => row.sourceIds)).size");
  assert.match(list, new RegExp("本次逐条核价来源（" + referenced + " 页）"));
  assert.doesNotMatch(list, /google-ai-plus-availability/, "已被替换的 Google AI Plus 旧证据不再作为当前依据");
  assert.equal(app.run('"google-plus-us" in PRICE_CHECKS.sources'), true, "台账历史证据不删除");
  healthy(app);
});

test("费用计算器默认模型按固定身份解析，校验器拒绝指向无效条目", () => {
  const app = createApp();
  assert.equal(app.run("APP_DEFAULTS.calc.model"), app.run('CALC_DEFAULT_API.vendor + "|" + CALC_DEFAULT_API.model'));
  const broken = dataSource.replace('const CALC_DEFAULT_API = { vendor: "Anthropic", model: "Claude Sonnet 5.5" };', 'const CALC_DEFAULT_API = { vendor: "Anthropic", model: "Claude Sonnet 4" };');
  assert.notEqual(broken, dataSource);
  assert.ok(validateData({ workspace: root, source: broken }).errors.some((e) => /CALC_DEFAULT_API/.test(e)));
  healthy(app);
});

test("标题年月与数据版本不一致时给出警告", () => {
  const shifted = dataSource.replace(/updated: "\d{4}-\d{2}-\d{2}"/, 'updated: "2026-09-30"');
  assert.ok(validateData({ workspace: root, source: shifted }).warns.some((w) => /<title> 的年月/.test(w)));
  assert.ok(!validateData({ workspace: root, source: dataSource }).warns.some((w) => /<title> 的年月/.test(w)));
});

test("推荐偏好只改变候选先后：价格优先选最便宜，模型能力按 DeepSWE v1.1，偏好可分享", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=200&region=cn&task=hard" });
  assert.equal(app.run("chooseMain(eligibleProfiles()).p.id"), "plan-0168", "默认额度优先保持原推荐");
  app.run('pickerState.priority = "price";');
  const price = JSON.parse(app.run(`JSON.stringify((() => {
    const pool = eligibleProfiles(), main = chooseMain(pool);
    return { main: pickerMonthlyCNY(main.p), min: Math.min(...pool.filter((x) => x.headline).map((x) => pickerMonthlyCNY(x.p))) };
  })())`));
  assert.ok(Math.abs(price.main - price.min) < 0.06, "价格优先的主计划应是任务适配档里最便宜的");
  app.run('pickerState.priority = "ability"; renderPicker();');
  const ability = JSON.parse(app.run(`JSON.stringify((() => {
    const pool = eligibleProfiles(), main = chooseMain(pool);
    return { main: abilityValue(main.p, main.headline), others: hardRepresentatives(pool).map((x) => abilityValue(x.p, x.headline)) };
  })())`));
  assert.ok(ability.main > 0 && ability.others.every((score) => score <= ability.main), "能力优先的主计划应有最高的 DeepSWE v1.1 成绩");
  assert.match(app.elements.get("pickerPolicy").textContent, /模型能力优先.*DeepSWE v1\.1.*不同评测不合成总分/);
  assert.match(app.elements.get("quickGrid").innerHTML, /本次按 DeepSWE v1\.1 参与排序/);
  const chip = app.run('document.querySelector(\'#picker .picker-row[data-pick="priority"] [data-value="price"]\')');
  app.fire(chip, "click");
  assert.equal(new URLSearchParams(app.location.search).get("priority"), "price");
  assert.equal(chip.getAttribute("aria-pressed"), "true");
  const restored = createApp({ url: app.location.href });
  assert.equal(restored.run("pickerState.priority"), "price");
  const invalid = createApp({ url: "http://127.0.0.1:8123/index.html?priority=hack" });
  assert.equal(invalid.run("pickerState.priority"), "quota");
  healthy(app); healthy(restored); healthy(invalid);
});

test("推荐区直接展示前三档对比，手机卡片带字段标签，对比按钮与卡片同步", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=200&region=cn&task=hard" });
  const table = app.elements.get("quickGrid").querySelector(".qc-compare");
  assert.ok(table, "缺少对比表");
  const rows = table.querySelectorAll("tbody tr");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].querySelector(".qc-compare-tag").textContent, "主计划");
  assert.equal(rows[1].querySelector(".qc-compare-tag"), null);
  assert.equal(rows[0].querySelector(".cmp-add").dataset.planId, app.run("chooseMain(eligibleProfiles()).p.id"));
  for (const td of table.querySelectorAll("tbody td")) assert.ok(td.getAttribute("data-label"), "手机卡片需要字段标签");
  assert.match(app.elements.get("quickGrid").innerHTML, /<th scope="col">DeepSWE v1\.1<\/th>/);
  assert.equal(new Set(rows.map((row) => row.querySelector(".cmp-add").dataset.planId)).size, 3, "对比表不重复同一档");
  app.fire(rows[1].querySelector(".cmp-add"), "click");
  const id = rows[1].querySelector(".cmp-add").dataset.planId;
  assert.equal(app.run("cmpState.items.map((p) => p.id).join()"), id);
  for (const button of app.elements.get("quickGrid").querySelectorAll(`.cmp-add[data-plan-id="${id}"]`)) assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.match(app.elements.get("pickerNote").textContent, /^符合条件 \d+ 档 · 额度优先/);
  assert.match(app.elements.get("pickerRulesNote").textContent, /中转站与国家限定套餐不参与通用推荐/);
  healthy(app);
});

test("复制推荐摘要为纯文本，包含条件、主计划、候选与当前链接", async () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=200&region=cn&task=hard&priority=ability" });
  app.fire(app.elements.get("copySummaryBtn"), "click");
  await new Promise((resolve) => setImmediate(resolve));
  const text = app.run("copiedText");
  assert.match(text, /推荐摘要（数据版本 \d{4}-\d{2}-\d{2}）/);
  assert.match(text, /条件：≤¥200 · 国内 · 不限工具 · 复杂为主 · 月付标价 · 模型能力优先/);
  assert.match(text, /\n主计划：.+ — .+；.+；额度参考下限 .+；DeepSWE v1\.1 /);
  assert.match(text, /\n候选 2：/);
  assert.match(text, /\?task=hard&priority=ability#quick$/, "默认预算与地区不写入链接");
  assert.doesNotMatch(text, /<|&lt;|undefined|NaN/);
  assert.match(app.elements.get("serviceFeedback").textContent, /已复制推荐摘要/);
  healthy(app);
});

test("数据表默认收起中转站与待核价格，开关可显示、可分享，空态提供显示入口", () => {
  const app = createApp();
  const hidden = app.run("PLANS.filter(isOnSalePlan).filter(tableExtraHidden).length");
  assert.ok(hidden > 0);
  assert.equal(app.run("computeTableRows().some((p) => isRelay(p) || !isPriceConfirmed(p))"), false);
  assert.match(app.elements.get("tableCount").textContent, new RegExp(`另有 ${hidden} 档中转站或待核价格未显示`));
  const toggle = app.elements.get("tableExtraToggle");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  app.fire(toggle, "click");
  assert.equal(app.run("computeTableRows().length"), app.run("PLANS.filter(isOnSalePlan).length"));
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(new URLSearchParams(app.location.search).get("tall"), "1");
  assert.doesNotMatch(app.elements.get("tableCount").textContent, /未显示/);
  assert.equal(createApp({ url: app.location.href }).run("tableState.extra"), true, "分享链接保留开关");
  app.fire(app.elements.get("tableResetBtn"), "click");
  assert.equal(app.run("tableState.extra"), false);
  app.run('tableState.search = "88code"; renderTable();');
  assert.equal(app.run("computeTableRows().length"), 0);
  const show = app.elements.get("tableBody").querySelector("[data-table-extra]");
  assert.ok(show, "只匹配到隐藏档位时，空态应提供显示入口");
  app.fire(show, "click");
  assert.ok(app.run("computeTableRows().length") > 0);
  healthy(app);
});

test("构建期预渲染写入默认推荐与价格表，启动后按链接条件重绘并移除标记", () => {
  const { prerenderIndex, injectContainer } = require("../build/prerender");
  const out = prerenderIndex(html);
  assert.match(out, /id="tableBody" data-prerendered><tr>/);
  assert.match(out, /id="quickGrid" data-prerendered><div class="quick-card"/);
  assert.match(out, /id="freeGrid" data-prerendered>\s*<div class="free-card">/);
  assert.doesNotMatch(out, /<script\b(?![^>]*\bsrc=)[^>]*>[^<]+<\/script>/, "不注入内联脚本，CSP 仍禁止内联");
  for (const url of ["http://127.0.0.1:8123/index.html", "http://127.0.0.1:8123/index.html?budget=500&tall=1#table"]) {
    const app = createApp({ html: out, url });
    healthy(app);
    assert.equal(app.run('document.querySelectorAll("[data-prerendered]").length'), 0, "启动后不再隐藏任何容器");
    assert.equal(app.run('document.documentElement.classList.contains("has-query")'), false);
  }
  assert.throws(() => injectContainer('<div id="x"><p>old</p></div>', "x", "new"), /应为空/);
  assert.throws(() => injectContainer("<div></div>", "x", "new"), /缺失或重复/);
});

test("发布产物附带分享图等公共静态文件，跳过隐藏文件且不越出白名单", () => {
  const os = require("node:os");
  const { publicExtras } = require("../build/stage-site");
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cp-extras-")));
  try {
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
    fs.mkdirSync(path.join(dir, "img"));
    fs.mkdirSync(path.join(dir, "feeds"));
    fs.writeFileSync(path.join(dir, "img", "og-card.png"), "png");
    fs.writeFileSync(path.join(dir, "img", ".DS_Store"), "x");
    fs.writeFileSync(path.join(dir, "feeds", "vendor-test.xml"), "<rss/>");
    const files = publicExtras(dir).map((file) => path.relative(dir, file).split(path.sep).join("/"));
    assert.deepEqual(files, ["img/og-card.png", "feeds/vendor-test.xml"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\/img\/og-card\.png">/);
  assert.ok(fs.existsSync(path.join(root, "img", "og-card.png")), "og:image 指向的文件需随站发布");
  assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/">/);
});

test("关注同步链接只含套餐 ID，打开后由用户确认合并，地址栏随即去掉参数", async () => {
  const followed = JSON.stringify({ version: 1, planIds: ["plan-0002"], readChangeIds: [] });
  const app = createApp({ storage: { "cp-followed-plans-v1": followed } });
  assert.equal(app.elements.get("copyFollowLinkBtn").disabled, false);
  app.fire(app.elements.get("copyFollowLinkBtn"), "click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(app.run("copiedText"), /\?follow=plan-0002#updates$/);
  assert.match(app.elements.get("followedPlans").innerHTML, /href="feeds\/anthropic-[0-9a-f]{8}\.xml"/, "关注的厂商提供单独订阅");
  const incoming = createApp({ url: "http://127.0.0.1:8123/index.html?follow=plan-0003,plan-9999,../x,plan-0003#updates" });
  const box = incoming.elements.get("followImport");
  assert.equal(box.hidden, false);
  assert.match(box.innerHTML, /带来 1 档关注套餐，其中 1 档尚未在本机关注/);
  assert.equal(new URLSearchParams(incoming.location.search).has("follow"), false, "启动后地址栏不保留关注参数");
  incoming.fire(box.querySelector('[data-follow-import="merge"]'), "click");
  assert.deepEqual(JSON.parse(incoming.run('localStorage.getItem("cp-followed-plans-v1")')).planIds, ["plan-0003"]);
  assert.equal(box.hidden, true);
  const dismissed = createApp({ url: "http://127.0.0.1:8123/index.html?follow=plan-0004#updates" });
  dismissed.fire(dismissed.elements.get("followImport").querySelector('[data-follow-import="dismiss"]'), "click");
  assert.equal(dismissed.run("followState.planIds.length"), 0, "忽略后不写入本机关注");
  healthy(app); healthy(incoming); healthy(dismissed);
});

test("每个在库厂商都有确定的变更订阅文件，条目链接到对应档位并使用中文字段名", () => {
  const maintenance = JSON.parse(fs.readFileSync(path.join(root, "data/maintenance.json"), "utf8"));
  const { vendorFeedSlug } = require("../maintenance/build-maintenance");
  const app = createApp();
  const vendors = JSON.parse(app.run("JSON.stringify([...new Set([...PLANS, ...API_PRICES, ...PAYG_REFERENCES].map((r) => r.vendor))].sort())"));
  assert.deepEqual(maintenance.feeds.map((feed) => feed.vendor), vendors);
  for (const feed of maintenance.feeds) {
    assert.equal(feed.path, "feeds/" + vendorFeedSlug(feed.vendor) + ".xml");
    const xml = fs.readFileSync(path.join(root, feed.path), "utf8");
    assert.equal((xml.match(/<item>/g) || []).length, feed.changes, feed.vendor);
  }
  const busy = maintenance.feeds.find((feed) => feed.changes > 0);
  const xml = fs.readFileSync(path.join(root, busy.path), "utf8");
  assert.match(xml, /\?q=[^<]+&amp;tall=1#table/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "changes.xml"), "utf8"), /<description>[^<]*\bprice[MY]：/, "RSS 用中文字段名");
  healthy(app);
});

test("ccusage 各种 JSON 形态都能本地解析，Claude 缓存分列与 Codex 缓存子集分别处理", () => {
  const app = createApp();
  const parse = (value) => JSON.parse(app.run(`JSON.stringify(parseUsageExport(${JSON.stringify(JSON.stringify(value))}))`));
  const day = (date, extra) => ({ date, inputTokens: 1000, outputTokens: 2000, cacheCreationTokens: 1000, cacheReadTokens: 8000, totalTokens: 12000, ...extra });
  const claude = parse({ daily: [day("2026-10-01"), day("2026-10-02")], totals: {} });
  assert.equal(claude.total, 24000);
  assert.equal(claude.activeDays, 2);
  assert.ok(Math.abs(claude.inputShare - 20000 / 24000 * 100) < 1e-9, "Claude 的缓存读写计入输入");
  assert.ok(Math.abs(claude.cacheRate - 80) < 1e-9);
  const codex = parse({ daily: [{ date: "2026-10-01", inputTokens: 10000, cachedInputTokens: 9000, outputTokens: 1000 }] });
  assert.equal(codex.total, 11000, "Codex 缓存输入已含在 inputTokens");
  assert.ok(Math.abs(codex.cacheRate - 90) < 1e-9);
  assert.equal(parse([{ month: "2026-09", inputTokens: 5, outputTokens: 5 }]).months, 1);
  assert.equal(parse({ type: "monthly", data: [{ month: "2026-08", inputTokens: 1, outputTokens: 1 }] }).total, 2);
  assert.equal(parse({ projects: { a: [day("2026-10-03")], b: [day("2026-10-03")] } }).activeDays, 1);
  for (const bad of ["not json", "{}", '{"daily":[{"date":"2026-10-01"}]}']) {
    assert.throws(() => app.run(`parseUsageExport(${JSON.stringify(bad)})`), /JSON|token/);
  }
  healthy(app);
});

test("导入用量换算成计算器条件并写入链接，按有用量天数推算每月天数", () => {
  const app = createApp();
  const daily = Array.from({ length: 14 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, inputTokens: 200000, outputTokens: 100000, cacheReadTokens: 1600000, cacheCreationTokens: 200000 }))
    .filter((_, i) => i % 7 < 5);
  const text = app.elements.get("usageImportText");
  text.value = JSON.stringify({ daily });
  app.fire(app.elements.get("usageImportBtn"), "click");
  const state = JSON.parse(app.run("JSON.stringify(calcState)"));
  assert.equal(state.days, "25", "12 天跨度里有 10 天使用：10 ÷ 12 × 30.44 ≈ 25 天/月");
  assert.equal(state.input, "95.2", "输入含缓存读写：2.0M ÷ 2.1M");
  assert.equal(state.cache, "80");
  assert.equal(Number(state.requests) * Number(state.tokens), 2100000, "每天 210 万 tokens");
  assert.match(app.elements.get("usageImportFeedback").textContent, /已导入 10 个有用量的日子/);
  assert.equal(new URLSearchParams(app.location.search).get("cdays"), "25");
  text.value = "[]";
  app.fire(app.elements.get("usageImportBtn"), "click");
  assert.match(app.elements.get("usageImportFeedback").textContent, /没有读到 token 用量/);
  assert.equal(app.run("calcState.days"), "25", "导入失败不改已有条件");
  healthy(app);
});

const claudeLogLine = (id, day, model = "claude-opus-5-5-20260901") => JSON.stringify({ type: "assistant", timestamp: `2026-10-0${day}T10:00:00.000Z`, requestId: "req_" + id,
  message: { id: "msg_" + id, model, usage: { input_tokens: 10, output_tokens: 500, cache_creation_input_tokens: 1000, cache_read_input_tokens: 20000 } } });
const codexLog = () => {
  const usage = (input, cached, output) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 100, total_tokens: input + output });
  const event = (time, total, last) => JSON.stringify({ timestamp: time, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total, last_token_usage: last } } });
  return [
    JSON.stringify({ timestamp: "2026-10-01T10:00:00Z", type: "session_meta", payload: { id: "s1" } }),
    JSON.stringify({ timestamp: "2026-10-01T10:00:01Z", type: "turn_context", payload: { model: "gpt-codex-test" } }),
    JSON.stringify({ timestamp: "2026-10-01T10:01:00Z", type: "event_msg", payload: { type: "token_count", info: null } }),
    event("2026-10-01T10:02:00Z", usage(5000, 4000, 300), usage(5000, 4000, 300)),
    event("2026-10-01T10:02:01Z", usage(5000, 4000, 300), usage(5000, 4000, 300)),
    event("2026-10-01T10:05:00Z", usage(12000, 10000, 700), usage(7000, 6000, 400)),
  ].join("\n");
};

test("Claude Code / Codex 会话日志按消息去重解析，多份文件合并统计并识别主要模型", () => {
  const app = createApp();
  /** @param {string|string[]} value */
  const parse = (value) => JSON.parse(app.run(`JSON.stringify(parseUsageExport(${JSON.stringify(value)}))`));
  const claudeText = [claudeLogLine(1, 1), claudeLogLine(1, 1), claudeLogLine(2, 2),
    JSON.stringify({ type: "user", timestamp: "2026-10-02T09:00:00Z", message: { role: "user", content: "hi" } }), "not json", ""].join("\n");
  const claude = parse(claudeText);
  assert.equal(claude.total, 2 * 21510, "流式重复写入的同一回复只计一次；缓存读写计入输入");
  assert.equal(claude.activeDays, 2);
  assert.equal(claude.cacheWrite, 2000);
  assert.ok(Math.abs(claude.cacheRate - 40000 / 42020 * 100) < 1e-9);
  assert.equal(claude.model, "claude-opus-5-5-20260901");
  assert.equal(claude.modelShare, 1);
  assert.equal(parse(claudeLogLine(3, 3)).total, 21510, "只有一行的日志也按会话日志解析");

  const codex = parse(codexLog());
  assert.equal(codex.total, 12700, "Codex 的缓存输入已含在输入里，累计未变的 token_count 不重复计入");
  assert.ok(Math.abs(codex.cacheRate - 10000 / 12000 * 100) < 1e-9);
  assert.equal(codex.model, "gpt-codex-test");

  const both = parse([claudeText, codexLog()]);
  assert.equal(both.total, 2 * 21510 + 12700);
  assert.equal(both.activeDays, 2, "不同文件的同一天只算一次");
  assert.equal(both.model, "claude-opus-5-5-20260901");
  assert.equal(parse([claudeText, claudeText]).total, 2 * 21510, "重复选择同一份日志不重复计入");
  assert.throws(() => app.run(`parseUsageExport(${JSON.stringify(JSON.stringify({ type: "user", message: { role: "user" } }))})`), /没有读到 token 用量/);
  assert.throws(() => app.run('parseUsageExport("hello world")'), /不是有效的 JSON 或 JSONL/);
  healthy(app);
});

test("日志模型只匹配完全一致或带日期后缀的牌价，主要模型占七成以上才换计算器模型", async () => {
  const app = createApp();
  assert.equal(app.run('(apiForUsageModel("claude-opus-5-5") || {}).model'), "Claude Opus 5.5");
  assert.equal(app.run('(apiForUsageModel("claude-opus-5-5-latest") || {}).model'), "Claude Opus 5.5");
  assert.equal(app.run('(apiForUsageModel("claude-opus-5-5-20260901") || {}).model'), "Claude Opus 5.5");
  assert.equal(app.run('apiForUsageModel("claude-opus-5-7")'), null, "不把新版本对到旧版本");
  assert.equal(app.run('apiForUsageModel("")'), null);

  const text = app.elements.get("usageImportText"), feedback = app.elements.get("usageImportFeedback");
  text.value = [claudeLogLine(1, 1), claudeLogLine(2, 2)].join("\n");
  app.fire(app.elements.get("usageImportBtn"), "click");
  assert.equal(app.run("calcState.model"), "Anthropic|Claude Opus 5.5");
  assert.match(feedback.textContent, /主要模型 claude-opus-5-5-20260901 已对应 Anthropic · Claude Opus 5\.5 的 API 牌价/);
  assert.doesNotMatch(app.location.href, /msg_|req_|20260901/, "链接只保存折算后的计算条件");

  const before = app.run("calcState.model");
  text.value = [claudeLogLine(1, 1), claudeLogLine(2, 2, "claude-unknown-9")].join("\n");
  app.fire(app.elements.get("usageImportBtn"), "click");
  assert.equal(app.run("calcState.model"), before);
  assert.match(feedback.textContent, /混用了多个模型，保留计算器当前模型/);

  /* 选择多份文件：合并导入，超出文本框回显上限时清空文本框，避免再次点击导入截断内容。 */
  const file = app.elements.get("usageImportFile");
  const big = [claudeLogLine(5, 5), "x".repeat(25000)].join("\n");
  file.files = [{ size: big.length, text: async () => big }, { size: 10, text: async () => codexLog() }];
  text.value = "旧内容";
  app.fire(file, "change");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(text.value, "");
  assert.match(feedback.textContent, /已导入 2 个有用量的日子：共 0\.03M tokens/);
  file.files = [{ size: 31 * 1024 * 1024, text: async () => "" }];
  app.fire(file, "change");
  assert.match(feedback.textContent, /内容超过 30MB/);
  healthy(app);
});

test("按用量反查能覆盖的套餐，给出同模型按量费用与订阅回本点", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?region=all&budget=any" });
  const rows = JSON.parse(app.run(`JSON.stringify(usageCoverageRows(30).map((r) => ({ id: r.p.id, moLow: r.c.moLow, conf: r.conf, price: r.quote.monthlyCNY, api: r.apiMonthlyCNY, breakEven: r.breakEvenM })))`));
  assert.ok(rows.length >= 3);
  for (const row of rows) {
    assert.ok(row.moLow >= 30 && ["高", "中"].includes(row.conf), JSON.stringify(row));
    if (row.api != null) assert.ok(Math.abs(row.breakEven * row.api / 30 - row.price) < 1e-6, "回本点 × 每 M 按量价 = 月费");
  }
  assert.deepEqual(rows.map((r) => r.price), rows.map((r) => r.price).slice().sort((a, b) => a - b), "按月均价升序");
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "每档只列一行");
  app.run("renderCostCalculator();");
  assert.match(app.elements.get("costResult").innerHTML, /能覆盖这个用量的套餐/);
  assert.equal(app.run("usageCoverageRows(1e9).length"), 0);
  assert.match(app.run("usageCoverageHtml(1e9)"), /没有套餐的参考月额度下限/);
  healthy(app);
});

test("中国大陆可用性只按登记的官方说明展示，未登记的国际档标未核实", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?region=intl&budget=any&task=hard" });
  assert.ok(badgesOf(app, "plan-0002").includes("不服务中国大陆"), "Claude Pro");
  assert.ok(badgesOf(app, "plan-0017").includes("不服务中国大陆"), "Google AI Pro");
  assert.ok(!badgesOf(app, "plan-0021").includes("不服务中国大陆"), "Code Assist 未登记，不按厂商名推测");
  assert.ok(badgesOf(app, "plan-0098").includes("部分模型限地区"), "Cursor 模型供应商的地区限制");
  const text = (id) => app.run(`mainlandAccessText(findPlanReference(${JSON.stringify(id)}))`);
  assert.match(text("plan-0010"), /官方支持地区不含中国大陆（\d{4}-\d{2}-\d{2} 核查）/);
  assert.equal(text("plan-0157"), "国内服务");
  assert.equal(text("plan-0021"), "未核实官方支持地区");
  const csv = app.run('tableRowsCsv([findPlanReference("plan-0002")])');
  assert.match(csv, /"中国大陆可用性"/);
  assert.match(csv, /官方支持地区不含中国大陆/);
  assert.match(app.elements.get("quickGrid").innerHTML, /官方支持地区不含中国大陆；需要外币或国际账号支付/);
  /** @type {Array<[string, string, RegExp]>} */
  const invalidEntries = [
    ['status: "restricted", checkedAt: "2026-10-10", url: "https://cursor.com/docs/account/regions"', 'status: "blocked", checkedAt: "2026-10-10", url: "https://cursor.com/docs/account/regions"', /status 只能是/],
    ['planIds: ["plan-0016", "plan-0017", "plan-0018", "plan-0019"]', 'planIds: ["plan-0016", "plan-0098"]', /planIds 须为该厂商/],
    ['url: "https://www.anthropic.com/supported-countries"', 'url: "http://www.anthropic.com/supported-countries"', /HTTPS/],
  ];
  for (const [from, to, pattern] of invalidEntries) {
    const mutated = dataSource.replace(from, to);
    assert.notEqual(mutated, dataSource, "测试锚点需要存在：" + from);
    assert.ok(validateData({ workspace: root, source: mutated }).errors.some((e) => pattern.test(e)), String(pattern));
  }
  healthy(app);
});

test("图表从宽屏缩到窄屏时整图重绘：标签移到柱子上方并加高每行", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html#s4" });
  const el = app.elements.get("chartRank");
  const chart = app.charts.get("chartRank");
  assert.equal(chart.option.yAxis.axisLabel.inside, undefined);
  const wideHeight = parseFloat(el.style.height);
  app.run(`(() => {
    const el = byId("chartRank");
    el.getBoundingClientRect = () => ({ top: 10, bottom: 600, left: 0, right: 330, width: 330, height: 590 });
    chartCache.chartRank.getWidth = () => 1200; chartCache.chartRank.getHeight = () => 590;
    markChartsForResize(["chartRank"]); resizeVisibleCharts();
  })()`);
  assert.equal(app.charts.get("chartRank").option.yAxis.axisLabel.inside, true);
  assert.ok(parseFloat(el.style.height) > wideHeight, "窄屏每行加高");
  healthy(app);
});

if (require.main === module) main();
