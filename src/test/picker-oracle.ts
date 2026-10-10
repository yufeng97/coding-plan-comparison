/* The classic markup oracle belongs only to regression tests. It uses the current typed business helpers. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as runtime from "@domain/runtime";

interface PickerOracle {
  mainCard(main: unknown, pool: unknown[]): string;
  dailyCard(main: unknown, pool: unknown[]): string;
  upgradeCard(main: unknown): string;
  ownVendorCard(main: unknown): string | null;
}
const fixtureDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/tests/fixtures");
const helpers = fs.readFileSync(path.join(fixtureDirectory, "maintenance-renderers.js"), "utf8");
const helperFile = ts.createSourceFile("maintenance-renderers.js", helpers, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const pureHelpers = helperFile.statements.filter(node => ts.isFunctionDeclaration(node) && ["badgeHtml", "watchButtonHtml"].includes(node.name?.text ?? "")).map(node => helpers.slice(node.getStart(helperFile), node.end)).join("\n");
const source = pureHelpers + "\n" + fs.readFileSync(path.join(fixtureDirectory, "picker-renderers.js"), "utf8");
const names = Object.keys(runtime);
export const pickerOracle = new Function(...names, `${source}\nreturn { mainCard, dailyCard, upgradeCard, ownVendorCard };`)(...names.map((name) => runtime[name as keyof typeof runtime])) as PickerOracle;
