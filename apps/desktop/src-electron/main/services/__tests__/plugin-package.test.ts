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
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable" as const,
    format: "cjs",
    id: "example.fixture",
    name: "读取样本",
    version: "1.0.0",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },

    profile: "web-v1" as const,
    targets: { desktop: { minAppVersion: "0.0.0" } },
    ...overrides,
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(directory, "main.js"), code);
  return directory;
}

describe("开发插件包读取", () => {
  it("后台只静态核验，不执行也不传给渲染端", async () => {
    const backendCode = "throw new Error('扫描不得执行后台');";
    const directory = await fixture({
      formatVersion: 2,
      platform: "desktop",
      minAppVersion: "0.59.0",
      backend: {
        entry: "backend.js",
        runtime: "node",
        apiVersion: 1,
        scope: "application",
        activation: "on-demand",
        lifetime: "idle",
        reason: "本机能力",
        systemAccess: [],
      },
      integrity: {
        "main.js": createHash("sha256")
          .update("throw new Error('目录扫描不能执行此入口');")
          .digest("hex"),
        "backend.js": createHash("sha256").update(backendCode).digest("hex"),
      },
    });
    await expect(readPluginPackage(directory)).rejects.toThrow();
    await writeFile(path.join(directory, "backend.js"), backendCode);
    const result = await readPluginPackage(directory);
    expect(result.manifest.backend?.entry).toBe("backend.js");
    expect(result).not.toHaveProperty("backendCode");
    await writeFile(path.join(directory, "backend.js"), "changed");
    await expect(readPluginPackage(directory)).rejects.toThrow("产物不完整");
    const outside = await fixture();
    await rm(path.join(directory, "backend.js"));
    await symlink(path.join(outside, "main.js"), path.join(directory, "backend.js"));
    await expect(readPluginPackage(directory)).rejects.toThrow("插件目录内");
  });
  it("未知字段和未声明文件不会成为执行入口", async () => {
    const directory = await fixture();
    const manifestPath = path.join(directory, "manifest.json");
    const { readFile } = await import("node:fs/promises");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const sync = "throw new Error('扫描不得执行后台入口')";
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        sync: "sync.js",
        integrity: {
          ...manifest.integrity,
          "sync.js": createHash("sha256").update(sync).digest("hex"),
        },
      })
    );
    await expect(readPluginPackage(directory)).rejects.toThrow("未声明文件");
  });
  it("检查产物后返回快照，读取不执行 JS", async () => {
    const result = await readPluginPackage(await fixture());
    expect(result.manifest.id).toBe("example.fixture");
    expect(result.code).toContain("目录扫描不能执行");
  });
  it.each([
    { formatVersion: 1 },
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
