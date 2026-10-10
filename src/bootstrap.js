/* 必须在旧脚本之前执行：旧脚本用 appState() 声明的状态由此成为 Vue 响应式对象，组件与旧代码读写同一份数据。 */
import { reactive } from "vue";

globalThis.__codingPlanState = reactive;
