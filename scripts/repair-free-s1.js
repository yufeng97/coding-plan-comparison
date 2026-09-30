// 一次性修复脚本：重建 free（免费入口）与 s1（个人订阅价格全景）两个区块
const fs = require("fs");
const FILE = "D:/workbuddy/coding-plan-comparison/index.html";
let s = fs.readFileSync(FILE, "utf8");

// 1) 定位被串位的区块：从 "Section 5: 免费入口" 注释到 id="free" 的 </section>
const blockStart = s.indexOf("<!-- ======== Section 5: 免费入口 ======== -->");
if (blockStart < 0) throw new Error("免费入口注释未找到");
const freeSecStart = s.indexOf('<section class="section" id="free">');
const blockEnd = s.indexOf("</section>", freeSecStart) + "</section>".length;
const block = s.slice(blockStart, blockEnd);
if (!block.includes("chartPersonal")) throw new Error("块内容校验失败（应含 s1 残留）");

// 2) 重建：免费入口区块 + 个人订阅价格全景区块（顺序：free 在前，s1 在后）
const freeBlock = `<!-- ======== Section 5: 免费入口 ======== -->
  <section class="section" id="free">
    <div class="section-head">
      <h2><span class="sec-no">04</span>免费 Coding 入口</h2>
      <p>零成本上手方案：官方免费 CLI 额度与工具免费档（部分需自备 API Key，即 BYOK）。</p>
    </div>
    <div class="free-grid" id="freeGrid"></div>
  </section>`;

const s1Block = block
  .replace("<!-- ======== Section 5: 免费入口 ======== -->", "<!-- ======== Section 1: 个人订阅价格全景 ======== -->")
  .replace('<section class="section" id="free">', '<section class="section" id="s1">')
  .replace('<h2><span class="sec-no">05</span>个人订阅价格全景</h2>', '<h2><span class="sec-no">05</span>个人订阅价格全景</h2>');

// 3) 替换回去
s = s.slice(0, blockStart) + freeBlock + "\n\n" + s1Block + s.slice(blockEnd);

fs.writeFileSync(FILE, s);
console.log("修复完成");
