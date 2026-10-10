/* 必须在旧脚本之前执行：旧脚本用 appState() 声明的状态由此成为 Vue 响应式对象，组件与旧代码读写同一份数据。 */
import { reactive } from "vue";

/* reactive 返回的代理与原对象同形，按旧脚本声明的工厂类型登记（js/globals.d.ts） */
globalThis.__codingPlanState = /** @type {typeof globalThis.__codingPlanState} */ (/** @type {unknown} */ (reactive));
