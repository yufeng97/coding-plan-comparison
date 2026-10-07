"use strict";
const crypto = require("node:crypto");
const { normalizeURL } = require("./urls");
const { publicURL } = require("./network");

const STATUSES = ["pending", "accepted", "rejected", "deferred"];
/** @typedef {{reviewedAt:string,status:string,reason:string,evidenceUrls:string[],planIds:string[],officialDomains:string[],contentHash:string}} ReviewDecision */
/** @typedef {import('./collect-news').Candidate & {id:string,firstSeen:string,lastSeen:string,contentHash:string,status:string,needsReReview:boolean,reason:string,evidenceUrls:string[],planIds:string[],officialDomains:string[],reviewedAt?:string,reviewedContentHash?:string,reviewHistory:ReviewDecision[],revisions:Array<{changedAt:string,contentHash:string,title:string,summary:string,publishedAt?:string,dateStatus:string}>,outsideWindow?:boolean}} InboxItem */
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
        !["known", "missing", "invalid", "not-applicable"].includes(item.dateStatus) || typeof item.kind !== "string" || !Array.isArray(item.sources) || item.sources.some((ref) => !ref || typeof ref.id !== "string" || typeof ref.name !== "string" || typeof ref.url !== "string" || !["official", "discovery"].includes(ref.authority)) ||
        !Array.isArray(item.vendorMatches) || item.vendorMatches.some((match) => !match || typeof match.vendor !== "string" || !["name", "domain"].includes(match.match)) || typeof item.needsVendorReview !== "boolean" ||
        typeof item.reason !== "string" || !validEvidence(item.evidenceUrls) || !stringList(item.planIds) || !stringList(item.officialDomains) ||
        (item.status === "accepted" && (!item.reason.trim() || !item.evidenceUrls.length)) ||
        (item.publishedAt !== undefined && !validInstant(item.publishedAt)) || (item.observedAt !== undefined && !validInstant(item.observedAt)) ||
        (item.reviewedAt !== undefined && !validInstant(item.reviewedAt)) || (item.reviewedContentHash !== undefined && !/^[a-f\d]{64}$/.test(item.reviewedContentHash)) ||
        item.contentHash !== contentHash(item) || !Array.isArray(item.reviewHistory) || item.reviewHistory.some((decision) => !validDecision(decision)) ||
        !Array.isArray(item.revisions) || item.revisions.some((revision) => !revision || !validInstant(revision.changedAt) || !/^[a-f\d]{64}$/.test(revision.contentHash) || typeof revision.title !== "string" || typeof revision.summary !== "string" || revision.summary.length > 360)) throw new Error("候选队列条目无效；保留原 inbox.json");
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
 * @param {Inbox|undefined} previous @param {import('./collect-news').NewsReport} report @returns {Inbox} */
function updateInbox(previous, report) {
  const old = previous ? structuredClone(previous) : { schemaVersion: 1, updatedAt: report.checkedAt, windowDays: report.window.days, items: [], stats: null };
  const items = new Map(old.items.map((item) => [item.id, item]));
  const sourceResults = new Map(report.sources.map((source) => [source.id, source]));
  for (const candidate of report.candidates) {
    const id = stableId(candidate.url), hash = contentHash(candidate), existing = items.get(id);
    const confirmed = candidate.sources.some((ref) => sourceResults.has(ref.id) && !sourceResults.get(ref.id).cacheStale);
    if (!existing) {
      const seen = confirmed ? report.checkedAt : candidate.publishedAt || candidate.observedAt || report.checkedAt;
      items.set(id, { ...structuredClone(candidate), id, firstSeen: seen, lastSeen: seen, contentHash: hash,
        status: "pending", needsReReview: false, reason: "", evidenceUrls: [], planIds: [], officialDomains: [], reviewHistory: [], revisions: [] });
      continue;
    }
    if (confirmed) existing.lastSeen = report.checkedAt > existing.lastSeen ? report.checkedAt : existing.lastSeen;
    for (const ref of candidate.sources) if (!existing.sources.some((value) => value.id === ref.id && value.url === ref.url)) existing.sources.push(structuredClone(ref));
    // An unavailable source's old cache must not overwrite a later confirmed revision or re-open a review.
    if (!confirmed) continue;
    const mergedSources = existing.sources;
    if (hash !== existing.contentHash) {
      existing.revisions.push({ changedAt: report.checkedAt, contentHash: existing.contentHash, title: existing.title, summary: existing.summary,
        ...(existing.publishedAt ? { publishedAt: existing.publishedAt } : {}), dateStatus: existing.dateStatus });
      existing.needsReReview = true;
      for (const key of ["publishedAt", "observedAt", "previousHash", "currentHash"]) if (!(key in candidate)) delete existing[key];
    }
    Object.assign(existing, structuredClone(candidate), { sources: mergedSources, contentHash: hash });
  }
  return summarizeInbox({ ...old, items: [...items.values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id)) }, report.checkedAt, report.window.days);
}

module.exports = { STATUSES, stableId, contentHash, validInstant, validateInbox, updateInbox, summarizeInbox };
