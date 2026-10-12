"use strict";
/* Keep production module dependencies acyclic, layered from domain rules up to views, and free of test-only code. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

/** @typedef {{ target: string, runtime: boolean, test?: boolean }} Dependency 依赖目标；test 表示目标在测试目录（生产代码不应引用） */
/** @param {string} directory @returns {string[]} */
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" || entry.name === "regression" ? [] : sourceFiles(file);
    return /\.(?:ts|vue)$/.test(entry.name) && !/\.(?:test|d)\.ts$/.test(entry.name) ? [file] : [];
  }).sort();
}

/** @param {string} root @returns {Map<string, Dependency[]>} */
function moduleGraph(root) {
  const files = sourceFiles(path.join(root, "src"));
  const known = new Set(files);
  const configFile = path.join(root, "tsconfig.app.json");
  const config = fs.existsSync(configFile) ? ts.readConfigFile(configFile, ts.sys.readFile).config : {};
  /** @type {Record<string, string[]>} */
  const aliases = config.compilerOptions?.paths || {};
  const graph = new Map();
  for (const file of files) {
    let content = fs.readFileSync(file, "utf8");
    if (file.endsWith(".vue")) content = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n");
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    /** @type {Dependency[]} */
    const dependencies = [];
    /** @param {string} specifier @param {boolean} runtime */
    const add = (specifier, runtime) => {
      let base = specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : "";
      if (!base) {
        for (const [alias, targets] of Object.entries(aliases)) {
          const prefix = alias.replace(/\*$/, "");
          if (specifier.startsWith(prefix) && targets[0]) {
            base = path.resolve(root, config.compilerOptions?.baseUrl || ".", targets[0].replace("*", specifier.slice(prefix.length)));
            break;
          }
        }
      }
      if (!base) return; // External packages are outside the application graph.
      /* 测试目录不在生产模块图里；生产代码引用测试支撑（如测试用的业务汇总出口）单独报告。 */
      if (/[\\/]src[\\/](?:test|regression)(?:[\\/]|$)/.test(base)) { dependencies.push({ target: base, runtime, test: true }); return; }
      const target = [base, base + ".ts", base + ".vue", path.join(base, "index.ts")].find((candidate) => known.has(candidate));
      if (target) dependencies.push({ target, runtime });
    };
    /** @param {import("typescript").Node} node */
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyNamedTypes = !!bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
        add(node.moduleSpecifier.text, !clause?.isTypeOnly && (!onlyNamedTypes || !!clause?.name));
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const onlyNamedTypes = !!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((element) => element.isTypeOnly);
        add(node.moduleSpecifier.text, !node.isTypeOnly && !onlyNamedTypes);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        add(node.arguments[0].text, true);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    graph.set(file, dependencies);
  }
  return graph;
}

/* 每层不得依赖的目录：业务规则 → 共享状态 → 浏览器适配 → 应用协调 → 组合式函数 → 通用组件 → 页面区块 → 布局，
   只允许向左依赖；独立构建的经典脚本入口不依赖任何应用模块。 */
const VIEWS = "composables|components|sections|layouts";
/** @type {[string, RegExp, string][]} */
const LAYER_RULES = [
  ["src/domain/", new RegExp(`^src/(?:application|browser|state|${VIEWS})/`), "业务规则依赖了上层模块"],
  ["src/state/", new RegExp(`^src/(?:application|browser|${VIEWS})/`), "共享状态依赖了应用或浏览器模块"],
  ["src/browser/", new RegExp(`^src/(?:application|${VIEWS})/`), "浏览器适配依赖了应用协调层或视图"],
  ["src/application/", new RegExp(`^src/(?:${VIEWS})/`), "应用协调层依赖了视图"],
  ["src/composables/", /^src\/(?:components|sections|layouts)\//, "组合式函数依赖了组件"],
  ["src/components/", /^src\/(?:sections|layouts)\//, "通用组件依赖了页面区块或布局"],
  ["src/sections/", /^src\/layouts\//, "页面区块依赖了布局"],
  ["src/entries/", /^src\//, "独立构建入口依赖了应用模块"],
];

/** @param {string} root @returns {{ modules: number, errors: string[] }} */
function checkArchitecture(root) {
  const graph = moduleGraph(root);
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  /** @type {string[]} */
  const errors = [];
  for (const [file, dependencies] of graph) {
    const from = relative(file);
    for (const { target, test } of dependencies) {
      const to = relative(target);
      if (test) { errors.push(`生产模块引用了测试代码：${from} → ${to}`); continue; }
      for (const [layer, forbidden, message] of LAYER_RULES) if (from.startsWith(layer) && forbidden.test(to)) errors.push(`${message}：${from} → ${to}`);
    }
  }
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @param {string} file */
  function visit(file) {
    const at = stack.indexOf(file);
    if (at >= 0) {
      errors.push(`循环依赖：${[...stack.slice(at), file].map(relative).join(" → ")}`);
      return;
    }
    if (visited.has(file)) return;
    stack.push(file);
    for (const dependency of graph.get(file) || []) if (dependency.runtime) visit(dependency.target);
    stack.pop();
    visited.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return { modules: graph.size, errors: [...new Set(errors)] };
}

if (require.main === module) {
  const result = checkArchitecture(path.resolve(__dirname, "../.."));
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else console.log(`✅ ${result.modules} 个前端模块无循环依赖，分层边界与测试隔离检查通过`);
}

module.exports = { checkArchitecture, moduleGraph };
