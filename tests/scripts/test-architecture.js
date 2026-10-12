"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { checkArchitecture } = require("../../scripts/build/check-architecture");

/** @param {Record<string, string>} files @param {(root: string) => void} check */
function fixture(files, check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-architecture-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    check(root);
  } finally {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("coding-plan-architecture-")) throw new Error("拒绝清理未知架构测试目录");
    fs.rmSync(root, { recursive: true, force: true });
  }
}

fixture({
  "src/domain/a.ts": "export { b } from './b'; export const a = 1;",
  "src/domain/b.ts": "import { a } from './a'; export const b = () => a;",
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("循环依赖"))));

fixture({
  "src/domain/a.ts": "import type { B } from './b'; export type A = { b?: B };",
  "src/domain/b.ts": "import { type A } from './a'; export type B = { a?: A };",
}, (root) => assert.deepEqual(checkArchitecture(root).errors, []));

fixture({
  "tsconfig.app.json": JSON.stringify({ compilerOptions: { paths: { "@browser/*": ["src/browser/*"] } } }),
  "src/domain/rule.ts": "import { read } from '@browser/storage'; export const rule = read;",
  "src/browser/storage.ts": "export const read = () => '';",
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("业务规则依赖了上层模块"))));

fixture({
  "src/state/store.ts": "export { update } from '../application/actions';",
  "src/application/actions.ts": "export const update = () => {};",
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("共享状态依赖"))));

fixture({
  "src/browser/view.ts": "export { update } from '../application/actions';",
  "src/application/actions.ts": "export const update = () => {};",
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("浏览器适配依赖"))));

fixture({
  "src/components/A.vue": '<script setup lang="ts">import B from "./B.vue";</script><template><B /></template>',
  "src/components/B.vue": '<script setup lang="ts">import A from "./A.vue";</script><template><A /></template>',
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("循环依赖"))));

fixture({
  "src/application/actions.ts": "export { default as Card } from '../components/Card.vue';",
  "src/components/Card.vue": '<script setup lang="ts"></script><template><p /></template>',
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("应用协调层依赖了视图"))));

fixture({
  "src/components/Card.vue": '<script setup lang="ts">import Section from "../sections/pricing/Section.vue";</script><template><Section /></template>',
  "src/sections/pricing/Section.vue": '<script setup lang="ts"></script><template><p /></template>',
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("通用组件依赖了页面区块"))));

fixture({
  "src/entries/theme-init.ts": "import { themeView } from '../state/app'; void themeView;",
  "src/state/app.ts": "export const themeView = {};",
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("独立构建入口依赖了应用模块"))));

fixture({
  "src/sections/View.vue": '<script setup lang="ts">import * as app from "../test/runtime"; void app;</script><template><p /></template>',
  "src/test/runtime.ts": "export const ready = true;",
}, (root) => assert.ok(checkArchitecture(root).errors.some((error) => error.includes("生产模块引用了测试代码"))));

const repositoryRoot = path.resolve(__dirname, "../..");
const domainRoot = path.join(repositoryRoot, "src/domain");
/** @param {string} dir @returns {string[]} 业务规则目录下的全部模块（含子目录），相对 src/domain。 */
const listDomain = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? listDomain(path.join(dir, entry.name)).map((file) => entry.name + "/" + file)
  : entry.name.endsWith(".ts") && !/\.(?:test|d)\.ts$/.test(entry.name) ? [entry.name] : []);
const domainFiles = listDomain(domainRoot);
const domainEntry = domainFiles.map((file, index) => `import * as module${index} from ${JSON.stringify(path.join(domainRoot, file).split(path.sep).join("/"))}; export { module${index} };`).join("\n");
fixture({ "src/entry.ts": domainEntry }, (root) => {
  const output = path.join(root, "domain.cjs");
  require("esbuild").buildSync({ entryPoints: [path.join(root, "src/entry.ts")], outfile: output, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  // All domain modules must import and compute successfully in Node, with no DOM/browser shims.
  const modules = require(output);
  const recommendations = modules["module" + domainFiles.indexOf("picker/rules.ts")];
  const settings = { budget: "0", region: "all", tool: "any", task: "both", billing: "M", priority: "quota" };
  const rules = recommendations.createPickerRules(settings);
  const otherRules = recommendations.createPickerRules({ ...settings });
  const paidPlan = { vendor: "Test", plan: "Monthly", cur: "CNY", priceM: 10, priceY: 5 };
  assert.equal(rules.pickerMonthlyCNY(paidPlan), 10);
  settings.billing = "Y";
  assert.equal(rules.pickerMonthlyCNY(paidPlan), 5);
  assert.equal(otherRules.pickerMonthlyCNY(paidPlan), 10);
});

const actual = checkArchitecture(repositoryRoot);
assert.deepEqual(actual.errors, [], actual.errors.join("\n"));
console.log(`✅ 架构检查回归通过，${actual.modules} 个生产模块边界与依赖方向有效`);
