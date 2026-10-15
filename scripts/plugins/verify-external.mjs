import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  readdir,
  rm,
  realpath,
  lstat,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-independent-author-"));
const reportPath = path.resolve(
  process.argv[2] ?? path.join(root, "output/plugin-g1/external-report.json")
);
const report = {
  status: "running",
  startedAt: new Date().toISOString(),
  author: {},
  runtime: null,
};
async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    const child = spawn(command, args, { cwd, stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`))
    );
  });
}
try {
  const sdk = path.join(directory, "sdk");
  await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk], root);
  const author = path.join(directory, "干净作者 project");
  const versions = async () =>
    (await readdir(path.join(author, "dist"), { withFileTypes: true }))
      .filter(item => item.isDirectory() && !item.name.startsWith("."))
      .map(item => item.name);
  await cp(path.join(root, "scripts/plugins/template"), author, { recursive: true });
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(sdk, "tau-plugins-0.1.0.tgz"),
      path.join(sdk, "tau-ui-0.1.0.tgz"),
    ],
    author
  );
  const installed = {};
  for (const name of ["@tau/plugins", "@tau/ui", "react", "react-dom", "typescript", "esbuild"]) {
    const location = path.join(author, "node_modules", name);
    assert.equal((await lstat(location)).isSymbolicLink(), false, `${name} 不得链接到工作区`);
    const resolved = await realpath(location);
    assert.equal(resolved.startsWith((await realpath(author)) + path.sep), true);
    const info = JSON.parse(await readFile(path.join(location, "package.json"), "utf8"));
    installed[name] = info.version;
    if (name.startsWith("@tau/")) {
      assert.deepEqual(Object.keys(info.exports), ["."]);
      assert.equal(
        Object.values(info.dependencies).some(value => String(value).startsWith("workspace:")),
        false
      );
    }
  }
  assert.deepEqual((await readdir(path.join(author, "node_modules/@tau"))).sort(), [
    "plugins",
    "ui",
  ]);
  report.author = {
    cleanDirectory: true,
    pathIncludesUnicodeAndSpaces: true,
    workspaceLinks: false,
    packages: installed,
    skipLibCheck: true,
  };
  await run("npm", ["run", "build"], author);
  const [first] = await versions();
  const manifest = JSON.parse(await readFile(path.join(author, "manifest.json"), "utf8"));
  await writeFile(
    path.join(author, "manifest.json"),
    JSON.stringify({ ...manifest, id: "example.external-other", name: "独立计数插件二" })
  );
  await run("npm", ["run", "build"], author);
  const second = (await versions()).find(name => name !== first);
  const beforeReload = await versions();
  await writeFile(
    path.join(author, "manifest.json"),
    JSON.stringify({ ...manifest, version: "1.1.0" })
  );
  await run("npm", ["run", "build"], author);
  const replacement = (await versions()).find(name => !beforeReload.includes(name));
  const beforeFailure = await versions();
  const source = path.join(author, "src/index.tsx");
  const validSource = await readFile(source, "utf8");
  const pointer = path.join(author, "dist", `tau-build-${manifest.id}.json`);
  const published = await readFile(pointer, "utf8");
  await writeFile(source, "export default = ;");
  await assert.rejects(run("npm", ["run", "build"], author));
  assert.equal(await readFile(pointer, "utf8"), published);
  await writeFile(
    source,
    validSource.replace(
      "activate(context) {",
      "activate(context) { throw new Error('重载验证故障');"
    )
  );
  await run("npm", ["run", "build"], author);
  const failing = (await versions()).find(name => !beforeFailure.includes(name));
  const beforeHanging = await versions();
  await writeFile(
    source,
    validSource.replace(
      "activate(context) {",
      "activate(context) { return new Promise<void>(() => undefined);"
    )
  );
  await run("npm", ["run", "build"], author);
  const hanging = (await versions()).find(name => !beforeHanging.includes(name));
  const beforeCleanup = await versions();
  await writeFile(
    source,
    validSource.replace(
      "activate(context) {",
      "deactivate() { throw new Error('清理验证故障'); }, activate(context) {"
    )
  );
  await run("npm", ["run", "build"], author);
  const cleanup = (await versions()).find(name => !beforeCleanup.includes(name));
  const runtimeReport = path.join(directory, "runtime-report.json");
  await run(
    process.execPath,
    [
      "apps/desktop/scripts/verify-plugin-runtime.mjs",
      path.join(author, "dist", first),
      path.join(author, "dist", second),
      path.join(author, "dist", replacement),
      path.join(author, "dist", failing),
      path.join(author, "dist", hanging),
      path.join(author, "dist", cleanup),
      runtimeReport,
    ],
    root
  );
  report.runtime = JSON.parse(await readFile(runtimeReport, "utf8"));
  for (const phase of report.runtime.phases) {
    assert.equal(phase.snapshot.versions.react, installed.react);
    assert.equal(phase.snapshot.versions.reactDom, installed["react-dom"]);
  }
  report.status = "passed";
  console.log("[external-plugin] 临时仓库外项目独立安装、严格源码检查、构建与真实桌面验证完成");
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`[external-plugin] 报告：${reportPath}`);
  await rm(directory, { recursive: true, force: true });
}
