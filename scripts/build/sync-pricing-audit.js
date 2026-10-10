"use strict";
/* 将已人工逐条核实的价格审计同步到数据；保留注释及永久 ID，不访问网络。 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { validateData, isISODate } = require("./validate-data");
const { loadData, canonical, changeOf, readHistory, mergeHistory } = require("../maintenance/history");
const crypto = require("node:crypto");
const { withFileLockSync } = require("../lib/file-lock");

/** Asia/Shanghai 的当日日期 YYYY-MM-DD。 @param {Date} now */
function shanghaiDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Stage all outputs before replacing any file; restore existing or remove newly created files on failure.
 * @param {Map<string,Buffer>} outputs
 * @param {{rename?:(from:string,to:string)=>void,writeBytes?:(file:string,bytes:Buffer)=>void}} options */
function commitOutputs(outputs, options = {}) {
  const rename = options.rename || fs.renameSync;
  const writeBytes = options.writeBytes || fs.writeFileSync;
  const staged = [], applied = [], recovery = new Set();
  try {
    for (const [file, bytes] of outputs) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
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
 * @param {{incremental?:boolean,input?:string,now?:Date,rename?:(from:string,to:string)=>void,writeBytes?:(file:string,bytes:Buffer)=>void}} options
 *   now 仅供测试注入“今天”；核查日期以 Asia/Shanghai 当日为准。 */
function syncPricingAuditUnlocked(workspace, options = {}) {
  const root = path.resolve(workspace);
  const auditDir = path.join(root, "audit");
  if (!!options.incremental !== !!options.input) throw new Error("增量同步必须同时提供 --incremental 和 --input");
  const now = options.now || new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("同步时间无效");
  /* 未来日期会把 META.updated / PRICE_CHECKS.checkedAt 推到未来，之后正确的核查都被判为“日期倒退”。
   * 允许 1 天时差，覆盖跨时区录入；更晚的日期视为输入错误。 */
  const today = shanghaiDate(now), latest = new Date(Date.parse(today + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const notFuture = (date, label) => { if (date > latest) throw new Error(label + " " + date + " 晚于今天（Asia/Shanghai " + today + "，最多容许 1 天时差），疑似输入错误"); };
  let input = null;
  if (options.input) {
    input = path.resolve(root, options.input);
    const relative = path.relative(auditDir, input);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !input.endsWith(".json")) throw new Error("增量输入必须为 audit 目录中的 JSON 文件");
    const real = path.relative(fs.realpathSync(auditDir), fs.realpathSync(input));
    if (real.startsWith("..") || path.isAbsolute(real)) throw new Error("增量输入链接越出 audit 目录");
  }
  const inputs = input ? [input] : ["pricing-root.json", "pricing-relays.json", "pricing-tools.json", "pricing-cn.json"].map((file) => path.join(auditDir, file));
  const audits = inputs.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  if (audits.some((audit) => !Array.isArray(audit.sources) || !Array.isArray(audit.records))) throw new Error("审计输入必须包含 sources 和 records 数组");
  let checkedAt = audits[0].checkedAt;
  if (!options.incremental) {
    if (audits.some((audit) => audit.checkedAt !== checkedAt)) throw new Error("核查日期不一致");
    if (!isISODate(checkedAt)) throw new Error("核查日期必须为有效 YYYY-MM-DD 日期");
    notFuture(checkedAt, "批次核查日期");
  }
  const sources = audits.flatMap((a) => a.sources);
  if (new Set(sources.map((s) => s.id)).size !== sources.length) throw new Error("来源 ID 重复");
  const records = audits.flatMap((a) => a.records);
  if (!records.length) throw new Error("审计记录不能为空");
  for (const entry of sources) {
    if (typeof entry.id !== "string" || !entry.id.trim() || typeof entry.url !== "string" || !/^https:\/\//.test(entry.url)) throw new Error("核价来源 URL 非法或缺 ID");
    if (typeof entry.evidence !== "string" || !entry.evidence.trim()) throw new Error("核价来源缺少证据");
    if (entry.checkedAt != null && !isISODate(entry.checkedAt)) throw new Error("来源核查日期非法");
    if (entry.checkedAt != null) notFuture(entry.checkedAt, "来源 " + entry.id + " 的核查日期");
  }
  const dataFile = path.join(root, "js/data.js");
  let source = fs.readFileSync(dataFile, "utf8");
  const data = loadData(source);
  const priorHistory = readHistory(root);
  const sourceMap = options.incremental ? structuredClone(data.PRICE_CHECKS.sources) : {};
  const supplied = new Set(sources.map((entry) => entry.id));
  for (const entry of sources) {
    const previous = sourceMap[entry.id];
    if (previous && (previous.url !== entry.url || previous.evidence !== entry.evidence)) throw new Error("旧来源证据不可覆盖，请使用新来源 ID：" + entry.id);
    const observedAt = entry.checkedAt || (options.incremental ? records.filter((record) => Array.isArray(record.sourceIds) && record.sourceIds.includes(entry.id)).map((record) => record.checkedAt).filter(isISODate).sort()[0] : null);
    sourceMap[entry.id] = previous || { url: entry.url, evidence: entry.evidence, ...(observedAt ? { checkedAt: observedAt } : {}) };
  }
  const ast = ts.createSourceFile(dataFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = new Map();
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) declarations.set(declaration.name.getText(ast), declaration);
    }
  }
  const arrays = { plan: "PLANS", api: "API_PRICES", payg: "PAYG_REFERENCES" };
  const allowed = new Set(["priceM", "priceY", "annualTotal", "autoRenewMonthly", "singleMonthPrice", "availability", "accessUnstable", "sameAs", "cur", "seat", "plan", "model", "label", "quota", "models", "tools", "note", "url", "inUSD", "outUSD", "inCNY", "outCNY", "apiIn", "apiOut", "apiCache", "source", "windowPeriod", "quotaSharing", "codingSurface", "includedModelQuota", "modelAccess", "purchaseCountries", "modelBaseRef", "modelIncludes", "modelExcludes", "ownClient"]);
  const edits = [];
  const newPlans = [];
  const changes = [];
  const identity = new Map();
  const allowedNew = new Set(["id", "vendor", "cat", "region", "fieldRefs", "plan", "priceM", "priceY", "annualTotal", "autoRenewMonthly", "singleMonthPrice", "availability", "accessUnstable", "sameAs", "cur", "seat", "quota", "models", "tools", "note", "url", "windowPeriod", "quotaSharing", "codingSurface", "includedModelQuota", "modelAccess", "purchaseCountries", "modelBaseRef", "modelIncludes", "modelExcludes", "ownClient"]);
  function validateNewPlan(plan, record) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan) || Object.keys(plan).some((key) => !allowedNew.has(key))) throw new Error("新增计划必须为完整 Plan schema");
    if (plan.id !== record.id || plan.vendor !== record.vendor || plan.plan !== record.name) throw new Error("新增计划永久 ID、厂商或名称与审计身份不一致");
    for (const key of ["id", "vendor", "plan", "quota", "models", "tools", "note", "url"]) if (typeof plan[key] !== "string" || (key !== "note" && !plan[key].trim())) throw new Error("新增计划缺少完整字段：" + key);
    for (const key of ["priceM", "priceY"]) if (!Object.hasOwn(plan, key) || !(plan[key] === null || (typeof plan[key] === "number" && Number.isFinite(plan[key]) && plan[key] >= 0))) throw new Error("新增计划价格字段非法：" + key);
    if (typeof plan.seat !== "boolean") throw new Error("新增计划缺少 seat 布尔字段");
  }
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
  const rows = options.incremental ? structuredClone(data.PRICE_CHECKS.rows) : {};
  for (const record of records) {
    record.patch = record.patch || {};
    if (typeof record.patch !== "object" || Array.isArray(record.patch)) throw new Error("patch 必须为对象");
    const rowDate = options.incremental ? record.checkedAt : (record.checkedAt || checkedAt);
    if (!isISODate(rowDate)) throw new Error("逐行核查日期必须为有效 YYYY-MM-DD 日期");
    if (!options.incremental && rowDate > checkedAt) throw new Error("逐行核查日期不能晚于批次日期");
    notFuture(rowDate, "逐行核查日期（" + record.kind + ":" + record.id + "）");
    const name = arrays[record.kind];
    if (!name) throw new Error("未知记录类型：" + record.kind);
    const declaration = declarations.get(name);
    if (!declaration || !declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) throw new Error("缺少数据数组：" + name);
    const entries = data[name];
    const index = record.kind === "plan" ? entries.findIndex((p) => p.id === record.id)
      : entries.findIndex((p) => p.vendor + "|" + p.model === record.id || p.vendor + "|" + p.model === record.vendor + "|" + (record.patch.model || record.name));
    if (record.new != null) {
      if (record.kind !== "plan") throw new Error("显式新增只支持完整 PLANS 计划");
      validateNewPlan(record.new, record);
      if (Object.keys(record.patch).length) throw new Error("新增计划不能同时填写 patch");
      if (index >= 0 && canonical(entries[index]) !== canonical(record.new)) throw new Error("永久 ID 已存在，不能覆盖新增：" + record.id);
    }
    if (index < 0 && record.new == null) throw new Error("未找到审计条目，请显式提供 new：" + record.kind + ":" + record.id);
    const key = record.kind + ":" + (record.kind === "plan" ? record.id : record.vendor + "|" + (record.patch.model || entries[index].model));
    if (seen.has(key)) throw new Error("重复条目：" + key);
    seen.add(key);
    if (!Array.isArray(record.sourceIds) || !record.sourceIds.length || record.sourceIds.some((id) => typeof id !== "string" || !sourceMap[id] || (options.incremental && !supplied.has(id)))) throw new Error("核价来源缺失或增量未提供本次证据：" + key);
    if (!["verified", "changed", "unverified", "retired", "custom"].includes(record.status)) throw new Error("核价状态非法：" + key);
    if (typeof record.reason !== "string" || !record.reason.trim()) throw new Error("缺少核价说明：" + key);
    const item = index >= 0 ? entries[index] : {};
    if (index >= 0 && item.vendor !== record.vendor) throw new Error("审计厂商与永久 ID 不一致：" + key);
    const originalKey = record.kind + ":" + (record.kind === "plan" ? record.id : item.vendor + "|" + item.model);
    const previous = data.PRICE_CHECKS.rows[originalKey];
    if (previous && rowDate < previous.checkedAt) throw new Error("核查日期倒退，拒绝旧审计重放：" + originalKey);
    for (const id of record.sourceIds) if (sourceMap[id].checkedAt && sourceMap[id].checkedAt > rowDate) throw new Error("来源核查日期不能晚于记录日期：" + key);
    for (const [field, value] of Object.entries(record.patch)) {
      if (!allowed.has(field)) throw new Error("不支持的 patch 字段：" + field);
      // 缺失字段与 null 等价（与变更历史口径一致），因此新增字段可用 old:null 声明当前基值。
      const current = Object.hasOwn(item, field) ? item[field] : null, changed = canonical(current) !== canonical(value);
      const hasOld = !!record.old && Object.hasOwn(record.old, field);
      if (hasOld && changed && canonical(current) !== canonical(record.old[field])) throw new Error("旧审计 patch 与现值不符，拒绝覆盖：" + originalKey + "/" + field);
      /* 同日可能有多批增量：每个改值字段都要以 old 声明当前值，未声明基值的旧文件重放不能把新值改回去。 */
      if (options.incremental && changed && !hasOld) throw new Error("增量修改须在 old 中提供该字段的当前值，拒绝无基值的 patch（防止旧审计重放覆盖新值）：" + originalKey + "/" + field);
      const explicitCurrentBase = hasOld && canonical(record.old[field]) === canonical(current);
      if (!options.incremental && previous && rowDate === previous.checkedAt && !explicitCurrentBase && changed && priorHistory.changes.some((change) => change.kind === record.kind && change.id === originalKey.slice(record.kind.length + 1) && change.checkedAt >= rowDate && change.fields.includes(field) && canonical(change.after[field]) === canonical(current))) throw new Error("同日旧全量权益 patch 重放，须显式提供当前基值：" + originalKey + "/" + field);
    }
    if (record.status === "unverified" && (index < 0 || Object.keys(record.patch).some((field) => canonical(item[field]) !== canonical(record.patch[field])))) throw new Error("未核实记录不能修改价格或权益事实：" + key);
    const after = record.new || { ...item, ...record.patch };
    if (index < 0) newPlans.push(after); else patchObject(declaration.initializer.elements[index], record.patch);
    if (originalKey !== key) delete rows[originalKey];
    rows[key] = { status: record.status, checkedAt: rowDate, sourceIds: record.sourceIds, reason: record.reason };
    identity.set(record, { key, name, id: record.kind === "plan" ? record.id : originalKey.slice(record.kind.length + 1) });
    /* 任何状态只要改变事实都要进入真实变更历史（custom 也可能把价格改为询价）；无差异时 changeOf 返回 null。
     * unverified 已在上方禁止修改事实。 */
    changes.push(changeOf(item, after, {
      id: identity.get(record).id, kind: record.kind, vendor: record.vendor,
      name: after.plan || after.model, checkedAt: rowDate,
      sourceUrls: [...new Set(record.sourceIds.map((id) => sourceMap[id].url))].sort(),
    }, true));
  }
  if (newPlans.length) {
    const planArray = declarations.get("PLANS").initializer;
    edits.push({ start: planArray.end - 1, end: planArray.end - 1, text: (planArray.elements.length && !planArray.elements.hasTrailingComma ? "," : "") + "\n" + newPlans.map((plan) => JSON.stringify(plan)).join(",\n") + "\n" });
  }
  const expected = data.PLANS.length + data.API_PRICES.length + data.PAYG_REFERENCES.length + newPlans.length;
  if (!options.incremental && records.length !== expected) throw new Error(`审计覆盖不完整：${records.length}/${expected}`);
  const batchDate = options.incremental ? records.map((record) => record.checkedAt).sort().at(-1) : checkedAt;
  checkedAt = data.PRICE_CHECKS.checkedAt > batchDate ? data.PRICE_CHECKS.checkedAt : batchDate;
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
  const current = loadData(source);
  const validation = validateData({ workspace: root, source, now });
  if (validation.errors.length) throw new Error("核价同步候选数据校验失败：\n" + validation.errors.join("\n"));
  for (const record of records) {
    const currentId = identity.get(record).key.slice(record.kind.length + 1);
    const item = current[identity.get(record).name].find((p) => record.kind === "plan" ? p.id === currentId : p.vendor + "|" + p.model === currentId);
    record.current = Object.fromEntries(["vendor", "plan", "model", "priceM", "priceY", "annualTotal", "cur", "seat", "inUSD", "outUSD", "inCNY", "outCNY", "apiIn", "apiOut", "apiCache"].filter((k) => item[k] !== undefined).map((k) => [k, item[k]]));
  }
  const ledger = { checkedAt: batchDate, ...(options.incremental ? { incremental: true } : {}), totals: { plans: current.PLANS.length, api: current.API_PRICES.length, payg: current.PAYG_REFERENCES.length }, sources, records };
  const csvCell = (v) => {
    let text = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = [["类型", "ID", "厂商", "计划/模型", "状态", "核查日期", "原价格", "当前价格", "原因", "来源"],
    ...records.map((r) => [r.kind, r.id, r.vendor, r.name, r.status, r.checkedAt || batchDate, JSON.stringify(r.old), JSON.stringify(r.current), r.reason, r.sourceIds.map((id) => sourceMap[id].url).join(" ; ")])]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
  const history = mergeHistory(priorHistory, changes);
  const suffix = options.incremental ? "incremental-" + batchDate + "-" + crypto.createHash("sha256").update(canonical(audits)).digest("hex").slice(0, 12) : "verification-" + batchDate;
  const filesChanged = commitOutputs(new Map([
    [dataFile, Buffer.from(source)],
    [path.join(auditDir, `pricing-${suffix}.json`), Buffer.from(JSON.stringify(ledger, null, 2) + "\n")],
    [path.join(auditDir, `pricing-${suffix}.csv`), Buffer.from("\uFEFF" + csv + "\r\n")],
    [path.join(root, "data/change-history.json"), Buffer.from(JSON.stringify(history, null, 2) + "\n")],
  ]), options);
  return { records: records.length, sources: sources.length, filesChanged, updated, checkedAt, historyChanges: history.changes.length };
}

/* 锁覆盖读取、校验与四份输出交换。只锁落盘仍会让另一批更新从旧快照覆盖新数据。 */
function syncPricingAudit(workspace = path.join(__dirname, "..", ".."), options = {}) {
  const root = path.resolve(workspace), auditDir = path.join(root, "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  const lock = path.join(auditDir, ".pricing.lock");
  return withFileLockSync(lock, () => syncPricingAuditUnlocked(root, options), {
    busyMessage: "核价正在同步或维护摘要正在构建，或存在遗留锁（audit/.pricing.lock）",
  });
}

/** @param {string[]} args */
function parseArgs(args) {
  const options = { incremental: false, input: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--incremental") options.incremental = true;
    else if (args[i] === "--input" && args[i + 1] && !args[i + 1].startsWith("--")) options.input = args[++i];
    else throw new Error("未知或缺值参数：" + args[i]);
  }
  return options;
}

if (require.main === module) {
  try {
    const result = syncPricingAudit(undefined, parseArgs(process.argv.slice(2)));
    console.log(`同步 ${result.records} 条核价记录、${result.sources} 个来源；更新 ${result.filesChanged} 个文件，数据版本 ${result.updated}。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { syncPricingAudit, commitOutputs, parseArgs };
