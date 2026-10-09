"use strict";
const crypto = require("node:crypto");
const { normalizeURL } = require("./urls");
const { publicURL } = require("./network");

const STATUSES = ["pending", "accepted", "rejected", "deferred"];
const DATE_STATUSES = ["known", "missing", "invalid", "not-applicable"];
const OPTIONAL_FIELDS = ["dateMeaning", "publishedAt", "observedAt", "previousHash", "currentHash"];
/** @typedef {{reviewedAt:string,status:string,reason:string,evidenceUrls:string[],planIds:string[],officialDomains:string[],contentHash:string}} ReviewDecision */
/** 同一网址由单个来源给出的内容；按 (url, sourceId) 记录，用来判断来源自身是否真的变化。
 * @typedef {{sourceId:string,authority:string,title:string,summary:string,kind:string,dateStatus:string,dateMeaning?:string,publishedAt?:string,observedAt?:string,previousHash?:string,currentHash?:string,vendorMatches:Array<{vendor:string,match:string}>,contentHash:string}} SourceVariant */
/** @typedef {{changedAt:string,contentHash:string,title:string,summary:string,publishedAt?:string,dateStatus:string,sourceId?:string,change?:string}} Revision */
/** @typedef {import('./collect-news').Candidate & {id:string,firstSeen:string,lastSeen:string,contentHash:string,status:string,needsReReview:boolean,reason:string,evidenceUrls:string[],planIds:string[],officialDomains:string[],reviewedAt?:string,reviewedContentHash?:string,reviewHistory:ReviewDecision[],revisions:Revision[],outsideWindow?:boolean}} InboxItem */
/** @typedef {{total:number,pending:number,accepted:number,rejected:number,deferred:number,needsReReview:number,awaitingReview:number,agedBacklog:number,unknownVendorCandidates:number}} InboxStats */
/** @typedef {{schemaVersion:number,updatedAt:string,windowDays:number,items:InboxItem[],stats:InboxStats,reportFile?:string}} Inbox */
const stableId = (url) => crypto.createHash("sha256").update(normalizeURL(url)).digest("hex");
function contentHash(candidate) {
  return crypto.createHash("sha256").update(JSON.stringify({ title: candidate.title, summary: candidate.summary,
    publishedAt: candidate.publishedAt || null, dateStatus: candidate.dateStatus, dateMeaning: candidate.dateMeaning || null,
    kind: candidate.kind, currentHash: candidate.currentHash || null })).digest("hex");
}
const validInstant = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const stringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && !!item.trim());
function validEvidence(values) { if (!Array.isArray(values)) return false; try { values.forEach((url) => publicURL(url, true)); return true; } catch { return false; } }
const validMatches = (matches) => Array.isArray(matches) && matches.every((match) => match && typeof match.vendor === "string" && ["name", "domain", "model-alias"].includes(match.match));
function validVariant(variant) {
  return variant && typeof variant.sourceId === "string" && !!variant.sourceId && ["official", "discovery"].includes(variant.authority) &&
    typeof variant.title === "string" && !!variant.title.trim() && variant.title.length <= 500 && typeof variant.summary === "string" && variant.summary.length <= 360 &&
    typeof variant.kind === "string" && DATE_STATUSES.includes(variant.dateStatus) && (variant.publishedAt === undefined || validInstant(variant.publishedAt)) &&
    (variant.observedAt === undefined || validInstant(variant.observedAt)) && validMatches(variant.vendorMatches) && variant.contentHash === contentHash(variant);
}

/** 单一来源候选的内容快照。 @param {any} candidate @returns {SourceVariant} */
function variantOf(candidate) {
  const ref = candidate.sources[0];
  /** @type {any} */
  const variant = { sourceId: ref.id, authority: ref.authority, title: candidate.title, summary: candidate.summary, kind: candidate.kind, dateStatus: candidate.dateStatus };
  for (const key of OPTIONAL_FIELDS) if (candidate[key] !== undefined) variant[key] = candidate[key];
  return { ...variant, vendorMatches: structuredClone(candidate.vendorMatches), contentHash: contentHash(candidate) };
}
/** 固定来源优先级：官方来源优先，其次配置顺序，本次未运行的来源按 ID 排后；与本次是否失败、是否仍在窗口内无关。
 * 主条目取最高优先级来源；缺日期或摘要时依次由后续来源补齐，厂商关联取并集。
 * @param {SourceVariant[]} variants @param {Map<string,number>} order */
