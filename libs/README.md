# libs/ — 第三方产物与来源

本目录只放「别人的东西」，自研代码不要放这里。内容自证如下：

## echarts.min.js（约 519KiB）

- **版本**：ECharts 6.1.0，**按需精简构建**（不是官方完整版）——只含 BarChart + Grid / Tooltip / Legend / Title / AxisPointer 组件与 CanvasRenderer；升级包含上游安全修复。
- **重建**：在项目根目录运行 `npm ci`、`npm run vendor:echarts`、`npm run bump`。ECharts 6.1.0 与 esbuild 0.28.2 精确锁定，入口在 `scripts/echarts-entry.mjs`，产物带上游许可证注释。
- **要完整版时**：从 `echarts@6.1.0` 包的 `dist/echarts.min.js` 取回（页面用不到全量组件）。
- 修改页面图表时若用到新组件/图表类型，先在入口 `scripts/echarts-entry.mjs` 里补注册再重建。

## fonts/（Manrope + IBM Plex Mono 子集）

- `gf-*.woff2`（当前 39 个）是 Google Fonts 按 unicode-range 切的子集，编号对应 `fonts.css` 里的 `@font-face` 映射；页面按需加载，不是全量。每次更新的切片数量以下载结果为准。
- 家族与字重：Manrope 500/600/700/800、IBM Plex Mono 400/500/600（`display=swap`）。
- **更新**：`npm run vendor:fonts`（需要联网），然后 `npm run bump`。下载在独立暂存目录中完成，全部 WOFF2 校验成功后才替换整组文件；网络或替换失败时保留/恢复旧字体。新字体文件名含内容哈希，旧子集随成功替换清理。CSS 内本地 URL 的 `?v=` 也由缓存工具维护。
- 图标在此**没有**字体文件：Remix Icon 已替换为内联 SVG（见 `js/app-core.js` 的 `ICON_SVG`）。

## 许可证

- ECharts：Apache-2.0
- Manrope：OFL；IBM Plex Mono：OFL
