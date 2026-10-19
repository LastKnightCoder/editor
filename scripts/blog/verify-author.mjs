import { cp, mkdir, mkdtemp, readFile, writeFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.resolve(process.argv[2] ?? path.join(root, "../tau-blog-template-starter"));
const candidate = process.argv.includes("--candidate");
const directory = await mkdtemp(path.join(tmpdir(), "tau-template-author-"));
const author = path.join(directory, "author");
// 只验证已提交的源码，产物与报告中的提交一一对应。
assert.equal(
  execFileSync("git", ["-C", source, "status", "--porcelain"], { encoding: "utf8" }),
  "",
  "模板工作区有未提交改动，请提交后再验证"
);
const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
await mkdir(author);
execFileSync("tar", ["-x", "-C", author], {
  input: execFileSync("git", ["-C", source, "archive", "--format=tar", commit], {
    maxBuffer: 256 * 1024 * 1024,
  }),
});
if (candidate) await rm(path.join(author, "pnpm-lock.yaml"), { force: true });
const manifest = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
const tauPackages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
  name => name.startsWith("@tau/")
);
assert.deepEqual(tauPackages, ["@tau/blog"]);
assert(
  !Object.values({ ...manifest.dependencies, ...manifest.devDependencies }).some(version =>
    /^(?:link|workspace|file):/.test(version)
  )
);
if (candidate) {
  const { version } = JSON.parse(
    await readFile(path.join(root, "packages/blog/package.json"), "utf8")
  );
  const archive = path.join(root, "output/blog-package", `xiongtao.xt-tau-blog-${version}.tgz`);
  await cp(archive, path.join(author, "blog.tgz"));
  manifest.dependencies["@tau/blog"] = "file:./blog.tgz";
  await writeFile(path.join(author, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
}
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    const child = spawn(command, args, { cwd: author, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}；工程 ${author}`))
    );
  });
}
const pnpm = process.env.TAU_PNPM_CLI;
const installFlags = [
  "install",
  "--ignore-scripts",
  "--registry=https://registry.npmjs.org",
  "--store-dir",
  path.join(directory, "store"),
];
const install = flags =>
  pnpm
    ? run(process.execPath, [pnpm, ...installFlags, ...flags])
    : run("pnpm", [...installFlags, ...flags]);
await install(candidate ? [] : ["--frozen-lockfile"]);
await install(["--frozen-lockfile"]);
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
  const location = await realpath(path.join(author, "node_modules", name));
  assert(location.startsWith((await realpath(author)) + path.sep), `${name} 指向作者目录外`);
}
await run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
await run(process.execPath, [
  "--input-type=module",
  "-e",
  `
  import ts from 'typescript';
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const files = ts.createProgram(parsed.fileNames, parsed.options).getSourceFiles().map(file => file.fileName);
  if (files.some(file => /tau-plugins\\/types\\/packages\\/(?:editor|ui|whiteboard)\\//.test(file))) throw Error('发布协议类型不应连带载入 SDK 中的 UI 声明');
`,
]);
await run(process.execPath, [
  "node_modules/vitest/vitest.mjs",
  "run",
  "--maxWorkers=1",
  "--minWorkers=1",
]);
await run(process.execPath, ["scripts/build.mjs"]);
const report = {
  source,
  commit,
  author,
  status: "passed",
  mode: candidate ? "candidate" : "public-registry",
  tauPackages,
  frozenInstall: true,
  typecheck: true,
  tests: true,
  build: true,
  hostSourceRequired: false,
  freshStore: true,
};
await mkdir(path.join(root, "output/author-verification"), { recursive: true });
await writeFile(
  path.join(root, "output/author-verification", `${path.basename(source)}-${report.mode}.json`),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report));
