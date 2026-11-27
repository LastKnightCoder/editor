// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { PACKAGE_FORMAT_MIN_VERSIONS, validateUnifiedPackageManifest } from "@tau/plugins/unified";

const root = path.resolve(import.meta.dirname, "../../../../../..");
const workspaceRequire = createRequire(path.join(root, "package.json"));
const sdkRequire = createRequire(path.join(root, "packages/plugins/package.json"));
const { build } = sdkRequire("esbuild") as typeof import("esbuild");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});

const sha256 = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");
const identity = {
  id: "example.writing",
  name: "写作",
  description: "写作规则",
  version: "1.0.0",
};
const instructions = "---\nname: 写作\ndescription: 写作时使用\n---\n请先读取资料。";
const script = "throw new Error('构建与安装不能执行脚本');";

/**
 * 按插件模板作者的方式建一个只含 Skill 的项目，执行模板自带的构建脚本，返回压缩包与包内清单。
 * 构建脚本在临时目录里通过一份精简的 @tau/plugins 取用 SDK，入口与它运行期 import 的子路径一致。
 */
async function buildSkillPackage(author: Record<string, unknown>) {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-skill-author-"));
  directories.push(directory);
  await mkdir(path.join(directory, "src"));
  await mkdir(path.join(directory, "skills/writing/scripts"), { recursive: true });
  await mkdir(path.join(directory, "node_modules/@tau/plugins"), { recursive: true });
  for (const name of ["esbuild", "adm-zip"])
    await symlink(
      path.dirname(
        (name === "esbuild" ? sdkRequire : workspaceRequire).resolve(`${name}/package.json`)
      ),
      path.join(directory, "node_modules", name)
    );
  const entries = ["package", "portable", "unified"];
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    path.join(directory, "node_modules/@tau/plugins/package.json"),
    JSON.stringify({
      type: "module",
      exports: Object.fromEntries(entries.map(name => [`./${name}`, `./${name}.js`])),
    })
  );
  await Promise.all(
    entries.map(name =>
      build({
        entryPoints: [path.join(root, `packages/plugins/src/${name}.ts`)],
        outfile: path.join(directory, `node_modules/@tau/plugins/${name}.js`),
        bundle: true,
        format: "esm",
        platform: "node",
      })
    )
  );
  await cp(
    path.join(root, "plugins/tau-plugin-template/build.mjs"),
    path.join(directory, "build.mjs")
  );
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(author));
  await writeFile(path.join(directory, "README.md"), "# 写作技能\n帮助整理文字。");
  // Skill 包没有代码入口：src/ 里留着编译不过的源码，构建也不该碰它
  await writeFile(path.join(directory, "src/index.tsx"), "独立包不应构建这段无效 TypeScript !");
  await writeFile(path.join(directory, "skills/writing/SKILL.md"), instructions);
  await writeFile(path.join(directory, "skills/writing/scripts/run.js"), script);
  execFileSync(process.execPath, ["build.mjs"], { cwd: directory, stdio: "pipe" });
  const archive = new AdmZip(path.join(directory, "dist/example.writing-1.0.0.zip"));
  const rawManifest = archive.readAsText("example.writing/manifest.json");
  return { archive, manifest: JSON.parse(rawManifest), rawManifest };
}

it("独立 Skill 包产出格式 4 清单：没有代码入口，脚本只作为文件打包", async () => {
  const { archive, manifest, rawManifest } = await buildSkillPackage({
    kind: "skills",
    ...identity,
    targets: {
      desktop: { minAppVersion: "0.66.3" },
      android: { minAppVersion: "0.5.1" },
      ios: { minAppVersion: "0.5.1" },
    },
  });
  expect(manifest).toMatchObject({
    formatVersion: 4,
    apiVersion: 1,
    platform: "portable",
    kind: "skills",
    ...identity,
    skills: ["writing"],
  });
  for (const field of ["main", "format", "profile"]) expect(manifest).not.toHaveProperty(field);
  // 构建器的产物必须被 SDK 的读取边界原样接受：两端对同一份清单达成一致
  expect(validateUnifiedPackageManifest(JSON.parse(rawManifest))).toMatchObject({
    kind: "skills",
    skills: ["writing"],
  });

  expect(Object.keys(manifest.integrity).sort()).toEqual([
    "skills/writing/SKILL.md",
    "skills/writing/scripts/run.js",
  ]);
  expect(manifest.integrity["skills/writing/SKILL.md"]).toBe(sha256(instructions));
  expect(manifest.integrity["skills/writing/scripts/run.js"]).toBe(sha256(script));
  // 脚本原样落包；构建过程中一旦被执行，脚本里的 throw 就会让构建失败
  expect(archive.readAsText("example.writing/skills/writing/scripts/run.js")).toBe(script);
  // 包里只有清单、说明和摘要列出的文件，没有摘要之外的散落文件
  const files = archive
    .getEntries()
    .map(entry => entry.entryName)
    .filter(name => !name.endsWith("/"))
    .sort();
  expect(files).toEqual(
    [
      "example.writing/manifest.json",
      "example.writing/README.md",
      ...Object.keys(manifest.integrity).map(file => `example.writing/${file}`),
    ].sort()
  );
}, 20_000);

it("最低客户端版本低于格式要求时抬到格式下限，不低于时保留作者写的值", async () => {
  const { manifest } = await buildSkillPackage({
    kind: "skills",
    ...identity,
    targets: {
      desktop: { minAppVersion: "99.0.0" },
      android: { minAppVersion: "0.0.1" },
      ios: { minAppVersion: "0.0.1" },
    },
  });
  expect(manifest.targets).toEqual({
    desktop: { minAppVersion: "99.0.0" },
    android: { minAppVersion: PACKAGE_FORMAT_MIN_VERSIONS.android },
    ios: { minAppVersion: PACKAGE_FORMAT_MIN_VERSIONS.ios },
  });
}, 20_000);

it("只面向桌面的 Skill 包只保留桌面目标，旧的桌面写法也能构建", async () => {
  // 旧写法不带 kind，构建脚本靠「格式 1 且没有代码入口」把它识别成 Skill 包
  const authors = [
    { kind: "skills", ...identity, targets: { desktop: { minAppVersion: "0.59.0" } } },
    { ...identity, formatVersion: 1, apiVersion: 1, platform: "desktop", minAppVersion: "0.59.0" },
  ];
  for (const author of authors) {
    const { manifest } = await buildSkillPackage(author);
    expect(manifest).toMatchObject({ formatVersion: 4, kind: "skills", skills: ["writing"] });
    expect(manifest.targets).toEqual({
      desktop: { minAppVersion: PACKAGE_FORMAT_MIN_VERSIONS.desktop },
    });
  }
}, 20_000);
