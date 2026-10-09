#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { plainText, parseFeed, parseHN } = require("./feed");
const { parseBlogLinks, parseBlogArticle } = require("./blog");
const { publicURL, fetchSource } = require("./network");
const { normalizeURL } = require("./urls");
const { validateInbox, updateInbox, validInstant } = require("./inbox");
const { withFileLock } = require("../lib/file-lock");

const DEFAULT_KEYWORDS = ["coding plan", "token plan", "编程套餐", "编程订阅", "AI编程", "AI 编程", "编程助手", "编码助手",
  "coding agent", "code agent", "code assistant", "code editor", "agentic coding", "vibe coding", "copilot", "codex", "credits", "pricing",
  "new model", "model release", "model launch", "新模型", "模型发布", "发布模型", "模型上线", "模型更新"];
const MODEL_NAMES = /\b(?:gpt\s*\d|claude\s+(?:haiku|sonnet|opus)\s*\d|(?:gemini|grok|deepseek|qwen|glm|mistral|kimi|mini\s*max)[\s-]*[a-z]?\d)/i;
const MODEL_ALIASES = { OpenAI: /\b(?:gpt\s*\d|codex)\b/i, Anthropic: /\bclaude\b/i, Google: /\bgemini\b/i, xAI: /\bgrok\b/i };
const SHARED_DOMAINS = ["github.com", "github.io", "huggingface.co", "vercel.app", "netlify.app", "pages.dev", "gitlab.com", "gitlab.io", "blogspot.com"];
const KINDS = ["rss", "atom", "hn-search", "page", "blog"];
const MAX_STATE_ITEMS = 5000;

/** @typedef {import('./feed').NewsItem} NewsItem */
/** @typedef {{id:string,name:string,kind:string,url:string,authority:string,keywords?:string[],articlePaths?:string[],maxArticles?:number}} NewsSource */
/** @typedef {{vendor:string,domains:string[]}} KnownVendor */
/** @typedef {{url:string,kind:string,etag?:string,lastModified?:string,items:NewsItem[],pageHash?:string,baselineAt?:string,truncated?:boolean,updatedAt?:string}} SourceCache */
/** @typedef {{id:string,url:string,kind:string,checkedAt:string,lastSuccess:string|null,consecutiveFailures:number,status:string,error:string|null,baselineAt?:string,baselineExpired?:boolean,freshness:string,enabled:boolean}} SourceHealth */
/** @typedef {{schemaVersion:number,sources:Record<string,SourceCache>,health?:Record<string,SourceHealth>}} NewsState */
/** @typedef {{fetcher?:typeof fetch,resolver?:(hostname:string)=>Promise<Array<{address:string}>>,timeoutMs?:number}} NetworkOptions */
/** @typedef {{id:string,name:string,url:string,authority:string,dateMeaning:string}} SourceReference */
/** @typedef {NewsItem & {dateStatus:string,sources:SourceReference[],vendorMatches:Array<{vendor:string,match:string}>,needsVendorReview:boolean}} Candidate */
/** @typedef {{id:string,name:string,kind:string,url:string,authority:string,status:string,itemsFetched:number,candidatesEligible:number,cacheReused?:boolean,cacheStale?:boolean,truncated?:boolean,sourceDate?:string,error?:string,pagesFetched?:number,pageLimit?:number,missingPublicationDates?:string[],futurePublicationDates?:string[],requestURL?:string,lastSuccess?:string|null,consecutiveFailures?:number,baselineAt?:string,baselineExpired?:boolean,freshness?:string}} SourceResult */
/** @typedef {{schemaVersion:number,checkedAt:string,window:{days:number,start:string,end:string},status:string,reviewRequired:boolean,sources:SourceResult[],errors:Array<{sourceId:string,message:string}>,candidates:Candidate[],stats:{candidates:number,knownVendor:number,vendorReviewCandidates:number,sourcesSucceeded:number,sourcesFailed:number},queue?:import('./inbox').InboxStats}} NewsReport */
const folded = (text) => String(text || "").toLowerCase().replace(/[\s_\-\u2010-\u2015\u2212]+/g, " ");
function keywordMatch(item, extra = []) { const text = folded(item.title + " " + item.summary); return MODEL_NAMES.test(text) || [...DEFAULT_KEYWORDS, ...extra].some((word) => text.includes(folded(word))); }

function calendarDate(year, month, day) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function publicationTime(raw) {
  if (typeof raw !== "string") return NaN;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(raw);
  if (iso && !calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return NaN;
  const clock = /[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (clock && (Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] || 0) > 59)) return NaN;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const rfc = /(?:^|\s)(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})(?:\s|$)/i.exec(raw);
  if (rfc && !calendarDate(Number(rfc[3]), months.indexOf(rfc[2].toLowerCase()) + 1, Number(rfc[1]))) return NaN;
  return Date.parse(raw);
}

