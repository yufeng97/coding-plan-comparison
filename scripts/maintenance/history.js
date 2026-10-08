"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { isISODate } = require("../build/validate-data");

/** @param {string} source */
function loadData(source) {
  const box = {};
  vm.createContext(box);
  vm.runInContext(source + "\n;globalThis.data={META,PRICE_CHECKS,PLANS,API_PRICES,PAYG_REFERENCES};", box, { timeout: 2000 });
  return JSON.parse(JSON.stringify(box.data));
}

/** Stable key order makes IDs independent of JSON formatting and object order. @param {any} value */
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

/** @param {any} before @param {any} after @param {{id:string,kind:string,vendor:string,name:string,checkedAt:string,sourceUrls:string[]}} identity
 * @param {boolean} [addition] */
function changeOf(before, after, identity, addition = false) {
  const keys = addition ? Object.keys(after) : Object.keys(after).filter((key) => Object.hasOwn(before, key));
  const fields = keys.filter((key) => !["id", "vendor"].includes(key) && canonical(Object.hasOwn(before, key) ? before[key] : null) !== canonical(after[key])).sort();
  if (!fields.length) return null;
  const old = Object.fromEntries(fields.map((key) => [key, Object.hasOwn(before, key) ? before[key] : null]));
  const next = Object.fromEntries(fields.map((key) => [key, after[key]]));
  const entry = { ...identity, fields, before: old, after: next };
  const changeId = "change-" + crypto.createHash("sha256").update(canonical(entry)).digest("hex").slice(0, 24);
  return { changeId, ...entry, ...(identity.kind === "plan" ? { plan: identity.name } : { model: identity.name }) };
}

/** @param {any} history */
function validateHistory(history) {
  if (!history || history.schemaVersion !== 1 || !Array.isArray(history.changes)) throw new Error("变更历史 schema 非法");
  const seen = new Set();
  for (const change of history.changes) {
    if (!change || typeof change.changeId !== "string" || !/^change-[a-f0-9]{24}$/.test(change.changeId) || seen.has(change.changeId)) throw new Error("变更历史 changeId 非法或重复");
    seen.add(change.changeId);
    if (!["plan", "api", "payg"].includes(change.kind) || !isISODate(change.checkedAt) || !change.id || !change.vendor || !change.name) throw new Error("变更历史身份或日期非法");
    if (!Array.isArray(change.sourceUrls) || !change.sourceUrls.length || change.sourceUrls.some((url) => typeof url !== "string" || !/^https:\/\//.test(url))) throw new Error("变更历史缺少官网来源");
    if (!Array.isArray(change.fields) || !change.fields.length || new Set(change.fields).size !== change.fields.length || !change.before || !change.after || change.fields.some((field) => !Object.hasOwn(change.before, field) || !Object.hasOwn(change.after, field) || canonical(change.before[field]) === canonical(change.after[field]))) throw new Error("变更历史没有实际差异");
    const recomputed = changeOf(change.before, change.after, {
      id: change.id, kind: change.kind, vendor: change.vendor, name: change.name,
      checkedAt: change.checkedAt, sourceUrls: change.sourceUrls,
    }, true);
    if (!recomputed || recomputed.changeId !== change.changeId || canonical(recomputed.fields) !== canonical(change.fields)) throw new Error("变更历史事实与 changeId 哈希不一致；请重新生成已确认变更");
  }
  return history;
}

/** Only shared old/current fields in a confirmed historical audit prove a change.
 * A field omitted by the old ledger serializer is not evidence of removal.
 * @param {string} root */
function seededHistory(root) {
  const file = path.join(root, "audit/pricing-verification-2026-10-04.json");
  const changes = [];
  if (fs.existsSync(file)) {
    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    const sources = new Map(audit.sources.map((source) => [source.id, source]));
    for (const record of audit.records) {
      if (record.status !== "changed" || !record.old || !record.current) continue;
      const evidence = (record.sourceIds || []).map((id) => sources.get(id));
      if (!evidence.length || evidence.some((source) => !source || !source.evidence || !/^https:\/\//.test(source.url))) throw new Error("历史核价记录缺少来源证据");
      const change = changeOf(record.old, record.current, {
        id: record.id, kind: record.kind, vendor: record.vendor,
        name: record.current.plan || record.current.model || record.name,
        checkedAt: record.checkedAt || audit.checkedAt,
        sourceUrls: [...new Set(evidence.map((source) => source.url))].sort(),
      });
      if (change) changes.push(change);
    }
  }
  return validateHistory({ schemaVersion: 1, changes });
}

/** @param {string} root */
function readHistory(root) {
  const file = path.join(root, "data/change-history.json");
  return fs.existsSync(file) ? validateHistory(JSON.parse(fs.readFileSync(file, "utf8"))) : seededHistory(root);
}

/** @param {any} history @param {any[]} additions */
function mergeHistory(history, additions) {
  const changes = new Map(history.changes.map((change) => [change.changeId, change]));
  for (const change of additions) if (change) changes.set(change.changeId, change);
  return validateHistory({ schemaVersion: 1, changes: [...changes.values()].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt) || a.changeId.localeCompare(b.changeId)) });
}

module.exports = { loadData, canonical, changeOf, validateHistory, seededHistory, readHistory, mergeHistory };
