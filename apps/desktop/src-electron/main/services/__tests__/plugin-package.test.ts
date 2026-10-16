// @vitest-environment node
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPluginPackage } from "../plugin-package";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});
async function fixture(overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-package-"));
  directories.push(directory);
  const code = "throw new Error('目录扫描不能执行此入口');";
  const manifest = {
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    format: "cjs",
    id: "example.fixture",
    name: "读取样本",
    version: "1.0.0",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    ...overrides,
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(directory, "main.js"), code);
  return directory;
}

describe("开发插件包读取", () => {
  it("检查产物后返回快照，读取不执行 JS", async () => {
    const result = await readPluginPackage(await fixture());
    expect(result.manifest.id).toBe("example.fixture");
    expect(result.code).toContain("目录扫描不能执行");
  });
  it.each([
    { apiVersion: 2 },
    { format: "esm" },
    { platform: "mobile" },
    { formatVersion: 2 },
    { id: "../escape" },
    { version: "future" },
    { main: "../main.js" },
    { main: "/main.js" },
    { styles: "../other.css" },
    { integrity: {} },
  ])("拒绝无效清单 %j", async overrides => {
    await expect(readPluginPackage(await fixture(overrides))).rejects.toThrow();
  });
  it("拒绝缺文件和构建后发生变化的产物", async () => {
    const directory = await fixture();
    await writeFile(path.join(directory, "main.js"), "changed");
    await expect(readPluginPackage(directory)).rejects.toThrow("产物不完整");
    await rm(path.join(directory, "main.js"));
    await expect(readPluginPackage(directory)).rejects.toThrow();
  });
  it("拒绝指向目录外的符号链接", async () => {
    const directory = await fixture();
    const outside = await fixture();
    await rm(path.join(directory, "main.js"));
    await symlink(path.join(outside, "main.js"), path.join(directory, "main.js"));
    await expect(readPluginPackage(directory)).rejects.toThrow("插件目录内");
  });
});