/** Execute only the repository's trusted local data source, never source responses or imported content.
 * @returns {KnownVendor[]} */
function readKnownVendors(workspace) {
  const source = fs.readFileSync(path.join(workspace, "js", "data.js"), "utf8");
  const plans = vm.runInNewContext(source + "\n;[...(typeof PLANS !== 'undefined' ? PLANS : []), ...(typeof API_PRICES !== 'undefined' ? API_PRICES : []), ...(typeof PAYG_REFERENCES !== 'undefined' ? PAYG_REFERENCES : [])]", {}, { timeout: 2000 });
  const vendors = new Map();
  for (const plan of plans) {
    if (!plan || typeof plan.vendor !== "string" || !plan.vendor.trim()) continue;
    const domains = vendors.get(plan.vendor) || new Set();
    for (const link of [plan.url, plan.source]) if (typeof link === "string") { try { const parsed = publicURL(link); domains.add(parsed.hostname.toLowerCase().replace(/^www\./, "")); } catch {} }
    vendors.set(plan.vendor, domains);
  }
  return [...vendors].map(([vendor, domains]) => ({ vendor, domains: [...domains] }));
}

/** @returns {Array<{id:string,vendor:string,url:string}>} */
function readPlanReferences(workspace) {
  const source = fs.readFileSync(path.join(workspace, "js", "data.js"), "utf8");
  return vm.runInNewContext(source + "\n;PLANS.map(p => ({id:p.id,vendor:p.vendor,url:p.url || ''}))", {}, { timeout: 2000 });
}

function vendorNameMatch(text, name) {
  // Match the complete recorded name and meaningful parenthesized aliases, with ASCII word boundaries.
  const names = [name, ...name.split(/[（）()]/)].map((part) => part.trim()).filter((part) => part.length >= 2);
  return names.some((part) => {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefix = /^[a-z\d]/i.test(part) ? "(?:^|[^a-z\\d])" : "";
    const suffix = /[a-z\d]$/i.test(part) ? "(?:$|[^a-z\\d])" : "";
    return new RegExp(prefix + escaped + suffix, "i").test(text);
  });
}
/** @param {NewsItem} item @param {KnownVendor[]} vendors */
function matchVendors(item, vendors) {
  const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "");
  const text = item.title + " " + item.summary;
  return vendors.flatMap((known) => {
    const domain = known.domains.some((value) => {
      // A shared host cannot establish the product owner; subdomain hosting must match the entire host.
      if (SHARED_DOMAINS.includes(value)) return false;
      if (SHARED_DOMAINS.some((shared) => value.endsWith("." + shared))) return host === value;
      return host === value || host.endsWith("." + value);
    });
    const alias = MODEL_ALIASES[known.vendor]?.test(folded(text));
    return domain || vendorNameMatch(text, known.vendor) || alias ? [{ vendor: known.vendor, match: domain ? "domain" : alias ? "model-alias" : "name" }] : [];
  });
}

function validSource(source) {
  if (!source || typeof source.id !== "string" || !/^[a-z\d][a-z\d_-]{0,79}$/i.test(source.id) ||
      typeof source.name !== "string" || !source.name.trim() || !KINDS.includes(source.kind) ||
      typeof source.url !== "string" || !["official", "discovery"].includes(source.authority) ||
      (source.keywords !== undefined && (!Array.isArray(source.keywords) || source.keywords.some((word) => typeof word !== "string" || !word.trim())))) throw new Error("来源配置字段无效");
  publicURL(source.url, true);
  if (source.kind === "blog") {
    if (!Array.isArray(source.articlePaths) || !source.articlePaths.length || source.articlePaths.some((pattern) => typeof pattern !== "string" || !pattern.startsWith("^") || !pattern.endsWith("$"))) throw new Error("博客来源须提供完整锚定的 articlePaths 路径规则");
    for (const pattern of source.articlePaths) new RegExp(pattern);
    if (source.maxArticles !== undefined && (!Number.isInteger(source.maxArticles) || source.maxArticles < 1 || source.maxArticles > 40)) throw new Error("博客 maxArticles 必须为 1–40 的整数");
  }
}

