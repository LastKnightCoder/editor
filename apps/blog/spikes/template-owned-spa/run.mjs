import { mkdir, readFile, writeFile, readdir, cp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { publishData, sha256, serialize } from "./publish.mjs";
import { serveSite } from "./server.mjs";
import { checkProtocol } from "./protocol-checks.mjs";

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(source, "../../../..");
const blogRequire = createRequire(path.join(root, "apps/blog/package.json"));
const devRequire = createRequire(path.join(root, "apps/desktop/package.json"));
const { build: bundle } = devRequire("esbuild");
const vite = await import(
  pathToFileURL(
    path.join(path.dirname(blogRequire.resolve("vite/package.json")), "dist/node/index.js")
  ).href
);
const output = path.join(root, "output/template-owned-spa-spike", randomUUID());
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "package.json"), '{"type":"module"}');
const servers = [];
const cases = [];

async function files(directory, prefix = "") {
  const result = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + item.name;
    if (item.isDirectory())
      Object.assign(result, await files(path.join(directory, item.name), relative + "/"));
    else result[relative] = sha256(await readFile(path.join(directory, item.name)));
  }
  return result;
}

async function buildTemplate(mode) {
  const directory = path.join(output, `frozen-${mode}`);
  let modules = [];
  await vite.build({
    configFile: false,
    envFile: false,
    publicDir: false,
    root: path.join(source, "template"),
    base: "./",
    cacheDir: path.join(output, `cache-${mode}`),
    define: { __TEMPLATE_MODE__: JSON.stringify(mode) },
    resolve: {
      alias: [{ find: /^react-router-dom$/, replacement: devRequire.resolve("react-router-dom") }],
    },
    esbuild: { jsx: "automatic" },
    logLevel: "warn",
    plugins: [
      {
        name: "template-owned-spike-audit",
        enforce: "post",
        transformIndexHtml: {
          order: "post",
          handler: html => html.replaceAll('"./assets/', '"__TAU_BASE__assets/'),
        },
        generateBundle() {
          modules = [...this.getModuleIds()];
          this.emitFile({
            type: "asset",
            fileName: "deployment.json",
            source: serialize({ historyFallback: mode === "path" }),
          });
        },
      },
    ],
    build: { outDir: directory, emptyOutDir: true, assetsInlineLimit: 0, target: "es2022" },
  });
  for (const id of modules) {
    if (id.startsWith("\0") || id.includes("/node_modules/") || !path.isAbsolute(id)) continue;
    assert(id.startsWith(path.join(source, "template") + path.sep), `模板意外导入外部实现：${id}`);
  }
  const snapshot = await files(directory);
  for (const name of Object.keys(snapshot).filter(name => name.endsWith(".js"))) {
    const bytes = await readFile(path.join(directory, name), "utf8");
    assert(!bytes.includes("example.portable-counter") && !bytes.includes("模板自己的文章页面"));
  }
  return { directory, snapshot, modules };
}

async function buildHelper() {
  const directory = path.join(output, "helper");
  const built = await bundle({
    entryPoints: [path.join(source, "protocol/client.ts")],
    outdir: directory,
    bundle: true,
    format: "esm",
    splitting: true,
    platform: "browser",
    target: "es2022",
    entryNames: "tau-publish-data",
    chunkNames: "chunks/[name]-[hash]",
    minify: true,
    metafile: true,
    tsconfig: path.join(source, "tsconfig.json"),
  });
  for (const id of Object.keys(built.metafile.inputs)) {
    assert(
      !/\/template\/|\/apps\/desktop\/src|\/apps\/blog\/src|\/react(?:-dom)?\//.test(id),
      `数据工具含渲染依赖：${id}`
    );
  }
  const snapshot = await files(directory);
  return {
    directory,
    digest: sha256(serialize(snapshot)),
    modules: Object.keys(built.metafile.inputs),
  };
}

