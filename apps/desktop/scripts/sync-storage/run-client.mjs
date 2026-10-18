import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const archive = process.argv[2];
const previousArchive = process.argv[3];
if (!archive) throw new Error("请提供同步插件ZIP路径");
const output = path.join(root, "output/sync-client", randomUUID());
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "package.json"),
  JSON.stringify({ name: "tau-sync-client-test", version: "0.59.0", main: "verify.cjs" })
);
await writeFile(
  path.join(output, "index.html"),
  '<!doctype html><html><body>同步模块行为验收<script src="renderer.js"></script></body></html>'
);
await build({
  entryPoints: [path.join(root, "apps/desktop/src-electron/preload/index.ts")],
  outfile: path.join(output, "preload.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
});
await build({
  entryPoints: [path.join(root, "apps/desktop/scripts/sync-storage/verify-client.ts")],
  outfile: path.join(output, "verify.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
  tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
});
await build({
  entryPoints: [path.join(root, "apps/desktop/scripts/sync-storage/verify-renderer.ts")],
  outfile: path.join(output, "renderer.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "syncRendererTest",
  tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
  define: { "process.env.NODE_ENV": '"test"' },
});
for (const phase of [
  "install",
  "restart",
  "migrate",
  "migrate-restart",
  ...(previousArchive ? ["upgrade"] : []),
]) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(
      require("electron"),
      [
        output,
        phase,
        output,
        path.resolve(archive),
        ...(previousArchive ? [path.resolve(previousArchive)] : []),
      ],
      {
        env,
        stdio: "inherit",
      }
    );
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("验证超时"));
    }, 60000);
    child.on("error", reject);
    child.on("exit", code => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error("验证失败：" + code));
    });
  });
}
console.log("隔离验收目录：" + output);
