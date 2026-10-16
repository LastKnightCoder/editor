import { build } from "esbuild";
import AdmZip from "adm-zip";
import { mkdir, readFile, writeFile, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id))
  throw new Error("插件 ID 应为小写字母、数字及点或连字符组成的命名空间");
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) throw new Error("插件版本无效");
const shared = [
  "@tau/plugins",
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
        throw new Error(`未支持的宿主模块：${dependency.path}`);
    }
  }
  const styles = Object.keys(result.metafile.outputs).some(file => file.endsWith("main.css"));
  const integrity = {};
  for (const file of ["main.js", ...(styles ? ["main.css"] : [])])
    integrity[file] = createHash("sha256")
      .update(await readFile(path.join(staging, file)))
      .digest("hex");
  await writeFile(
    path.join(staging, "manifest.json"),
    JSON.stringify({ ...manifest, integrity, ...(styles ? { styles: "main.css" } : {}) }, null, 2)
  );
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
    `构建完成：${archive}\n运行 npm run install:local，或将 ZIP 解压至 ~/.editor/plugins，然后在插件管理中刷新列表并启用。`
  );
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
} finally {
  await rm(pointer, { force: true });
}