/** @returns {NewsState} */
function validateState(value) {
  if (!value || value.schemaVersion !== 1 || !value.sources || typeof value.sources !== "object" || Array.isArray(value.sources)) throw new Error("缓存 state.json 格式无效");
  for (const cache of Object.values(value.sources)) {
    if (!cache || typeof cache.url !== "string" || !KINDS.includes(cache.kind) || !Array.isArray(cache.items) || cache.items.length > MAX_STATE_ITEMS ||
        cache.items.some((item) => !item || typeof item.title !== "string" || typeof item.url !== "string" || typeof item.summary !== "string" || item.summary.length > 360 || typeof item.kind !== "string") ||
        (cache.etag !== undefined && typeof cache.etag !== "string") || (cache.lastModified !== undefined && typeof cache.lastModified !== "string") ||
        (cache.pageHash !== undefined && (typeof cache.pageHash !== "string" || !/^[a-f\d]{64}$/.test(cache.pageHash)))) throw new Error("缓存来源条目格式无效");
  }
  if (value.health !== undefined) {
    if (!value.health || typeof value.health !== "object" || Array.isArray(value.health)) throw new Error("来源健康缓存格式无效");
    for (const health of Object.values(value.health)) if (!health || typeof health.id !== "string" || typeof health.url !== "string" || !validInstant(health.checkedAt) ||
      (health.lastSuccess !== null && !validInstant(health.lastSuccess)) || !Number.isInteger(health.consecutiveFailures) || health.consecutiveFailures < 0) throw new Error("来源健康缓存条目无效");
  }
  return value;
}

function hnRequestURL(sourceURL, start, end, page = 0) {
  const url = new URL(sourceURL), filters = (url.searchParams.get("numericFilters") || "").split(",").filter((filter) => filter.trim() && !/^created_at_i(?:[<>]=?|=)/.test(filter.trim()));
  filters.push("created_at_i>=" + Math.ceil(start / 1000), "created_at_i<=" + Math.floor(end / 1000));
  url.searchParams.set("numericFilters", filters.join(",")); url.searchParams.set("page", String(page));
  return url.href;
}

/** @param {NewsItem} item @param {NewsSource} source @param {number} start @param {number} end @param {KnownVendor[]} vendors
 * @returns {Candidate|null} */
function candidateFrom(item, source, start, end, vendors) {
  if (source.kind !== "page" && !keywordMatch(item, source.keywords)) return null;
  let url;
  try { url = normalizeURL(item.url); } catch { return null; }
  const title = plainText(item.title).slice(0, 500), summary = plainText(item.summary).slice(0, 360);
  if (!title) return null;
  const candidate = { ...item, title, summary, url, dateStatus: "missing", sources: [{ id: source.id, name: source.name, url: source.url, authority: source.authority, dateMeaning: item.dateMeaning || "unknown" }], vendorMatches: [], needsVendorReview: false };
  if (item.kind === "page-change") {
    const observed = Date.parse(item.observedAt || "");
    if (!Number.isFinite(observed) || observed < start || observed > end) return null;
    candidate.dateStatus = "not-applicable";
    delete candidate.publishedAt;
  } else if (item.publishedAt) {
    const time = publicationTime(item.publishedAt);
    if (Number.isFinite(time)) {
      if (time < start || time > end) return null;
      candidate.dateStatus = "known";
      candidate.publishedAt = new Date(time).toISOString();
    } else { candidate.dateStatus = "invalid"; delete candidate.publishedAt; }
  } else { delete candidate.publishedAt; }
  candidate.vendorMatches = matchVendors(candidate, vendors);
  candidate.needsVendorReview = candidate.vendorMatches.length === 0;
  return candidate;
}