function mergeVariants(variants, order) {
  const rank = (variant) => order.get(variant.sourceId) ?? Infinity;
  const ranked = [...variants].sort((a, b) => Number(a.authority !== "official") - Number(b.authority !== "official") || (rank(a) - rank(b) || 0) || a.sourceId.localeCompare(b.sourceId));
  const [base] = ranked;
  /** @type {any} */
  const display = { title: base.title, summary: base.summary, kind: base.kind, dateStatus: base.dateStatus };
  for (const key of OPTIONAL_FIELDS) if (base[key] !== undefined) display[key] = base[key];
  const dated = display.dateStatus === "known" ? null : ranked.find((variant) => variant.dateStatus === "known");
  if (dated) Object.assign(display, { dateStatus: "known", publishedAt: dated.publishedAt }, dated.dateMeaning ? { dateMeaning: dated.dateMeaning } : {});
  if (!display.summary) display.summary = ranked.find((variant) => variant.summary)?.summary || "";
  const vendorMatches = [];
  for (const variant of ranked) for (const match of variant.vendorMatches) if (!vendorMatches.some((value) => value.vendor === match.vendor)) vendorMatches.push(structuredClone(match));
  return { display: { ...display, vendorMatches, needsVendorReview: vendorMatches.length === 0 }, ranked };
}
/** @param {any} item @param {SourceVariant[]} variants @param {Map<string,number>} order */
function setDisplay(item, variants, order) {
  const { display, ranked } = mergeVariants(variants, order);
  for (const key of OPTIONAL_FIELDS) delete item[key];
  Object.assign(item, display, { variants: ranked, contentHash: contentHash(display) });
}
/** @param {any} content @param {string} changedAt @param {{sourceId?:string,change?:string}} [origin] @returns {Revision} */
const revisionOf = (content, changedAt, origin = {}) => ({ changedAt, contentHash: content.contentHash, title: content.title, summary: content.summary,
  ...(content.publishedAt ? { publishedAt: content.publishedAt } : {}), dateStatus: content.dateStatus, ...origin });
function validDecision(decision) {
  return decision && validInstant(decision.reviewedAt) && STATUSES.includes(decision.status) && typeof decision.reason === "string" && !!decision.reason.trim() && decision.reason.length <= 2000 &&
    validEvidence(decision.evidenceUrls) && (decision.status !== "accepted" || decision.evidenceUrls.length > 0) && stringList(decision.planIds) && stringList(decision.officialDomains) && /^[a-f\d]{64}$/.test(decision.contentHash);
}

/** @returns {Inbox} */
function validateInbox(value) {
  if (!value || value.schemaVersion !== 1 || !validInstant(value.updatedAt) || !Number.isInteger(value.windowDays) || value.windowDays < 1 || value.windowDays > 365 || !Array.isArray(value.items)) throw new Error("候选 inbox.json 格式无效；保留原文件");
  if (value.reportFile !== undefined && (typeof value.reportFile !== "string" || !/^[^/\\]+\.json$/i.test(value.reportFile) || ["state.json", "inbox.json", "health.json"].includes(value.reportFile.toLowerCase()))) throw new Error("候选队列 reportFile 无效");
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.url !== "string" || item.id !== stableId(item.url) || item.url !== normalizeURL(item.url) || ids.has(item.id) ||
        typeof item.title !== "string" || !item.title.trim() || item.title.length > 500 || typeof item.summary !== "string" || item.summary.length > 360 ||
        !validInstant(item.firstSeen) || !validInstant(item.lastSeen) || item.firstSeen > item.lastSeen ||
        !STATUSES.includes(item.status) || typeof item.needsReReview !== "boolean" || !/^[a-f\d]{64}$/.test(item.contentHash) ||
        !DATE_STATUSES.includes(item.dateStatus) || typeof item.kind !== "string" || !Array.isArray(item.sources) || item.sources.some((ref) => !ref || typeof ref.id !== "string" || typeof ref.name !== "string" || typeof ref.url !== "string" || !["official", "discovery"].includes(ref.authority)) ||
        !validMatches(item.vendorMatches) || typeof item.needsVendorReview !== "boolean" ||
        (item.variants !== undefined && (!Array.isArray(item.variants) || !item.variants.length || item.variants.some((variant) => !validVariant(variant)) || new Set(item.variants.map((variant) => variant.sourceId)).size !== item.variants.length)) ||
        typeof item.reason !== "string" || !validEvidence(item.evidenceUrls) || !stringList(item.planIds) || !stringList(item.officialDomains) ||
        (item.status === "accepted" && (!item.reason.trim() || !item.evidenceUrls.length)) ||
        (item.publishedAt !== undefined && !validInstant(item.publishedAt)) || (item.observedAt !== undefined && !validInstant(item.observedAt)) ||
        (item.reviewedAt !== undefined && !validInstant(item.reviewedAt)) || (item.reviewedContentHash !== undefined && !/^[a-f\d]{64}$/.test(item.reviewedContentHash)) ||
        item.contentHash !== contentHash(item) || !Array.isArray(item.reviewHistory) || item.reviewHistory.some((decision) => !validDecision(decision)) ||
        !Array.isArray(item.revisions) || item.revisions.some((revision) => !revision || !validInstant(revision.changedAt) || !/^[a-f\d]{64}$/.test(revision.contentHash) || typeof revision.title !== "string" || typeof revision.summary !== "string" || revision.summary.length > 360 ||
          (revision.sourceId !== undefined && typeof revision.sourceId !== "string") || (revision.change !== undefined && !["added", "updated"].includes(revision.change)))) throw new Error("候选队列条目无效；保留原 inbox.json");
    ids.add(item.id);
  }
  return value;
}

