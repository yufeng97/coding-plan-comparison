/* Vite public asset pipeline: source allowlist, content-hashed classic scripts and the generated ECharts bundle. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import publicPaths from "../lib/paths.js";
/* 只允许应用源码、明确登记的公开数据、公共资源与 npm 依赖；data/ 下的维护台账仍属私有输入。 */
const PUBLIC_SOURCES = /^(?:index\.html$|(?:src|node_modules)\/|data\/(?:sources\/(?:data|project-data)|generated\/(?:maintenance-data|benchmark-data|benchmark-summary))\.js$|data\/generated\/(?:feeds\/|changes\.xml$)|public\/img\/)/;
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

/** 发布 URL 与来源目录分离：img/ 来自手写静态资源 public/，变更 RSS（changes.xml、feeds/）来自 data/generated/。
 *  开发时也检查真实路径，不能通过链接读取私有文件。 */
export function publicAssets({ root }) {
  const sourceRoot = (rel) => path.join(root, rel.startsWith("img/") ? "public" : "data/generated");
  return {
    name: "coding-plan:public-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let rel;
        try { rel = decodeURIComponent(String(req.url || "").split("?")[0]).replace(/^\/+/, ""); }
        catch { res.statusCode = 400; res.end(); return; }
        /* Vite 默认以项目根提供静态文件；开发也只开放前端源文件、依赖、虚拟模块及发布 URL。 */
        const allowed = /^(?:(?:index\.html)?$|(?:src|node_modules|js|libs|img|feeds)\/|changes\.xml$|@(?:vite|id|fs)\/|__vite_ping$)/;
        if (!allowed.test(rel) || rel.includes("\\")) { res.statusCode = 403; res.end(); return; }
        if (!/^(?:img\/|feeds\/|changes\.xml$|@(?:vite|id)\/|__vite_ping$)/.test(rel)) {
          const file = rel.startsWith("@fs/") ? rel.slice(4) : path.join(root, rel || "index.html");
          if (fs.existsSync(file)) {
            try {
              if (rel.startsWith("node_modules/")) {
                /* Vite 的依赖缓存位于 node_modules/.vite；其他隐藏段与真实路径越界仍然拒绝。 */
                const realRel = path.relative(fs.realpathSync.native(root), fs.realpathSync.native(file)).split(path.sep).join("/");
                if (!realRel.startsWith("node_modules/") || realRel.split("/").some((part) => part.startsWith(".") && part !== ".vite")) throw new Error("私有依赖路径");
              } else assertPublicSource(root, file);
            } catch { res.statusCode = 403; res.end(); return; }
          }
        }
        if (!/^(?:img\/|feeds\/|changes\.xml$|public\/)/.test(rel)) { next(); return; }
        if (rel.startsWith("public/") || !publicPaths.publicSiteFile(rel) || publicPaths.hiddenSegment(rel) || rel.includes("\\") || rel.includes(":")) { res.statusCode = 403; res.end(); return; }
        const base = sourceRoot(rel);
        const file = path.resolve(base, rel);
        try {
          assertPublicSource(root, file);
          const real = fs.realpathSync.native(file);
          const actual = path.relative(fs.realpathSync.native(base), real).split(path.sep).join("/");
          if (!publicPaths.publicSiteFile(actual) || publicPaths.hiddenSegment(actual) || !fs.statSync(real).isFile()) throw new Error("公共资源不在白名单");
          res.setHeader("Content-Type", file.endsWith(".xml") ? "application/rss+xml; charset=utf-8" : file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.end(fs.readFileSync(file));
        } catch (error) {
          if (error.code === "ENOENT") { next(); return; }
          res.statusCode = 403; res.end();
        }
      });
    },
  };
}

/** 用 npm 里的 ECharts 构建按需精简包（经典脚本，IIFE）。页面接近图表时才插入 <script> 加载：
 *  经典脚本下载失败后可以重新插入重试；Chromium 会缓存失败的动态 import，不能重试，所以不走模块按需加载。 */
export async function bundleEcharts(root, entry) {
  return (await bundleClassicScript(root, entry)).bytes;
}

