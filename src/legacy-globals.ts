/* 浏览器回归与控制台调试兼容层：通过只读 getter 访问 TypeScript 模块的实时导出。
 * 浏览器自带的同名属性保持不变；启动模块挂到全局的函数（值与导出相同）改为 getter。浏览器测试改为只读 DOM 后删除本文件。 */
import * as lib from "@domain/runtime";

for (const namespace of [lib] as Record<string, unknown>[]) {
  for (const name of Object.keys(namespace)) {
    const own = Object.getOwnPropertyDescriptor(window, name);
    const ours = !!own && "value" in own && own.value === namespace[name];
    if (!ours && name in window) continue;
    Object.defineProperty(window, name, { configurable: true, enumerable: false, get: () => namespace[name] });
  }
}
