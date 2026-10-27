import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, cp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";

const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "package.json"));
const sdkRequire = createRequire(path.join(root, "packages/plugins/package.json"));
const { build } = sdkRequire(
  "esbuild"
) as typeof import("../../../packages/plugins/node_modules/esbuild");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});

it("独立作者项目构建两个入口并校验后台摘要，未声明时不读取后台源码", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-backend-author-"));
  directories.push(directory);
  await mkdir(path.join(directory, "src"));
  await mkdir(path.join(directory, "node_modules/@tau/plugins"), { recursive: true });
  for (const name of ["esbuild", "adm-zip"])
    await symlink(
      path.dirname((name === "esbuild" ? sdkRequire : require).resolve(`${name}/package.json`)),
      path.join(directory, "node_modules", name)
    );
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    path.join(directory, "node_modules/@tau/plugins/package.json"),
    JSON.stringify({
      type: "module",
      exports: { "./package": "./package.js", "./portable": "./portable.js" },
    })
  );
  await build({
    entryPoints: [path.join(root, "packages/plugins/src/package.ts")],
    outfile: path.join(directory, "node_modules/@tau/plugins/package.js"),
    bundle: true,
    format: "esm",
    platform: "node",
  });
  await build({
    entryPoints: [path.join(root, "packages/plugins/src/portable.ts")],
    outfile: path.join(directory, "node_modules/@tau/plugins/portable.js"),
    bundle: true,
    format: "esm",
    platform: "node",
  });
  await cp(
    path.join(root, "plugins/tau-plugin-template/build.mjs"),
    path.join(directory, "build.mjs")
  );
  await writeFile(path.join(directory, "README.md"), "# 设备插件\n连接本机设备。");
  await writeFile(
    path.join(directory, "src/index.tsx"),
    "export default { create() { return { activate() {} }; } };"
  );
  const manifest = {
    id: "example.backend",
    name: "设备",
    description: "设备状态",
    version: "1.0.0",
    minAppVersion: "0.59.0",
    formatVersion: 3,
    profile: "web-v1",
    targets: { desktop: { minAppVersion: "0.59.0" } },
    apiVersion: 1,
    platform: "portable",
    format: "cjs",
    main: "main.js",
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(directory, "src/backend.ts"), "this is invalid typescript!");
  execFileSync(process.execPath, ["build.mjs"], { cwd: directory, stdio: "pipe" });
  const normal = new AdmZip(await readFile(path.join(directory, "dist/example.backend-1.0.0.zip")));
  expect(normal.getEntry("example.backend/backend.js")).toBeNull();
  await writeFile(
    path.join(directory, "src/backend.ts"),
    "import { platform } from 'node:os'; export default { create() { return { activate() { return platform(); } }; } };"
  );
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      ...manifest,
      formatVersion: 2,
      platform: "desktop",
      targets: undefined,
      backend: {
        entry: "backend.js",
        runtime: "node",
        apiVersion: 1,
        scope: "application",
        activation: "app-ready",
        lifetime: "persistent",
        reason: "读取系统信息",
        systemAccess: [],
      },
    })
  );
  execFileSync(process.execPath, ["build.mjs"], { cwd: directory, stdio: "pipe" });
  const archive = new AdmZip(
    await readFile(path.join(directory, "dist/example.backend-1.0.0.zip"))
  );
  const packaged = JSON.parse(archive.readAsText("example.backend/manifest.json"));
  expect(packaged.formatVersion).toBe(2);
  expect(packaged.integrity["backend.js"]).toBe(
    createHash("sha256").update(archive.readFile("example.backend/backend.js")!).digest("hex")
  );
  expect(archive.readAsText("example.backend/main.js")).not.toContain("node:os");
}, 20_000);
