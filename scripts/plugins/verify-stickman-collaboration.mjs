import { mkdtemp, mkdir, cp, readFile, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-stickman-candidate-"));
const author = path.join(directory, "author"),
  sdk = path.join(directory, "sdk");
const source = path.join(root, "plugins/tau-plugin-stickman");
const run = (command, args, cwd = root, extra = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...extra },
    });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`))
    );
  });
const hash = async file =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const unchanged = Object.fromEntries(
  await Promise.all(
    ["package.json", "manifest.json", "pnpm-lock.yaml"].map(async name => [
      name,
      await hash(path.join(source, name)),
    ])
  )
);
console.log(`候选组合验证目录：${directory}`);
await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk]);
await mkdir(author);
for (const name of [
  "src",
  "scripts",
  "tests",
  "package.json",
  "manifest.json",
  "tsconfig.json",
  "build.mjs",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
])
  await cp(path.join(source, name), path.join(author, name), { recursive: true });
const pkg = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
const sdkVersion = JSON.parse(
  await readFile(path.join(root, "packages/plugins/package.json"), "utf8")
).version;
const uiVersion = JSON.parse(
  await readFile(path.join(root, "packages/ui/package.json"), "utf8")
).version;
const sdkFile = path.join(sdk, `xiongtao.xt-tau-plugins-${sdkVersion}.tgz`);
pkg.dependencies["@tau/plugins"] = `file:${sdkFile}`;
pkg.dependencies["@tau/ui"] = `file:${sdk}/xiongtao.xt-tau-ui-${uiVersion}.tgz`;
// 只生成隔离验收副本，仓库依赖与锁文件不改写为候选包。
await writeFile(path.join(author, "package.json"), JSON.stringify(pkg, null, 2));
await run("pnpm", ["install", "--ignore-scripts", "--lockfile=false"], author);
assert.ok(
  (await realpath(path.join(author, "node_modules/@tau/plugins"))).startsWith(
    (await realpath(author)) + path.sep
  )
);
await run("pnpm", ["test"], author);
await run("pnpm", ["build"], author);
await run("pnpm", ["--filter", "@tau/collaboration-server", "build"]);
const pointer = JSON.parse(
  await readFile(path.join(author, "dist/tau-build-taunote.stickman.json"), "utf8")
);
const artifact = path.join(author, "dist", pointer.directory);
await run(
  "pnpm",
  [
    "--filter",
    "@tau/whiteboard",
    "exec",
    "vitest",
    "run",
    "--config",
    "../../scripts/plugins/stickman/vitest.config.ts",
  ],
  root,
  {
    TAU_STICKMAN_ARTIFACT: artifact,
    TAU_STICKMAN_RESULT: path.join(directory, "integration-result.json"),
  }
);
for (const [name, digest] of Object.entries(unchanged))
  assert.equal(await hash(path.join(source, name)), digest);
const report = {
  status: "passed",
  author,
  artifact,
  sdk: { version: sdkVersion, sha256: await hash(sdkFile) },
  plugin: {
    version: pkg.version,
    sha256: await hash(path.join(author, "dist", `taunote.stickman-${pkg.version}.zip`)),
  },
  server: { sha256: await hash(path.join(root, "apps/collaboration-server/dist/index.js")) },
  sourceManifestAndLockUnchanged: true,
  integration: JSON.parse(await readFile(path.join(directory, "integration-result.json"), "utf8")),
};
await writeFile(path.join(directory, "result.json"), JSON.stringify(report, null, 2));
console.log(`组合验证通过：${path.join(directory, "result.json")}`);
