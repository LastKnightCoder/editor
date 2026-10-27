// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { discoverPlugins } from "../plugin-discovery";

const roots: string[] = [];
async function root() {
  const value = path.join(await mkdtemp(path.join(tmpdir(), "tau-local-scan-")), "plugins");
  roots.push(path.dirname(value));
  return value;
}
async function put(directory: string, folder: string, id = folder) {
  const target = path.join(directory, folder);
  await mkdir(target, { recursive: true });
  const code = "throw new Error('扫描不得执行代码');";
  await writeFile(path.join(target, "main.js"), code);
  await writeFile(
    path.join(target, "manifest.json"),
    JSON.stringify({
      formatVersion: 3,
      apiVersion: 1,
      id,
      name: id,
      version: "1.0.0",
      platform: "portable" as const,
      format: "cjs",
      main: "main.js",
      integrity: { "main.js": createHash("sha256").update(code).digest("hex") },

      profile: "web-v1" as const,
      targets: { desktop: { minAppVersion: "0.0.0" } },
    })
  );
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(value => rm(value, { recursive: true, force: true })));
});
it("目录不存在时创建，仅扫描一层插件目录且不执行代码", async () => {
  const directory = await root();
  expect((await discoverPlugins(directory)).entries).toEqual([]);
  expect(await readdir(directory)).toEqual([]);
  await put(directory, "test.b");
  await put(directory, "test.a");
  await mkdir(path.join(directory, ".staging"));
  await writeFile(path.join(directory, "plugin.zip"), "zip");
  const result = await discoverPlugins(directory);
  expect(result.directory).toBe(directory);
  expect(result.entries.map(entry => entry.id)).toEqual(["test.a", "test.b"]);
  expect(result.entries.every(entry => entry.artifact?.code.includes("扫描不得执行"))).toBe(true);
});
it("坏包、ID 不一致和未完成构建分别显示错误，不阻断好包", async () => {
  const directory = await root();
  await put(directory, "good");
  await put(directory, "changed");
  await put(directory, "wrong", "different");
  await writeFile(path.join(directory, "changed/main.js"), "unfinished");
  await mkdir(path.join(directory, "broken"));
  const { entries } = await discoverPlugins(directory);
  expect(entries.find(entry => entry.id === "good")?.artifact).toBeDefined();
  expect(entries.find(entry => entry.id === "changed")?.error).toContain("产物不完整");
  expect(entries.find(entry => entry.id === "wrong")?.error).toContain("目录名");
  expect(entries.find(entry => entry.id === "broken")?.error).toBeTruthy();
  await rm(path.join(directory, "good"), { recursive: true });
  expect((await discoverPlugins(directory)).entries.some(entry => entry.id === "good")).toBe(false);
});
it("Skill 包按摘要校验后单独列出，插件包内 Skill 文件同样校验摘要", async () => {
  const directory = await root();
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const readme = "---\ndescription: 统一写作风格\n---\n# 风格\n";
  const target = path.join(directory, "test.pack");
  await mkdir(path.join(target, "skills/style"), { recursive: true });
  await writeFile(path.join(target, "skills/style/SKILL.md"), readme);
  const manifest = {
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    id: "test.pack",
    name: "风格包",
    version: "1.0.0",
    skills: ["style"],
    integrity: { "skills/style/SKILL.md": sha(readme) },
  };
  await writeFile(path.join(target, "manifest.json"), JSON.stringify(manifest));
  await put(directory, "test.plugin");
  const pluginManifest = path.join(directory, "test.plugin/manifest.json");
  const plugin = JSON.parse(await readFile(pluginManifest, "utf8"));
  await mkdir(path.join(directory, "test.plugin/skills/guide"), { recursive: true });
  await writeFile(path.join(directory, "test.plugin/skills/guide/SKILL.md"), "被改过");
  await writeFile(
    pluginManifest,
    JSON.stringify({
      ...plugin,
      skills: ["guide"],
      integrity: { ...plugin.integrity, "skills/guide/SKILL.md": sha(readme) },
    })
  );
  const { entries } = await discoverPlugins(directory);
  expect(entries.find(entry => entry.id === "test.pack")).toMatchObject({
    skillPackage: { id: "test.pack", skills: ["style"] },
  });
  expect(entries.find(entry => entry.id === "test.pack")?.artifact).toBeUndefined();
  expect(entries.find(entry => entry.id === "test.plugin")?.error).toContain("产物不完整");
  await writeFile(path.join(target, "skills/style/SKILL.md"), "被改过");
  expect((await discoverPlugins(directory)).entries[0].error).toContain("产物不完整");
});
