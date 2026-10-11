# src/assets/ — 第三方资产与来源

本目录保存第三方字体等应用静态资产；自研程序归属 src/ 下对应模块。ECharts 通过 npm 在构建时生成，来源与许可证记录如下：

## ECharts（构建时生成，不在本目录）

- 发布产物里的 `libs/echarts-<hash>.js` 由构建从 npm 包 `echarts`（版本见 package.json）生成，**按需精简**：只含 BarChart + Grid / Tooltip / Legend / Title / AxisPointer 组件与 CanvasRenderer，产物带上游许可证注释。仓库不再保存打包后的文件，依赖更新随下次构建生效。
- 入口在 `src/entries/echarts.ts`；页面用到新的图表类型或组件时，先在入口里注册。
- **构建与页面加载**：`scripts/build/vite-assets.mjs` 从 npm 生成并按内容哈希命名；地址保留在 `index.html` 的 `chartLibraryTemplate` 中，首屏不执行。接近图表或导航到相关章节时由 `src/application/runtime.ts` 的加载器插入脚本，Vue 图表组件负责绘制与销毁；失败可局部重试，文字明细先行显示。Vue 服务端渲染不下载或运行 ECharts。

## fonts/（Manrope + IBM Plex Mono 子集）

- `fonts/gf-*.woff2`（当前 21 个）是 Google Fonts 按 unicode-range 切的子集，文件名使用字节内容的 SHA-256；页面按需加载，不是全量。不同字重和 URL 返回相同字节时共用一份资产，CSS 中的字重与 unicode-range 映射保持完整。
- 2026-10-06 根据仓库中的原始字节离线去重，39 个文件合并为 21 个，字体总大小从 452,796 字节降至 227,880 字节（减少约 49.7%）；未重新下载或改变字体内容。
- 家族与字重：Manrope 500/600/700/800、IBM Plex Mono 400/500/600（`display=swap`）。
- **更新**：`npm run vendor:fonts`（需要联网）。下载在独立暂存目录中完成，全部 WOFF2 校验成功后才替换整组文件；网络或替换失败时保留/恢复旧字体。新字体文件名含内容哈希，旧子集随成功替换清理。 源码在 `src/assets/fonts/`；构建时 Vite 按内容哈希重新命名并发布到 `libs/fonts/`。
- 图标在此**没有**字体文件：Remix Icon 已替换为内联 SVG（见 `src/application/runtime.ts` 的 `ICON_SVG` 与 Vue 模板）。

## 许可证

- ECharts：Apache-2.0
- Manrope：OFL；IBM Plex Mono：OFL
