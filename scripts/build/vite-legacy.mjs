/* 迁移期 Vite 插件。
 * legacyApp：js/legacy-scripts.json 列出的经典脚本按原顺序合并成两个 ES 模块。
 *   virtual:legacy-lib  除启动脚本外的全部旧脚本。它们共用一个模块作用域，与原来共用全局作用域等价，并导出全部顶层名称；
 *   virtual:legacy-init app-init.js（页面启动），从 lib 导入其余名称。
 *   新代码（src/）按名从 virtual:legacy-lib 导入；只导入 lib 不会启动页面，组件测试据此单独载入旧逻辑。
 * classicScripts：HTML 中保留的经典脚本（主题引导、加载失败提示、按需数据、ECharts）按内容哈希另存并改写引用；ECharts 由 npm 包在构建时生成。 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseSync } from "vite";

export const LEGACY_LIB_ID = "virtual:legacy-lib";
export const LEGACY_INIT_ID = "virtual:legacy-init";

/** @param {string} root @returns {{ lib: string[], init: string }} */
export function readLegacyManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "js", "legacy-scripts.json"), "utf8"));
}

/** 经典脚本的顶层声明（含解构）及其种类；函数体与 IIFE 内的声明不计入。
 * @returns {{ name: string, kind: string }[]} kind 为 const、let、var、function 或 class */
export function topLevelDeclarations(code, filename) {
  const { program, errors } = parseSync(filename, code, { sourceType: "script", lang: "js" });
  if (errors.length) throw new Error(`${filename} 解析失败：${errors[0].message}`);
  const declarations = [];
  const collect = (node, kind) => {
    if (!node) return;
    if (node.type === "Identifier") declarations.push({ name: node.name, kind });
    else if (node.type === "ObjectPattern") node.properties.forEach((p) => collect(p.type === "RestElement" ? p.argument : p.value, kind));
    else if (node.type === "ArrayPattern") node.elements.forEach((element) => collect(element, kind));
    else if (node.type === "RestElement") collect(node.argument, kind);
    else if (node.type === "AssignmentPattern") collect(node.left, kind);
  };
  for (const node of program.body) {
    if (node.type === "VariableDeclaration") node.declarations.forEach((d) => collect(d.id, node.kind));
    else if (node.type === "FunctionDeclaration" && node.id) declarations.push({ name: node.id.name, kind: "function" });
    else if (node.type === "ClassDeclaration" && node.id) declarations.push({ name: node.id.name, kind: "class" });
  }
  return declarations;
}
export function topLevelNames(code, filename) {
  return topLevelDeclarations(code, filename).map((d) => d.name);
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function vlq(value) {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1, out = "";
  do {
    let digit = rest & 31;
    rest >>>= 5;
    if (rest > 0) digit |= 32;
    out += BASE64[digit];
  } while (rest > 0);
  return out;
}

/** 逐行拼接并生成行级 source map：源文件的每一行原样落在生成代码的一行上，调试器能定位到原文件与行号。
 * @param {(string | { file: string, code: string })[]} chunks 字符串是生成的胶水代码，对象是原样拼入的源文件 */
export function concatWithMap(chunks) {
  const lines = [], mappings = [], sources = [], sourcesContent = [];
  let previousSource = 0, previousLine = 0;
  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      for (const line of chunk.split("\n")) { lines.push(line); mappings.push(""); }
      continue;
    }
    const source = sources.push(chunk.file) - 1;
    sourcesContent.push(chunk.code);
    chunk.code.split("\n").forEach((line, index) => {
      lines.push(line);
      mappings.push(vlq(0) + vlq(source - previousSource) + vlq(index - previousLine) + vlq(0));
      previousSource = source;
      previousLine = index;
    });
  }
  return { code: lines.join("\n"), map: { version: 3, sources, sourcesContent, names: [], mappings: mappings.join(";") } };
}

/** @param {{ root: string }} options */
export function legacyApp({ root }) {
  const manifest = readLegacyManifest(root);
  const absolute = (file) => path.join(root, file).split(path.sep).join("/");
  const read = (file) => {
    assertPublicSource(root, path.join(root, file));
    return fs.readFileSync(path.join(root, file), "utf8");
  };
  const libNames = () => {
    const seen = new Map();
    for (const file of manifest.lib) {
      for (const name of topLevelNames(read(file), file)) {
        if (seen.has(name)) throw new Error(`顶层名称 ${name} 在 ${seen.get(name)} 与 ${file} 中重复声明`);
        seen.set(name, file);
      }
    }
    return [...seen.keys()];
  };
  return {
    name: "coding-plan:legacy-app",
    resolveId(id) {
      if (id === LEGACY_LIB_ID || id === LEGACY_INIT_ID) return "\0" + id;
      return null;
    },
    load(id) {
      if (id === "\0" + LEGACY_LIB_ID) {
        const chunks = [];
        for (const file of manifest.lib) {
          this.addWatchFile(path.join(root, file));
          chunks.push(`/* ---- ${file} ---- */`, { file: absolute(file), code: read(file) }, ";");
        }
        chunks.push(`export { ${libNames().join(", ")} };`);
        return concatWithMap(chunks);
      }
      if (id === "\0" + LEGACY_INIT_ID) {
        const file = manifest.init;
        this.addWatchFile(path.join(root, file));
        const code = read(file);
        const own = topLevelNames(code, file);
        const lib = libNames();
        const clash = own.filter((name) => lib.includes(name));
        if (clash.length) throw new Error(`${file} 与旧脚本重复声明：${clash.join(", ")}`);
        /* lib 中引用的启动函数（如 navigateToSection）在用户操作时才调用，启动后挂到全局即可解析。 */
        const libCode = manifest.lib.map(read).join("\n");
        const lateBound = own.filter((name) => new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(libCode));
        return concatWithMap([
          `import { ${lib.join(", ")} } from "${LEGACY_LIB_ID}";`,
          { file: absolute(file), code },
          ";",
          lateBound.length ? `Object.assign(globalThis, { ${lateBound.join(", ")} });` : "",
          `export { ${own.join(", ")} };`,
        ]);
      }
      return null;
    },
  };
}

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
