import { build } from "esbuild";
import AdmZip from "adm-zip";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  writeFile,
  mkdtemp,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { isBuiltin } from "node:module";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const portable = manifest.formatVersion === 3;
if (!portable && (manifest.profile !== undefined || manifest.targets !== undefined))
  throw new Error("旧桌面格式不能混入跨端 profile/targets 声明");
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id))
  throw new Error("插件 ID 应为小写字母、数字及点或连字符组成的命名空间");
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)) throw new Error("插件版本无效");
// manifest 不写 main 时构建独立 Skill 包：没有代码入口，只打包 skills/ 目录
const skillPackage = manifest.main === undefined;
let backend;
let validateManifest;
if (portable) {
  if (skillPackage) throw new Error("跨端开发包必须有 JS 入口");
  const api = await import("@tau/plugins/portable");
  validateManifest = api.validatePortableDistributionManifest;
} else if (skillPackage) {
  if (manifest.backend !== undefined || manifest.formatVersion !== 1)
    throw new Error("Skill 包使用格式 1，不能声明后台");
} else if (manifest.backend !== undefined) {
  const api = await import("@tau/plugins/package");
  backend = api.validateBackendManifest(manifest.backend);
  validateManifest = api.validatePluginManifest;
  if (manifest.formatVersion !== 2 || backend.entry !== "backend.js")
    throw new Error("后台模板使用格式 2 和 backend.js 入口");
} else {
  if (manifest.formatVersion !== 1) throw new Error("普通桌面插件使用格式 1");
  validateManifest = (await import("@tau/plugins/package")).validatePluginManifest;
}
/** skills/<id>/ 下每个目录是一个 Skill：必须有带 description 的 SKILL.md，全部文件原样打包。 */
async function collectSkills(staging) {
  let folders;
  try {
    folders = (await readdir("skills", { withFileTypes: true }))
      .filter(entry => !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error.code === "ENOENT") return { ids: [], files: [] };
    throw error;
  }
  const ids = [];
  const files = [];
  async function walk(relative) {
    for (const entry of await readdir(relative, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["node_modules", "__pycache__"].includes(entry.name))
        continue;
      const file = `${relative}/${entry.name}`;
      if ((await lstat(file)).isSymbolicLink()) throw new Error(`Skill 不能包含符号链接：${file}`);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        await mkdir(path.dirname(path.join(staging, file)), { recursive: true });
        await cp(file, path.join(staging, file));
        files.push(file);
      }
    }
  }
  for (const folder of folders) {
    if (!folder.isDirectory()) throw new Error(`skills 下只能放 Skill 目录：${folder.name}`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(folder.name))
      throw new Error(`Skill 目录名只能使用字母、数字、点、横线和下划线：${folder.name}`);
    const readme = await readFile(`skills/${folder.name}/SKILL.md`, "utf8").catch(() => null);
    if (readme === null) throw new Error(`skills/${folder.name} 缺少 SKILL.md`);
    const front = readme.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!front || !/^description:\s*\S/m.test(front[1]))
      throw new Error(
        `skills/${folder.name}/SKILL.md 需要在开头的 front matter 中填写 description`
      );
    ids.push(folder.name);
    await walk(`skills/${folder.name}`);
  }
  return { ids, files };
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
if (portable)
  shared.splice(
    0,
    shared.length,
    ...(await import("@tau/plugins/portable")).PORTABLE_SHARED_MODULES
  );
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
  const skills = await collectSkills(staging);
  if (portable && skills.ids.length) throw new Error("跨端开发配置尚不支持 Skill 包");
  if (skillPackage && !skills.ids.length)
    throw new Error("Skill 包至少需要一个 skills/<id>/SKILL.md");
  const result = skillPackage
    ? undefined
    : await build({
        entryPoints: ["src/index.tsx"],
        outfile: path.join(staging, "main.js"),
        bundle: true,
        platform: "browser",
        format: "cjs",
        target: "es2022",
        jsx: "automatic",
        external: shared,
        plugins: [
          {
            name: "browser-dependencies",
            setup(builder) {
              builder.onResolve({ filter: /.*/ }, args => {
                if (isBuiltin(args.path))
                  return { errors: [{ text: `浏览器入口不能依赖 Node 内置模块：${args.path}` }] };
              });
            },
          },
        ],
        metafile: true,
        loader: { ".svg": "dataurl" },
        define: {
          __PLUGIN_PORTABLE__: JSON.stringify(portable),
          __PLUGIN_META__: JSON.stringify({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
          }),
        },
      });
  for (const output of Object.values(result?.metafile.outputs ?? {})) {
    for (const dependency of output.imports) {
      if (dependency.external && !shared.includes(dependency.path))
        throw new Error(`插件构建包含未支持的外部依赖：${dependency.path}`);
    }
  }
  const styles = Object.keys(result?.metafile.outputs ?? {}).some(file =>
    file.endsWith("main.css")
  );
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
    ...(skillPackage ? [] : ["main.js"]),
    ...(styles ? ["main.css"] : []),
    ...(backend ? [backend.entry] : []),
    ...skills.files,
  ])
    integrity[file] = createHash("sha256")
      .update(await readFile(path.join(staging, file)))
      .digest("hex");
  // skills 由 skills/ 目录生成，忽略 manifest 中手写的值
  const packaged = { ...manifest, integrity, ...(styles ? { styles: "main.css" } : {}) };
  delete packaged.skills;
  if (skills.ids.length) packaged.skills = skills.ids;

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
    `构建完成：${archive}\n${portable ? "格式 3 沿用插件中心上架规则，作者负责平台适配与测试；移动安装需兼容的正式客户端，桌面仅支持显式开发目录。" : "运行 pnpm install:local 安装到 Tau，然后在插件页点「重新扫描」。"}`
  );
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
} finally {
  await rm(pointer, { force: true });
}