function visiblePageText(text) {
  const visible = plainText(text.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ").replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " "));
  if (visible.length < 40 || /^(?:please )?(?:enable|turn on) javascript/i.test(visible)) throw new Error("页面缺少足够的可见文本，可能需要浏览器加载");
  return visible;
}

/** Collect source data without changing the repository, and return only review candidates.
 * @param {{config:any,state?:NewsState,inbox?:import('./inbox').Inbox,days?:number,knownVendors?:KnownVendor[],now?:Date,importItems?:any[],initialErrors?:Array<{sourceId:string,message:string}>} & NetworkOptions} options
 * @returns {Promise<{report:NewsReport,state:NewsState,inbox:import('./inbox').Inbox,health:{schemaVersion:number,checkedAt:string,status:string,sources:SourceHealth[],errors:Array<{sourceId:string,message:string}>}}>} */
async function collectNews(options) {
  const now = options.now || new Date(), days = options.days ?? 14;
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(days) || days < 1 || days > 365) throw new Error("days 必须是 1–365 的整数，checkedAt 必须有效");
  const checkedAt = now.toISOString(), end = now.getTime(), start = end - days * 86400000;
  const errors = [...(options.initialErrors || [])], sources = [], candidates = new Map(), candidateFreshness = new Map();
  const oldState = options.state || { schemaVersion: 1, sources: {} };
  /** @type {NewsState} */
  const nextState = { schemaVersion: 1, sources: { ...oldState.sources }, health: Object.fromEntries(Object.entries(oldState.health || {}).map(([id, health]) => [id, { ...health, enabled: false, freshness: "disabled" }])) };
  let configured = options.config?.sources;
  if (options.config?.schemaVersion !== 1 || !Array.isArray(configured)) { errors.push({ sourceId: "config", message: "配置必须包含 schemaVersion:1 和 sources 数组" }); configured = []; }
  if (!configured.length) errors.push({ sourceId: "config", message: "没有配置采集来源" });
  const ids = new Set(), resultSlots = Array(configured.length), itemSlots = Array(configured.length);
  let cursor = 0;
  async function worker() {
    while (cursor < configured.length) {
      const index = cursor++, source = configured[index];
      /** @type {SourceResult} */
      const result = { id: typeof source?.id === "string" ? source.id : "invalid-" + index, name: source?.name || "无效来源", kind: source?.kind || "unknown", url: typeof source?.url === "string" ? source.url : "", authority: source?.authority || "discovery", status: "error", itemsFetched: 0, candidatesEligible: 0 };
      const cached = oldState.sources[result.id];
      const compatibleCache = cached && cached.url === source?.url && cached.kind === source?.kind ? cached : null;
      /** @type {NewsItem[]} */
      let items = [];
      try {
        validSource(source);
        if (ids.has(source.id)) throw new Error("来源 id 重复");
        ids.add(source.id);
        const headers = { "user-agent": "CodingPlanNewsCollector/1.0", "accept": source.kind === "hn-search" ? "application/json" : "application/rss+xml, application/atom+xml, text/html, text/plain;q=0.9" };
        // A multi-page HN query is always read as one bounded snapshot; one page's ETag cannot represent all pages.
        if (!["hn-search", "blog"].includes(source.kind) && compatibleCache?.etag) headers["if-none-match"] = compatibleCache.etag;
        if (!["hn-search", "blog"].includes(source.kind) && compatibleCache?.lastModified) headers["if-modified-since"] = compatibleCache.lastModified;
        result.requestURL = source.kind === "hn-search" ? hnRequestURL(source.url, start, end) : source.url;
        const fetched = await fetchSource(result.requestURL, { ...options, headers });
        const page = source.kind === "page";
        if (fetched.response.status === 304) {
          if (source.kind === "blog") throw new Error("博客目录返回 304，无法核对文章内容变化");
          if (!compatibleCache || (page && !compatibleCache.pageHash)) throw new Error("收到 304 但没有可复用的来源缓存");
          items = compatibleCache.items;
          result.cacheReused = true;
          result.status = "not-modified";
          result.truncated = compatibleCache.truncated || false;
        } else {
          let pageHash, truncated = false;
          if (source.kind === "rss" || source.kind === "atom") items = parseFeed(fetched.text, fetched.finalURL, source.kind);
          else if (source.kind === "blog") {
            const links = parseBlogLinks(fetched.text, fetched.finalURL, source.articlePaths, { maxArticles: source.maxArticles || 20 });
            truncated = links.truncated;
            result.pagesFetched = 1; result.pageLimit = (source.maxArticles || 20) + 1;
            const articleErrors = [];
            // Read articles on every pass: an unchanged index does not prove an article is unchanged.
            for (const url of links.urls) {
              try {
                const article = await fetchSource(url, { ...options, headers: { "user-agent": headers["user-agent"], accept: "text/html" } });
                if (new URL(article.finalURL).origin !== new URL(fetched.finalURL).origin) throw new Error("文章跳转到博客来源以外的域名");
                const parsedArticle = parseBlogArticle(article.text, article.finalURL);
                items.push(parsedArticle);
                if (!parsedArticle.publishedAt) (result.missingPublicationDates ||= []).push(parsedArticle.url);
                else if (publicationTime(parsedArticle.publishedAt) > end) (result.futurePublicationDates ||= []).push(parsedArticle.url);
                result.pagesFetched++;
              } catch (error) { articleErrors.push(url + ": " + (error instanceof Error ? error.message : String(error))); }
            }
            if (!items.length && articleErrors.length) throw new Error(articleErrors.join("; "));
            if (articleErrors.length) {
              result.status = "partial"; result.error = articleErrors.join("; ");
              errors.push({ sourceId: source.id, message: result.error });
            }
          }
          else if (source.kind === "hn-search") {
            const first = JSON.parse(fetched.text), parsed = parseHN(first);
            items = parsed.items; result.pagesFetched = 1; result.pageLimit = 3;
            if (first.nbPages !== undefined && (!Number.isInteger(first.nbPages) || first.nbPages < 0)) throw new Error("HN nbPages 无效");
            let totalPages = first.nbPages ?? 1;
            for (let page = 1; page < Math.min(3, totalPages); page++) {
              const more = await fetchSource(hnRequestURL(source.url, start, end, page), { ...options, headers });
              if (more.response.status === 304) throw new Error("HN 分页返回 304，无法确认完整查询结果");
              const data = JSON.parse(more.text), batch = parseHN(data);
              if (data.nbPages !== undefined && (!Number.isInteger(data.nbPages) || data.nbPages < 0)) throw new Error("HN nbPages 无效");
              totalPages = Math.max(totalPages, data.nbPages ?? 1);
              items.push(...batch.items); result.pagesFetched++;
            }
            truncated = totalPages > 3;
          }
          else {
            const visible = visiblePageText(fetched.text);
            pageHash = crypto.createHash("sha256").update(visible).digest("hex");
            if (!compatibleCache?.pageHash) { result.status = "baseline"; items = []; }
            else if (compatibleCache.pageHash !== pageHash) items = [{ title: source.name + " 页面内容变化", url: fetched.finalURL, summary: "监测到可见文本变化；需人工检查是否涉及编程服务、价格或额度。", kind: "page-change", dateMeaning: "observation-only", observedAt: checkedAt, previousHash: compatibleCache.pageHash, currentHash: pageHash }];
            else items = compatibleCache.items;
          }
          if (items.length > MAX_STATE_ITEMS) throw new Error("来源条目数量超过缓存上限");
          const baselineAt = pageHash ? compatibleCache?.pageHash === pageHash ? compatibleCache?.baselineAt || compatibleCache?.updatedAt || checkedAt : checkedAt : undefined;
          nextState.sources[source.id] = { url: source.url, kind: source.kind, items, ...(pageHash ? { pageHash, baselineAt } : {}), truncated,
            ...(fetched.response.headers.get("etag") ? { etag: fetched.response.headers.get("etag") } : {}),
            ...(fetched.response.headers.get("last-modified") ? { lastModified: fetched.response.headers.get("last-modified") } : {}), updatedAt: checkedAt };
          result.status = ["baseline", "partial"].includes(result.status) ? result.status : "ok";
          result.truncated = truncated;
        }
        result.sourceDate = page ? "页面变化的观测时间，不是新闻发布日期或改价证据" : source.kind === "blog" ? "官方文章的真实发布日期；逐篇提取，缺失日期单列待核" : source.kind === "hn-search" ? "HN 帖子创建时间，不是原文发布时间；发现线索需核对官网" : "Feed 提供的发布日期；仅有 updated 时标记 feed-update";
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        errors.push({ sourceId: result.id, message: result.error });
        // Failed requests never replace the previous cache; stale candidates remain visibly marked.
        if (compatibleCache) { items = compatibleCache.items; result.cacheReused = true; result.cacheStale = true; result.truncated = compatibleCache.truncated || false; }
      }
      result.itemsFetched = items.length;
      const priorHealth = oldState.health?.[result.id], previousHealth = priorHealth?.url === result.url && priorHealth?.kind === result.kind ? priorHealth : undefined;
      const baselineAt = nextState.sources[result.id]?.baselineAt || compatibleCache?.baselineAt || (result.kind === "page" ? compatibleCache?.updatedAt : undefined);
      const succeeded = !["error", "partial"].includes(result.status);
      const lastSuccess = succeeded ? checkedAt : previousHealth ? previousHealth.lastSuccess : compatibleCache?.updatedAt || null;
      const baselineExpired = !!baselineAt && Date.parse(baselineAt) < start;
      const health = { id: result.id, url: result.url, kind: result.kind, checkedAt, lastSuccess,
        consecutiveFailures: succeeded ? 0 : (previousHealth?.consecutiveFailures || 0) + 1, status: result.status, error: result.error || null,
        ...(baselineAt ? { baselineAt, baselineExpired } : {}),
        freshness: result.status === "partial" ? "partial" : !succeeded ? lastSuccess ? "stale" : "never-succeeded" : baselineExpired ? "baseline-aged" : "checked", enabled: true };
      nextState.health[result.id] = health;
      Object.assign(result, { lastSuccess, consecutiveFailures: health.consecutiveFailures, freshness: health.freshness, ...(baselineAt ? { baselineAt, baselineExpired } : {}) });
      resultSlots[index] = result;
      itemSlots[index] = { source, items };
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, configured.length) }, () => worker()));
  function add(item, source, result) {
    const candidate = candidateFrom(item, source, start, end, options.knownVendors || []);
    if (!candidate) return;
    result.candidatesEligible++;
    const existing = candidates.get(candidate.url);
    const fresh = !result.cacheStale;
    if (!existing) { candidates.set(candidate.url, candidate); candidateFreshness.set(candidate.url, fresh); return; }
    const existingFresh = candidateFreshness.get(candidate.url);
    if (fresh && !existingFresh) {
      const previousSources = existing.sources;
      for (const key of ["publishedAt", "observedAt", "previousHash", "currentHash"]) if (!(key in candidate)) delete existing[key];
      Object.assign(existing, candidate, { sources: previousSources });
    }
    for (const ref of candidate.sources) if (!existing.sources.some((value) => value.id === ref.id)) existing.sources.push(ref);
    if (!existingFresh || fresh) for (const vendor of candidate.vendorMatches) if (!existing.vendorMatches.some((value) => value.vendor === vendor.vendor)) existing.vendorMatches.push(vendor);
    existing.needsVendorReview = existing.vendorMatches.length === 0;
    if ((!existingFresh || fresh) && existing.dateStatus !== "known" && candidate.dateStatus === "known") { existing.dateStatus = candidate.dateStatus; existing.publishedAt = candidate.publishedAt; existing.dateMeaning = candidate.dateMeaning; }
    if ((!existingFresh || fresh) && !existing.summary && candidate.summary) existing.summary = candidate.summary;
    candidateFreshness.set(candidate.url, existingFresh || fresh);
  }
  for (let index = 0; index < resultSlots.length; index++) {
    const result = resultSlots[index], slot = itemSlots[index];
    sources.push(result);
    if (slot.source && KINDS.includes(slot.source.kind)) for (const item of slot.items) add(item, slot.source, result);
  }
  if (options.importItems !== undefined) {
    /** @type {NewsSource} */
    const source = { id: "external-import", name: "外部导入候选（待核实）", kind: "import", url: "", authority: "discovery" };
    /** @type {SourceResult} */
    const result = { ...source, status: "ok", itemsFetched: 0, candidatesEligible: 0, sourceDate: "外部提供的发布时间，缺失或无效日期不补写" };
    if (!Array.isArray(options.importItems)) { result.status = "error"; result.error = "导入文件必须为候选数组"; errors.push({ sourceId: source.id, message: result.error }); }
    else for (const [index, item] of options.importItems.entries()) {
      try {
        if (!item || typeof item.title !== "string" || !item.title.trim() || typeof item.url !== "string" || (item.summary !== undefined && typeof item.summary !== "string") || (item.publishedAt !== undefined && typeof item.publishedAt !== "string")) throw new Error("字段无效");
        normalizeURL(item.url);
        const parsed = { title: plainText(item.title).slice(0, 500), url: item.url, summary: plainText(item.summary).slice(0, 360), kind: "import", dateMeaning: "externally-provided", ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}) };
        result.itemsFetched++;
        add(parsed, source, result);
      } catch (error) { result.status = "error"; errors.push({ sourceId: source.id, message: "导入第 " + (index + 1) + " 条无效：" + (error instanceof Error ? error.message : String(error)) }); }
    }
    sources.push(result);
  }
  const list = [...candidates.values()].sort((a, b) => (b.publishedAt || b.observedAt || "").localeCompare(a.publishedAt || a.observedAt || "") || a.url.localeCompare(b.url));
  const successful = sources.filter((source) => !["error", "partial"].includes(source.status) && source.kind !== "import").length;
  const report = { schemaVersion: 1, checkedAt, window: { days, start: new Date(start).toISOString(), end: checkedAt },
    status: errors.length ? successful || sources.some((source) => source.status === "partial" && source.itemsFetched > 0) ? "partial" : "failed" : "ok", reviewRequired: true, sources, errors, candidates: list,
    stats: { candidates: list.length, knownVendor: list.filter((item) => !item.needsVendorReview).length, vendorReviewCandidates: list.filter((item) => item.needsVendorReview).length,
      sourcesSucceeded: successful, sourcesFailed: sources.filter((source) => ["error", "partial"].includes(source.status)).length } };
  const inbox = validateInbox(updateInbox(options.inbox, report));
  report.queue = inbox.stats;
  return { report, state: nextState, inbox, health: { schemaVersion: 1, checkedAt, status: report.status, sources: Object.values(nextState.health), errors } };
}