async function buildPlugin() {
  const directory = path.join(output, "author-stage");
  await mkdir(directory);
  await bundle({
    entryPoints: [path.join(root, "scripts/plugins/fixtures/published-editor.tsx")],
    outfile: path.join(directory, "main.js"),
    bundle: true,
    format: "cjs",
    platform: "browser",
    jsx: "automatic",
    target: "es2022",
    tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
    external: ["@tau/plugins", "@tau/ui", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  });
  const code = await readFile(path.join(directory, "main.js"));
  const css = Buffer.from(".portable-counter { padding: 12px; }");
  return {
    code,
    css,
    directory,
    manifest: {
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      format: "cjs",
      editor: true,
      id: "example.portable-counter",
      name: "可发布计数块",
      version: "1.0.0",
      main: "main.js",
      styles: "main.css",
      integrity: { "main.js": sha256(code), "main.css": sha256(css) },
    },
  };
}

async function assemble(name, frozen, helper, plugin, basePath, title) {
  const directory = path.join(output, name);
  await cp(frozen.directory, directory, { recursive: true });
  const packet = await publishData(directory, { basePath, plugin, title });
  const helperPath = `_tau/client/${helper.digest}/`;
  await cp(helper.directory, path.join(directory, helperPath), { recursive: true });
  const html = (await readFile(path.join(directory, "index.html"), "utf8"))
    .replaceAll("__TAU_MANIFEST__", basePath + packet.manifestPath)
    .replaceAll("__TAU_CLIENT__", basePath + helperPath)
    .replaceAll("__TAU_BASE__", basePath);
  assert(!/__TAU_[A-Z]+__/.test(html));
  assert(!html.includes("pluginRenderers") && !html.includes("模板自己的文章页面"));
  await writeFile(path.join(directory, "index.html"), html);
  const published = await files(directory);
  for (const [name, hash] of Object.entries(frozen.snapshot)) {
    if (name !== "index.html") assert.equal(published[name], hash, `发布修改了模板资产：${name}`);
  }
  const deployment = JSON.parse(await readFile(path.join(directory, "deployment.json"), "utf8"));
  const slow = packet.manifest.items.find(item => item.key === "article:3");
  const server = await serveSite({
    directory,
    basePath,
    historyFallback: deployment.historyFallback,
    delayedFiles: new Set(["data/" + slow.data]),
  });
  servers.push(server);
  return { directory, packet, server };
}

async function runElectron(config) {
  const configFile = path.join(output, "verification.json");
  await writeFile(configFile, serialize(config));
  const env = { ...process.env, TAU_SPA_SPIKE_CONFIG: configFile };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(devRequire("electron"), [path.join(source, "verify.cjs")], {
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostics = "";
    child.stderr.on("data", bytes => {
      diagnostics = (diagnostics + bytes).slice(-12000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("浏览器行为验证超时\n" + diagnostics));
    }, 120000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`Electron 验证失败 (${code})\n${diagnostics}`));
    });
  });
  return JSON.parse(await readFile(path.join(output, "browser-report.json"), "utf8"));
}

