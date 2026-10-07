/* 自动生成：npm run benchmark:build */
const BENCHMARKS = {
  "schemaVersion": 1,
  "tasks": [
    {
      "id": "cached-cost",
      "version": 1,
      "title": "修复缓存输入计费",
      "description": "修复缓存命中 tokens 重复计费，校验非法输入，保留纯函数接口。只编辑 solution.cjs。",
      "acceptance": "固定公开验收：缓存/非缓存、全命中、零用量，以及每个数量/价格的负数、非有限与缺失值。",
      "fixture": "cached-cost",
      "fixtureHash": "0da606a00951ae9aaea25f88194766eb9f82a385e288fcefc6a83b620307f495"
    },
    {
      "id": "csv-export",
      "version": 1,
      "title": "实现可靠的 CSV 导出",
      "description": "实现 encodeCSV(rows)，正确处理引号、逗号、换行和空值；防止以公式字符开头的单元格被电子表格执行。只编辑 solution.cjs。",
      "acceptance": "6 项验收：标准 CSV 转义、空值、换行、公式前缀及二维输入检查。",
      "fixture": "csv-export",
      "fixtureHash": "b26f56dd058829ac4e75c0627a1701a32e95a6a7de049c2e5539215f5c9d9f8a"
    },
    {
      "id": "url-state",
      "version": 1,
      "title": "实现 URL 筛选状态往返",
      "description": "实现 encode/decode：budget 为 any/50/100，region 为 all/cn/intl；未知值回退 any/all，忽略额外参数并支持中文 search。只编辑 solution.cjs。",
      "acceptance": "5 项验收：默认值、有效筛选、中文往返、无效输入及未知参数。",
      "fixture": "url-state",
      "fixtureHash": "75a8142287de1c6b991aa6dcd707a1863ac1cbef0ea4610a213d43e371def674"
    }
  ],
  "runs": [],
  "methodology": "固定任务与版本；同一解答在独立暂存目录重复验收至少 3 次，不代表独立模型尝试。生成耗时由贡献者记录，验收运行耗时单独展示；费用为生成该解答的真实 API 账单金额，订阅内/未知不记零。记录由贡献者提供并经维护者审核；不同工具、任务、版本和费用口径分别比较。",
  "generatedAt": "2026-10-08"
};
