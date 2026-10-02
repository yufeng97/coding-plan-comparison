# libs/ — 第三方产物与来源

本目录只放「别人的东西」，自研代码不要放这里。内容自证如下：

## echarts.min.js（493KB）

- **版本**：ECharts 5.5.1，**按需精简构建**（不是官方完整版）——只含 BarChart + Grid / Tooltip / Legend / Title / AxisPointer 组件与 CanvasRenderer。
- **重建**：`npx esbuild scripts/echarts-entry.mjs --bundle --minify --format=iife --outfile=libs/echarts.min.js`（临时目录里 `npm i echarts@5.5.1 esbuild`），然后 `npm run bump`。
- **要完整版时**：从 `echarts@5.5.1` 包的 `dist/echarts.min.js` 取回（约 1MB，页面用不到）。
- 修改页面图表时若用到新组件/图表类型，先在入口 `scripts/echarts-entry.mjs` 里补注册再重建。

## fonts/（Manrope + IBM Plex Mono 子集）

- `gf-*.woff2`（40 个）是 Google Fonts 按 unicode-range 切的子集，编号对应 `fonts.css` 里的 `@font-face` 映射；页面按需加载，不是全量。
- 家族与字重：Manrope 500/600/700/800、IBM Plex Mono 400/500/600（`display=swap`）。
- **更新**：`node scripts/vendor-fonts.js`（需要联网；按 Google Fonts 当前切片重新下载并回写 fonts.css）。
- 图标在此**没有**字体文件：Remix Icon 已替换为内联 SVG（见 `js/app-core.js` 的 `ICON_SVG`）。

## 许可证

- ECharts：Apache-2.0
- Manrope：OFL；IBM Plex Mono：OFL
