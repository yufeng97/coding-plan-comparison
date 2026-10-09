"use strict";
const MAX_BYTES = 64 * 1024;
function limitedValue(value, depth = 0, seen = new Set()) {
  if (depth > 20) throw new Error("解答数据嵌套过深");
  if (value === null || value === undefined || ["boolean", "number", "string"].includes(typeof value)) return;
  if (typeof value !== "object" || seen.has(value)) throw new Error("解答只允许返回普通数据");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error("解答只允许返回普通数据");
  const keys = Object.keys(value);
  if (keys.length > 10000) throw new Error("解答数据过大");
  seen.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("解答数据不能包含访问器");
    limitedValue(descriptor.value, depth + 1, seen);
  }
  seen.delete(value);
}
function validateValue(value) {
  limitedValue(value);
  // Preserve Infinity/NaN/undefined used by invalid-input assertions.
  if (require("node:v8").serialize(value).length > MAX_BYTES) throw new Error("解答数据过大");
  return value;
}
module.exports = { MAX_BYTES, validateValue };