try {
  console.log("构建两份模板并冻结资产……");
  const pathTemplate = await buildTemplate("path");
  const hashTemplate = await buildTemplate("hash");
  cases.push("Vite 模板独立构建，依赖图不含官方模板、数据工具实现或未知插件");
  const helper = await buildHelper();
  const plugin = await buildPlugin();
  cases.push("数据工具单独构建，无渲染依赖；真实 C23 夹具在模板冻结后单独编译");
  const main = await assemble("site-path", pathTemplate, helper, plugin, "/notes/");
  const alternative = await assemble("site-hash", hashTemplate, helper, plugin, "/notes/");
  const rootSite = await assemble("site-root", pathTemplate, helper, plugin, "/");
  const updated = await assemble(
    "site-updated",
    pathTemplate,
    helper,
    plugin,
    "/notes/",
    "只有数据变化后的标题"
  );
  assert.deepEqual(main.packet.files, alternative.packet.files);
  const updatedFiles = Object.entries(main.packet.files)
    .filter(([name, hash]) => updated.packet.files[name] !== hash)
    .map(([name]) => name);
  for (const item of main.packet.manifest.items)
    if (item.key !== "article:1") {
      const next = updated.packet.manifest.items.find(next => next.key === item.key);
      assert.equal(item.data, next.data);
      assert.equal(item.integrity, next.integrity);
    }
  assert(
    updatedFiles.every(
      name =>
        name.startsWith("data/articles/1.") ||
        name.startsWith("data/search.") ||
        name.startsWith("data/site.")
    )
  );
  assert(
    Object.keys(main.packet.files)
      .filter(name => name.endsWith(".css") && name.startsWith("data/"))
      .every(name => /^data\/styles\/[a-f0-9]{64}\.css$/.test(name))
  );
  cases.push("两个模板复用逐字节相同的数据包；单条修改不重写无关 JSON；CSS 仅按摘要命名");

  const corruptDirectory = path.join(output, "site-corrupt");
  await cp(main.directory, corruptDirectory, { recursive: true });
  const pluginFile = Object.keys(main.packet.files).find(name => name.endsWith("/entry.js"));
  await writeFile(path.join(corruptDirectory, pluginFile), "module.exports.default = {};");
  const corrupt = await serveSite({
    directory: corruptDirectory,
    basePath: "/notes/",
    historyFallback: true,
  });
  servers.push(corrupt);
  await rm(plugin.directory, { recursive: true });
  cases.push("作者临时构建目录删除，站点只使用已复制产物；发布阶段未修改模板 JS/CSS");

  console.log("验证纯数据协议和失败路径……");
  const { createClient } = await import(
    pathToFileURL(path.join(helper.directory, "tau-publish-data.js")).href
  );
  const protocolCases = await checkProtocol(createClient, main.server.url, main.packet);
  console.log("验证隐藏 Electron 中的 Router、插件交互和模板预览……");
  const browser = await runElectron({
    output,
    pathUrl: main.server.url,
    hashUrl: alternative.server.url,
    rootUrl: rootSite.server.url,
    updatedUrl: updated.server.url,
    corruptUrl: corrupt.url,
  });
  assert(
    !alternative.server.requests.some(
      request => request.path.includes("/_tau/client/") || request.path.includes("/plugin-assets/")
    )
  );
  cases.push("摘要模板直接 fetch，不下载数据工具或内容插件，仍能导航和搜索");
  for (const site of [main, alternative, rootSite, updated]) {
    const names = Object.keys(await files(site.directory));
    assert.deepEqual(
      names.filter(name => name.endsWith(".html")),
      ["index.html"]
    );
  }
  cases.push("所有站点只有作者提供的 index.html，宿主没有按内容生成公开页面");
  const report = {
    status: "passed",
    output,
    cases,
    protocolCases,
    browser,
    changedDataFiles: updatedFiles,
    helperModules: helper.modules,
    templateModules: { path: pathTemplate.modules, hash: hashTemplate.modules },
    dataManifest: main.packet.manifest,
    sites: {
      path: main.directory,
      hash: alternative.directory,
      root: rootSite.directory,
      updated: updated.directory,
    },
    requests: {
      path: main.server.requests,
      hash: alternative.server.requests,
      root: rootSite.server.requests,
    },
    limitations: [
      "使用六类结构夹具，不接正式数据库/发布 UI/插件中心",
      "模板内依赖适配仅覆盖本次计数夹具所用 API，不代表完整公开 SDK 已可运行",
      "History 回退由实验静态服务器按模板部署要求开启",
      "只做结构、网络与行为验证，不做视觉验收",
    ],
  };
  await writeFile(path.join(output, "report.json"), serialize(report));
  console.log(
    serialize({
      status: report.status,
      output,
      structuralCases: cases.length,
      protocolCases: protocolCases.length,
      browserCases: browser.cases.length,
    })
  );
} catch (error) {
  await writeFile(
    path.join(output, "report.json"),
    serialize({ status: "failed", output, cases, error: String(error), stack: error.stack })
  );
  console.error(error);
  console.error(`报告目录：${output}`);
  process.exitCode = 1;
} finally {
  await Promise.all(servers.map(server => server.close()));
}
