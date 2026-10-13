<script setup lang="ts">
/* 额度深度对比下方的方法论：官方未公布用量时「≈估」行的六种推算方法与三个注意事项。纯静态说明。 */
</script>
<template>
  <details class="method-box">
    <summary>方法论：官方没公布用量时，这些「≈估」行是怎么推算出来的？（6 种方法 + 3 个坑）</summary>
    <ol>
      <li><b>本地日志实测</b>（置信中高）—— Claude Code / Codex 的本地 JSONL 日志记录了每次请求的 input / output / cache tokens；用 <code>ccusage</code> 等工具持续跑任务直到触发限额，累计即为实际配额。社区实测结果：Claude Pro ≈ 10–45 prompts/5h、Max 20x ≈ 200–900 prompts/5h。</li>
      <li><b>官方倍率 + 锚点</b>（置信中）—— 厂商不公布绝对值但公布相对倍率（Max = 5× Pro、Pro 20x = 20× Plus）。只需实测一档作锚点，全系列按倍率换算。</li>
      <li><b>Credits 公式逆向</b>（置信高）—— 智谱公开积分公式 (输入×6.9 + 缓存×1.7 + 输出×24)/10000，已知 credits、输入输出比与缓存率即可精确解出 tokens（官方自己的"每周 48–104M 估算"就是这么来的）；美元制额度（OpenCode Go、Command Code）用 模型单价 直接换算。</li>
      <li><b>仪表差值</b>（置信中）—— Cursor 显示用量百分比、Copilot 显示 credits 计数、Devin 显示配额条。发送几个已知大小的请求，记录仪表增量，拟合出 100% 对应的总量。</li>
      <li><b>社区众包</b>（置信中）—— coding-plan.org、ccusage 聚合统计、Reddit 实测帖；多人取中位数可削掉个体任务差异。</li>
      <li><b>商业毛利反推</b>（置信低）—— 订阅厂商通常给用户 3–10 倍于月费的 API 价值：tokens ≈ 月费 × (3–10) ÷ 模型混合单价。Kimi Code Plan、Google AI Pro、Devin 等采用此法。</li>
    </ol>
    <p><b>三个坑</b>：① 高峰期动态限流——同账号不同天实测可差 2–3 倍，所以估算给区间不给单值；② 缓存命中率因任务而异（95% 是官方乐观值，碎片化任务可能只有 80%）；③ 故意快速触发限流可能违反 ToS / 触发风控，实测需克制。表中「≈估」行的倍率按区间保守下限计算，每 M 成本取中值。</p>
  </details>
</template>
