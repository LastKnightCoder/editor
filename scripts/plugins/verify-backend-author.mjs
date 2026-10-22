import { desktopAuthorManifest } from "./author-compat.mjs";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-backend-author-"));
const output = path.join(root, "output/plugin-backend-sdk");
const published = process.argv.includes("--published");
async function run(command, args, cwd, extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`))
    );
  });
}
try {
  const sdk = path.join(directory, "sdk");
  if (!published) await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk], root);
  const author = path.join(directory, "独立作者 project");
  await cp(path.join(root, "scripts/plugins/template"), author, {
    recursive: true,
    filter: source => !["node_modules", "dist", ".git"].includes(path.basename(source)),
  });
  await rm(path.join(author, "pnpm-lock.yaml"), { force: true });
  const pkg = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
  pkg.name = "tau-backend-system-example";
  for (const name of ["plugins", "ui"]) {
    const { version } = JSON.parse(
      await readFile(path.join(root, `packages/${name}/package.json`), "utf8")
    );
    pkg.dependencies[`@tau/${name}`] = published
      ? `npm:@xiongtao.xt/tau-${name}@${version}`
      : `file:${sdk}/xiongtao.xt-tau-${name}-${version}.tgz`;
  }
  pkg.devDependencies["@types/node"] = "24.0.0";
  await writeFile(path.join(author, "package.json"), JSON.stringify(pkg, null, 2));
  const manifest = desktopAuthorManifest(
    JSON.parse(await readFile(path.join(author, "manifest.json"), "utf8"))
  );
  Object.assign(manifest, {
    id: "example.backend-system",
    name: "后台系统信息",
    description: "在独立后台读取当前系统与进程信息。",
    keywords: ["系统信息", "后台"],
    formatVersion: 2,
    backend: {
      entry: "backend.js",
      runtime: "node",
      apiVersion: 1,
      scope: "application",
      activation: "on-demand",
      lifetime: "idle",
      reason: "读取系统平台和后台进程标识",
      systemAccess: [],
    },
  });
  await writeFile(path.join(author, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(author, "README.md"),
    "# 后台系统信息\n\n启用插件后，在本机后台中允许此版本运行，再打开设置中的系统信息。展示当前系统平台、架构和独立后台进程标识。只查询系统信息，不修改文件、不连接网络。\n"
  );
  await cp(
    path.join(root, "scripts/plugins/fixtures/backend-system.ts"),
    path.join(author, "src/backend.ts")
  );
  await cp(
    path.join(root, "scripts/plugins/fixtures/backend-system.tsx"),
    path.join(author, "src/index.tsx")
  );
  await cp(
    path.join(root, "scripts/plugins/fixtures/author-contract-check.ts"),
    path.join(author, "src/contract-check.ts")
  );
  await run("pnpm", ["install", "--store-dir", path.join(directory, "store")], author);
  for (const name of [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]) {
    const installed = await realpath(path.join(author, "node_modules", name));
    assert.ok(installed.startsWith((await realpath(author)) + path.sep));
  }
  await run("pnpm", ["build"], author);
  const pointer = JSON.parse(
    await readFile(path.join(author, "dist", `tau-build-${manifest.id}.json`), "utf8")
  );
  const builtDirectory = path.join(author, "dist", pointer.directory);
  const built = JSON.parse(await readFile(path.join(builtDirectory, "manifest.json"), "utf8"));
  for (const entry of ["main.js", "backend.js"])
    assert.equal(
      built.integrity[entry],
      createHash("sha256")
        .update(await readFile(path.join(builtDirectory, entry)))
        .digest("hex")
    );
  await run(process.execPath, ["apps/desktop/scripts/verify-plugin-backend.mjs"], root, {
    TAU_BACKEND_EXAMPLE_FILE: path.join(builtDirectory, "backend.js"),
  });
  await mkdir(output, { recursive: true });
  await cp(
    path.join(author, "dist", `${manifest.id}-${manifest.version}.zip`),
    path.join(output, `${manifest.id}-${manifest.version}.zip`)
  );
  await writeFile(
    path.join(
      output,
      published ? "backend-author-published-report.json" : "backend-author-report.json"
    ),
    JSON.stringify(
      {
        status: "passed",
        manifest: built,
        independentInstall: true,
        sdkSource: published ? "registry" : "local-tarball",
        runtime: "Electron utilityProcess",
        published: false,
      },
      null,
      2
    )
  );
  console.log("[backend-author] 独立安装公开 SDK 产物、类型检查、双入口构建和真实后台调用通过");
} finally {
  await rm(directory, { recursive: true, force: true });
}
