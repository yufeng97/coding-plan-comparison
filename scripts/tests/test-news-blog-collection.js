"use strict";
const assert = require("node:assert/strict");
const { collectNews } = require("../news/collect-news");
const { parseBlogArticle } = require("../news/blog");
const NOW = new Date("2026-10-09T10:00:00Z");
const blog = { id: "official-blog", name: "Official blog", kind: "blog", authority: "official", url: "https://official.example.com/news", articlePaths: ["^/news/[^/]+/?$"] };
const resolver = async () => [{ address: "8.8.8.8" }];
const article = (title, date = "2026-10-07", extra = "") => '<html><head><meta property="og:title" content="' + title + '">' + (date ? '<meta property="article:published_time" content="' + date + '">' : '') + '</head><body><main><article><h1>' + title + '</h1><p>A newly released model for efficient coding and agent workflows.</p>' + extra + '</article></main></body></html>';
const index = (...slugs) => '<main>' + slugs.map(slug => '<a href="/news/' + slug + '">' + slug + '</a>').join("") + '</main>';
const collect = (fetcher, extra = {}) => collectNews({ config: { schemaVersion: 1, sources: [blog] }, now: NOW, resolver, fetcher, ...extra });

async function main() {
  const separateHero = parseBlogArticle('<html><head><meta property="article:published_time" content="2026-09-10"></head><body><section><h1>DeepSeek V4.1 Flash</h1></section><main><article><p>A new multimodal model released for coding and agent workflows.</p></article></main></body></html>', 'https://official.example.com/news/flash');
  assert.equal(separateHero.title, 'DeepSeek V4.1 Flash');
  assert.equal(separateHero.publishedAt, '2026-09-10T00:00:00.000Z');
  const first = await collect(async url => new Response(String(url).endsWith("/news") ? index("haiku", "old", "future") : article("Claude Haiku 5.5", String(url).endsWith("old") ? "2026-09-01" : String(url).endsWith("future") ? "2026-10-20" : "2026-10-07")));
  assert.equal(first.report.status, "ok");
  assert.equal(first.report.candidates.length, 1);
  assert.equal(first.report.candidates[0].publishedAt, "2026-10-07T00:00:00.000Z");
  assert.equal(first.report.candidates[0].dateMeaning, "article-published");
  assert.equal(first.report.sources[0].pagesFetched, 4);
  assert.deepEqual(first.report.sources[0].futurePublicationDates, ["https://official.example.com/news/future"]);
  assert.notEqual(first.report.sources[0].status, "baseline");

  const partial = await collect(async url => new Response(String(url).endsWith("/news") ? index("haiku", "broken") : String(url).endsWith("broken") ? "unavailable" : article("Claude Haiku 5.5"), { status: String(url).endsWith("broken") ? 503 : 200 }));
  assert.equal(partial.report.status, "partial");
  assert.equal(partial.report.candidates.length, 1);
  assert.equal(partial.report.sources[0].status, "partial");
  assert.equal(partial.report.stats.sourcesFailed, 1);
  assert.equal(partial.health.sources[0].consecutiveFailures, 1);
  assert.match(partial.report.errors[0].message, /broken.*503/);

  const failed = await collect(async () => new Response("unavailable", { status: 503 }), { state: first.state, inbox: first.inbox });
  assert.equal(failed.report.status, "failed");
  assert.equal(failed.report.sources[0].cacheStale, true);
  assert.equal(failed.inbox.items.length, first.inbox.items.length);
  assert.equal(failed.report.candidates[0].publishedAt, first.report.candidates[0].publishedAt);

  const missing = await collect(async url => new Response(String(url).endsWith("/news") ? index("kimi") : article("Kimi K3", "")));
  assert.equal(missing.report.candidates[0].dateStatus, "missing");
  assert.equal(missing.report.candidates[0].publishedAt, undefined);
  assert.deepEqual(missing.report.sources[0].missingPublicationDates, ["https://official.example.com/news/kimi"]);

  const requests = [];
  const limited = await collect(async url => { requests.push(url); return new Response(String(url).endsWith("/news") ? index("one", "two") : article("Claude Haiku 5.5")); }, { config: { schemaVersion: 1, sources: [{ ...blog, maxArticles: 1 }] } });
  assert.equal(limited.report.sources[0].truncated, true);
  assert.equal(requests.length, 2);
  const badConfig = await collect(async () => { throw new Error("must not fetch"); }, { config: { schemaVersion: 1, sources: [{ ...blog, articlePaths: ["/news/"] }] } });
  assert.equal(badConfig.report.status, "failed");
  assert.match(badConfig.report.errors[0].message, /articlePaths/);

  const revisited = await collect(async (url, options) => {
    assert.equal(options.headers["if-none-match"], undefined);
    return new Response(String(url).endsWith("/news") ? index("haiku") : article("Claude Haiku 5.5 revised"), { headers: { etag: "changed" } });
  }, { state: first.state, inbox: first.inbox });
  assert.match(revisited.report.candidates[0].title, /revised/);

  const rss = { id: "model-feed", name: "Model feed", kind: "rss", authority: "official", url: "https://feed.example.com/rss" };
  const models = await collect(async () => new Response('<rss><channel>' + ["GPT&#x2011;6.1 Sol", "Claude Haiku 5.5", "Gemini 3.5", "Grok 4.7", "DeepSeek V4.1", "Qwen3.8", "GLM-5.3", "Kimi K3", "MiniMax-M3"].map((title, i) => '<item><title>' + title + '</title><link>https://feed.example.com/model-' + i + '</link><pubDate>2026-10-07</pubDate></item>').join("") + '</channel></rss>'), { config: { schemaVersion: 1, sources: [rss] }, knownVendors: [{ vendor: "OpenAI", domains: [] }, { vendor: "Anthropic", domains: [] }] });
  assert.equal(models.report.candidates.length, 9);
  assert.deepEqual(models.report.candidates.find(item => item.title.includes("Sol")).vendorMatches, [{ vendor: "OpenAI", match: "model-alias" }]);
  assert.deepEqual(models.report.candidates.find(item => item.title.includes("Haiku")).vendorMatches, [{ vendor: "Anthropic", match: "model-alias" }]);
  console.log("Official blog collection: first pass, dates, partial failures, stale cache, limits, rechecks and model discovery passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
