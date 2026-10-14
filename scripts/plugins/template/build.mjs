import { build } from "esbuild";
import { mkdir, readFile, writeFile, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
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
  const destination = path.resolve("dist", `${manifest.version}-${randomUUID()}`);
  await rename(staging, destination);
  console.log(`构建完成，在 Tau 中选择此目录：\n${destination}`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
