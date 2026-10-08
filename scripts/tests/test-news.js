#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseFeed, parseHN } = require("../news/feed");
const { fetchSource, publicURL, publicAddress, validateSourceURL, MAX_BYTES } = require("../news/network");
const { collectNews, runCollection, normalizeURL, readKnownVendors, parseArguments, main, withNewsLock } = require("../news/collect-news");
const { stableId, validateInbox } = require("../news/inbox");
const { applyReview, runReview, triageData, parseArguments: reviewArguments } = require("../news/review-news");

const NOW = new Date("2026-10-07T00:00:00Z");
const OCT8 = new Date("2026-10-08T00:00:00Z");
const resolver = async () => [{ address: "8.8.8.8" }];
const source = (id = "one", kind = "rss", authority = "official") => ({ id, name: "Source " + id, kind, authority, url: "https://news.example.com/" + id });
const config = (...sources) => ({ schemaVersion: 1, sources });
const itemXML = (title, url, date = "2026-10-06T00:00:00Z", summary = "") => '<item><title>' + title + '</title><link>' + url.replace(/&/g, "&amp;") + '</link>' + (date ? '<pubDate>' + date + '</pubDate>' : '') + '<description><![CDATA[' + summary + ']]></description></item>';
const rss = (...items) => '<rss version="2.0"><channel>' + items.join("") + '</channel></rss>';
/** @returns {ReturnType<typeof collectNews>} */
const collect = (sources, fetcher, extra = {}) => collectNews({ config: config(...sources), now: NOW, fetcher, resolver, ...extra });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("  ✓ " + name); }

