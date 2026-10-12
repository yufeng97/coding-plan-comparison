/* Vitest 在每个测试文件之前执行（vite.config.mjs 的 test.setupFiles）。
 * Vue 开发版在没有 devtools 时先缓存事件（含组件实例），3 秒后的计时器才确认没有 devtools 并清空；
 * 假计时器会清掉这个计时器，缓存就一直增长。提前给出空的 devtools 钩子，Vue 直接把事件交给它。 */
(globalThis as { __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__VUE_DEVTOOLS_GLOBAL_HOOK__ = { emit() {}, on() {}, off() {}, once() {} };
