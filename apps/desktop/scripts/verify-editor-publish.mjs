import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "../..");
const require = createRequire(path.join(desktop, "package.json"));
const output = path.join(root, "output/editor-publish", randomUUID());
const template = path.join(root, "apps/blog/dist");
const directory = path.join(output, "plugins");
const pluginDir = path.join(directory, "example.portable-counter");
const site = path.join(output, "site");
await mkdir(pluginDir, { recursive: true });
await cp(
  path.join(root, "plugins/custom-block/dist/package"),
  path.join(directory, "tau.custom-block"),
  { recursive: true }
);
const hash = data => createHash("sha256").update(data).digest("hex");
const templateHtml = await readFile(path.join(template, "src/templates/article/index.html"));
const templateScripts = new Map();
for (const name of await readdir(path.join(template, "assets"))) {
  if (!name.endsWith(".js")) continue;
  const bytes = await readFile(path.join(template, "assets", name));
  assert.equal(bytes.includes(Buffer.from("example.portable-counter")), false);
  templateScripts.set("assets/" + name, hash(bytes));
}
assert.equal(JSON.parse(await readFile(path.join(template, "plugin-runtime.json"))).version, 1);
// 真实模板已构建，随后才生成它不认识的插件。
await build({
  entryPoints: [path.join(root, "scripts/plugins/fixtures/published-editor.tsx")],
  outfile: path.join(pluginDir, "main.js"),
  bundle: true,
  platform: "browser",
  format: "cjs",
  external: ["@tau/plugins", "@tau/ui", "react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  tsconfig: path.join(desktop, "tsconfig.json"),
});
const code = await readFile(path.join(pluginDir, "main.js"), "utf8");
const css = ".portable-counter{padding:12px;color:var(--tau-ink-1)}";
await writeFile(path.join(pluginDir, "main.css"), css);
await writeFile(
  path.join(pluginDir, "manifest.json"),
  JSON.stringify({
    id: "example.portable-counter",
    name: "可发布计数块",
    description: "验证同一扩展的文档与博客渲染",
    version: "1.0.0",
    minAppVersion: "0.59.0",
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    styles: "main.css",
    editor: true,
    integrity: { "main.js": hash(code), "main.css": hash(css) },
  })
);
await build({
  entryPoints: [path.join(desktop, "scripts/editor-publish/generate.ts")],
  outfile: path.join(output, "generate.cjs"),
  bundle: true,
  platform: "node",
  tsconfig: path.join(desktop, "tsconfig.json"),
});
const { generateFixture } = require(path.join(output, "generate.cjs"));
const customRequire = createRequire(path.join(root, "plugins/custom-block/package.json"));
const { compile } = customRequire("@tailwindcss/node");
const { Scanner } = customRequire("@tailwindcss/oxide");
const styleInput = await readFile(path.join(root, "plugins/custom-block/src/styles.css"), "utf8");
const compileSource = async (content, extension) => {
  const compiler = await compile(styleInput, {
    base: path.join(root, "plugins/custom-block/src"),
    onDependency() {},
  });
  return compiler.build(new Scanner({ sources: [] }).scanFiles([{ content, extension }]));
};
const { files } = await generateFixture(template, directory, false, compileSource);
const { customSource } = await import(
  path.join(desktop, "scripts/editor-publish/custom-fixture.ts")
);
await writeFile(path.join(output, "custom-runtime.css"), await compileSource(customSource, "tsx"));
for (const [filePath, expected] of templateScripts) {
  assert.equal(hash(files.find(file => file.path === filePath).content), expected);
}
for (const file of files) {
  const destination = path.join(site, file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, file.content);
}
await assert.rejects(() => generateFixture(template, directory, true), /缺少/);
const oldTemplate = path.join(output, "old-template");
await cp(template, oldTemplate, { recursive: true });
await rm(path.join(oldTemplate, "plugin-runtime.json"));
await assert.rejects(() => generateFixture(oldTemplate, directory), /更新发布模板/);
await rm(oldTemplate, { recursive: true });
assert.equal(
  hash(await readFile(path.join(template, "src/templates/article/index.html"))),
  hash(templateHtml)
);
await cp(directory, path.join(output, "desktop-plugins"), { recursive: true });
await rm(directory, { recursive: true });

const rawAssets = {
  name: "verification-assets",
  setup(build) {
    build.onResolve({ filter: /\?(raw|url)$/ }, args => {
      const suffix = args.path.match(/\?(raw|url)$/)[0];
      const name = args.path.slice(0, -suffix.length);
      return {
        path:
          (name.startsWith("@/")
            ? path.join(desktop, "src", name.slice(2))
            : name.startsWith(".")
              ? path.resolve(args.resolveDir, name)
              : require.resolve(name)) + suffix,
      };
    });
    build.onLoad({ filter: /\?(raw|url)$/ }, async args => {
      const file = args.path.replace(/\?(raw|url)$/, "");
      if (args.path.endsWith("?raw"))
        return { contents: await readFile(file, "utf8"), loader: "text" };
      const name = path.basename(file);
      await cp(file, path.join(output, name));
      return { contents: `export default ${JSON.stringify("./" + name)}`, loader: "js" };
    });
  },
};
await build({
  entryPoints: [path.join(desktop, "scripts/editor-publish/desktop.tsx")],
  outfile: path.join(output, "desktop.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  tsconfig: path.join(desktop, "tsconfig.json"),
  plugins: [rawAssets],
  alias: {
    "react-dnd": require.resolve("react-dnd"),
    "react-dnd-html5-backend": require.resolve("react-dnd-html5-backend"),
    "@tau/editor": path.join(root, "packages/editor"),
    "@tau/shared": path.join(root, "packages/shared"),
  },
  loader: {
    ".css": "empty",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
    ".png": "dataurl",
  },
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "process.env.NODE_ENV": '"production"',
  },
});
await build({
  entryPoints: [path.join(desktop, "src-electron/preload/index.ts")],
  outfile: path.join(output, "preload.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
});
await writeFile(
  path.join(output, "desktop.html"),
  '<!doctype html><html><body><div id="root"></div><script src="./desktop.js"></script></body></html>'
);

await build({
  entryPoints: [path.join(desktop, "src-electron/main/workers/index-content.worker.ts")],
  outfile: path.join(output, "index-content-worker.cjs"),
  bundle: true,
  platform: "node",
  tsconfig: path.join(desktop, "tsconfig.json"),
});
await build({
  entryPoints: [path.join(desktop, "scripts/editor-publish/verify.ts")],
  outfile: path.join(output, "verify.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
});
const server = createServer(async (request, response) => {
  const file = path.resolve(
    site,
    "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname)
  );
  if (!file.startsWith(site + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type":
        ({
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".json": "application/json",
        }[path.extname(file)] ?? "application/octet-stream") + "; charset=utf-8",
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const env = {
    ...process.env,
    TAU_EDITOR_PUBLISH_DIRECTORY: output,
    TAU_EDITOR_PUBLISH_URL: `http://127.0.0.1:${server.address().port}/`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(output, "verify.cjs")], {
      env,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("发布验收超时"));
    }, 60_000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (code !== 0) throw new Error("浏览器验收失败");
  const report = {
    status: "passed",
    templateUnchanged: true,
    authorDirectoryRemoved: true,
    missingPluginRejected: true,
    oldTemplateRejected: true,
    publishedPluginFiles: files
      .filter(file => file.path.startsWith("plugin-assets/"))
      .map(file => file.path),
    browser: JSON.parse(await readFile(path.join(output, "browser-report.json"), "utf8")),
  };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
} finally {
  server.close();
}
