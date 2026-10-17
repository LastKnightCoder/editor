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
const output = path.join(root, "output/plugin-render-spike", randomUUID());
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
const shared = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@tau/plugins",
  "@tau/ui",
];

// 先冻结壳；插件作者的源文件不进入该依赖图。
const hostBuild = await build({
  ...common,
  entryPoints: [path.join(source, "shell.tsx")],
  outfile: path.join(template, "shell.js"),
  platform: "browser",
  format: "iife",
  metafile: true,
  alias: {
    "@blog/services/editorKit": path.join(source, "blog-kit.ts"),
    "@tau/editor": path.join(root, "packages/editor"),
    "@tau/shared": path.join(root, "packages/shared"),
    "@tau/plugins": path.join(root, "packages/plugins/src/index.ts"),
    "@tau/plugins/host": path.join(root, "packages/plugins/src/host.ts"),
  },
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
  Object.keys(hostBuild.metafile.inputs).some(file => file.endsWith("plugin-rendering/author.tsx")),
  false
);
const templateBytes = await readFile(path.join(template, "shell.js"));
assert.equal(templateBytes.includes(Buffer.from("spike.interactive-counter")), false);
const templateHash = digest(templateBytes);
await cp(template, path.join(site, "assets"), { recursive: true });
const templateBuiltAt = new Date().toISOString();

await build({
  ...common,
  entryPoints: [path.join(source, "publish.ts")],
  outfile: path.join(output, "publish.cjs"),
  platform: "node",
});
const { publishPage } = require(path.join(output, "publish.cjs"));
const data = {
  site: { title: "预编译模板", description: "spike", basePath: "/" },
  navigation: [],
  content: {
    id: 1,
    title: "动态插件文章",
    author: "spike",
    tags: [],
    createTime: 0,
    updateTime: 0,
    content: [
      { type: "paragraph", children: [{ type: "formatted", text: "普通段落" }] },
      {
        type: "spike.interactive-counter",
        initial: 7,
        children: [{ type: "formatted", text: "" }],
      },
      { type: "paragraph", children: [{ type: "formatted", text: "结尾" }] },
    ],
  },
  meta: { type: "article", publishTime: 0 },
};
const original = JSON.stringify(data);
const builds = [];
let first;
for (const version of ["1.0.0", "1.1.0"]) {
  const author = path.join(output, "author", version);
  await mkdir(author, { recursive: true });
  const label = `BUILT_AFTER_TEMPLATE_${randomUUID()}`;
  const result = await build({
    ...common,
    entryPoints: [path.join(source, "author.tsx")],
    outfile: path.join(author, "main.js"),
    platform: "browser",
    format: "cjs",
    external: shared,
    metafile: true,
    define: {
      __AUTHOR_LABEL__: JSON.stringify(label),
      __AUTHOR_VERSION__: JSON.stringify(version),
      "process.env.NODE_ENV": '"production"',
    },
  });
  assert.equal(Object.keys(result.metafile.inputs).length, 1);
  assert.equal(templateBytes.includes(Buffer.from(label)), false);
  await writeFile(
    path.join(author, "style.css"),
    ".spike-counter{padding:12px;border:1px solid var(--tau-border);color:var(--tau-ink-1)}"
  );
  const catalog = [
    {
      id: "spike.counter",
      version,
      nodeTypes: ["spike.interactive-counter"],
      main: path.join(author, "main.js"),
      css: path.join(author, "style.css"),
    },
  ];
  if (version === "1.0.0") {
    first = await publishPage(
      site,
      "articles/nested/index.html",
      { mode: "blog", page: data },
      catalog
    );
    await publishPage(site, "desktop/index.html", { mode: "desktop", page: data }, catalog);
    await assert.rejects(
      () => publishPage(site, "unpublished/index.html", { mode: "blog", page: data }, []),
      /缺少节点/
    );
  } else await publishPage(site, "second/index.html", { mode: "blog", page: data }, catalog);
  builds.push({
    version,
    label,
    builtAt: new Date().toISOString(),
    pluginSha256: digest(await readFile(catalog[0].main)),
  });
}
assert.equal(JSON.stringify(data), original);
assert.equal(digest(await readFile(path.join(site, "assets/shell.js"))), templateHash);
await mkdir(path.join(site, "missing"), { recursive: true });
await mkdir(path.join(site, "tampered"), { recursive: true });
const nestedHtml = await readFile(path.join(site, "articles/nested/index.html"), "utf8");
await writeFile(
  path.join(site, "missing/index.html"),
  nestedHtml
    .replaceAll("../../", "../")
    .replace("plugin-assets/spike.counter/1.0.0/main.js", "plugin-assets/absent/main.js")
);
await writeFile(
  path.join(site, "tampered/index.html"),
  nestedHtml.replaceAll("../../", "../").replace(first.plugins[0].sha256, "0".repeat(64))
);
await rm(path.join(output, "author"), { recursive: true });

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
  const file = path.resolve(site, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(site + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not file");
    const mime =
      { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[path.extname(file)] ??
      "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": mime + "; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const env = { ...process.env, TAU_RENDER_SPIKE_DIRECTORY: output, TAU_RENDER_SPIKE_URL: base };
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
    }, 120_000);
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
    status: code === 0 ? "passed" : "failed",
    templateBuiltAt,
    templateSha256: templateHash,
    publishedTemplateSha256: digest(await readFile(path.join(site, "assets/shell.js"))),
    shellHasAuthorDependency: false,
    authorBuilds: builds,
    authorBuildDirectoryRemoved: true,
    missingPluginPublishRejected: true,
    originalContentUnchanged: JSON.stringify(data) === original,
    browser,
    requests,
  };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
  if (code !== 0) process.exitCode = 1;
} finally {
  server.close();
}
