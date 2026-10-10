import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { legacyApp, classicScripts, publicSourcesOnly, bundleEcharts } from "./scripts/build/vite-legacy.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

/* 产物沿用原来的目录：js/、css/、libs/fonts/，与本地服务器和部署白名单一致。 */
function assetFileName(asset) {
  const name = asset.names?.[0] || "";
  if (name.endsWith(".css")) return "css/[name]-[hash][extname]";
  if (name.endsWith(".woff2")) return "libs/fonts/[name]-[hash][extname]";
  return "img/[name]-[hash][extname]";
}

export default defineConfig({
  root,
  /* 相对路径：同一份产物既能放在域名根（Vercel），也能放在项目子目录（GitHub Pages）。 */
  base: "./",
  /* img/、feeds/、changes.xml 与 vercel.json 由 build:site 复制，不经 Vite 的 public 目录。 */
  publicDir: false,
  plugins: [
    publicSourcesOnly({ root }),
    vue(),
    legacyApp({ root }),
    /* ECharts 精简包在构建时由 npm 包生成，仓库里不再保存打包后的文件 */
    classicScripts({ root, generated: { "libs/echarts.js": () => bundleEcharts(root, "src/charts/echarts.js") } }),
  ],
  server: {
    host: "127.0.0.1",
    /* Windows 上监听句柄会让 build:site 无法整目录替换 .site-build；产物、测试报告与审计资料都不需要热更新。 */
    watch: { ignored: ["**/.site-*/**", "**/test-results/**", "**/playwright-report/**", "**/audit/**"] },
  },
  build: {
    outDir: ".site-build",
    emptyOutDir: true,
    /* CSP 的 font-src 'self' 不允许 data: 字体；小文件也按独立文件输出。 */
    assetsInlineLimit: 0,
    /* 入口模块含全部价格数据（data.js 约 320KB），迁移期不拆分；Vite 默认的 500KB 提醒只会是噪音。 */
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        entryFileNames: "js/[name]-[hash].js",
        chunkFileNames: "js/[name]-[hash].js",
        assetFileNames: assetFileName,
      },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.js"],
  },
});
