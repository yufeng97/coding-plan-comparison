#!/usr/bin/env node
/* 为 virtual:legacy-lib / virtual:legacy-init 生成类型声明（src/legacy.d.ts）。
 * 导出名与旧脚本的顶层声明一一对应；类型取自 checkJs 对旧脚本的推断（旧脚本与 src/ 在同一个类型检查程序里）。
 * 用法：node scripts/build/legacy-types.mjs [--check]（--check 只验证，过期时失败，CI 不改仓库）。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGACY_INIT_ID, LEGACY_LIB_ID, readLegacyManifest, topLevelDeclarations } from "./vite-legacy.mjs";

export const LEGACY_TYPES_FILE = "src/legacy.d.ts";

/** @param {string} root */
export function legacyTypes(root) {
  const manifest = readLegacyManifest(root);
  const declarations = (files) => files.flatMap((file) => topLevelDeclarations(fs.readFileSync(path.join(root, file), "utf8"), file));
  const lib = declarations(manifest.lib), init = declarations([manifest.init]);
  /* 旧脚本的声明是全局的；先在全局取别名，模块内的同名导出才能引用到它们 */
  const alias = (name) => `LegacyType$${name}`;
  const moduleBlock = (id, list) => [
    `declare module "${id}" {`,
    ...list.map(({ name, kind }) => `  export ${kind === "let" || kind === "var" ? "let" : "const"} ${name}: ${alias(name)};`),
    "}",
  ];
  return [
    "/* 由 scripts/build/legacy-types.mjs 生成，勿手改。旧脚本的顶层声明变化后运行 npm run types:legacy。",
    " * 旧脚本是经典脚本，顶层声明是全局的；这里把它们的类型挂到 Vite 合并后的模块名下，供 src/ 按名导入。 */",
    ...[...lib, ...init].map(({ name }) => `type ${alias(name)} = typeof ${name};`),
    "",
    ...moduleBlock(LEGACY_LIB_ID, lib),
    "",
    ...moduleBlock(LEGACY_INIT_ID, init),
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const file = path.join(root, LEGACY_TYPES_FILE);
  const next = legacyTypes(root);
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (current !== next) {
      console.error(`${LEGACY_TYPES_FILE} 已过期：旧脚本的顶层声明有变化，请运行 npm run types:legacy`);
      process.exitCode = 1;
    }
  } else if (current !== next) {
    fs.writeFileSync(file, next);
    console.log(`✅ 已更新 ${LEGACY_TYPES_FILE}`);
  }
}
