"use strict";
/* 依赖「全量核查台账」快照的测试夹具共用。
 * 仓库数据在全量核查之后会有增量核查（日常流程，只推进有新证据的行）；全量同步拒绝日期倒退。
 * 这里把复制到临时目录的 data.js 中晚于全量核查日的逐行日期回放到该日，再用四份全量输入重建一次核价表，
 * 得到与全量台账一致的基线。为重建临时放入的输入、台账与历史文件随后删除，夹具原有的文件布局不变。 */
const fs = require("node:fs");
const path = require("node:path");
const { syncPricingAudit } = require("../build/sync-pricing-audit");

const FULL_AUDIT_INPUTS = ["pricing-root.json", "pricing-relays.json", "pricing-tools.json", "pricing-cn.json"];

function rewindToFullAudit(root, workspace) {
  const checkedAt = JSON.parse(fs.readFileSync(path.join(workspace, "audit", FULL_AUDIT_INPUTS[0]), "utf8")).checkedAt;
  const dataFile = path.join(root, "js/data.js");
  const source = fs.readFileSync(dataFile, "utf8");
  const start = source.indexOf("const PRICE_CHECKS = ");
  const end = source.indexOf("\nfunction priceCheckOf", start);
  if (start < 0 || end < 0) throw new Error("data.js 中找不到 PRICE_CHECKS 声明");
  const block = source.slice(start, end);
  const rewound = block.replace(/"checkedAt": "(\d{4}-\d{2}-\d{2})"/g, (match, date) => date > checkedAt ? `"checkedAt": "${checkedAt}"` : match);
  if (rewound === block) return { checkedAt, rewound: false };
  const temporary = [];
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); temporary.push(dir); } };
  ensureDir(path.join(root, "audit"));
  ensureDir(path.join(root, "data"));
  const ledgers = [`pricing-verification-${checkedAt}.json`, `pricing-verification-${checkedAt}.csv`];
  for (const file of [...FULL_AUDIT_INPUTS, ...ledgers]) {
    const target = path.join(root, "audit", file);
    if (!fs.existsSync(target)) { fs.copyFileSync(path.join(workspace, "audit", file), target); temporary.push(target); }
  }
  const history = path.join(root, "data/change-history.json");
  if (!fs.existsSync(history)) temporary.push(history);
  fs.writeFileSync(dataFile, source.slice(0, start) + rewound + source.slice(end));
  syncPricingAudit(root);
  /* 先删文件再删目录（目录按创建的逆序）；只删除本函数创建且仍为空的目录。 */
  for (const item of temporary.reverse()) {
    if (!fs.existsSync(item)) continue;
    if (fs.statSync(item).isDirectory()) { if (!fs.readdirSync(item).length) fs.rmdirSync(item); }
    else fs.rmSync(item, { force: true });
  }
  return { checkedAt, rewound: true };
}

module.exports = { rewindToFullAudit, FULL_AUDIT_INPUTS };
