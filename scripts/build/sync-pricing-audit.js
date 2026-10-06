"use strict";
/* 将已人工逐条核实的价格审计同步到数据；保留注释及永久 ID，不访问网络。 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { validateData, isISODate } = require("./validate-data");

/** Stage all outputs before replacing any file; restore existing or remove newly created files on failure.
 * @param {Map<string,Buffer>} outputs
 * @param {{rename?:(from:string,to:string)=>void,writeBytes?:(file:string,bytes:Buffer)=>void}} options */
function commitOutputs(outputs, options = {}) {
  const rename = options.rename || fs.renameSync;
  const writeBytes = options.writeBytes || fs.writeFileSync;
  const staged = [], applied = [], recovery = new Set();
  try {
    for (const [file, bytes] of outputs) {
      const exists = fs.existsSync(file);
      const originalBytes = exists ? fs.readFileSync(file) : null;
      if (originalBytes && originalBytes.equals(bytes)) continue;
      const dir = fs.mkdtempSync(path.join(path.dirname(file), ".audit-update-"));
      const item = { file, dir, next: path.join(dir, "next"), original: path.join(dir, "original"), exists };
      staged.push(item);
      writeBytes(item.next, bytes);
      if (originalBytes) writeBytes(item.original, originalBytes);
    }
    for (const item of staged) { rename(item.next, item.file); applied.push(item); }
    return staged.length;
  } catch (error) {
    const failures = [];
    for (const item of applied.reverse()) {
      try { if (item.exists) rename(item.original, item.file); else fs.unlinkSync(item.file); }
      catch (restoreError) { recovery.add(item.dir); failures.push(restoreError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "核价同步回滚失败，原文件备份保留在：" + [...recovery].join("、"));
    throw error;
  } finally {
    for (const item of staged) {
      if (path.dirname(item.dir) !== path.dirname(item.file) || !path.basename(item.dir).startsWith(".audit-update-")) throw new Error("拒绝清理未知核价暂存路径");
      if (!recovery.has(item.dir)) fs.rmSync(item.dir, { recursive: true, force: true });
    }
  }
}

/** @param {string} workspace
 * @param {{rename?:(from:string,to:string)=>void,writeBytes?:(file:string,bytes:Buffer)=>void}} options */
function syncPricingAudit(workspace = path.join(__dirname, "..", ".."), options = {}) {
  const root = path.resolve(workspace);
  const auditDir = path.join(root, "audit");
  const inputs = ["pricing-root.json", "pricing-relays.json", "pricing-tools.json", "pricing-cn.json"];
  const audits = inputs.map((f) => JSON.parse(fs.readFileSync(path.join(auditDir, f), "utf8")));
  const checkedAt = audits[0].checkedAt;
  if (audits.some((a) => a.checkedAt !== checkedAt)) throw new Error("核查日期不一致");
  if (!isISODate(checkedAt)) throw new Error("核查日期必须为有效 YYYY-MM-DD 日期");
  const sources = audits.flatMap((a) => a.sources);
  if (new Set(sources.map((s) => s.id)).size !== sources.length) throw new Error("来源 ID 重复");
  const records = audits.flatMap((a) => a.records);
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, { url: s.url, evidence: s.evidence }]));
  const dataFile = path.join(root, "js/data.js");
  let source = fs.readFileSync(dataFile, "utf8");
  function load(text) {
    const box = { console };
    vm.createContext(box);
    vm.runInContext(text + "\n;globalThis.d={META,PLANS,API_PRICES,PAYG_REFERENCES,METRICS_RAW,ESTIMATES,findPlanReference};", box);
    return box.d;
  }
  const data = load(source);
  const ast = ts.createSourceFile(dataFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = new Map();
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) declarations.set(declaration.name.getText(ast), declaration);
    }
  }
  const arrays = { plan: "PLANS", api: "API_PRICES", payg: "PAYG_REFERENCES" };
  const allowed = new Set(["priceM", "priceY", "cur", "seat", "plan", "model", "label", "quota", "models", "tools", "note", "url", "inUSD", "outUSD", "inCNY", "outCNY", "apiIn", "apiOut", "apiCache", "source", "windowPeriod", "quotaSharing", "codingSurface", "includedModelQuota", "modelAccess", "purchaseCountries", "modelBaseRef", "modelIncludes", "modelExcludes", "ownClient"]);
  const edits = [];
  function patchObject(node, patch) {
    const added = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) throw new Error("不支持的 patch 字段：" + key);
      const property = node.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(ast).replace(/^["']|["']$/g, "") === key);
      const text = JSON.stringify(value);
      if (property && ts.isPropertyAssignment(property)) {
        if (property.initializer.getText(ast) !== text) edits.push({ start: property.initializer.getStart(ast), end: property.initializer.end, text });
      } else added.push(`${key}: ${text}`);
    }
    if (added.length) edits.push({ start: node.end - 1, end: node.end - 1,
      text: (node.properties.length && !node.properties.hasTrailingComma ? ", " : " ") + added.join(", ") + " " });
  }
  const seen = new Set();
  const rows = {};
  for (const record of records) {
    record.patch = record.patch || {};
    const name = arrays[record.kind];
    if (!name) throw new Error("未知记录类型：" + record.kind);
    const declaration = declarations.get(name);
    if (!declaration || !declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) throw new Error("缺少数据数组：" + name);
    const entries = data[name];
    const index = record.kind === "plan" ? entries.findIndex((p) => p.id === record.id)
      : entries.findIndex((p) => p.vendor + "|" + p.model === record.id || p.vendor + "|" + p.model === record.vendor + "|" + (record.patch.model || record.name));
    if (index < 0) throw new Error("未找到审计条目：" + record.kind + ":" + record.id);
    const key = record.kind + ":" + (record.kind === "plan" ? record.id : record.vendor + "|" + (record.patch.model || entries[index].model));
    if (seen.has(key)) throw new Error("重复条目：" + key);
    seen.add(key);
    if (!record.sourceIds.length || record.sourceIds.some((id) => !sourceMap[id])) throw new Error("核价来源缺失：" + key);
    if (!["verified", "changed", "unverified", "retired", "custom"].includes(record.status)) throw new Error("核价状态非法：" + key);
    patchObject(declaration.initializer.elements[index], record.patch || {});
    rows[key] = { status: record.status, checkedAt, sourceIds: record.sourceIds, reason: record.reason || "" };
  }
  const expected = data.PLANS.length + data.API_PRICES.length + data.PAYG_REFERENCES.length;
  if (records.length !== expected) throw new Error(`审计覆盖不完整：${records.length}/${expected}`);
  const priceDeclaration = declarations.get("PRICE_CHECKS");
  if (!priceDeclaration || !priceDeclaration.initializer) throw new Error("缺 PRICE_CHECKS");
  edits.push({ start: priceDeclaration.initializer.getStart(ast), end: priceDeclaration.initializer.end,
    text: JSON.stringify({ checkedAt, sources: sourceMap, rows }, null, 2) });
  const metaDeclaration = declarations.get("META");
  if (!metaDeclaration || !metaDeclaration.initializer || !ts.isObjectLiteralExpression(metaDeclaration.initializer)) throw new Error("缺 META");
  const updatedProperty = metaDeclaration.initializer.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(ast) === "updated");
  if (!updatedProperty || !ts.isPropertyAssignment(updatedProperty)) throw new Error("缺 META.updated");
  /* 整份数据版本包括核价之后的巡检；审计日期只推进版本，不能使它倒退。 */
  const updated = data.META.updated > checkedAt ? data.META.updated : checkedAt;
  edits.push({ start: updatedProperty.initializer.getStart(ast), end: updatedProperty.initializer.end, text: JSON.stringify(updated) });
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  source = source.replace("全部价格经网络核实，来源见 SOURCES", "价格逐条核查状态见 PRICE_CHECKS；待核实历史价仅作参考");
  const current = load(source);
  const validation = validateData({ workspace: root, source });
  if (validation.errors.length) throw new Error("核价同步候选数据校验失败：\n" + validation.errors.join("\n"));
  for (const record of records) {
    const entries = current[arrays[record.kind]];
    const item = entries.find((p) => record.kind === "plan" ? p.id === record.id : p.vendor === record.vendor && p.model === (record.patch.model || record.name));
    record.current = Object.fromEntries(["vendor", "plan", "model", "priceM", "priceY", "cur", "seat", "inUSD", "outUSD", "inCNY", "outCNY", "apiIn", "apiOut", "apiCache"].filter((k) => item[k] !== undefined).map((k) => [k, item[k]]));
  }
  const ledger = { checkedAt, totals: { plans: current.PLANS.length, api: current.API_PRICES.length, payg: current.PAYG_REFERENCES.length }, sources, records };
  const csvCell = (v) => {
    let text = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = [["类型", "ID", "厂商", "计划/模型", "状态", "核查日期", "原价格", "当前价格", "原因", "来源"],
    ...records.map((r) => [r.kind, r.id, r.vendor, r.name, r.status, checkedAt, JSON.stringify(r.old), JSON.stringify(r.current), r.reason, r.sourceIds.map((id) => sourceMap[id].url).join(" ; ")])]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filesChanged = commitOutputs(new Map([
    [dataFile, Buffer.from(source)],
    [path.join(auditDir, `pricing-verification-${checkedAt}.json`), Buffer.from(JSON.stringify(ledger, null, 2) + "\n")],
    [path.join(auditDir, `pricing-verification-${checkedAt}.csv`), Buffer.from("\uFEFF" + csv + "\r\n")],
  ]), options);
  return { records: records.length, sources: sources.length, filesChanged, updated, checkedAt };
}

if (require.main === module) {
  try {
    const result = syncPricingAudit();
    console.log(`同步 ${result.records} 条核价记录、${result.sources} 个来源；更新 ${result.filesChanged} 个文件，数据版本 ${result.updated}。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { syncPricingAudit };
