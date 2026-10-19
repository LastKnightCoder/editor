import { cp, mkdir, mkdtemp, readFile, writeFile, realpath, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = path.resolve(process.argv[2] ?? path.join(root, "../tau-blog-template"));
const archive = process.env.TAU_DATA_SDK_ARCHIVE;
const directory = await mkdtemp(path.join(tmpdir(), "tau-independent-blog-"));
const author = path.join(directory, "blog");
const run = (command, args) => new Promise((resolve, reject) => {
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  const child = spawn(command, args, { cwd: author, env, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`)));
});
await cp(plugin, author, {
  recursive: true,
  filter: source => {
    const relative = path.relative(plugin, source);
    return !relative.split(path.sep).some(part => ["node_modules", "dist", "output", ".git"].includes(part)) && (!archive || relative !== "pnpm-lock.yaml");
  },
});
const manifestPath = path.join(author, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const tauDependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => name.startsWith("@tau/"));
assert.deepEqual(tauDependencies.sort(), ["@tau/plugins", "@tau/ui"]);
assert(!Object.values({ ...manifest.dependencies, ...manifest.devDependencies }).some(value => /^(?:link|workspace|file):/.test(value)));
if (archive) {
  await cp(path.resolve(archive), path.join(author, "data-sdk.tgz"));
  manifest.dependencies["@tau/plugins"] = "file:./data-sdk.tgz";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
const install = args => process.env.TAU_PNPM_CLI
  ? run(process.execPath, [process.env.TAU_PNPM_CLI, "install", ...args])
  : run("pnpm", ["install", ...args]);
await install(["--ignore-scripts", ...(!archive ? ["--frozen-lockfile"] : [])]);
await install(["--ignore-scripts", "--frozen-lockfile"]);
assert(!((await readdir(directory)).includes("editor")));
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
  const installed = await realpath(path.join(author, "node_modules", name));
  assert(installed.startsWith((await realpath(author)) + path.sep), `${name} 依赖目录外的源码`);
}
await run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
await run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.ts"]);
await run(process.execPath, ["scripts/build.mjs"]);
const report = { status: "passed", author, sdkSource: archive ? "待发布的 SDK 压缩包" : "公共 npm 注册表", tauPackages: tauDependencies, hostSourceRequired: false, frozenInstall: true, typecheck: true, tests: true, build: true };
await mkdir(path.join(root, "output/independent-blog"), { recursive: true });
await writeFile(path.join(root, "output/independent-blog", archive ? "archive-report.json" : "public-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
