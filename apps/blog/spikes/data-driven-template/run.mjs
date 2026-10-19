import { mkdir, readFile, writeFile, cp, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(source, "../../../..");
const output = path.join(root, "output/data-driven-template-spike", randomUUID());
const template = path.join(output, "template");
const site = path.join(output, "site");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
await mkdir(template, { recursive: true });
await mkdir(site, { recursive: true });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const common = {
  bundle: true,
  nodePaths: [path.join(root, "apps/desktop/node_modules")],
  tsconfig: path.join(root, "apps/blog/tsconfig.json"),
  logLevel: "warning",
};
// 壳构建不能用 blog tsconfig 的 paths（@tau/editor 的目录映射会盖过包 exports，解析到错误的 index.tsx）
const shellTsconfig = path.join(source, "esbuild.tsconfig.json");

const ARTICLE_TITLE = "数据驱动发布";

// 1. 先冻结模板壳：数据驱动壳不知道任何站点数据与插件实现。
const hostBuild = await build({
  ...common,
  entryPoints: [path.join(source, "shell.tsx")],
  outfile: path.join(template, "shell.js"),
  platform: "browser",
  format: "iife",
  metafile: true,
  tsconfig: shellTsconfig,
  loader: {
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
    ".png": "dataurl",
    ".gif": "dataurl",
    ".less": "empty",
  },
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "process.env.NODE_ENV": '"production"',
  },
});
assert.equal(
  Object.keys(hostBuild.metafile.inputs).some(file => file.endsWith("fixtures/published-editor.tsx")),
  false,
  "壳依赖图不得包含作者实现"
);
const shellBytes = await readFile(path.join(template, "shell.js"));
assert.equal(shellBytes.includes(Buffer.from("example.portable-counter")), false, "壳不含插件节点类型");
assert.equal(shellBytes.includes(Buffer.from(ARTICLE_TITLE)), false, "壳不含站点数据");
const shellHash = digest(shellBytes);
const templateBuiltAt = new Date().toISOString();
await cp(template, path.join(site, "assets"), { recursive: true });
await cp(path.join(source, "entry.html"), path.join(template, "entry.html"));

// 2. 构建作者插件（壳冻结之后）：使用 C23 正式作者夹具，default 导出内含 editorExtensions。
const author = path.join(output, "author");
await mkdir(author, { recursive: true });
await build({
  ...common,
  entryPoints: [path.join(root, "scripts/plugins/fixtures/published-editor.tsx")],
  outfile: path.join(author, "main.js"),
  platform: "browser",
  format: "cjs",
  external: ["@tau/plugins", "@tau/ui", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
});
const pluginCss = ".portable-counter{padding:12px;color:var(--tau-ink-1)}";
await writeFile(path.join(author, "main.css"), pluginCss);
const manifest = {
  formatVersion: 1,
  apiVersion: 1,
  platform: "desktop",
  format: "cjs",
  id: "example.portable-counter",
  name: "可发布计数块",
  description: "验证同一扩展的文档与博客渲染",
  version: "1.0.0",
  main: "main.js",
  styles: "main.css",
  editor: true,
  integrity: {
    "main.js": digest(await readFile(path.join(author, "main.js"))),
    "main.css": digest(pluginCss),
  },
};

// 3. 发布 = 数据打包：写 data/ 文件 + 复制模板资产 + 机械展开入口 HTML。
await build({
  ...common,
  entryPoints: [path.join(source, "publish.ts")],
  outfile: path.join(output, "publish.cjs"),
  platform: "node",
});
const { publishDataDrivenSite } = require(path.join(output, "publish.cjs"));
const siteManifest = await publishDataDrivenSite(site, {
  entryTemplate: path.join(source, "entry.html"),
  site: { title: "数据驱动模板 spike", description: "spike", basePath: "/" },
  articles: [
    {
      id: 1,
      title: ARTICLE_TITLE,
      author: "spike",
      content: [
        { type: "paragraph", children: [{ type: "formatted", text: "正文" }] },
        { type: "example.portable-counter", initial: 7, children: [{ type: "formatted", text: "" }] },
        { type: "paragraph", children: [{ type: "formatted", text: "结尾" }] },
      ],
    },
  ],
  plugins: [
    {
      manifest,
      nodeTypes: ["example.portable-counter"],
      mainFile: path.join(author, "main.js"),
      cssFile: path.join(author, "main.css"),
    },
  ],
});

// 4. 负例入口（机械展开即可生成）与作者目录清理。
await mkdir(path.join(site, "missing"), { recursive: true });
await writeFile(
  path.join(site, "missing/index.html"),
  (await readFile(path.join(source, "entry.html"), "utf8"))
    .replace("__TAU_DATA__", "../data/articles/404.json")
    .replace("__TAU_SHELL__", "../assets/shell.js")
);
await rm(author, { recursive: true });

// 5. 模板与数据分离的静态证据。
assert.equal(digest(await readFile(path.join(site, "assets/shell.js"))), shellHash, "发布未改动模板");
const entryHtml = await readFile(path.join(site, "articles/1/index.html"), "utf8");
assert.equal(entryHtml.includes(ARTICLE_TITLE), false, "入口 HTML 不含文章数据");
assert.equal(entryHtml.includes("pluginRenderers"), false, "插件清单只存在于数据文件");
const inlineHtml = await readFile(path.join(site, "inline/1/index.html"), "utf8");
assert.ok(inlineHtml.includes(ARTICLE_TITLE), "内联对照版包含同一份数据");
const dataJson = JSON.parse(await readFile(path.join(site, "data/articles/1.json"), "utf8"));
assert.equal(dataJson.content.title, ARTICLE_TITLE);
assert.equal(dataJson.pluginRenderers[0].manifest.id, "example.portable-counter");
assert.deepEqual(
  siteManifest.pages.map(page => ({ type: page.type, href: page.href })),
  [{ type: "article", href: "articles/1/" }]
);

// 6. 真实 Chromium 行为验证。
await build({
  ...common,
  entryPoints: [path.join(source, "verify.ts")],
  outfile: path.join(output, "verify.cjs"),
  platform: "node",
  external: ["electron"],
});
const requests = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  requests.push(url.pathname);
  const safeStat = async target => await stat(target).catch(() => null);
  try {
    let file = path.resolve(site, "." + decodeURIComponent(url.pathname));
    const probed = await safeStat(file);
    if (probed?.isDirectory()) file = path.join(file, "index.html");
    if (!file.startsWith(site + path.sep) || !(await safeStat(file))?.isFile()) throw new Error("not file");
    const mime =
      { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" }[
        path.extname(file)
      ] ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": mime + "; charset=utf-8", "Cache-Control": "no-store" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const env = { ...process.env, TAU_DATA_TEMPLATE_SPIKE_DIRECTORY: output, TAU_DATA_TEMPLATE_SPIKE_URL: base };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(output, "verify.cjs")], {
      env,
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("spike 超时"));
    }, 180_000);
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  const browser = JSON.parse(await readFile(path.join(output, "browser-report.json"), "utf8"));
  const report = {
    status: code === 0 && browser.status === "passed" ? "passed" : "failed",
    templateBuiltAt,
    templateSha256: shellHash,
    publishedTemplateSha256: digest(await readFile(path.join(site, "assets/shell.js"))),
    entryHtmlContainsData: false,
    dataFiles: ["data/site.json", "data/articles/1.json"],
    siteManifest,
    dataFetchedOverHttp: ["/data/site.json", "/data/articles/1.json"].every(pathname =>
      requests.includes(pathname)
    ),
    browser,
    requests,
  };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
} finally {
  server.close();
}
