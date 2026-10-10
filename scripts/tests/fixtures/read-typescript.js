"use strict";
/* Test-only classic-script adapter. Production imports TypeScript ES modules directly.
 * VM tests execute the same business calculations with a small DOM boundary; Vue tests
 * and real-browser tests cover the production rendering and events. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../..");
const compiled = new Map();
function classicSource(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  if (compiled.get(file)?.source === source) return compiled.get(file).code;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statements = parsed.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node));
  let text = statements.map(node => source.slice(node.getFullStart(), node.end).replace(/^export\s+/m, "")).join("\n");
  if (file.endsWith("startup.ts")) {
    const start = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "startApplication");
    if (!start || !ts.isFunctionDeclaration(start) || !start.body) throw new Error('TypeScript startup entry is missing');
    text = source.slice(start.body.getStart(parsed) + 1, start.body.end - 1);
    // VM assertions run synchronously; focus behavior is tested against Vue in browsers.
    text = text.replace(/await nextTick\(\);/g, "").replace(/async function restoreHistoryState/, "function restoreHistoryState");
  }
  if (file.endsWith('runtime.ts')) text = 'const reactive = value => value, shallowReactive = value => value;\n' + text;
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  compiled.set(file, { source, code });
  return code;
}
module.exports = { classicSource };
