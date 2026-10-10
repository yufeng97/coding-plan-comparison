/* 迁移期兼容层：旧脚本原本是全局声明，现有浏览器测试与控制台调试通过 window 读取它们。
 * 这里把旧脚本的顶层名称以只读 getter 挂到 window，读到的是模块里的实时绑定。
 * 浏览器自带的同名属性保持不变；启动模块挂到全局的函数（值与导出相同）改为 getter。浏览器测试改为只读 DOM 后删除本文件。 */
import * as lib from "virtual:legacy-lib";
import * as init from "virtual:legacy-init";

for (const namespace of [lib, init]) {
  for (const name of Object.keys(namespace)) {
    const own = Object.getOwnPropertyDescriptor(window, name);
    const ours = !!own && "value" in own && own.value === namespace[name];
    if (!ours && name in window) continue;
    Object.defineProperty(window, name, { configurable: true, enumerable: false, get: () => namespace[name] });
  }
}