/** Atomically replace each output, rolling both back if a later replacement fails.
 * @param {Map<string,Buffer>} outputs @param {{rename?:(from:string,to:string)=>void}} options */
function commitOutputs(outputs, options = {}) {
  const staged = [], applied = [], recovery = new Set(), rename = options.rename || fs.renameSync;
  try {
    for (const [file, bytes] of outputs) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const original = fs.existsSync(file) ? fs.readFileSync(file) : null;
      if (original?.equals(bytes)) continue;
      const dir = fs.mkdtempSync(path.join(path.dirname(file), ".news-update-"));
      const item = { file, dir, next: path.join(dir, "next"), original: path.join(dir, "original"), exists: original !== null };
      staged.push(item); fs.writeFileSync(item.next, bytes); if (original) fs.writeFileSync(item.original, original);
    }
    for (const item of staged) { rename(item.next, item.file); applied.push(item); }
  } catch (error) {
    const failures = [];
    for (const item of applied.reverse()) {
      try { if (item.exists) rename(item.original, item.file); else fs.unlinkSync(item.file); }
      catch (restoreError) { failures.push(restoreError); recovery.add(item.dir); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "资讯报告回滚失败，原文件备份保留在：" + [...recovery].join("、"));
    throw error;
  } finally {
    for (const item of staged) {
      if (path.dirname(item.dir) !== path.dirname(item.file) || !path.basename(item.dir).startsWith(".news-update-")) throw new Error("拒绝清理未知资讯暂存路径");
      if (!recovery.has(item.dir)) fs.rmSync(item.dir, { recursive: true, force: true });
    }
  }
}

