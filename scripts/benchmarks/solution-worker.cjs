"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { validateValue } = require("./solution-values.cjs");
// Maintainer-selected local code; this is not a security sandbox.
// The checker nonce is absent from this process's arguments.
const moduleObject = { exports: {} };
const context = vm.createContext({ module: moduleObject, exports: moduleObject.exports, URLSearchParams });
process.on("disconnect", () => process.exit(1));
try {
  vm.runInContext(fs.readFileSync(path.join(process.argv[2], "solution.cjs"), "utf8"), context, { timeout: 1000, filename: "solution.cjs" });
} catch (error) {
  process.send?.({ type: "load-error", message: String(error?.message || error).slice(0, 2000) });
  process.exitCode = 1;
  process.disconnect?.();
}
if (process.exitCode !== 1) {
  process.on("message", async request => {
    if (!request || request.type !== "call" || !Number.isSafeInteger(request.id) || !["default", "encode", "decode"].includes(request.method) || !Array.isArray(request.args) || request.args.length !== 1) {
      process.exitCode = 1; process.disconnect?.(); return;
    }
    try { validateValue(request.args); }
    catch { process.exitCode = 1; process.disconnect?.(); return; }
    const implementation = request.method === "default" ? moduleObject.exports : moduleObject.exports?.[request.method];
    if (typeof implementation !== "function") {
      process.send?.({ type: "protocol-error", id: request.id, message: "解答缺少所需函数" }); return;
    }
    let value;
    const deadline = setTimeout(() => process.exit(1), 1000);
    try {
      context.__benchmarkCall = implementation;
      context.__benchmarkArgs = request.args;
      value = await vm.runInContext("__benchmarkCall(...__benchmarkArgs)", context, { timeout: 750 });
    } catch (error) {
      process.send?.({ type: "throw", id: request.id, message: String(error?.message || error).slice(0, 2000) }); return;
    } finally {
      clearTimeout(deadline);
      delete context.__benchmarkCall;
      delete context.__benchmarkArgs;
    }
    try {
      value = structuredClone(value);
      validateValue(value);
      process.send?.({ type: "return", id: request.id, value });
    } catch (error) {
      process.send?.({ type: "protocol-error", id: request.id, message: String(error?.message || error).slice(0, 2000) });
    }
  });
  process.send?.({ type: "ready" });
}
