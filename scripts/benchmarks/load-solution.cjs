"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
// 这些固定任务只允许纯函数接口，无需 process / require / 文件或网络。
// VM 是减少意外副作用的执行环境，不应当作任意恶意代码的安全沙箱。
module.exports = function loadSolution(directory) {
  const moduleObject = {exports:{}};
  const context = vm.createContext({module:moduleObject,exports:moduleObject.exports,URLSearchParams});
  vm.runInContext(fs.readFileSync(path.join(directory,"solution.cjs"),"utf8"),context,{timeout:1000,filename:"solution.cjs"});
  return moduleObject.exports;
};
