/**
 * 构建插件包：esbuild 打包入口（共享模块外置），Tailwind 只编译本插件源码用到的类，
 * 输出 dist/<版本>-<构建号>/（manifest + main.js + main.css，带完整性摘要）与 ZIP。
 */
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import AdmZip from "adm-zip";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SHARED = [
  "@tau/plugins",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

/** @type {import("esbuild").Plugin} */
const tailwind = {
  name: "tailwind",
  setup(builder) {
    builder.onLoad({ filter: /\.css$/ }, async args => {
      const base = path.dirname(args.path);
      const compiler = await compile(await readFile(args.path, "utf8"), {
        base,
        onDependency: () => undefined,
      });
      const scanner = new Scanner({ sources: compiler.sources });
      return { contents: compiler.build(scanner.scan()), loader: "css" };
    });
  },
};

await mkdir("dist", { recursive: true });
const staging = await mkdtemp(path.resolve("dist/.building-"));
const buildId = randomUUID();
try {
  const readme = await readFile("README.md", "utf8");
  if (!readme.trim()) throw new Error("README.md 不能为空");
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
    minify: true,
    external: SHARED,
    metafile: true,
    plugins: [tailwind],
    define: {
      __PLUGIN_META__: JSON.stringify({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
      }),
      "process.env.NODE_ENV": '"production"',
    },
  });
  // 只依赖公开 SDK：除第三方依赖外，不得打包本目录以外的仓库源码（桌面、内部包）
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input.startsWith("../") && !input.includes("node_modules/"))
      throw new Error(`插件引用了仓库内部源码：${input}`);
  }
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      if (dependency.external && !SHARED.includes(dependency.path))
        throw new Error(`插件构建包含未支持的外部依赖：${dependency.path}`);
    }
  }
  const integrity = {};
  for (const file of ["main.js", "main.css"])
    integrity[file] = createHash("sha256")
      .update(await readFile(path.join(staging, file)))
      .digest("hex");
  await writeFile(
    path.join(staging, "manifest.json"),
    JSON.stringify({ ...manifest, styles: "main.css", integrity }, null, 2)
  );
  const destination = path.resolve("dist", `${manifest.version}-${buildId}`);
  await rename(staging, destination);
  const zip = new AdmZip();
  zip.addLocalFolder(destination, manifest.id);
  const archive = path.resolve("dist", `${manifest.id}-${manifest.version}.zip`);
  zip.writeZip(archive);
  console.log(`构建完成：${archive}`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
