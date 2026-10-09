"use strict";

const { plainText } = require("./feed");
const { replaceDelimited, elements, firstElement, stripElements, quotedTags, quotedElements } = require("./html-scan");
const { normalizeURL } = require("./urls");

const NON_ARTICLE_PATHS = new Set(["news", "blog", "index", "all", "archive", "archives", "category", "categories", "tag", "tags", "announcements", "company", "research", "product", "safety", "engineering"]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/* 文章与目录页最多 2 MiB：标签、属性与区块均用 html-scan 的线性扫描，结果与原正则逐项相同。 */

function htmlText(value) {
  return plainText(String(value || "").replace(/&(lsquo|rsquo|ldquo|rdquo|ensp|emsp|thinsp);/gi, (whole, name) => ({ lsquo:"‘", rsquo:"’", ldquo:"“", rdquo:"”", ensp:" ", emsp:" ", thinsp:" " })[name.toLowerCase()] || whole));
}
/** 线性属性扫描，同 /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g：引号未闭合时按无引号值读取。
 * @returns {Record<string,string>} */
function attributes(tag) {
  /** @type {Record<string,string>} */
  const result = {};
  const names = /[\w:-]+/g, equals = /\s*=\s*/y, bare = /[^\s>]+/y, unclosed = new Set();
  for (let match; (match = names.exec(tag));) {
    equals.lastIndex = names.lastIndex;
    if (!equals.exec(tag)) continue;
    const start = equals.lastIndex, quote = tag[start];
    let value = null, end = -1;
    if ((quote === '"' || quote === "'") && !unclosed.has(quote)) {
      end = tag.indexOf(quote, start + 1);
      if (end < 0) unclosed.add(quote); else { value = tag.slice(start + 1, end); end++; }
    }
    if (value === null) {
      bare.lastIndex = start;
      const plain = bare.exec(tag);
      if (!plain) continue;
      value = plain[0]; end = bare.lastIndex;
    }
    result[match[0].toLowerCase()] = htmlText(value);
    names.lastIndex = end;
  }
  return result;
}
/** 同 /<script\b[^>]*>(?![\s\S]*<\/script\s*>)/i：某个开标签之后再没有结束标签。 @param {string} html */
function unclosedScript(html) {
  const open = /<script\b/gi, close = /<\/script\s*>/gi;
  let lastClose = -1, tagEnd = -1;
  for (let match; (match = close.exec(html));) lastClose = match.index;
  while (open.exec(html)) {
    if (tagEnd < open.lastIndex) tagEnd = html.indexOf(">", open.lastIndex);
    if (tagEnd < 0) return false;
    if (lastClose < tagEnd + 1) return true;
  }
  return false;
}
function documentHTML(html) {
  if (typeof html !== "string" || !/<(?:html|main|article|h1|a|meta)\b/i.test(html)) throw new Error("博客响应不是可解析的 HTML");
  if (html.length > 8 * 1024 * 1024) throw new Error("博客 HTML 超过解析上限");
  if (unclosedScript(html)) throw new Error("博客 script 标签不完整");
  return html;
}
/** 去掉注释与不可见/导航区块（同原先的 /<!--[^]*?-->/g 与 /<(a|b)\b[^>]*>[^]*?<\/\1\s*>/gi 两次替换）。
 * @param {string} html @param {string[]} names */
const visibleHTML = (html, names) => stripElements(replaceDelimited(html, "<!--", "-->", () => " "), names);
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
  const visible = visibleHTML(html, ["script", "style", "template"]);
  for (const tag of quotedTags(visible)) {
    if (!/^<a\b/i.test(tag.text)) continue;
    const href = attributes(tag.text).href;
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
  for (const script of quotedElements(html, "script")) {
    if (attributes(script.attrs).type?.toLowerCase() !== "application/ld+json") continue;
    let json;
    try { json = JSON.parse(script.inner); }
    catch { try { json = JSON.parse(htmlText(script.inner)); } catch { throw new Error("文章 JSON-LD 无效"); } }
    articleNodes(json, nodes);
  }
  const matching = nodes.filter((node) => {
    const declared = node.url || (typeof node.mainEntityOfPage === "string" ? node.mainEntityOfPage : node.mainEntityOfPage?.["@id"]);
    if (!declared) return true;
    try { return normalizeURL(new URL(declared, url).href).replace(/\/$/, "") === url.replace(/\/$/, ""); } catch { return false; }
  });
  if (matching.length > 1) throw new Error("文章 JSON-LD 主文章不明确");
  const structured = matching[0];
  const visible = visibleHTML(html, ["script", "style", "template", "nav", "footer", "aside"]);
  const scope = firstElement(visible, ["article", "main"], { anyClose: true })?.inner || visible;
  /** @type {Record<string,string>} */
  const meta = {};
  for (const tag of quotedTags(visible)) {
    if (!/^<meta\b/i.test(tag.text)) continue;
    const attrs = attributes(tag.text), key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content) meta[key] = attrs.content;
  }
  // Some official layouts put the hero heading before <main>, with only the body in <article>.
  const scopedHeading = firstElement(scope, ["h1"]);
  const headingScope = scopedHeading ? scope : visible;
  const heading = scopedHeading || firstElement(headingScope, ["h1"]);
  const title = htmlText((typeof structured?.headline === "string" ? structured.headline : "") || (typeof structured?.name === "string" ? structured.name : "") || meta["og:title"] || heading?.inner);
  if (!title || (!structured && !heading)) throw new Error("博客文章缺少主标题或文章结构");
  let rawDate = structured?.datePublished || meta["article:published_time"] || meta["og:published_time"] || meta.datepublished || meta.pubdate;
  if (!rawDate) {
    const header = heading ? headingScope.slice(Math.max(0, heading.index - 1500), heading.end + 1500) : scope;
    for (const match of elements(header, ["time"])) {
      const attrs = attributes(match.attrs);
      const before = htmlText(header.slice(Math.max(0, match.index - 100), match.index));
      if (/modified|updated/i.test(attrs.itemprop || "") || /updated|last\s+modified/i.test(htmlText(match.inner)) || /(?:updated|last\s+modified)\s*[:：]?\s*$/i.test(before)) continue;
      rawDate = attrs.datetime || htmlText(match.inner); if (rawDate) break;
    }
    if (!rawDate) {
      for (const match of elements(header, ["p", "span", "div"])) {
        const text = htmlText(match.inner);
        if (/^(?:Published\s+(?:on\s+)?)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$/i.test(text)) { rawDate = text; break; }
      }
    }
  }
  const publishedAt = rawDate ? publicationDate(rawDate) : null;
  if (!structured && !/<article\b/i.test(scope) && !/<article\b/i.test(visible) && meta["og:type"] !== "article" && !(publishedAt && /<main\b/i.test(visible))) throw new Error("博客页面没有可确认的文章结构");
  const paragraphs = [...elements(scope, ["p"])].map((match) => htmlText(match.inner)).filter((text) => text.length >= 20 && !/^(?:Published|Updated|Last modified)\b/i.test(text));
  const summary = htmlText((typeof structured?.description === "string" ? structured.description : "") || meta["og:description"] || meta.description || paragraphs[0] || "").slice(0, 360);
  if (!summary) throw new Error("博客文章没有可解析的摘要或正文");
  return { title:title.slice(0, 500), url, summary, ...(publishedAt ? { publishedAt } : {}), dateMeaning:publishedAt ? "article-published" : "unknown", kind:"blog-article" };
}

module.exports = { parseBlogLinks, parseBlogArticle };
