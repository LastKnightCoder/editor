// @vitest-environment node
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PluginWorkspaceRegistry } from "../plugin-registry";

let directory: string;
let filename: string;
let registry: PluginWorkspaceRegistry;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-registry-"));
  filename = path.join(directory, "registry.json");
  registry = new PluginWorkspaceRegistry(filename);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("同库别名和重新启动保持身份，不同库隔离，并发打开只分配一次", async () => {
  const [first, concurrent] = await Promise.all([registry.open("笔记.db"), registry.open("笔记")]);
  expect(concurrent.id).toBe(first.id);
  expect((await new PluginWorkspaceRegistry(filename).open("笔记")).id).toBe(first.id);
  expect((await registry.open("其他.db")).id).not.toBe(first.id);
});

it("沿用旧登记文件的身份，写回时丢弃开发插件登记", async () => {
  await writeFile(
    filename,
    JSON.stringify({
      version: 1,
      workspaces: [{ name: "A", id: "stable", plugins: [{ directory: "/author" }] }],
    })
  );
  expect(await registry.open("A.db")).toEqual({ name: "A", id: "stable" });
  expect(await readFile(filename, "utf8")).not.toContain("plugins");
});

it("损坏的登记文件不覆盖，修复后同一实例可重试", async () => {
  await writeFile(filename, "broken");
  await expect(registry.open("A")).rejects.toThrow();
  expect(await readFile(filename, "utf8")).toBe("broken");
  await writeFile(filename, JSON.stringify({ version: 1, workspaces: [] }));
  expect((await registry.open("A")).name).toBe("A");
});

it("写入失败不返回成功，解除故障后可重试", async () => {
  const blocked = path.join(directory, "blocked");
  await writeFile(blocked, "占位文件");
  const store = new PluginWorkspaceRegistry(path.join(blocked, "registry.json"));
  await expect(store.open("A")).rejects.toThrow();
  await rm(blocked);
  expect((await store.open("A")).name).toBe("A");
});