/** Update derived triage counts, without changing review decisions or pretending old candidates are fresh.
 * @param {Inbox} inbox @param {string} checkedAt @param {number} days @returns {Inbox} */
function summarizeInbox(inbox, checkedAt, days = inbox.windowDays) {
  const start = Date.parse(checkedAt) - days * 86400000;
  const stats = { total: inbox.items.length, pending: 0, accepted: 0, rejected: 0, deferred: 0, needsReReview: 0, awaitingReview: 0, agedBacklog: 0, unknownVendorCandidates: 0 };
  for (const item of inbox.items) {
    stats[item.status]++;
    if (item.needsReReview) stats.needsReReview++;
    const awaiting = item.status === "pending" || item.needsReReview;
    if (awaiting) stats.awaitingReview++;
    const anchor = item.publishedAt || item.observedAt || item.firstSeen;
    item.outsideWindow = Date.parse(anchor) < start;
    if ((awaiting || item.status === "deferred") && item.outsideWindow) stats.agedBacklog++;
    if (item.needsVendorReview) stats.unknownVendorCandidates++;
  }
  return { ...inbox, updatedAt: checkedAt, windowDays: days, stats };
}

/** Persist candidates after they leave the rolling report window. Failed cached data never advances lastSeen.
 * 只有已贡献内容的来源自身内容变化，或新来源带来与已知来源都不同的内容时才重新复核；
 * 来源失败、恢复或某来源副本移出窗口都不改变展示内容，也不重开。
 * @param {Inbox|undefined} previous @param {import('./collect-news').NewsReport} report @returns {Inbox} */
function updateInbox(previous, report) {
  const old = previous ? structuredClone(previous) : { schemaVersion: 1, updatedAt: report.checkedAt, windowDays: report.window.days, items: [], stats: null };
  const items = new Map(old.items.map((item) => [item.id, item]));
  const sourceResults = new Map(report.sources.map((source) => [source.id, source]));
  const order = new Map(report.sources.map((source, index) => [source.id, index]));
  const fresh = (sourceId) => sourceResults.has(sourceId) && !sourceResults.get(sourceId).cacheStale;
  for (const candidate of report.candidates) {
    const id = stableId(candidate.url), existing = items.get(id);
    const confirmed = candidate.sources.some((ref) => fresh(ref.id));
    // 旧版报告（迁移 latest.json）没有逐来源内容，保持合并内容，下次采集再补齐。
    const copies = Array.isArray(candidate.variants) ? structuredClone(candidate.variants) : null;
    if (!existing) {
      const seen = confirmed ? report.checkedAt : candidate.publishedAt || candidate.observedAt || report.checkedAt;
      const created = { ...structuredClone(candidate), id, firstSeen: seen, lastSeen: seen, contentHash: contentHash(candidate),
        status: "pending", needsReReview: false, reason: "", evidenceUrls: [], planIds: [], officialDomains: [], reviewHistory: [], revisions: [] };
      if (copies) setDisplay(created, copies, order);
      items.set(id, created);
      continue;
    }
    if (confirmed) existing.lastSeen = report.checkedAt > existing.lastSeen ? report.checkedAt : existing.lastSeen;
    for (const ref of candidate.sources) if (!existing.sources.some((value) => value.id === ref.id && value.url === ref.url)) existing.sources.push(structuredClone(ref));
    if (!copies) continue;
    if (!Array.isArray(existing.variants)) {
      // 旧版条目只保存合并内容：与任一来源或固定优先级合并结果一致即视为未变化，只补齐逐来源记录。
      const before = revisionOf(existing, report.checkedAt), previousHash = existing.contentHash;
      setDisplay(existing, copies, order);
      if (confirmed && previousHash !== existing.contentHash && !copies.some((copy) => copy.contentHash === previousHash)) { existing.revisions.push(before); existing.needsReReview = true; }
      continue;
    }
    for (const copy of copies) {
      // An unavailable source's old cache must not overwrite a later confirmed revision or re-open a review.
      if (!fresh(copy.sourceId)) continue;
      const index = existing.variants.findIndex((variant) => variant.sourceId === copy.sourceId);
      if (index < 0) {
        if (!existing.variants.some((variant) => variant.contentHash === copy.contentHash)) {
          existing.revisions.push(revisionOf(existing, report.checkedAt, { sourceId: copy.sourceId, change: "added" }));
          existing.needsReReview = true;
        }
        existing.variants.push(copy);
      } else {
        if (existing.variants[index].contentHash !== copy.contentHash) {
          existing.revisions.push(revisionOf(existing.variants[index], report.checkedAt, { sourceId: copy.sourceId, change: "updated" }));
          existing.needsReReview = true;
        }
        existing.variants[index] = copy;
      }
    }
    setDisplay(existing, existing.variants, order);
  }
  return summarizeInbox({ ...old, items: [...items.values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id)) }, report.checkedAt, report.window.days);
}

module.exports = { STATUSES, stableId, contentHash, validInstant, validateInbox, updateInbox, summarizeInbox, variantOf, mergeVariants };
