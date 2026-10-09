#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const { parseBlogLinks, parseBlogArticle } = require("../news/blog");

const ANTHROPIC = "https://www.anthropic.com/news";
const PATHS = ["^/news/[^/]+/?$", "^/claude-[a-z0-9-]+-[0-9][a-z0-9-]*/?$"];
const description = "A newly announced model for coding tasks and practical applications.";
const paragraph = `<p>${description}</p>`;
const article = (body, meta = "") => `<html><head>${meta}</head><body><main><article>${body}</article></main></body></html>`;
const jsonLD = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

function tests() {
  test("Anthropic 新闻索引兼容根路径新模型链接，同源/路径/导航过滤并去重", () => {
    const html = '<main><a href="/claude-haiku-5-5?utm_source=news#intro"><img alt="Haiku"></a>' +
      '<a href="https://www.anthropic.com/claude-haiku-5-5/">Introducing Haiku</a>' +
      '<a href="/news/launch">Launch</a><a href="/news">News</a><a href="/news/announcements">Category</a>' +
      '<a href="/news/tags/ai">Tag</a><a href="/pricing">Pricing</a><a href="javascript:alert(1)">Bad</a>' +
      '<a href="https://evil.example/news/launch">External</a><a href="https://www.anthropic.com.evil.example/news/launch">Spoof</a>' +
      '<script>const hidden="<a href=\'/news/script\'>script</a>";</script><!-- <a href="/news/comment">comment</a> --></main>';
    assert.deepEqual(parseBlogLinks(html, ANTHROPIC, PATHS), { urls:["https://www.anthropic.com/claude-haiku-5-5", "https://www.anthropic.com/news/launch"], truncated:false });
  });
  test("文章链接解析正确处理属性实体、相对路径以及每次最多20篇", () => {
    const html = '<main>' + Array.from({ length:23 }, (_, i) => `<a href="/news/model-${i}?id=${i}&amp;utm_source=feed">Model</a>`).join("") + '</main>';
    const result = parseBlogLinks(html, ANTHROPIC, PATHS);
    assert.equal(result.urls.length, 20); assert.equal(result.truncated, true);
    assert.equal(result.urls[0], "https://www.anthropic.com/news/model-0?id=0");
    const small = parseBlogLinks('<a href="../news/model-x">Model</a><a href="/news/model-y">Model</a>', ANTHROPIC + '/', PATHS, { maxArticles:1 });
    assert.deepEqual(small, { urls:["https://www.anthropic.com/news/model-x"], truncated:true });
  });
  test("无链接、无文章匹配、损坏HTML和无效路径规则明确失败", () => {
    for (const html of ["not html", '<main><a href="/pricing">Pricing</a></main>', '<main><script>unclosed']) assert.throws(() => parseBlogLinks(html, ANTHROPIC, PATHS));
    for (const rules of [[], ["/news/"], ["^[$"]]) assert.throws(() => parseBlogLinks('<a href="/news/model">Model</a>', ANTHROPIC, rules));
    assert.throws(() => parseBlogLinks('<a href="/news/model">Model</a>', ANTHROPIC, PATHS, { maxArticles:0 }));
  });
  test("真实Anthropic Haiku结构：main/section、h1 span与大小写dateTime提供真实发布日", () => {
    const html = '<html><head><meta property="og:title" content="Introducing Claude Haiku 5.5">' +
      `<meta property="og:description" content="${description}"></head><body><nav>Ignore menus</nav><main id="main-content">` +
      '<section aria-labelledby="launch-hero-title"><div class="stage"><p class="eyebrow"><time dateTime="2026-10-07">October 7, 2026</time></p>' +
      '<h1 id="launch-hero-title"><span>Claude</span> <span>Haiku 5.5</span></h1>' + paragraph + '</div></section></main></body></html>';
    const item = parseBlogArticle(html, "https://www.anthropic.com/claude-haiku-5-5");
    assert.equal(item.title, "Introducing Claude Haiku 5.5"); assert.equal(item.publishedAt, "2026-10-07T00:00:00.000Z");
    assert.equal(item.dateMeaning, "article-published"); assert.equal(item.kind, "blog-article"); assert.equal(item.summary, description);
  });
  test("DeepSeek官方结构使用article:published_time，不误取更新日期", () => {
    const html = article('<h1>DeepSeek V4.1 Flash</h1><time itemprop="dateModified" datetime="2026-10-09">Updated October 9, 2026</time>' + paragraph,
      '<meta content="2026-09-10" property="article:published_time"><meta property="og:description" content="New &amp; faster &#x1F680; models">');
    const item = parseBlogArticle(html, "https://www.deepseek.com/news/deepseek-v4-1-flash/");
    assert.equal(item.publishedAt, "2026-09-10T00:00:00.000Z"); assert.equal(item.summary, "New & faster 🚀 models");
  });
  test("MiniMax官方Article @graph提取headline/datePublished，忽略Organization foundingDate", () => {
    const html = article('<header><h1>MiniMax H3</h1><div><time>2026-07-31</time></div></header>' + paragraph,
      jsonLD({ "@graph":[{ "@type":"Organization", foundingDate:"2015-01-01", name:"MiniMax" }, { "@type":"Article", headline:"MiniMax H3: model release", datePublished:"2026-07-31", dateModified:"2026-10-09", description, mainEntityOfPage:{ "@id":"https://www.minimax.io/blog/minimax-h3" } }] }));
    const item = parseBlogArticle(html, "https://www.minimax.io/blog/minimax-h3");
    assert.equal(item.title, "MiniMax H3: model release"); assert.equal(item.publishedAt, "2026-07-31T00:00:00.000Z");
  });
  test("Kimi真实Article缺datePublished时保留日期缺失，不借用采集日或组织成立日", () => {
    const html = article('<h1>Kimi K3</h1>' + paragraph, jsonLD({ "@graph":[
      { "@type":"Organization", foundingDate:"2023-03-01", datePublished:"2023-03-01" },
      { "@type":"Article", headline:"Kimi K3", dateModified:"2026-10-09", description, mainEntityOfPage:{ "@id":"https://www.kimi.ai/blog/kimi-k3" } },
    ] }));
    const item = parseBlogArticle(html, "https://www.kimi.ai/blog/kimi-k3");
    assert.equal(item.title, "Kimi K3"); assert.equal(item.dateMeaning, "unknown"); assert.equal(Object.hasOwn(item, "publishedAt"), false);
  });
  test("没有JSONLD也支持time正文日期以及英文日期独立文本节点", () => {
    const first = parseBlogArticle(article('<h1>Model release</h1><time>2026-07-31</time>' + paragraph), "https://example.com/blog/model");
    assert.equal(first.publishedAt, "2026-07-31T00:00:00.000Z");
    const second = parseBlogArticle(article('<p>October 7, 2026</p><h1>Model &amp; tools</h1>' + paragraph), "https://example.com/blog/model");
    assert.equal(second.publishedAt, "2026-10-07T00:00:00.000Z"); assert.equal(second.title, "Model & tools");
  });
  test("JSONLD日期带时区时保留真实时刻，转UTC而不写当天日期", () => {
    const item = parseBlogArticle(article('<h1>Model release</h1>' + paragraph, jsonLD({ "@type":"NewsArticle", headline:"Model release", datePublished:"2026-10-07T01:30:00+08:00", description })), "https://example.com/news/model");
    assert.equal(item.publishedAt, "2026-10-06T17:30:00.000Z");
  });
  test("非法日历、非法时间及损坏JSONLD抛错，不伪装为缺失日期", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026-10-07T25:00:00Z", "today", "2026-10-07T00:80:00Z"])
      assert.throws(() => parseBlogArticle(article('<h1>Model release</h1>' + paragraph, jsonLD({ "@type":"Article", headline:"Model", datePublished:date, description })), "https://example.com/news/model"));
    assert.throws(() => parseBlogArticle(article('<h1>Model release</h1>' + paragraph, '<script type="application/ld+json">not-json</script>'), "https://example.com/news/model"));
  });
  test("修改日期不可充当发布日期，旁边另一篇文章的JSONLD也不串入", () => {
    const item = parseBlogArticle(article('<h1>Model release</h1><div>Last updated: <time datetime="2026-10-09">October 9, 2026</time></div>' + paragraph,
      jsonLD({ "@type":"Article", url:"https://example.com/news/other", headline:"Other model", datePublished:"2026-10-08", description })), "https://example.com/news/model");
    assert.equal(item.dateMeaning, "unknown"); assert.equal(Object.hasOwn(item, "publishedAt"), false);
  });
  test("文章摘要与标题有长度上限，普通script内伪日期和长正文不执行不全文入库", () => {
    const html = article('<h1>' + "Title ".repeat(120) + '</h1><time datetime="2026-10-07">October 7, 2026</time><p>' + "Summary ".repeat(150) + '</p><script>throw new Error("MUST NOT EXECUTE");</script>');
    const item = parseBlogArticle(html, "https://example.com/news/model");
    assert.equal(item.title.length, 500); assert.equal(item.summary.length, 360); assert.ok(!item.summary.includes("MUST NOT EXECUTE"));
  });
  test("导航、标签、验证码、缺主标题或缺正文的页面不能静默产出文章", () => {
    const valid = article('<h1>Model release</h1><time datetime="2026-10-07">October 7, 2026</time>' + paragraph);
    for (const path of ["/news", "/news/tags", "/news/tags/models", "/news/category/models"]) assert.throws(() => parseBlogArticle(valid, "https://example.com" + path));
    for (const html of ["blocked", '<html><main><h1>Access denied</h1><p>Complete the verification challenge to continue browsing.</p></main></html>', article(paragraph), article('<h1>Model release</h1><time datetime="2026-10-07">October 7, 2026</time>')]) assert.throws(() => parseBlogArticle(html, "https://example.com/news/model"));
  });
  console.log(`官方博客解析：${passed} 通过，0 失败`);
}

if (require.main === module) { try { tests(); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = { tests };
