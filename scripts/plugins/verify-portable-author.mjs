import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { desktopAuthorManifest } from "./author-compat.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-portable-author-"));
const author = path.join(directory, "独立作者 project");
const output = path.resolve(
  process.argv[2] ?? path.join(root, "output/plugin-phase-a/author-report.json")
);
const report = {
  status: "running",
  directory,
  author,
  checks: [],
  startedAt: new Date().toISOString(),
};
const frozenTemplate = process.argv.includes("--frozen-template");
const published = process.argv.includes("--published");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let result = "";
    child.stdout.on("data", chunk => {
      result += chunk;
    });
    child.stderr.on("data", chunk => {
      result += chunk;
    });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0
        ? resolve(result)
        : reject(new Error(`${command} ${args.join(" ")} 退出 ${code}\n${result.slice(-6000)}`))
    );
  });
}
try {
  const sdk = path.join(directory, "sdk");
  if (!published) {
    console.log("生成本地 SDK/UI tarball");
    await run(process.execPath, ["scripts/plugins/package-sdk.mjs", sdk], root);
  }
  await cp(path.join(root, "plugins/tau-plugin-template"), author, {
    recursive: true,
    filter: source => !["node_modules", "dist", ".git", ".sdk"].includes(path.basename(source)),
  });
  if (!frozenTemplate) await rm(path.join(author, "pnpm-lock.yaml"), { force: true });
  const pluginVersion = JSON.parse(
    await readFile(path.join(root, "packages/plugins/package.json"), "utf8")
  ).version;
  const uiVersion = JSON.parse(
    await readFile(path.join(root, "packages/ui/package.json"), "utf8")
  ).version;
  if (!published)
    await run(
      process.execPath,
      [
        "use-local-sdk.mjs",
        path.join(sdk, `xiongtao.xt-tau-plugins-${pluginVersion}.tgz`),
        path.join(sdk, `xiongtao.xt-tau-ui-${uiVersion}.tgz`),
      ],
      author
    );
  report.sdkSource = published ? "npm" : "local-tarball";
  await cp(
    path.join(root, "scripts/plugins/fixtures/portable-contract-check.tsx"),
    path.join(author, "src/contract-check.tsx")
  );
  await cp(
    path.join(root, "scripts/plugins/fixtures/inspect-portable-build.mjs"),
    path.join(author, "inspect-build.mjs")
  );
  console.log("仓库外安装独立依赖并构建同一模板");
  await run(
    "pnpm",
    [
      "install",
      "--ignore-scripts",
      "--prefer-offline",
      ...(frozenTemplate ? ["--frozen-lockfile"] : []),
      "--store-dir",
      path.join(directory, "store"),
    ],
    author
  );
  await run(
    "pnpm",
    [
      "install",
      "--ignore-scripts",
      "--frozen-lockfile",
      "--store-dir",
      path.join(directory, "store"),
    ],
    author
  );
  await run("pnpm", ["build"], author);
  const inspection = await run(process.execPath, ["inspect-build.mjs"], author);
  report.artifact = JSON.parse(inspection.trim().split("\n").at(-1));
  report.typecheck = { strict: true, skipLibCheck: true };
  report.templateLockfileReused = frozenTemplate;
  report.checks.push(
    "仓库外类型检查与构建",
    "无 workspace 链接与宿主私有入口",
    "三端兼容矩阵与包完整性",
    "旧格式校验拒绝跨端开发包",
    "冻结锁文件安装"
  );
  const manifestPath = path.join(author, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const pointer = path.join(author, "dist", `tau-build-${manifest.id}.json`);
  const originalPointer = await readFile(pointer, "utf8");
  const sourcePath = path.join(author, "src/index.tsx");
  const source = await readFile(sourcePath, "utf8");
  for (const invalidImport of [
    "import { readFileSync } from 'node:fs'; console.log(readFileSync('unused'));",
    "import { createPluginEnvironmentStore } from '@tau/plugins/environment-host'; console.log(createPluginEnvironmentStore);",
  ]) {
    await writeFile(sourcePath, source + "\n" + invalidImport);
    await assert.rejects(run(process.execPath, ["build.mjs"], author));
    assert.equal(await readFile(pointer, "utf8"), originalPointer);
  }
  await writeFile(sourcePath, source);
  manifest.targets.ios.requires = ["missingFeature"];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(run(process.execPath, ["build.mjs"], author));
  assert.equal(await readFile(pointer, "utf8"), originalPointer);
  await writeFile(manifestPath, manifestText);
  for (const patch of [
    { permissions: ["cards:read"] },
    { version: "1.0.0-beta.1" },
    {
      targets: {
        ...JSON.parse(manifestText).targets,
        ios: { ...JSON.parse(manifestText).targets.ios, optional: ["futureOptional"] },
      },
    },
  ]) {
    await writeFile(manifestPath, JSON.stringify({ ...JSON.parse(manifestText), ...patch }));
    await assert.rejects(run(process.execPath, ["build.mjs"], author));
    assert.equal(await readFile(pointer, "utf8"), originalPointer);
  }
  await writeFile(manifestPath, manifestText);
  report.checks.push("未知可选能力、移动权限和预发布版本在构建时拒绝；客户端前向兼容读取");
  await assert.rejects(run(process.execPath, ["install-local.mjs"], author), /不能写入正式客户端/);
  report.checks.push(
    "Node 与宿主入口依赖被拒绝",
    "未知能力被拒绝且保留上一产物",
    "正式目录安装被阻止"
  );
  await writeFile(
    manifestPath,
    JSON.stringify(desktopAuthorManifest(JSON.parse(manifestText)), null, 2)
  );
  await run("pnpm", ["build"], author);
  await run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {readFile} from 'node:fs/promises'; import assert from 'node:assert/strict'; import {validatePluginManifest} from '@tau/plugins/package'; const m=JSON.parse(await readFile('manifest.json','utf8')); const p=JSON.parse(await readFile('dist/tau-build-'+m.id+'.json','utf8')); const result=validatePluginManifest(JSON.parse(await readFile('dist/'+p.directory+'/manifest.json','utf8'))); assert.equal(result.platform,'desktop'); assert.equal(result.formatVersion,1);`,
    ],
    author
  );
  const archive = path.join(
    author,
    "dist",
    `${JSON.parse(manifestText).id}-${JSON.parse(manifestText).version}.zip`
  );
  await cp(archive, path.join(author, "dist/legacy-example.zip"));
  report.checks.push("同一构建器的旧桌面格式回归");
  const editorManifest = JSON.parse(manifestText);
  editorManifest.editor = { elements: { "example.note": "edit" } };
  for (const platform of ["desktop", "android", "ios"])
    editorManifest.targets[platform] = {
      minAppVersion: editorManifest.targets[platform].minAppVersion,
      editor: { elements: { "example.note": platform === "desktop" ? "edit" : "render" } },
    };
  await writeFile(manifestPath, JSON.stringify(editorManifest, null, 2));
  await writeFile(sourcePath, "export { default } from '../examples/editor';\n");
  await run("pnpm", ["build"], author);
  const editorInspection = await run(
    process.execPath,
    ["inspect-build.mjs", "example.note"],
    author
  );
  report.editorArtifact = JSON.parse(editorInspection.trim().split("\n").at(-1));
  await cp(archive, path.join(author, "dist/editor-example.zip"));
  report.editorArtifact.archive = path.join(author, "dist/editor-example.zip");
  report.checks.push("同一模板的编辑器入口与分级声明构建");
  await writeFile(manifestPath, manifestText);
  await writeFile(sourcePath, source);
  await run("pnpm", ["build"], author);
  const finalInspection = await run(process.execPath, ["inspect-build.mjs"], author);
  const finalArtifact = JSON.parse(finalInspection.trim().split("\n").at(-1));
  assert.deepEqual(finalArtifact.packageIntegrity, report.artifact.packageIntegrity);
  report.artifact = { ...finalArtifact, archive };
  report.status = "passed";
  report.runtimeActivation = "未执行；阶段 A 验证作者构建与兼容契约，正式宿主接线属于后续阶段";
  console.log(`仓库外验证通过：${author}`);
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
}
