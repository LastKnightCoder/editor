import { build } from "esbuild";
import AdmZip from "adm-zip";
import { mkdir, readFile, writeFile, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { isBuiltin } from "node:module";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id))
  throw new Error("插件 ID 应为小写字母、数字及点或连字符组成的命名空间");
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) throw new Error("插件版本无效");
let backend;
let validateManifest;
if (manifest.backend !== undefined) {
  const api = await import("@tau/plugins/package");
  backend = api.validateBackendManifest(manifest.backend);
  validateManifest = api.validatePluginManifest;
  if (manifest.formatVersion !== 2 || backend.entry !== "backend.js")
    throw new Error("后台模板使用格式 2 和 backend.js 入口");
} else if (manifest.formatVersion !== 1) {
  throw new Error("普通插件使用格式 1");
}
const shared = [
  "@tau/plugins",
  "@tau/plugins/whiteboard",
  "@tau/plugins/sync",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];
await mkdir("dist", { recursive: true });
const staging = await mkdtemp(path.resolve("dist/.building-"));
const buildId = randomUUID();
const pointer = path.resolve("dist", `.building-pointer-${buildId}`);
try {
  const readme = await readFile("README.md", "utf8");
  if (!readme.trim()) throw new Error("README.md 必须包含插件介绍与使用说明");
  if (
    typeof manifest.description !== "string" ||
    !manifest.description.trim() ||
    manifest.description.length > 160
  )
    throw new Error("manifest.description 必须为1至160字简介");
  await writeFile(path.join(staging, "README.md"), readme);
  for (const name of ["LICENSE", "CHANGELOG.md"]) {
    try {
      await writeFile(path.join(staging, name), await readFile(name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const result = await build({
    entryPoints: ["src/index.tsx"],
    outfile: path.join(staging, "main.js"),
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2022",
    jsx: "automatic",
    external: shared,
    metafile: true,
    loader: { ".svg": "dataurl" },
    define: {
      __PLUGIN_META__: JSON.stringify({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
      }),
    },
  });
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      if (dependency.external && !shared.includes(dependency.path))
        throw new Error(`插件构建包含未支持的外部依赖：${dependency.path}`);
    }
  }
  const styles = Object.keys(result.metafile.outputs).some(file => file.endsWith("main.css"));
  if (backend) {
    const result = await build({
      entryPoints: ["src/backend.ts"],
      outfile: path.join(staging, backend.entry),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "es2022",
      external: ["@tau/plugins/backend"],
      metafile: true,
    });
    for (const output of Object.values(result.metafile.outputs))
      for (const dependency of output.imports)
        if (
          dependency.external &&
          dependency.path !== "@tau/plugins/backend" &&
          !isBuiltin(dependency.path)
        )
          throw new Error(`后台包含未打包依赖：${dependency.path}`);
  }
  const integrity = {};
  for (const file of [
    "main.js",
    ...(styles ? ["main.css"] : []),
    ...(backend ? [backend.entry] : []),
  ])
    integrity[file] = createHash("sha256")
      .update(await readFile(path.join(staging, file)))
      .digest("hex");
  const packaged = { ...manifest, integrity, ...(styles ? { styles: "main.css" } : {}) };
  if (validateManifest) validateManifest(packaged, { strict: true });
  await writeFile(path.join(staging, "manifest.json"), JSON.stringify(packaged, null, 2));
  const destination = path.resolve("dist", `${manifest.version}-${buildId}`);
  await rename(staging, destination);
  await writeFile(
    pointer,
    JSON.stringify({
      formatVersion: 1,
      id: manifest.id,
      buildId,
      directory: path.basename(destination),
    })
  );
  await rename(pointer, path.resolve("dist", `tau-build-${manifest.id}.json`));
  const zip = new AdmZip();
  zip.addLocalFolder(destination, manifest.id);
  const archive = path.resolve("dist", `${manifest.id}-${manifest.version}.zip`);
  zip.writeZip(archive);
  console.log(
    `构建完成：${archive}\n运行 pnpm install:local，或将 ZIP 解压至 ~/.editor/plugins，然后在插件管理中刷新列表并启用。`
  );
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
} finally {
  await rm(pointer, { force: true });
}
