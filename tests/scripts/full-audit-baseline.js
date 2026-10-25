"use strict";
/* 依赖「全量核查台账」快照的测试夹具共用。
 * 仓库数据在全量核查之后会有增量核查（日常流程，只推进有新证据的行）；全量同步拒绝日期倒退。
 * 这里把复制到临时目录的 data.js 中晚于全量核查日的逐行日期回放到该日，并以副本现值显式声明待回放 patch 的 old，
 * 再用四份全量输入重建一次核价表，
 * 得到与全量台账一致的基线。全量核查之后才收录的条目（增量 new 新增的套餐、手工新增的 API 行）不在四份输入里，
 * 按它们当前的核价状态与来源补进临时目录里的第一份输入，全量同步才能覆盖全部记录；补入条数随返回值给出。
 * 为重建临时放入的输入、台账与历史文件随后删除，夹具原有的文件布局不变。 */
const fs = require("node:fs");
const path = require("node:path");
const { syncPricingAudit } = require("../../scripts/build/sync-pricing-audit");
const { canonical } = require("../../scripts/maintenance/history");
const { loadData } = require("../../scripts/lib/load-data");

const FULL_AUDIT_INPUTS = ["pricing-root.json", "pricing-relays.json", "pricing-tools.json", "pricing-cn.json"];

/** 全量输入没有覆盖的当前核价行：按当前状态、说明与来源写成全量记录（日期取全量核查日）。 */
function supplementFullAudit(root, source, checkedAt) {
  const { PRICE_CHECKS, PLANS, API_PRICES, PAYG_REFERENCES } = loadData(source, ["PRICE_CHECKS", "PLANS", "API_PRICES", "PAYG_REFERENCES"]);
  const files = FULL_AUDIT_INPUTS.map((file) => path.join(root, "data/audit", file));
  const audits = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  const entries = { plan: PLANS, api: API_PRICES, payg: PAYG_REFERENCES };
  const itemOf = (record) => record.kind === "plan" ? PLANS.find((entry) => entry.id === record.id)
    : entries[record.kind].find((entry) => entry.vendor + "|" + entry.model === record.id || entry.vendor + "|" + entry.model === record.vendor + "|" + (record.patch?.model || record.name));
  /* 只在临时输入中授权回放已变的字段；未变字段的历史 old 仍用于原全量价格差异断言。 */
  for (const audit of audits) for (const record of audit.records) {
    const item = itemOf(record);
    if (!item) throw new Error("全量核价记录找不到当前条目：" + record.kind + ":" + record.id);
    for (const [field, value] of Object.entries(record.patch || {})) {
      const current = Object.hasOwn(item, field) ? item[field] : null;
      if (canonical(current) !== canonical(value)) record.old = { ...record.old, [field]: current };
    }
  }
  /* 与同步脚本同一身份规则：API / 按量记录可用旧「厂商|型号」或 patch.model 指向改名后的条目。 */
  const keyOf = (record) => {
    if (record.kind === "plan") return "plan:" + record.id;
    const model = record.patch && record.patch.model;
    const item = itemOf(record);
    return record.kind + ":" + record.vendor + "|" + (model || (item ? item.model : record.id.slice(record.vendor.length + 1)));
  };
  const covered = new Set(audits.flatMap((audit) => audit.records.map(keyOf)));
  const supplied = new Set(audits.flatMap((audit) => audit.sources.map((entry) => entry.id)));
  const added = [];
  for (const [key, row] of Object.entries(PRICE_CHECKS.rows)) {
    if (covered.has(key)) continue;
    const kind = key.slice(0, key.indexOf(":")), id = key.slice(kind.length + 1);
    const item = entries[kind].find((entry) => (kind === "plan" ? entry.id : entry.vendor + "|" + entry.model) === id);
    if (!item) throw new Error("核价行找不到对应条目：" + key);
    added.push({ kind, id, vendor: item.vendor, name: item.plan || item.model, status: row.status, checkedAt, sourceIds: row.sourceIds, reason: row.reason, patch: {} });
    for (const sourceId of row.sourceIds) {
      if (supplied.has(sourceId)) continue;
      const entry = PRICE_CHECKS.sources[sourceId];
      audits[0].sources.push({ id: sourceId, url: entry.url, evidence: entry.evidence });
      supplied.add(sourceId);
    }
  }
  if (added.length) audits[0].records.push(...added);
  audits.forEach((audit, index) => fs.writeFileSync(files[index], JSON.stringify(audit, null, 2) + "\n"));
  return added;
}

function rewindToFullAudit(root, workspace) {
  const checkedAt = JSON.parse(fs.readFileSync(path.join(workspace, "data/audit", FULL_AUDIT_INPUTS[0]), "utf8")).checkedAt;
  const dataFile = path.join(root, "data/sources/data.js");
  const source = fs.readFileSync(dataFile, "utf8");
  const start = source.indexOf("const PRICE_CHECKS = ");
  const end = source.indexOf("\nfunction priceCheckOf", start);
  if (start < 0 || end < 0) throw new Error("data.js 中找不到 PRICE_CHECKS 声明");
  const block = source.slice(start, end);
  const rewound = block.replace(/"checkedAt": "(\d{4}-\d{2}-\d{2})"/g, (match, date) => date > checkedAt ? `"checkedAt": "${checkedAt}"` : match);
  if (rewound === block) return { checkedAt, rewound: false, added: [] };
  const temporary = [];
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); temporary.push(dir); } };
  ensureDir(path.join(root, "data/audit"));
  ensureDir(path.join(root, "data"));
  const ledgers = [`pricing-verification-${checkedAt}.json`, `pricing-verification-${checkedAt}.csv`];
  for (const file of [...FULL_AUDIT_INPUTS, ...ledgers]) {
    const target = path.join(root, "data/audit", file);
    if (!fs.existsSync(target)) { fs.copyFileSync(path.join(workspace, "data/audit", file), target); temporary.push(target); }
  }
  const history = path.join(root, "data/audit/change-history.json");
  if (!fs.existsSync(history)) temporary.push(history);
  const added = supplementFullAudit(root, source, checkedAt);
  fs.writeFileSync(dataFile, source.slice(0, start) + rewound + source.slice(end));
  syncPricingAudit(root);
  /* 先删文件再删目录（目录按创建的逆序）；只删除本函数创建且仍为空的目录。 */
  for (const item of temporary.reverse()) {
    if (!fs.existsSync(item)) continue;
    if (fs.statSync(item).isDirectory()) { if (!fs.readdirSync(item).length) fs.rmdirSync(item); }
    else fs.rmSync(item, { force: true });
  }
  return { checkedAt, rewound: true, added };
}

module.exports = { rewindToFullAudit, FULL_AUDIT_INPUTS };
