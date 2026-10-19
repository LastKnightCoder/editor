import { cp, mkdir, mkdtemp, readFile, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.resolve(process.argv[2] ?? path.join(root, "../tau-blog-template-starter"));
const candidate = process.argv.includes("--candidate");
const directory = await mkdtemp(path.join(tmpdir(), "tau-template-author-"));
const author = path.join(directory, "author");
await cp(source, author, {
  recursive: true,
  filter: entry => {
    const relative = path.relative(source, entry);
    return (
      relative !== "test-fixtures" &&
      !relative.startsWith("test-fixtures" + path.sep) &&
      !relative
        .split(path.sep)
        .some(part => ["node_modules", "dist", "output", ".git"].includes(part)) &&
      (!candidate || path.basename(entry) !== "pnpm-lock.yaml")
    );
  },
});
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
const fixtures = [];
const nodeTypes = {
  "tau.html": ["html-block", "html-inline"],
  "tau.tikz": ["tikz"],
  "tau.typst": ["typst"],
  "tau.abc": ["abc"],
  "tau.custom-block": ["custom-block"],
};
for (const item of JSON.parse(
  await readFile(path.join(root, "tests/fixtures/plugins/catalog.json"), "utf8")
)) {
  if (!nodeTypes[item.id]) continue;
  const origin = path.join(root, "tests/fixtures/plugins", item.artifact);
  const target = path.join(author, "test-fixtures", item.id);
  await cp(origin, target, { recursive: true });
  fixtures.push({ directory: item.id, nodeTypes: nodeTypes[item.id] });
}
await writeFile(path.join(author, "test-fixtures/catalog.json"), JSON.stringify(fixtures, null, 2));
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
  author,
  status: "passed",
  mode: candidate ? "candidate" : "public-registry",
  tauPackages,
  frozenInstall: true,
  realContentPlugins: fixtures.map(item => item.directory),
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
