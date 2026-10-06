# libs/ — 第三方产物与来源

本目录只放「别人的东西」，自研代码不要放这里。内容自证如下：

## echarts.min.js（约 519KiB）

- **版本**：ECharts 6.1.0，**按需精简构建**（不是官方完整版）——只含 BarChart + Grid / Tooltip / Legend / Title / AxisPointer 组件与 CanvasRenderer；升级包含上游安全修复。
- **重建**：在项目根目录运行 `npm ci`、`npm run vendor:echarts`、`npm run bump`。ECharts 6.1.0 与 esbuild 0.28.2 精确锁定，入口在 `scripts/build/echarts-entry.mjs`，产物带上游许可证注释。
- **要完整版时**：从 `echarts@6.1.0` 包的 `dist/echarts.min.js` 取回（页面用不到全量组件）。
- 修改页面图表时若用到新组件/图表类型，先在入口 `scripts/build/echarts-entry.mjs` 里补注册再重建。
- **页面加载**：地址保留在 `index.html` 的 `chartLibraryTemplate` 中，首屏不执行。接近图表或导航到相关章节时由 `app-core.js` 加载一次；失败可局部重试，文字明细先行显示。公共资源工具仍会发现 template 内的脚本，给它生成缓存版本并复制到部署产物。

## fonts/（Manrope + IBM Plex Mono 子集）

- `gf-*.woff2`（当前 21 个）是 Google Fonts 按 unicode-range 切的子集，文件名使用字节内容的 SHA-256；页面按需加载，不是全量。不同字重和 URL 返回相同字节时共用一份资产，CSS 中的字重与 unicode-range 映射保持完整。
- 2026-10-06 根据仓库中的原始字节离线去重，39 个文件合并为 21 个，字体总大小从 452,796 字节降至 227,880 字节（减少约 49.7%）；未重新下载或改变字体内容。
- 家族与字重：Manrope 500/600/700/800、IBM Plex Mono 400/500/600（`display=swap`）。
- **更新**：`npm run vendor:fonts`（需要联网），然后 `npm run bump`。下载在独立暂存目录中完成，全部 WOFF2 校验成功后才替换整组文件；网络或替换失败时保留/恢复旧字体。新字体文件名含内容哈希，旧子集随成功替换清理。CSS 内本地 URL 的 `?v=` 也由缓存工具维护。
- 图标在此**没有**字体文件：Remix Icon 已替换为内联 SVG（见 `js/app-core.js` 的 `ICON_SVG`）。

## 许可证

- ECharts：Apache-2.0
- Manrope：OFL；IBM Plex Mono：OFL