/** All generated artifacts share a validated directory; none may replace code, inputs, or another reserved artifact.
 * @param {string} workspace @param {string} outputPath @param {Array<string|null>} inputs */
function resolveNewsPaths(workspace, outputPath = "audit/news/latest.json", inputs = []) {
  const root = fs.realpathSync(path.resolve(workspace)), output = path.resolve(root, outputPath);
  const dir = path.dirname(output), stateFile = path.join(dir, "state.json"), inboxFile = path.join(dir, "inbox.json"), healthFile = path.join(dir, "health.json");
  const outputRoot = path.join(root, "audit", "news"), relative = path.relative(outputRoot, output);
  if (!relative || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative) || path.extname(output).toLowerCase() !== ".json") throw new Error("报告输出必须位于 audit/news 内且为 .json 文件");
  if ([stateFile, inboxFile, healthFile].some((file) => output.toLowerCase() === file.toLowerCase())) throw new Error("报告输出路径不能覆盖 state.json/inbox.json/health.json");
  const outputs = [output, stateFile, inboxFile, healthFile, path.join(dir, ".news.lock")];
  for (const input of inputs) if (input && outputs.some((file) => file.toLowerCase() === path.resolve(root, input).toLowerCase())) throw new Error("输出不能覆盖配置或导入输入文件");
  for (const file of outputs) {
    let current = root;
    for (const part of path.relative(root, file).split(path.sep)) {
      current = path.join(current, part);
      try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error("报告或缓存路径不能包含符号链接"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  return { workspace: root, output, dir, stateFile, inboxFile, healthFile };
}

/** Prevent collection from overwriting a concurrent human review. Existing locks require manual inspection.
 * @template T @param {string} dir @param {()=>Promise<T>|T} action @returns {Promise<T>} */
async function withNewsLock(dir, action) {
  return withFileLock(path.join(dir, ".news.lock"), action, { busyMessage: "资讯队列正在采集或复核，或存在遗留锁" });
}

/** @param {{workspace?:string,configPath?:string,outputPath?:string,importPath?:string,days?:number,now?:Date,rename?:(from:string,to:string)=>void,onCommitted?:(cacheReady:boolean)=>void} & NetworkOptions} options
 * @returns {Promise<NewsReport>} */
async function runCollection(options = {}) {
  const resolved = resolveNewsPaths(options.workspace || path.join(__dirname, "..", ".."), options.outputPath, [options.configPath || "config/news-sources.json", options.importPath || null]);
  const { workspace, output, stateFile, inboxFile, healthFile } = resolved;
  const configFile = path.resolve(workspace, options.configPath || "config/news-sources.json");
  const importFile = options.importPath ? path.resolve(workspace, options.importPath) : null;
  return withNewsLock(resolved.dir, async () => {
  const errors = [], now = options.now || new Date();
  let config, state, inbox, importItems, knownVendors = [], preserveState = false;
  // Never replace a damaged review history with an empty queue.
  if (fs.existsSync(inboxFile)) inbox = validateInbox(JSON.parse(fs.readFileSync(inboxFile, "utf8")));
  else if (fs.existsSync(output)) {
    const previous = JSON.parse(fs.readFileSync(output, "utf8"));
    if (previous.schemaVersion === 1 && validInstant(previous.checkedAt) && Array.isArray(previous.candidates) && Array.isArray(previous.sources) && previous.window?.days) inbox = updateInbox(undefined, previous);
  }
  try { config = JSON.parse(fs.readFileSync(configFile, "utf8")); }
  catch (error) { errors.push({ sourceId: "config", message: "无法读取来源配置：" + error.message }); }
  try { knownVendors = readKnownVendors(workspace); } catch (error) { errors.push({ sourceId: "vendors", message: "无法读取本地厂商关联：" + error.message }); }
  if (fs.existsSync(stateFile)) {
    try { state = validateState(JSON.parse(fs.readFileSync(stateFile, "utf8"))); }
    catch (error) { preserveState = true; errors.push({ sourceId: "state", message: error.message + "；保留原缓存文件" }); }
  }
  if (options.importPath) {
    try { importItems = JSON.parse(fs.readFileSync(importFile, "utf8")); }
    catch (error) { errors.push({ sourceId: "external-import", message: "无法读取导入文件：" + error.message }); }
  }
  const collected = await collectNews({ ...options, config, state, inbox, now, importItems, knownVendors, initialErrors: errors });
  collected.inbox.reportFile = path.basename(output);
  const outputs = new Map([[output, Buffer.from(JSON.stringify(collected.report, null, 2) + "\n")]]);
  if (!preserveState) outputs.set(stateFile, Buffer.from(JSON.stringify(collected.state, null, 2) + "\n"));
  outputs.set(inboxFile, Buffer.from(JSON.stringify(collected.inbox, null, 2) + "\n"));
  outputs.set(healthFile, Buffer.from(JSON.stringify(collected.health, null, 2) + "\n"));
  commitOutputs(outputs, options);
  // Source failures may still produce useful committed candidates; damaged state is never a cache baseline.
  options.onCommitted?.(!preserveState);
  return collected.report;
  });
}

const HELP = `采集编程服务资讯候选，输出仅供人工审核，不修改正式价格或部署。
用法：node scripts/news/collect-news.js [选项]
  --days N       最近 N 天，默认 14（1–365）
  --config PATH  来源配置，默认 config/news-sources.json
  --output PATH  audit/news 内的 JSON 报告，默认 audit/news/latest.json
                 同目录 state.json / inbox.json / health.json 保存缓存、队列与来源健康
  --import PATH  外部候选 JSON 数组，字段 title/url/publishedAt?/summary?
  --help         显示帮助
任一来源或输入失败退出码为 1，仍写出可用报告；所有候选须人工核对官网。`;
function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help") return { help: true };
    if (!["--days", "--config", "--output", "--import"].includes(arg) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("未知选项或缺少参数：" + arg);
    const value = args[++index];
    if (arg === "--days") { if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 365) throw new Error("--days 必须是 1–365 的整数"); options.days = Number(value); }
    else options[{ "--config": "configPath", "--output": "outputPath", "--import": "importPath" }[arg]] = value;
  }
  return options;
}
/** @param {string[]} args @param {Parameters<typeof runCollection>[0]} overrides */
async function main(args = process.argv.slice(2), overrides = {}) {
  const options = parseArguments(args);
  if (options.help) { console.log(HELP); return 0; }
  const report = await runCollection({ ...options, ...overrides, onCommitted(cacheReady) {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "cache-ready=" + cacheReady + "\n");
    overrides.onCommitted?.(cacheReady);
  } });
  console.log("资讯候选 " + report.stats.candidates + " 条（已知厂商关联候选 " + report.stats.knownVendor + "，厂商待识别候选 " + report.stats.vendorReviewCandidates + "）；状态 " + report.status + "，来源成功 " + report.stats.sourcesSucceeded + "，错误 " + report.errors.length + "。");
  if (report.queue) console.log("持久队列 " + report.queue.total + " 条，待复核 " + report.queue.awaitingReview + "，过期积压 " + report.queue.agedBacklog + "。");
  for (const error of report.errors) console.error("  " + error.sourceId + ": " + error.message);
  return report.errors.length ? 1 : 0;
}
if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => { console.error("资讯采集失败：" + error.message); process.exitCode = 1; });
module.exports = { DEFAULT_KEYWORDS, normalizeURL, readKnownVendors, readPlanReferences, matchVendors, validateState, collectNews, runCollection, parseArguments, main, commitOutputs, resolveNewsPaths, withNewsLock, hnRequestURL };
