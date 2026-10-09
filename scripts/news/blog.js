"use strict";

const { plainText } = require("./feed");
const { normalizeURL } = require("./urls");

const NON_ARTICLE_PATHS = new Set(["news", "blog", "index", "all", "archive", "archives", "category", "categories", "tag", "tags", "announcements", "company", "research", "product", "safety", "engineering"]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

function htmlText(value) {
  return plainText(String(value || "").replace(/&(lsquo|rsquo|ldquo|rdquo|ensp|emsp|thinsp);/gi, (whole, name) => ({ lsquo:"‘", rsquo:"’", ldquo:"“", rdquo:"”", ensp:" ", emsp:" ", thinsp:" " })[name.toLowerCase()] || whole));
}
/** @returns {Record<string,string>} */
function attributes(tag) {
  /** @type {Record<string,string>} */
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = htmlText(match[2] ?? match[3] ?? match[4]);
  return result;
}
function documentHTML(html) {
  if (typeof html !== "string" || !/<(?:html|main|article|h1|a|meta)\b/i.test(html)) throw new Error("博客响应不是可解析的 HTML");
  if (html.length > 8 * 1024 * 1024) throw new Error("博客 HTML 超过解析上限");
  if (/<script\b[^>]*>(?![\s\S]*<\/script\s*>)/i.test(html)) throw new Error("博客 script 标签不完整");
  return html;
}
function articlePath(pathname) {
  const parts = pathname.toLowerCase().split("/").filter(Boolean);
  return parts.length > 0 && !NON_ARTICLE_PATHS.has(parts.at(-1)) && !parts.some((part) => ["category", "categories", "tag", "tags", "page"].includes(part));
}

/** Extract a bounded list of same-origin article URLs. Path rules are anchored pathname regular expressions.
 * @param {string} html @param {string} indexURL @param {string[]} articlePaths
 * @param {{maxArticles?:number}} [options]
 * @returns {{urls:string[],truncated:boolean}} */
function parseBlogLinks(html, indexURL, articlePaths, options = {}) {
  documentHTML(html);
  if (!Array.isArray(articlePaths) || !articlePaths.length || articlePaths.some((pattern) => typeof pattern !== "string" || !pattern.startsWith("^") || !pattern.endsWith("$"))) throw new Error("博客文章路径必须是非空的首尾锚定正则数组");
  const patterns = articlePaths.map((pattern) => new RegExp(pattern));
  const maxArticles = options.maxArticles ?? 20;
  if (!Number.isInteger(maxArticles) || maxArticles < 1 || maxArticles > 100) throw new Error("博客文章上限必须在 1–100 之间");
  const index = new URL(normalizeURL(indexURL)), urls = [], seen = new Set();
  const visible = html.replace(/<!--[^]*?-->/g, " ").replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi, " ");
  for (const match of visible.matchAll(TAG)) {
    if (!/^<a\b/i.test(match[0])) continue;
    const href = attributes(match[0]).href;
    if (!href || href.startsWith("#")) continue;
    let url;
    try { url = new URL(normalizeURL(new URL(href, index).href)); } catch { continue; }
    if (url.origin !== index.origin || url.pathname.replace(/\/$/, "") === index.pathname.replace(/\/$/, "") || !articlePath(url.pathname) || !patterns.some((pattern) => pattern.test(url.pathname))) continue;
    const key = url.origin + url.pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key); urls.push(url.href);
  }
  if (!urls.length) throw new Error("博客索引没有解析到符合配置的文章链接");
  return { urls:urls.slice(0, maxArticles), truncated:urls.length > maxArticles };
}

