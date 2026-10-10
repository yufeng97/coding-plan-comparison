/* Vite 入口。导入顺序就是执行顺序：状态工厂 → 旧脚本与已迁移的 Vue 区块 → 页面启动 → 迁移期兼容层。 */
import "./bootstrap.js";
import "./sections/mount.js";
import "virtual:legacy-init";
import "./legacy-globals.js";
