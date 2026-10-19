import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { serveSite } from "../../apps/blog/spikes/template-owned-spa/server.mjs";
import { checkProtocol } from "../../apps/blog/spikes/template-owned-spa/protocol-checks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = path.resolve(process.argv[2] ?? path.join(root, "../tau-blog-template"));
const output = path.join(root, "output/blog-template-integration", randomUUID());
await mkdir(output, { recursive: true });
const requireDesktop = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = requireDesktop("esbuild");
const hash = value => createHash("sha256").update(value).digest("hex");
await build({
  stdin: {
    contents: [
      'export {PublishSiteGenerator} from "./apps/desktop/src-electron/main/modules/publish-site-generator";',
      'export {readTemplatePackage} from "./apps/desktop/src-electron/main/services/template-package";',
      'export {makePublishFixture} from "./apps/desktop/src-electron/main/modules/__tests__/publish-fixtures";',
      'export {inspectPackage} from "./apps/plugin-portal/api/package";',
      'export {createClient} from "./packages/plugins/src/publish-client";',
    ].join("\n"),
    resolveDir: root,
    loader: "ts",
  },
  alias: { "@": path.join(root, "apps/desktop/src") },
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: path.join(output, "bridge.cjs"),
  tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
});
// Node 外部依赖从当前工作树解析；不引用原工作目录的业务代码。
await writeFile(path.join(output, "package.json"), JSON.stringify({ type: "module" }));
const { symlink } = await import("node:fs/promises");
await symlink(path.join(root, "apps/desktop/node_modules"), path.join(output, "node_modules"));
const bridge = requireDesktop(path.join(output, "bridge.cjs"));
const shared = [
  "@tau/plugins",
  "@tau/plugins/whiteboard",
  "@tau/plugins/sync",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];
const bundled = await build({
  entryPoints: [path.join(root, "scripts/plugins/fixtures/published-editor.tsx")],
  bundle: true,
  platform: "browser",
  format: "cjs",
  jsx: "automatic",
  external: shared,
  write: false,
});
const code = bundled.outputFiles[0].text;
const css = ".portable-counter { padding: 8px; }";
const manifest = {
  formatVersion: 1,
  apiVersion: 1,
  platform: "desktop",
  format: "cjs",
  id: "example.portable-counter",
  name: "可发布计数块",
  version: "1.0.0",
  main: "main.js",
  styles: "style.css",
  editor: true,
  integrity: { "main.js": hash(code), "style.css": hash(css) },
};
const plugins = {
  builtinTypes: ["paragraph", "formatted", "content-link", "html-block"],
  plugins: [{ artifact: { manifest, code, css }, nodeTypes: ["example.portable-counter"] }],
};
const clientBuild = await build({
  entryPoints: [path.join(root, "packages/plugins/src/publish-client.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "TauPublish",
  write: false,
  metafile: true,
  minify: true,
});
assert(
  !Object.keys(clientBuild.metafile.inputs).some(file =>
    /react|packages\/editor|packages\/ui/.test(file)
  )
);
const clientSource = clientBuild.outputFiles[0].text;
const template = await bridge.readTemplatePackage(path.join(plugin, "dist"), "0.59.0");
const inspected = await bridge.inspectPackage(
  await readFile(path.join(plugin, "output/tau.blog-1.0.0.zip"))
);
assert.equal(inspected.manifest.id, "tau.blog");
const cases = [
  "完整官方模板通过门户包限制及全部资产校验",
  "数据辅助脚本的模块图没有 React、编辑器或 UI",
];
const fixture = bridge.makePublishFixture();
const themeCss = await readFile(path.join(root, "packages/themes/src/tailwind.css"), "utf8");
const compileTailwind = (content, extension) =>
  new Promise((resolve, reject) => {
    const worker = fork(
      path.join(root, "apps/desktop/src-electron/main/workers/tailwind-runtime-worker.js"),
      { stdio: ["ignore", "ignore", "pipe", "ipc"] }
    );
    let stderr = "";
    worker.stderr.on("data", value => (stderr += value));
    const timer = setTimeout(() => {
      worker.kill();
      reject(new Error("Tailwind 编译超时" + stderr));
    }, 20000);
    worker.once("error", error => {
      clearTimeout(timer);
      worker.kill();
      reject(error);
    });
    worker.once("message", message => {
      clearTimeout(timer);
      worker.kill();
      message.ok ? resolve(message.css) : reject(new Error(message.error));
    });
    worker.send({ id: 1, content, extension, themeCss });
  });
const makeGenerator = selected =>
  new bridge.PublishSiteGenerator({
    template: selected,
    clientSource,
    plugins,
    compileTailwind,
    logger: console,
  });
const packet = await makeGenerator(template).generate(fixture.data, fixture.selections, {
  title: "独立博客验证",
  description: "共享协议",
  basePath: "/notes/",
});
const files = packet.files;
const manifestPath = files.find(file => /^data\/site\./.test(file.path)).path;
const directory = path.join(output, "site");
for (const file of files) {
  const target = path.join(directory, file.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.content);
}
assert.deepEqual(
  files.filter(file => file.path.endsWith(".html")).map(file => file.path),
  ["index.html"]
);
for (const file of template.files.filter(file => file.path !== "index.html"))
  assert(
    Buffer.from(file.content).equals(
      Buffer.from(files.find(output => output.path === file.path).content)
    )
  );
cases.push(`宿主只复制一个作者入口，${template.files.length - 1} 个非入口模板资产字节保持一致`);
const another = await makeGenerator({
  ...template,
  manifest: { ...template.manifest, id: "another.template", name: "另一个模板" },
}).generate(fixture.data, fixture.selections, {
  title: "独立博客验证",
  description: "共享协议",
  basePath: "/notes/",
});
assert.deepEqual(
  files.filter(file => file.path.startsWith("data/")),
  another.files.filter(file => file.path.startsWith("data/"))
);
cases.push("替换模板身份不会改变正文、CSS、索引与数据清单");
const servers = [];
try {
  const server = await serveSite({ directory, basePath: "/notes/", historyFallback: false });
  servers.push(server);
  cases.push(...(await checkProtocol(bridge.createClient, server.url, { manifestPath })));
  const report = {
    output,
    plugin,
    site: server.url,
    manifestPath,
    cases,
    files: files.length,
    templateFiles: template.files.length,
    templateZipBytes: (await readFile(path.join(plugin, "output/tau.blog-1.0.0.zip"))).length,
  };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(
    path.join(output, "browser-config.json"),
    JSON.stringify({ ...report, url: server.url }, null, 2)
  );
  if (process.env.TAU_VERIFY_BLOG_BROWSER === "1") {
    const { spawn } = await import("node:child_process");
    const executable = process.env.TAU_ELECTRON_BIN || requireDesktop("electron");
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [path.join(root, "scripts/plugins/verify-blog-template-browser.cjs")],
        {
          env: { ...process.env, TAU_BLOG_CONFIG: path.join(output, "browser-config.json") },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", value => (stdout += value));
      child.stderr.on("data", value => (stderr += value));
      child.on("error", reject);
      child.on("exit", code => (code === 0 ? resolve(stdout) : reject(new Error(stderr + stdout))));
    });
    console.log(result.trim());
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all(servers.map(server => server.close()));
}