function validCalendar(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
/** Interpret only explicit publication dates; relative text and update dates never become publication dates. */
function publicationDate(raw) {
  const value = htmlText(raw);
  let year, month, day, iso;
  const numeric = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(value);
  if (numeric) {
    [year, month, day] = numeric.slice(1, 4).map(Number);
    if (Number(numeric[4] || 0) > 23 || Number(numeric[5] || 0) > 59 || Number(numeric[6] || 0) > 59) throw new Error("文章发布日期时间无效");
    iso = numeric[4] ? value.replace(" ", "T") + (numeric[8] ? "" : "Z") : value + "T00:00:00Z";
  } else {
    const english = /^(?:Published\s+(?:on\s+)?)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(value);
    const reverse = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(value);
    const chinese = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/.exec(value);
    if (english || reverse) {
      const match = english || reverse, name = (english ? match[1] : match[2]).toLowerCase();
      month = MONTHS.findIndex((full) => full === name || full.slice(0, 3) === name) + 1;
      day = Number(english ? match[2] : match[1]); year = Number(match[3]);
    } else if (chinese) [year, month, day] = chinese.slice(1).map(Number);
    else throw new Error("文章缺少可核验的发布日期");
    iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`;
  }
  const time = Date.parse(iso);
  if (!validCalendar(year, month, day) || !Number.isFinite(time)) throw new Error("文章发布日期无效");
  return new Date(time).toISOString();
}

/** @param {unknown} value @param {Array<Record<string,any>>} nodes @param {number} [depth] */
function articleNodes(value, nodes, depth = 0) {
  if (depth > 32) throw new Error("文章 JSON-LD 嵌套过深");
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const child of value) articleNodes(child, nodes, depth + 1); return; }
  const node = /** @type {Record<string,any>} */ (value), types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (types.some((type) => typeof type === "string" && /^(?:https?:\/\/schema\.org\/)?(?:Article|NewsArticle|BlogPosting|TechArticle|Report|AnalysisNewsArticle)$/i.test(type))) nodes.push(node);
  for (const child of Object.values(node)) articleNodes(child, nodes, depth + 1);
}

/** Parse an article without running HTML scripts. Missing publication dates stay unknown; invalid dates fail.
 * @param {string} html @param {string} articleURL
 * @returns {import('./feed').NewsItem} */
function parseBlogArticle(html, articleURL) {
  documentHTML(html);
  const url = normalizeURL(articleURL);
  if (!articlePath(new URL(url).pathname)) throw new Error("博客导航或分类页不能作为文章");
  /** @type {Array<Record<string,any>>} */
  const nodes = [];
  for (const match of html.matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1]).type?.toLowerCase() !== "application/ld+json") continue;
    let json;
    try { json = JSON.parse(match[2]); }
    catch { try { json = JSON.parse(htmlText(match[2])); } catch { throw new Error("文章 JSON-LD 无效"); } }
    articleNodes(json, nodes);
  }
  const matching = nodes.filter((node) => {
    const declared = node.url || (typeof node.mainEntityOfPage === "string" ? node.mainEntityOfPage : node.mainEntityOfPage?.["@id"]);
    if (!declared) return true;
    try { return normalizeURL(new URL(declared, url).href).replace(/\/$/, "") === url.replace(/\/$/, ""); } catch { return false; }
  });
  if (matching.length > 1) throw new Error("文章 JSON-LD 主文章不明确");
  const structured = matching[0];
  const visible = html.replace(/<!--[^]*?-->/g, " ").replace(/<(script|style|template|nav|footer|aside)\b[^>]*>[^]*?<\/\1\s*>/gi, " ");
  const scope = /<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)\s*>/i.exec(visible)?.[1] || visible;
  /** @type {Record<string,string>} */
  const meta = {};
  for (const match of visible.matchAll(TAG)) {
    if (!/^<meta\b/i.test(match[0])) continue;
    const attrs = attributes(match[0]), key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content) meta[key] = attrs.content;
  }
  // Some official layouts put the hero heading before <main>, with only the body in <article>.
  const scopedHeading = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(scope);
  const headingScope = scopedHeading ? scope : visible;
  const heading = scopedHeading || /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(headingScope);
  const title = htmlText((typeof structured?.headline === "string" ? structured.headline : "") || (typeof structured?.name === "string" ? structured.name : "") || meta["og:title"] || heading?.[1]);
  if (!title || (!structured && !heading)) throw new Error("博客文章缺少主标题或文章结构");
  let rawDate = structured?.datePublished || meta["article:published_time"] || meta["og:published_time"] || meta.datepublished || meta.pubdate;
  if (!rawDate) {
    const header = heading ? headingScope.slice(Math.max(0, heading.index - 1500), heading.index + heading[0].length + 1500) : scope;
    for (const match of header.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time\s*>/gi)) {
      const attrs = attributes(match[1]);
      const before = htmlText(header.slice(Math.max(0, match.index - 100), match.index));
      if (/modified|updated/i.test(attrs.itemprop || "") || /updated|last\s+modified/i.test(htmlText(match[2])) || /(?:updated|last\s+modified)\s*[:：]?\s*$/i.test(before)) continue;
      rawDate = attrs.datetime || htmlText(match[2]); if (rawDate) break;
    }
    if (!rawDate) {
      for (const match of header.matchAll(/<(p|span|div)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
        const text = htmlText(match[2]);
        if (/^(?:Published\s+(?:on\s+)?)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$/i.test(text)) { rawDate = text; break; }
      }
    }
  }
  const publishedAt = rawDate ? publicationDate(rawDate) : null;
  if (!structured && !/<article\b/i.test(scope) && !/<article\b/i.test(visible) && meta["og:type"] !== "article" && !(publishedAt && /<main\b/i.test(visible))) throw new Error("博客页面没有可确认的文章结构");
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)].map((match) => htmlText(match[1])).filter((text) => text.length >= 20 && !/^(?:Published|Updated|Last modified)\b/i.test(text));
  const summary = htmlText((typeof structured?.description === "string" ? structured.description : "") || meta["og:description"] || meta.description || paragraphs[0] || "").slice(0, 360);
  if (!summary) throw new Error("博客文章没有可解析的摘要或正文");
  return { title:title.slice(0, 500), url, summary, ...(publishedAt ? { publishedAt } : {}), dateMeaning:publishedAt ? "article-published" : "unknown", kind:"blog-article" };
}

module.exports = { parseBlogLinks, parseBlogArticle };
