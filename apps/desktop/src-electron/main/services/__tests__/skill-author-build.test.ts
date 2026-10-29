// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";

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

it("同一作者构建器生成新跨端与旧桌面独立Skill包，无JS入口且脚本只作为文件打包", async () => {
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
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    path.join(directory, "node_modules/@tau/plugins/package.json"),
    JSON.stringify({
      type: "module",
      exports: {
        "./package": "./package.js",
        "./portable": "./portable.js",
        "./template": "./template.js",
      },
    })
  );
  await Promise.all(
    ["package", "portable", "template"].map(name =>
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
  await writeFile(path.join(directory, "README.md"), "# 写作技能\n帮助整理文字。");
  await writeFile(path.join(directory, "src/index.tsx"), "独立包不应构建这段无效 TypeScript !");
  const instructions = "---\nname: 写作\ndescription: 写作时使用\n---\n请先读取资料。";
  const script = "throw new Error('构建与安装不能执行脚本');";
  await writeFile(path.join(directory, "skills/writing/SKILL.md"), instructions);
  await writeFile(path.join(directory, "skills/writing/scripts/run.js"), script);
  const identity = {
    formatVersion: 1,
    apiVersion: 1,
    id: "example.writing",
    name: "写作",
    description: "写作规则",
    version: "1.0.0",
  };
  for (const platform of ["portable", "desktop"] as const) {
    await writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        ...identity,
        platform,
        ...(platform === "portable"
          ? {
              targets: {
                desktop: { minAppVersion: "0.60.4" },
                android: { minAppVersion: "0.2.13" },
                ios: { minAppVersion: "0.2.13" },
              },
            }
          : { minAppVersion: "0.59.0" }),
      })
    );
    execFileSync(process.execPath, ["build.mjs"], { cwd: directory, stdio: "pipe" });
    const archive = new AdmZip(
      await readFile(path.join(directory, "dist/example.writing-1.0.0.zip"))
    );
    const manifest = JSON.parse(archive.readAsText("example.writing/manifest.json"));
    expect(manifest).toMatchObject({ formatVersion: 1, platform, skills: ["writing"] });
    expect(manifest).not.toHaveProperty("main");
    expect(manifest).not.toHaveProperty("format");
    expect(manifest).not.toHaveProperty("profile");
    expect(manifest.integrity["skills/writing/SKILL.md"]).toBe(
      createHash("sha256").update(instructions).digest("hex")
    );
    expect(archive.readAsText("example.writing/skills/writing/scripts/run.js")).toBe(script);
    expect(archive.getEntry("example.writing/main.js")).toBeNull();
    if (platform === "portable") expect(manifest.targets.ios.minAppVersion).toBe("0.2.13");
    else expect(manifest).not.toHaveProperty("targets");
  }
}, 20_000);
