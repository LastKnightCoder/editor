import { mkdtemp, cp, readFile, writeFile, mkdir, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-editor-author-"));
const author = path.join(directory, "author");
const sdk = path.join(directory, "sdk");
const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, pnpm_config_verify_deps_before_run: "warn" },
    });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0 ? resolve() : reject(new Error(`${command} 退出 ${code}`))
    );
  });
try {
  await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk], root);
  const { version } = JSON.parse(
    await readFile(path.join(root, "packages/plugins/package.json"), "utf8")
  );
  const { version: uiVersion } = JSON.parse(
    await readFile(path.join(root, "packages/ui/package.json"), "utf8")
  );
  await cp(path.join(root, "plugins/tau-plugin-template"), author, { recursive: true });
  await rm(path.join(author, "pnpm-lock.yaml"), { force: true });
  const pkg = JSON.parse(await readFile(path.join(author, "package.json"), "utf8"));
  pkg.dependencies["@tau/plugins"] = `file:${sdk}/xiongtao.xt-tau-plugins-${version}.tgz`;
  pkg.dependencies["@tau/ui"] = `file:${sdk}/xiongtao.xt-tau-ui-${uiVersion}.tgz`;
  await writeFile(path.join(author, "package.json"), JSON.stringify(pkg, null, 2));
  const manifest = JSON.parse(await readFile(path.join(author, "manifest.json"), "utf8"));
  Object.assign(manifest, {
    id: "example.portable-counter",
    name: "可发布计数块",
    description: "验证文档与博客共用同一交互块，计数仅为当前页面的展示状态。",
    targets: { desktop: { minAppVersion: "0.59.0" } },
  });
  await writeFile(path.join(author, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(author, "README.md"),
    "# 可发布计数块\n\n这是开发验收样本，不是业务计数器。启用后重启 Tau，在编辑器块菜单中选择「可发布计数块」。\n\n计数初始值为 7，点击增加只改变当前页面的展示，不修改或持久化原文数据。发布博客后，同一个组件仍可交互。需要支持编辑器扩展发布的 Tau 0.59.0 和对应博客模板。\n"
  );
  await cp(
    path.join(root, "scripts/plugins/fixtures/published-editor.tsx"),
    path.join(author, "src/index.tsx")
  );
  await run("pnpm", ["install", "--ignore-scripts"], author);
  assert.ok(
    (await realpath(path.join(author, "node_modules/@tau/plugins"))).startsWith(
      (await realpath(author)) + path.sep
    )
  );
  await run("pnpm", ["build"], author);
  const pointer = JSON.parse(
    await readFile(path.join(author, "dist/tau-build-example.portable-counter.json"), "utf8")
  );
  const built = JSON.parse(
    await readFile(path.join(author, "dist", pointer.directory, "manifest.json"), "utf8")
  );
  assert.equal(built.formatVersion, 3);
  assert.equal(built.targets.desktop.minAppVersion, "0.59.0");
  const output = path.join(root, "output/plugin-sdk");
  await mkdir(output, { recursive: true });
  const archiveName = `${built.id}-${built.version}.zip`;
  const archive = path.join(output, archiveName);
  await cp(path.join(author, "dist", archiveName), archive);
  const distribution = JSON.parse(
    await readFile(path.join(root, "tests/fixtures/plugins/catalog.json"), "utf8")
  );
  const release = distribution.find(entry => entry.id === "tau.custom-block");
  if (!release?.repository || !release.sourceRevision) throw new Error("缺少自定义块源码出处");
  const customAuthor = path.join(directory, "custom-author");
  await run("git", ["init", customAuthor], directory);
  await run("git", ["remote", "add", "origin", release.repository + ".git"], customAuthor);
  await run("git", ["fetch", "--depth=1", "origin", release.sourceRevision], customAuthor);
  await run("git", ["checkout", "--detach", release.sourceRevision], customAuthor);
  if (release.sourcePatch) {
    const { readPluginFixtures } = await import("./test-support/package-fixtures.ts");
    await readPluginFixtures(path.join(root, "tests/fixtures/plugins/catalog.json"));
    await run(
      "git",
      ["apply", path.join(root, "tests/fixtures/plugins", release.sourcePatch.file)],
      customAuthor
    );
    const customPackageFile = path.join(customAuthor, "package.json");
    const customPackage = JSON.parse(await readFile(customPackageFile, "utf8"));
    customPackage.dependencies["@tau/plugins"] =
      `file:${sdk}/xiongtao.xt-tau-plugins-${version}.tgz`;
    customPackage.dependencies["@tau/ui"] = `file:${sdk}/xiongtao.xt-tau-ui-${uiVersion}.tgz`;
    await writeFile(customPackageFile, JSON.stringify(customPackage, null, 2));
  }
  await run(
    "pnpm",
    ["install", ...(release.sourcePatch ? ["--no-frozen-lockfile"] : ["--frozen-lockfile"])],
    customAuthor
  );
  await run("pnpm", ["test"], customAuthor);
  await run("pnpm", ["build"], customAuthor);
  await writeFile(
    path.join(output, "editor-author-report.json"),
    JSON.stringify(
      {
        status: "passed",
        sdkVersion: version,
        independentInstall: true,
        customBlockIndependentBuild: true,
        sourceTypecheck: true,
        archive,
        pluginId: built.id,
        pluginVersion: built.version,
        formatVersion: built.formatVersion,
        targets: built.targets,
      },
      null,
      2
    )
  );
  console.log("独立编辑器插件构建通过：output/plugin-sdk/editor-author-report.json");
} finally {
  await rm(directory, { recursive: true, force: true });
}
