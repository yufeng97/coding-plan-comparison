/* Vite public asset pipeline: source allowlist, content-hashed classic scripts and the generated ECharts bundle. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
/* 能进入产物的源文件位置：入口、新代码、旧脚本、样式、第三方产物、图片与依赖包。 */
const PUBLIC_SOURCES = /^(?:index\.html$|(?:src|js|css|libs|img|node_modules)\/)/;
/** 词法路径与真实路径（展开链接、短名后）都须在项目内的公共源目录中，且不含隐藏段；
 *  防止经 junction / 符号链接把 audit/、scripts/ 等私有文件打进发布产物。 */
export function assertPublicSource(root, file) {
  const rootReal = fs.realpathSync.native(root);
  for (const [base, target] of [[root, file], [rootReal, fs.realpathSync.native(file)]]) {
    const rel = path.relative(base, target).split(path.sep).join("/");
    const hidden = rel.split("/").some((segment) => segment.startsWith("."));
    if (!rel || rel.startsWith("../") || path.isAbsolute(rel) || hidden || !PUBLIC_SOURCES.test(rel)) {
      throw new Error(`构建引用了公共目录以外的文件：${rel || file}`);
    }
  }
}

/** 构建时检查进入产物的每个源文件：模块在读入时检查，样式里引用的字体、图片等资源在产出时按原始文件检查。 */
export function publicSourcesOnly({ root }) {
  const check = (id) => {
    if (!id || id.startsWith("\0")) return;
    const file = id.split("?")[0];
    if (path.isAbsolute(file) && fs.existsSync(file)) assertPublicSource(root, file);
  };
  return {
    name: "coding-plan:public-sources-only",
    apply: "build",
    enforce: "pre",
    load(id) { check(id); return null; },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        const sources = output.type === "chunk" ? output.moduleIds : output.originalFileNames || [];
        for (const source of sources) check(path.isAbsolute(source) ? source : path.join(root, source));
      }
    },
  };
}

const CLASSIC_SCRIPT_RE = /(<script\b[^>]*?\bsrc=")((?:js|libs)\/[\w./-]+\.js)(")/g;

/** 用 npm 里的 ECharts 构建按需精简包（经典脚本，IIFE）。页面接近图表时才插入 <script> 加载：
 *  经典脚本下载失败后可以重新插入重试；Chromium 会缓存失败的动态 import，不能重试，所以不走模块按需加载。 */
export async function bundleEcharts(root, entry) {
  const { build } = await import("esbuild");
  const result = await build({ entryPoints: [path.join(root, entry)], bundle: true, minify: true, format: "iife", legalComments: "eof", write: false, logLevel: "silent" });
  return Buffer.from(result.outputFiles[0].contents);
}

/** HTML 中仍按经典脚本加载的文件（主题引导、加载提示、按需数据、template 内的 ECharts）：构建时按内容哈希另存并改写引用。
 *  generated 登记构建时生成、仓库里没有源文件的脚本（路径 → 生成函数）；开发服务器按需生成并缓存，其余直接读源文件。 */
export function classicScripts({ root, generated = {} }) {
  /** @type {Map<string, string>} 源路径 → 产物路径 */
  const outputs = new Map();
  let command = "build";
  const read = async (src) => {
    if (generated[src]) return generated[src]();
    assertPublicSource(root, path.join(root, src));
    return fs.readFileSync(path.join(root, src));
  };
  return {
    name: "coding-plan:classic-scripts",
    configResolved(config) { command = config.command; },
    configureServer(server) {
      const cache = new Map();
      server.middlewares.use((req, res, next) => {
        const src = decodeURIComponent(String(req.url || "").split("?")[0]).replace(/^\/+/, "");
        if (!generated[src]) { next(); return; }
        if (!cache.has(src)) cache.set(src, generated[src]());
        cache.get(src).then((bytes) => {
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.end(bytes);
        }, next);
      });
    },
    async buildStart() {
      if (command !== "build") return;
      outputs.clear();
      const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
      for (const [, , src] of html.matchAll(CLASSIC_SCRIPT_RE)) {
        if (outputs.has(src)) continue;
        const bytes = await read(src);
        const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);
        const fileName = src.replace(/\.js$/, `-${hash}.js`);
        outputs.set(src, fileName);
        this.emitFile({ type: "asset", fileName, source: bytes });
      }
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (command !== "build") return html;
        return html.replace(CLASSIC_SCRIPT_RE, (_match, before, src, after) => {
          if (!outputs.has(src)) throw new Error(`经典脚本 ${src} 未在构建开始时登记`);
          return before + outputs.get(src) + after;
        });
      },
    },
  };
}