async function bundleClassicScript(root, entry) {
  const { build } = await import("esbuild");
  const loaded = new Map();
  const result = await build({ absWorkingDir: root, entryPoints: [path.join(root, entry)], bundle: true, minify: true, format: "iife", legalComments: "eof", metafile: true, write: false, logLevel: "silent", plugins: [{
    name: "record-public-inputs",
    setup(builder) {
      builder.onLoad({ filter: /\.(?:[cm]?[jt]sx?|json)$/ }, (args) => {
        assertPublicSource(root, args.path);
        const contents = fs.readFileSync(args.path);
        loaded.set(args.path, contents);
        const extension = path.extname(args.path);
        const loader = extension === ".json" ? "json" : extension.endsWith("tsx") ? "tsx" : extension.endsWith("jsx") ? "jsx" : /\.[cm]?ts$/.test(extension) ? "ts" : "js";
        return { contents, loader, resolveDir: path.dirname(args.path) };
      });
    },
  }] });
  const dependencies = Object.keys(result.metafile.inputs).map((file) => path.resolve(root, file));
  for (const file of dependencies) assertPublicSource(root, file);
  return { bytes: Buffer.from(result.outputFiles[0].contents), dependencies, digest: fingerprint(dependencies, loaded) };
}

/* 使用内容而非 mtime：快速保存、相同字节长度和文件替换也能识别；依赖列表由 esbuild 解析。 */
function fingerprint(dependencies, loaded = undefined) {
  const digest = crypto.createHash("sha256");
  for (const file of dependencies) {
    const contents = loaded ? loaded.get(file) : fs.readFileSync(file);
    if (!contents) throw new Error(`生成脚本的依赖未登记：${file}`);
    digest.update(file); digest.update(contents);
  }
  return digest.digest("hex");
}

/** HTML 中仍按经典脚本加载的文件（主题引导、加载提示、按需数据、template 内的 ECharts）：构建时按内容哈希另存并改写引用。
 * generated: 发布路径 → TypeScript 入口；sources: 发布路径 → 数据源码。开发缓存随入口或依赖内容更新。 */
export function classicScripts({ root, generated = {}, sources = {}, bundle = bundleClassicScript }) {
  /** @type {Map<string, string>} 源路径 → 产物路径 */
  const outputs = new Map();
  let command = "build";
  const read = async (src) => {
    if (generated[src]) return (await bundle(root, generated[src])).bytes;
    const file = path.join(root, sources[src] || src);
    assertPublicSource(root, file);
    return fs.readFileSync(file);
  };
  return {
    name: "coding-plan:classic-scripts",
    configResolved(config) { command = config.command; },
    configureServer(server) {
      const cache = new Map();
      const pending = new Map();
      let generation = 0;
      const invalidate = (file) => {
        generation++;
        let changed = false;
        for (const [src, value] of cache) if (value.dependencies.includes(path.resolve(file))) { cache.delete(src); changed = true; }
        if (changed) server.ws.send({ type: "full-reload" });
      };
      for (const event of ["change", "unlink", "add"]) server.watcher.on(event, invalidate);
      server.httpServer?.once("close", () => { for (const event of ["change", "unlink", "add"]) server.watcher.off(event, invalidate); });
      const generatedBytes = async (src) => {
        const value = cache.get(src);
        try { if (value && value.digest === fingerprint(value.dependencies)) return value.bytes; }
        catch { /* 删除或替换依赖时重新构建，让当前错误传播并可在下一次请求重试。 */ }
        if (!pending.has(src)) {
          const work = (async () => {
            while (true) {
              const started = generation;
              const result = await bundle(root, generated[src]);
              /* 依赖在构建期间保存时，旧结果不能贴上新指纹；事件尚未送达也能用实际读取的字节检测。 */
              if (started !== generation || result.digest !== fingerprint(result.dependencies)) continue;
              cache.set(src, result);
              server.watcher.add(result.dependencies);
              return result.bytes;
            }
          })().finally(() => pending.delete(src));
          pending.set(src, work);
        }
        return pending.get(src);
      };
      server.middlewares.use(async (req, res, next) => {
        let src;
        try { src = decodeURIComponent(String(req.url || "").split("?")[0]).replace(/^\/+/, ""); }
        catch (error) { next(error); return; }
        if (!generated[src] && !sources[src]) { next(); return; }
        try {
          const bytes = generated[src] ? await generatedBytes(src) : await read(src);
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(bytes);
        } catch (error) { next(error); }
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
