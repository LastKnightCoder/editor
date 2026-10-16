import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import AdmZip from "adm-zip";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = import.meta.dirname;
const out = path.join(root, "dist/package");
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const shared = [
  "@tau/plugins",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/plugin.ts"],
  outfile: path.join(out, "main.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  external: shared,
  loader: { ".md": "text" },
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const input of Object.keys(result.metafile.inputs)) {
  if (input.startsWith("../") && !input.includes("node_modules/"))
    throw new Error(`插件不能打包仓库内部源码：${input}`);
}
for (const output of Object.values(result.metafile.outputs))
  for (const dependency of output.imports)
    if (dependency.external && !shared.includes(dependency.path))
      throw new Error(`外部依赖不受支持：${dependency.path}`);
const compiler = await compile(await readFile(path.join(root, "src/styles.css"), "utf8"), {
  base: path.join(root, "src"),
  onDependency() {},
});
await writeFile(
  path.join(out, "main.css"),
  compiler.build(new Scanner({ sources: compiler.sources }).scan())
);
const integrity = {};
for (const file of ["main.js", "main.css"])
  integrity[file] = createHash("sha256")
    .update(await readFile(path.join(out, file)))
    .digest("hex");
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify({ ...manifest, styles: "main.css", integrity }, null, 2)
);
await writeFile(path.join(out, "README.md"), await readFile(path.join(root, "README.md")));
const zip = new AdmZip();
zip.addLocalFolder(out, manifest.id);
zip.writeZip(path.join(root, "dist", `${manifest.id}-${manifest.version}.zip`));
console.log(`插件包：${out}`);