async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-news-test-"));
  const write = (relative, value) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  write("js/data.js", 'const PLANS=[{id:"plan-existing",vendor:"Existing",url:"https://existing.example.com/pricing"}]; const API_PRICES=[{vendor:"API Only",source:"https://api-only.example.com/pricing"}]; const PAYG_REFERENCES=[{vendor:"Payg Only",url:"https://payg-only.example.com/pricing"}];');
  write("config/news-sources.json", JSON.stringify(config(source())));
  try { await fn(root, write); }
  finally {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("coding-plan-news-test-")) throw new Error("拒绝清理未知资讯测试路径");
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function tests() {
  await test("RSS 实体/CDATA/namespace 日期与自闭合 atom:link，正文只保留360字摘要", () => {
    const xml = rss('<item><title>New &#x1F680; Coding Plan &amp; credits</title><atom:link href="https://wrong.example.com" rel="self"/><link>/launch?utm_source=x&amp;id=2</link><dc:date>2026-10-06</dc:date><description><![CDATA[<p>New <item> inside a tutorial; <!DOCTYPE html> is sample text.</p>' + "x".repeat(500) + ']]></description><content:encoded><![CDATA[DO NOT COPY THE COMPLETE ARTICLE]]></content:encoded></item>');
    const items = parseFeed(xml, "https://news.example.com/feed", "rss");
    assert.equal(items.length, 1); assert.equal(items[0].title, "New 🚀 Coding Plan & credits");
    assert.equal(items[0].url, "https://news.example.com/launch?utm_source=x&id=2");
    assert.equal(items[0].publishedAt, "2026-10-06"); assert.equal(items[0].summary.length, 360);
    assert.ok(!JSON.stringify(items).includes("DO NOT COPY"));
  });
  await test("Atom 只读entry直接字段，继承xml:base及XHTML摘要，updated语义明确", () => {
    const xml = '<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://new.example.com/news/"><entry><source><title>Old archive</title><updated>2001-01-01</updated></source><title>New code assistant &amp; editor</title><link href="launch" rel="alternate"/><updated>2026-10-06T09:00:00Z</updated><summary type="xhtml"><div><b>编程助手</b> Launch</div></summary></entry></feed>';
    const [item] = parseFeed(xml, "https://other.example.com/feed.xml", "atom");
    assert.equal(item.title, "New code assistant & editor"); assert.equal(item.url, "https://new.example.com/news/launch");
    assert.equal(item.publishedAt, "2026-10-06T09:00:00Z"); assert.equal(item.dateMeaning, "feed-update"); assert.equal(item.summary, "编程助手 Launch");
  });
  await test("合法空feed成功，损坏XML/未解析条目/真正DTD显式失败", () => {
    assert.deepEqual(parseFeed(rss(), "https://news.example.com", "rss"), []);
    assert.deepEqual(parseFeed('<feed/>', "https://news.example.com", "atom"), []);
    for (const xml of ['<rss><channel></rss>', '<rss><channel><item><title>x</title></channel></rss>', rss('<item><title>x</title></item>'), '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///private">]>' + rss()]) assert.throws(() => parseFeed(xml, "https://news.example.com", "rss"));
  });
  await test("URL归一去fragment和跟踪，保留业务参数且拒绝本地/非HTTP链接", () => {
    assert.equal(normalizeURL("https://NEWS.example.com/a?utm_source=x&id=3&fbclid=y#top"), "https://news.example.com/a?id=3");
    for (const url of ["javascript:alert(1)", "file:///private", "https://127.0.0.1/x", "http://localhost/x", "https://user:pass@news.example.com"]) assert.throws(() => normalizeURL(url));
    assert.doesNotThrow(() => normalizeURL("http://news.example.com/product"));
  });
  await test("已知厂商仅作标注，陌生厂商和共享托管新仓库候选保留", async () => {
    const { report } = await collect([source()], async () => new Response(rss(
      itemXML("Unknown coding plan launch", "https://fresh.example.com/launch"),
      itemXML("Fresh code assistant launch", "https://github.com/stranger/new-agent"),
      itemXML("Pricing updates", "https://existing.example.com/new"),
      itemXML("Existing coding agent release", "https://elsewhere.example.com/story")
    )), { knownVendors: [{ vendor: "Existing", domains: ["existing.example.com"] }, { vendor: "GitHub Copilot", domains: ["github.com", "github.io"] }] });
    assert.equal(report.stats.candidates, 4); assert.equal(report.stats.knownVendor, 2); assert.equal(report.stats.vendorReviewCandidates, 2);
    assert.equal(report.candidates.find((item) => item.url.includes("github.com")).needsVendorReview, true);
    assert.equal(report.candidates.find((item) => item.url.includes("fresh.example.com")).needsVendorReview, true);
  });
  await test("默认新增中英关键词与配置扩展均匹配，跨来源URL去重保留来源和时间语义", async () => {
    const first = source("first"), second = source("second", "atom", "discovery"); first.keywords = ["novel product"];
    const { report } = await collect([first, second], async (url) => new Response(String(url).endsWith("first") ? rss(
      itemXML("Token Plan 发布", "https://new.example.com/token"), itemXML("编程订阅", "https://new.example.com/zh"), itemXML("Novel product", "https://new.example.com/custom"),
      itemXML("Agentic-coding launch", "https://new.example.com/dupe?utm_campaign=x#top", null)
    ) : '<feed><entry><title>Vibe coding editor</title><link href="https://new.example.com/dupe"/><published>2026-10-06T00:00:00Z</published></entry></feed>'));
    assert.equal(report.stats.candidates, 4);
    const merged = report.candidates.find((item) => item.url.endsWith("/dupe")); assert.equal(merged.sources.length, 2); assert.equal(merged.dateStatus, "known");
    assert.equal(merged.publishedAt, "2026-10-06T00:00:00.000Z"); assert.deepEqual(merged.sources.map((item) => item.authority), ["official", "discovery"]);
  });
  await test("滚动窗口包含边界，排除过去/未来；缺失与无效日期不冒充checkedAt", async () => {
    const { report } = await collect([source()], async () => new Response(rss(
      itemXML("Coding plan boundary", "https://new.example.com/boundary", "2026-09-23T00:00:00Z"),
      itemXML("Coding plan old", "https://new.example.com/old", "2026-09-22T23:59:59Z"),
      itemXML("Coding plan future", "https://new.example.com/future", "2026-10-07T00:00:01Z"),
      itemXML("Coding plan missing", "https://new.example.com/missing", null),
      itemXML("Coding plan invalid", "https://new.example.com/invalid", "not-a-date")
    )));
    assert.equal(report.candidates.length, 3); assert.equal(report.window.start, "2026-09-23T00:00:00.000Z");
    const missing = report.candidates.find((item) => item.url.endsWith("missing")), invalid = report.candidates.find((item) => item.url.endsWith("invalid"));
    assert.equal(missing.dateStatus, "missing"); assert.equal(invalid.dateStatus, "invalid");
    assert.ok(!("publishedAt" in missing)); assert.ok(!("publishedAt" in invalid));
  });
  await test("HN帖子日期与原文发布日期区分，截断显式报告且无URL时提供帖子链接", async () => {
    const json = { hits: [{ objectID: "123", title: "New code editor", url: null, created_at: "2026-10-06T00:00:00Z", story_text: "<p>credits &amp; pricing</p>" }], nbPages: 4 };
    assert.equal(parseHN(json).items[0].url, "https://news.ycombinator.com/item?id=123");
    const { report } = await collect([source("hn", "hn-search", "discovery")], async () => Response.json(json));
    assert.equal(report.sources[0].truncated, true); assert.match(report.sources[0].sourceDate, /不是原文/);
    assert.equal(report.candidates[0].dateMeaning, "hn-post-created"); assert.equal(report.candidates[0].sources[0].authority, "discovery");
    assert.equal(report.candidates[0].summary, "credits & pricing");
  });
  await test("不存在的ISO/RFC日期和24点钟不得被Date.parse滚成有效发布日期", async () => {
    const { report } = await collect([source()], async () => new Response(rss(
      itemXML("Coding plan invalid ISO", "https://new.example.com/iso", "2026-02-30"),
      itemXML("Coding plan invalid RFC", "https://new.example.com/rfc", "Mon, 30 Feb 2026 00:00:00 GMT"),
      itemXML("Coding plan invalid clock", "https://new.example.com/clock", "2026-03-01T24:00:00Z"),
      itemXML("Coding plan valid leap", "https://new.example.com/leap", "2024-02-29")
    )), { now: new Date("2026-03-03T00:00:00Z") });
    assert.equal(report.candidates.length, 3); assert.ok(report.candidates.every((item) => item.dateStatus === "invalid" && !("publishedAt" in item)));
  });
  await test("ETag/LastModified条件请求304复用缓存，并随新的窗口剔除过期条目", async () => {
    const first = await collect([source()], async () => new Response(rss(itemXML("Coding plan launch", "https://new.example.com/a")), { headers: { etag: '"v1"', "last-modified": "Tue, 06 Oct 2026 00:00:00 GMT" } }));
    const second = await collect([source()], async (_url, init) => {
      assert.equal(init.headers["if-none-match"], '"v1"'); assert.equal(init.headers["if-modified-since"], "Tue, 06 Oct 2026 00:00:00 GMT"); return new Response(null, { status: 304 });
    }, { state: first.state, now: new Date("2026-11-07T00:00:00Z") });
    assert.equal(second.report.status, "ok"); assert.equal(second.report.sources[0].cacheReused, true); assert.equal(second.report.candidates.length, 0);
    assert.deepEqual(second.state.sources, first.state.sources);
    assert.equal(second.state.health.one.lastSuccess, "2026-11-07T00:00:00.000Z");
    const noCache = await collect([source()], async () => new Response(null, { status: 304 }));
    assert.equal(noCache.report.status, "failed"); assert.match(noCache.report.errors[0].message, /没有可复用/);
  });
  await test("page首轮只建基线，后续变化是观测候选而非发布时间，无关键词也采集", async () => {
    const page = source("page", "page"), text = "This official product lists its features and subscription details. ";
    const baseline = await collect([page], async () => new Response('<html><head><title>Title</title></head><body>' + text.repeat(50) + '<script>hidden code</script></body></html>'));
    assert.equal(baseline.report.sources[0].status, "baseline"); assert.equal(baseline.report.candidates.length, 0); assert.equal(baseline.state.sources.page.items.length, 0);
    const change = await collect([page], async () => new Response(text.repeat(50) + "Changed"), { state: baseline.state });
    const [item] = change.report.candidates; assert.equal(item.kind, "page-change"); assert.equal(item.dateStatus, "not-applicable"); assert.ok(!("publishedAt" in item));
    assert.equal(item.observedAt, NOW.toISOString()); assert.equal(item.previousHash, baseline.state.sources.page.pageHash); assert.equal(item.currentHash, change.state.sources.page.pageHash);
    assert.ok(!JSON.stringify(change.state).includes(text)); assert.ok(item.summary.length <= 360);
  });
  await test("page隐藏脚本变化不造候选；已有变化在304/相同内容时保留原观测时间", async () => {
    const page = source("page", "page"), text = "Public visible product features and documented subscription information.";
    const first = await collect([page], async () => new Response(text + "<script>1</script>"));
    const same = await collect([page], async () => new Response(text + "<script>2</script>"), { state: first.state }); assert.equal(same.report.candidates.length, 0);
    const changed = await collect([page], async () => new Response(text + " New visible feature"), { state: same.state });
    const later = await collect([page], async () => new Response(null, { status: 304 }), { state: changed.state, now: new Date("2026-11-07T00:00:00Z") });
    assert.equal(later.report.candidates.length, 0); assert.equal(later.state.sources.page.items[0].observedAt, NOW.toISOString());
    const shell = await collect([page], async () => new Response('<html><script>big application</script><body>Please enable JavaScript to view the application.</body></html>'));
    assert.equal(shell.report.status, "failed"); assert.ok(!shell.state.sources.page);
  });
  await test("源失败隔离且保留旧缓存，缓存候选标明来源陈旧；所有失败不宣称成功", async () => {
    const baseline = await collect([source()], async () => new Response(rss(itemXML("Coding plan launch", "https://new.example.com/a"))));
    const failed = await collect([source()], async () => new Response("error", { status: 503 }), { state: baseline.state });
    assert.equal(failed.report.status, "failed"); assert.equal(failed.report.sources[0].cacheStale, true); assert.equal(failed.report.candidates.length, 1); assert.deepEqual(failed.state.sources, baseline.state.sources);
    assert.equal(failed.state.health.one.lastSuccess, NOW.toISOString()); assert.equal(failed.state.health.one.consecutiveFailures, 1);
    const mixed = await collect([source("good"), source("bad")], async (url) => String(url).endsWith("good") ? new Response(rss()) : new Response("error", { status: 500 }));
    assert.equal(mixed.report.status, "partial"); assert.equal(mixed.report.stats.sourcesSucceeded, 1); assert.equal(mixed.report.stats.sourcesFailed, 1);
    const empty = await collectNews({ config: config(), now: NOW }); assert.equal(empty.report.status, "failed"); assert.match(empty.report.errors[0].message, /没有配置/);
  });
  await test("响应body与Content-Length均受2MiB限制，HTML错当feed显式报错", async () => {
    const big = async () => new Response("x", { headers: { "content-length": String(MAX_BYTES + 1) } });
    await assert.rejects(fetchSource(source().url, { fetcher: big, resolver }), /超过 2 MiB/);
    await assert.rejects(fetchSource(source().url, { fetcher: async () => new Response("x".repeat(MAX_BYTES + 1)), resolver }), /超过 2 MiB/);
    const broken = await collect([source()], async () => new Response('<html>Not a feed</html>')); assert.equal(broken.report.status, "failed");
  });
  await test("HTTPS/DNS/私有IPv4与IPv6 guard，注入resolver不能绕过fake/private IP", async () => {
    for (const url of ["http://news.example.com/rss", "https://localhost/rss", "https://127.1/rss", "https://[::1]/rss", "https://[::ffff:127.0.0.1]/rss", "https://10.0.0.1/rss"]) await assert.rejects(validateSourceURL(url, resolver));
    for (const address of ["192.168.1.1", "198.18.0.1", "100.64.0.1", "169.254.169.254", "2001:db8::1", "fc00::1", "fe80::1"]) { assert.equal(publicAddress(address), false); await assert.rejects(validateSourceURL(source().url, async () => [{ address }])); }
    await assert.rejects(validateSourceURL(source().url, async () => [{ address: "8.8.8.8" }, { address: "10.0.0.1" }]));
    assert.equal(publicAddress("2606:4700:4700::1111"), true); assert.equal(publicAddress("::ffff:8.8.8.8"), true); assert.doesNotThrow(() => publicURL(source().url, true));
  });
  await test("重定向逐跳公开DNS校验，拒绝私有目标且不调用fetch，合法相对跳转保留base", async () => {
    let calls = 0;
    await assert.rejects(fetchSource(source().url, { resolver, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } }); } }), /私有|本地/);
    assert.equal(calls, 1);
    const fetched = await fetchSource(source().url, { resolver, fetcher: async (url) => String(url).endsWith("one") ? new Response(null, { status: 301, headers: { location: "/feeds/latest" } }) : new Response(rss()) });
    assert.equal(fetched.finalURL, "https://news.example.com/feeds/latest");
  });
  await test("15s总超时边界覆盖DNS/fetch/body（离线注入短期限）", async () => {
    const never = () => new Promise(() => {});
    await assert.rejects(fetchSource(source().url, { resolver: never, fetcher: async () => new Response("x"), timeoutMs: 10 }), /超时/);
    await assert.rejects(fetchSource(source().url, { resolver, fetcher: never, timeoutMs: 10 }), /超时/);
    await assert.rejects(fetchSource(source().url, { resolver, fetcher: async () => new Response(new ReadableStream({ pull: never })), timeoutMs: 10 }), /超时/);
  });
  await test("多个独立来源抓取并发最多3且报告顺序稳定", async () => {
    let active = 0, maximum = 0;
    const sources = Array.from({ length: 8 }, (_value, index) => source("source" + index));
    const { report } = await collect(sources, async () => { active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 5)); active--; return new Response(rss()); });
    assert.equal(maximum, 3); assert.equal(report.sources.length, 8); assert.deepEqual(report.sources.map((value) => value.id), sources.map((value) => value.id));
  });
  await test("本地VM发现PLANS/API_PRICES/PAYG_REFERENCES厂商，导入缩短摘要且不修改data.js", () => fixture(async (root, write) => {
    assert.equal(readKnownVendors(root).length, 3);
    const data = fs.readFileSync(path.join(root, "js/data.js"));
    write("import.json", JSON.stringify([{ title: "Fresh code assistant", url: "https://api-only.example.com/news", summary: "x".repeat(800) }, { title: "Unknown coding plan", url: "https://new.example.com/import", publishedAt: "bad-date" }]));
    const report = await runCollection({ workspace: root, now: NOW, resolver, fetcher: async () => new Response(rss()), importPath: "import.json" });
    assert.equal(report.status, "ok"); assert.equal(report.candidates.length, 2); assert.equal(report.stats.knownVendor, 1); assert.equal(report.stats.vendorReviewCandidates, 1);
    assert.equal(report.candidates.find((value) => value.url.includes("api-only")).summary.length, 360);
    assert.deepEqual(fs.readFileSync(path.join(root, "js/data.js")), data);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "audit/news/latest.json"), "utf8")).checkedAt, NOW.toISOString());
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "audit/news/state.json"), "utf8")).schemaVersion, 1);
  }));
  await test("CLI导入无效记录/源失败非零但写可用报告，导入链接不执行远端内容", () => fixture(async (root, write) => {
    write("import.json", JSON.stringify([{ title: "New coding plan", url: "https://new.example.com/import" }, { title: "Coding plan bad", url: "javascript:alert(1)" }]));
    const code = await main(["--import", "import.json"], { workspace: root, now: NOW, resolver, fetcher: async () => new Response("down", { status: 503 }) });
    assert.equal(code, 1);
    const report = JSON.parse(fs.readFileSync(path.join(root, "audit/news/latest.json"), "utf8")); assert.equal(report.status, "failed"); assert.equal(report.candidates.length, 1); assert.equal(report.errors.length, 2);
    const data = fs.readFileSync(path.join(root, "js/data.js")); assert.match(data.toString(), /^const PLANS=/);
  }));
  await test("损坏缓存保留原始文件且报告输入错误，不假装重建缓存成功", () => fixture(async (root, write) => {
    write("audit/news/state.json", "broken state");
    const report = await runCollection({ workspace: root, now: NOW, resolver, fetcher: async () => new Response(rss()) });
    assert.equal(report.status, "partial"); assert.ok(report.errors.some((error) => error.sourceId === "state")); assert.equal(fs.readFileSync(path.join(root, "audit/news/state.json"), "utf8"), "broken state");
  }));
  await test("第二个输出替换失败回滚报告/缓存原字节，清理暂存文件", () => fixture(async (root, write) => {
    const reportFile = path.join(root, "audit/news/latest.json"), stateFile = path.join(root, "audit/news/state.json");
    write("audit/news/latest.json", '{"old":"report"}'); write("audit/news/state.json", JSON.stringify({ schemaVersion: 1, sources: {} }));
    const beforeReport = fs.readFileSync(reportFile), beforeState = fs.readFileSync(stateFile);
    await assert.rejects(runCollection({ workspace: root, now: NOW, resolver, fetcher: async () => new Response(rss()), rename: (from, to) => { if (to === stateFile && path.basename(from) === "next") throw new Error("injected replace failure"); fs.renameSync(from, to); } }), /injected/);
    assert.deepEqual(fs.readFileSync(reportFile), beforeReport); assert.deepEqual(fs.readFileSync(stateFile), beforeState);
    assert.deepEqual(fs.readdirSync(path.dirname(reportFile)).sort(), ["latest.json", "state.json"]);
  }));
  await test("首次创建报告后缓存替换失败删除新报告，危险output不能覆盖数据/配置/导入/链接", () => fixture(async (root, write) => {
    const stateFile = path.join(root, "audit/news/state.json"), data = fs.readFileSync(path.join(root, "js/data.js"));
    await assert.rejects(runCollection({ workspace: root, now: NOW, resolver, fetcher: async () => new Response(rss()), rename: (from, to) => { if (to === stateFile) throw new Error("injected new failure"); fs.renameSync(from, to); } }), /injected/);
    assert.deepEqual(fs.readdirSync(path.dirname(stateFile)), []);
    const forbidden = ["js/data.js", "config/news-sources.json", "README.md", "audit/else.json", "audit/news/../../js/data.js", "audit/news/state.json"];
    for (const outputPath of forbidden) await assert.rejects(runCollection({ workspace: root, outputPath }), /输出/);
    write("audit/news/input.json", "[]"); await assert.rejects(runCollection({ workspace: root, outputPath: "audit/news/input.json", importPath: "audit/news/input.json" }), /输入/);
    fs.mkdirSync(path.join(root, "elsewhere")); fs.symlinkSync(path.join(root, "elsewhere"), path.join(root, "audit/news/linked"), "junction");
    await assert.rejects(runCollection({ workspace: root, outputPath: "audit/news/linked/report.json" }), /符号链接/);
    fs.unlinkSync(path.join(root, "audit/news/linked"));
    assert.deepEqual(fs.readFileSync(path.join(root, "js/data.js")), data);
  }));
  await test("CLI选项校验和--help保持只读", async () => {
    assert.deepEqual(parseArguments(["--days", "7", "--config", "custom.json", "--output", "audit/news/custom.json"]), { days: 7, configPath: "custom.json", outputPath: "audit/news/custom.json" });
    for (const args of [["--days", "0"], ["--days", "1.5"], ["--days", "366"], ["--config"], ["--oops"]]) assert.throws(() => parseArguments(args));
    assert.equal(await main(["--help"]), 0);
  });
  await test("HN numericFilters仅查窗口，最多3页合并且准确报告截断", async () => {
    const requests = [];
    const fetcher = async (raw) => {
      const url = new URL(String(raw)), page = Number(url.searchParams.get("page")); requests.push(page);
      assert.match(url.searchParams.get("numericFilters"), /created_at_i>=\d+,created_at_i<=\d+/);
      const [minimum, maximum] = url.searchParams.get("numericFilters").split(",").map((filter) => Number(filter.replace(/.*[>=]/, "")));
      assert.equal(minimum, (OCT8.getTime() - 14 * 86400000) / 1000); assert.equal(maximum, OCT8.getTime() / 1000);
      return Response.json({ nbPages: 5, hits: [{ objectID: String(page), title: "New coding agent page " + page, url: "https://new.example.com/page" + page, created_at: "2026-10-07T00:00:00Z" }] });
    };
    const result = await collect([source("hn", "hn-search", "discovery")], fetcher, { now: OCT8 });
    assert.deepEqual(requests, [0, 1, 2]); assert.equal(result.report.candidates.length, 3); assert.equal(result.report.sources[0].pagesFetched, 3); assert.equal(result.report.sources[0].truncated, true);
    const full = await collect([source("hn", "hn-search")], async () => Response.json({ hits: [], nbPages: 3 })); assert.equal(full.report.sources[0].truncated, false); assert.equal(full.report.sources[0].pagesFetched, 3);
  });
  await test("候选按规范URL永久ID保留首次发现，退出窗口/从feed消失仍积压待审", async () => {
    const first = await collect([source()], async () => new Response(rss(itemXML("New coding plan", "https://new.example.com/launch?utm_source=x#top"))), { now: OCT8 });
    const [item] = first.inbox.items;
    assert.equal(item.id, stableId("https://new.example.com/launch")); assert.equal(item.firstSeen, OCT8.toISOString()); assert.equal(item.lastSeen, OCT8.toISOString());
    const disappeared = await collect([source()], async () => new Response(rss()), { now: new Date("2026-11-08T00:00:00Z"), state: first.state, inbox: first.inbox });
    assert.equal(disappeared.report.candidates.length, 0); assert.equal(disappeared.inbox.items.length, 1); assert.equal(disappeared.inbox.items[0].lastSeen, item.lastSeen);
    assert.equal(disappeared.inbox.stats.agedBacklog, 1); assert.equal(disappeared.inbox.stats.pending, 1); assert.equal(disappeared.inbox.stats.unknownVendorCandidates, 1);
  });
  await test("已决候选重复内容不重新复核，来源合并；内容或日期变化保留已决状态并标needsReReview", async () => {
    const first = await collect([source()], async () => new Response(rss(itemXML("New coding plan", "https://new.example.com/a"))), { now: OCT8 });
    const context = { config: config(source()), knownVendors: [], plans: [], now: OCT8 };
    const input = { id: first.inbox.items[0].id, status: "accepted", reason: "官方说明值得人工入库", evidenceUrls: ["https://news.example.com/product"] };
    const accepted = applyReview(first.inbox, input, context);
    assert.equal(accepted.items[0].status, "accepted"); assert.equal(accepted.items[0].reviewHistory.length, 1);
    const repeat = await collect([source(), source("second")], async () => new Response(rss(itemXML("New coding plan", "https://new.example.com/a"))), { now: OCT8, state: first.state, inbox: accepted });
    assert.equal(repeat.inbox.items[0].sources.length, 2); assert.equal(repeat.inbox.items[0].needsReReview, false); assert.equal(repeat.inbox.items[0].reviewHistory.length, 1);
    const changed = await collect([source()], async () => new Response(rss(itemXML("New coding plan raises pricing", "https://new.example.com/a", "2026-10-07T00:00:00Z"))), { now: OCT8, state: repeat.state, inbox: repeat.inbox });
    const [updated] = changed.inbox.items; assert.equal(updated.status, "accepted"); assert.equal(updated.needsReReview, true); assert.equal(updated.revisions.length, 1);
    assert.equal(updated.reason, input.reason); assert.notEqual(updated.reviewHistory[0].contentHash, updated.contentHash);
    const reviewed = applyReview(changed.inbox, { ...input, reason: "复核修订后的官方日期和价格说明" }, context);
    assert.equal(reviewed.items[0].needsReReview, false); assert.equal(reviewed.items[0].reviewHistory.length, 2);
    assert.deepEqual(applyReview(reviewed, { ...input, reason: "复核修订后的官方日期和价格说明" }, context), reviewed);
    const dated = await collect([source()], async () => new Response(rss(itemXML(updated.title, updated.url, "2026-10-08T00:00:00Z"))), { now: OCT8, state: changed.state, inbox: reviewed });
    assert.equal(dated.inbox.items[0].needsReReview, true);
  });
  await test("所有人工状态流转留历史，严格官方证据/理由/计划ID，未知新厂商可空planIds", async () => {
    const first = await collect([source("discovery", "rss", "discovery")], async () => new Response(rss(itemXML("Unknown code assistant", "https://fresh.example.com/launch"))), { now: OCT8 });
    const id = first.inbox.items[0].id, context = { config: config(source("discovery", "rss", "discovery")), knownVendors: [{ vendor: "Existing", domains: ["existing.example.com"] }], plans: [{ id: "plan-existing", vendor: "Existing", url: "https://existing.example.com/pricing" }], now: OCT8 };
    const decision = { id, status: "accepted", reason: "已人工确认新厂商官网", evidenceUrls: ["https://fresh.example.com/pricing"] };
    assert.throws(() => applyReview(first.inbox, decision, context), /official-domain/);
    for (const override of [{ reason: " " }, { evidenceUrls: [] }, { evidenceUrls: ["http://fresh.example.com"] }, { evidenceUrls: ["https://127.0.0.1"] }, { planIds: ["missing-plan"] }, { officialDomains: ["github.com"] }, { officialDomains: ["co.uk"] }]) assert.throws(() => applyReview(first.inbox, { ...decision, officialDomains: ["fresh.example.com"], ...override }, context));
    let current = applyReview(first.inbox, { ...decision, officialDomains: ["fresh.example.com"] }, context);
    assert.deepEqual(current.items[0].planIds, []); assert.deepEqual(current.items[0].officialDomains, ["fresh.example.com"]);
    for (const status of ["rejected", "deferred", "pending"]) current = applyReview(current, { id, status, reason: "人工处理为 " + status }, context);
    assert.equal(current.items[0].reviewHistory.length, 4); assert.equal(current.items[0].status, "pending");
    current = applyReview(current, { id, status: "accepted", reason: "现有计划官方依据", planIds: ["plan-existing"], evidenceUrls: ["https://existing.example.com/pricing"] }, context);
    assert.deepEqual(current.items[0].planIds, ["plan-existing"]);
    const triage = triageData(current, { now: OCT8 }); assert.equal(triage.purpose, "manual-review-only"); assert.ok(triage.workflow.some((line) => line.includes("不改价")));
  });
  await test("来源失败不更新候选lastSeen，连续失败持久记录，恢复后清零；旧缓存字节内容保留", async () => {
    const first = await collect([source()], async () => new Response(rss(itemXML("Coding plan launch", "https://new.example.com/a"))), { now: OCT8 });
    const fail1 = await collect([source()], async () => new Response("down", { status: 503 }), { state: first.state, inbox: first.inbox, now: new Date("2026-10-09T00:00:00Z") });
    const fail2 = await collect([source()], async () => new Response("down", { status: 503 }), { state: fail1.state, inbox: fail1.inbox, now: new Date("2026-10-10T00:00:00Z") });
    assert.deepEqual(fail2.state.sources, first.state.sources); assert.equal(fail2.inbox.items[0].lastSeen, OCT8.toISOString()); assert.equal(fail2.inbox.items[0].needsReReview, false);
    assert.equal(fail2.health.sources[0].consecutiveFailures, 2); assert.equal(fail2.health.sources[0].lastSuccess, OCT8.toISOString()); assert.equal(fail2.health.sources[0].freshness, "stale");
    const recovered = await collect([source()], async () => new Response(null, { status: 304 }), { state: fail2.state, inbox: fail2.inbox, now: new Date("2026-10-11T00:00:00Z") });
    assert.equal(recovered.health.sources[0].consecutiveFailures, 0); assert.equal(recovered.health.sources[0].lastSuccess, "2026-10-11T00:00:00.000Z");
  });
  await test("过期page baseline与停用来源不伪称新鲜，304保留原基线日期", async () => {
    const page = source("page", "page"), text = "The official product has long visible feature documentation and subscription information.";
    const first = await collect([page], async () => new Response(text), { now: OCT8 });
    const later = await collect([page], async () => new Response(null, { status: 304 }), { state: first.state, now: new Date("2026-11-08T00:00:00Z") });
    assert.equal(later.report.sources[0].baselineAt, OCT8.toISOString()); assert.equal(later.report.sources[0].baselineExpired, true); assert.equal(later.health.sources[0].freshness, "baseline-aged");
    const disabled = await collect([source("new")], async () => new Response(rss()), { state: later.state, now: new Date("2026-11-09T00:00:00Z") });
    const old = disabled.health.sources.find((health) => health.id === "page"); assert.equal(old.enabled, false); assert.equal(old.checkedAt, "2026-11-08T00:00:00.000Z");
  });
  await test("同URL多源中陈旧缓存不能盖过新鲜内容，重复失败不让已复核修订反复重开", async () => {
    const sources = [source("old"), source("fresh")], url = "https://new.example.com/same";
    const knownVendors = [{ vendor: "Existing", domains: ["existing.example.com"] }];
    const first = await collect(sources, async () => new Response(rss(itemXML("Existing coding plan original", url))), { now: OCT8, knownVendors });
    const context = { config: config(...sources), knownVendors: [], plans: [], now: OCT8 }, decision = { id: stableId(url), status: "rejected", reason: "原内容不值得入库" };
    const reviewed = applyReview(first.inbox, decision, context);
    const nextFetcher = async (raw) => String(raw).endsWith("old") ? new Response("down", { status: 503 }) : new Response(rss(itemXML("Coding plan revised pricing", url)));
    const next = await collect(sources, nextFetcher, { now: OCT8, state: first.state, inbox: reviewed, knownVendors });
    assert.equal(next.report.candidates[0].title, "Coding plan revised pricing"); assert.equal(next.inbox.items[0].title, "Coding plan revised pricing"); assert.equal(next.inbox.items[0].needsReReview, true);
    assert.equal(next.report.candidates[0].needsVendorReview, true);
    const revised = applyReview(next.inbox, { ...decision, reason: "已复核新修订仍不入库" }, context);
    const repeat = await collect(sources, nextFetcher, { now: OCT8, state: next.state, inbox: revised, knownVendors });
    assert.equal(repeat.inbox.items[0].needsReReview, false); assert.equal(repeat.inbox.items[0].contentHash, revised.items[0].contentHash); assert.equal(repeat.inbox.items[0].reviewHistory.length, 2);
  });
  await test("HN后续分页失败不替换旧缓存或丢候选，显式失败并记健康错误", async () => {
    const hn = source("hn", "hn-search", "discovery");
    const first = await collect([hn], async () => Response.json({ nbPages: 1, hits: [{ objectID: "old", title: "Coding agent old", url: "https://old.example.com/a", created_at: "2026-10-07T00:00:00Z" }] }), { now: OCT8 });
    const failed = await collect([hn], async (raw) => new URL(String(raw)).searchParams.get("page") === "0" ? Response.json({ nbPages: 3, hits: [] }) : new Response("down", { status: 500 }), { now: OCT8, state: first.state, inbox: first.inbox });
    assert.equal(failed.report.status, "failed"); assert.deepEqual(failed.state.sources, first.state.sources); assert.equal(failed.inbox.items.length, 1); assert.equal(failed.health.sources[0].consecutiveFailures, 1);
  });
  await test("四输出后段替换失败报告/缓存/队列/健康全部回滚，保留人工决定", () => fixture(async (root) => {
    const options = { workspace: root, now: OCT8, resolver, fetcher: async () => new Response(rss(itemXML("Coding plan launch", "https://new.example.com/a"))) };
    await runCollection(options);
    const dir = path.join(root, "audit/news"), names = ["latest.json", "state.json", "inbox.json", "health.json"], before = names.map((name) => fs.readFileSync(path.join(dir, name)));
    await assert.rejects(runCollection({ ...options, now: new Date("2026-10-09T00:00:00Z"), fetcher: async () => new Response(rss(itemXML("Coding plan changes pricing", "https://new.example.com/a"))), rename: (from, to) => { if (to === path.join(dir, "health.json") && path.basename(from) === "next") throw new Error("injected health failure"); fs.renameSync(from, to); } }), /injected/);
    names.forEach((name, index) => assert.deepEqual(fs.readFileSync(path.join(dir, name)), before[index])); assert.deepEqual(fs.readdirSync(dir).sort(), names.sort());
  }));
  await test("人工review更新队列+报告回滚/幂等，不改data；triage只导出JSON候选", () => fixture(async (root) => {
    await runCollection({ workspace: root, now: OCT8, resolver, fetcher: async () => new Response(rss(itemXML("Existing coding plan launch", "https://existing.example.com/a"))) });
    const dir = path.join(root, "audit/news"), data = fs.readFileSync(path.join(root, "js/data.js")), inbox = JSON.parse(fs.readFileSync(path.join(dir, "inbox.json"), "utf8"));
    const options = { command: "review", workspace: root, now: OCT8, id: inbox.items[0].id, status: "accepted", reason: "已有计划官方依据已核对", evidenceUrls: ["https://existing.example.com/pricing"], planIds: ["plan-existing"] };
    const original = fs.readFileSync(path.join(dir, "inbox.json")), report = fs.readFileSync(path.join(dir, "latest.json"));
    await assert.rejects(runReview({ ...options, rename: (from, to) => { if (to === path.join(dir, "latest.json") && path.basename(from) === "next") throw new Error("injected review failure"); fs.renameSync(from, to); } }), /injected/);
    assert.deepEqual(fs.readFileSync(path.join(dir, "inbox.json")), original); assert.deepEqual(fs.readFileSync(path.join(dir, "latest.json")), report);
    await runReview(options); const reviewed = fs.readFileSync(path.join(dir, "inbox.json")); await runReview(options); assert.deepEqual(fs.readFileSync(path.join(dir, "inbox.json")), reviewed);
    const exported = await runReview({ command: "triage", workspace: root, status: "accepted", now: OCT8, outputPath: "audit/news/triage.json" }); assert.ok("candidates" in exported); assert.equal(exported.candidates.length, 1); assert.equal(exported.candidates[0].status, "accepted");
    assert.deepEqual(fs.readFileSync(path.join(root, "js/data.js")), data); assert.deepEqual(fs.readFileSync(path.join(dir, "inbox.json")), reviewed);
    await assert.rejects(runReview({ command: "triage", workspace: root, outputPath: "js/data.js" }), /输出/);
    assert.equal(reviewArguments(["review", "--id", "abc", "--status", "deferred", "--reason", "later"]).command, "review");
    assert.throws(() => reviewArguments(["review", "--id", "abc"])); assert.throws(() => reviewArguments(["list", "--evidence", "https://new.example.com"]));
  }));
  await test("迁移旧latest保留过期候选；损坏inbox失败时不覆写原历史或缓存", () => fixture(async (root, write) => {
    const first = await collect([source()], async () => new Response(rss(itemXML("Coding plan launch", "https://new.example.com/a"))), { now: OCT8 });
    write("audit/news/latest.json", JSON.stringify(first.report));
    const report = await runCollection({ workspace: root, now: new Date("2026-11-08T00:00:00Z"), resolver, fetcher: async () => new Response(rss()) });
    assert.equal(report.queue.total, 1); assert.equal(report.queue.agedBacklog, 1);
    const oldReport = fs.readFileSync(path.join(root, "audit/news/latest.json")), oldState = fs.readFileSync(path.join(root, "audit/news/state.json"));
    write("audit/news/inbox.json", "broken review history");
    await assert.rejects(runCollection({ workspace: root, resolver, fetcher: async () => new Response(rss()) }));
    assert.equal(fs.readFileSync(path.join(root, "audit/news/inbox.json"), "utf8"), "broken review history");
    assert.deepEqual(fs.readFileSync(path.join(root, "audit/news/latest.json")), oldReport); assert.deepEqual(fs.readFileSync(path.join(root, "audit/news/state.json")), oldState);
    assert.throws(() => validateInbox({ schemaVersion: 1, items: [] }));
  }));
  await test("采集进行中拒绝并发人工复核，避免后写覆盖已决状态", () => fixture(async (root) => {
    let begin = () => {}, release = () => {};
    const started = new Promise((resolve) => { begin = () => resolve(undefined); }), gate = new Promise((resolve) => { release = () => resolve(undefined); });
    const running = runCollection({ workspace: root, now: OCT8, resolver, fetcher: async () => { begin(); await gate; return new Response(rss()); } });
    await started;
    await assert.rejects(runReview({ command: "review", workspace: root, id: "missing", status: "rejected", reason: "later" }), /正在采集或复核/);
    release(); await running; assert.equal(fs.existsSync(path.join(root, "audit/news/.news.lock")), false);
  }));
  await test("资讯遗留锁阻止同时采集与复核，不删锁或改已有队列", () => fixture(async (root, write) => {
    const exited = require("node:child_process").spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    assert.equal(exited.status, 0);
    const stale = JSON.stringify({ pid: Number(exited.stdout), hostname: os.hostname() });
    write("audit/news/.news.lock", stale); write("audit/news/inbox.json", "saved review queue");
    let fetched = false;
    const outcomes = await Promise.allSettled([
      runCollection({ workspace: root, resolver, fetcher: async () => { fetched = true; return new Response(rss()); } }),
      runReview({ command: "review", workspace: root, id: "missing", status: "rejected", reason: "later" }),
    ]);
    for (const outcome of outcomes) { assert.equal(outcome.status, "rejected"); if (outcome.status === "rejected") assert.match(outcome.reason.message, /人工检查/); }
    assert.equal(fetched, false);
    assert.equal(fs.readFileSync(path.join(root, "audit/news/.news.lock"), "utf8"), stale);
    assert.equal(fs.readFileSync(path.join(root, "audit/news/inbox.json"), "utf8"), "saved review queue");
  }));
  await test("资讯操作失去锁所有权后保留替换锁，抛错操作正常释放自己的锁", () => fixture(async root => {
    const dir = path.join(root, "audit/news"), lock = path.join(dir, ".news.lock");
    const failure = new Error("news action failed");
    await assert.rejects(withNewsLock(dir, () => { throw failure; }), error => error === failure);
    assert.equal(fs.existsSync(lock), false);
    const replacement = JSON.stringify({ ownerId: "replacement", pid: process.pid });
    await assert.rejects(withNewsLock(dir, () => fs.writeFileSync(lock, replacement)), /所有权已变化/);
    assert.equal(fs.readFileSync(lock, "utf8"), replacement);
  }));
  await test("系统Fake-IP通过固定DoH复核，私有/失败/超限结果仍拒绝", () => require("./test-news-proxy").testProxyDNS());
  console.log("资讯离线回归通过：" + passed + " 项（无网络请求）");
}
tests().catch((error) => { console.error(error); process.exitCode = 1; });
