// @vitest-environment node
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DevelopmentPluginRegistry, restoreDevelopmentPlugin } from "../plugin-registry";
import type { DevelopmentPluginRecord } from "@/types/plugin-development";

let directory: string;
let filename: string;
let registry: DevelopmentPluginRegistry;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-registry-"));
  filename = path.join(directory, "registry.json");
  registry = new DevelopmentPluginRegistry(filename);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function fixture(): Promise<DevelopmentPluginRecord> {
  const source = path.join(directory, "author");
  await mkdir(source);
  const code = "throw new Error('登记不得执行');";
  const manifest = {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    format: "cjs" as const,
    id: "example.saved",
    name: "持久插件",
    version: "1.0.0",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
  };
  await writeFile(path.join(source, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(source, "main.js"), code);
  return { directory: source, manifest, enabled: false, starting: false };
}

it("同库别名和重新启动保持身份，不同库隔离；删除后同名库获得新身份", async () => {
  const first = await registry.open("笔记.db");
  const again = await new DevelopmentPluginRegistry(filename).open("笔记");
  expect(again.id).toBe(first.id);
  expect((await registry.open("其他.db")).id).not.toBe(first.id);
  await registry.retire("笔记.db");
  expect((await registry.open("笔记.db")).id).not.toBe(first.id);
});

it("并发登记串行保存，启动标记可恢复，移除只解除登记", async () => {
  const workspace = await registry.open("A");
  const record = await fixture();
  await Promise.all([
    registry.add(workspace.id, record),
    registry.add(workspace.id, {
      ...record,
      manifest: { ...record.manifest, id: "example.second" },
    }),
  ]);
  await registry.state(workspace.id, record.manifest.id, true, true);
  let restored = await new DevelopmentPluginRegistry(filename).open("A");
  expect(restored.plugins).toHaveLength(2);
  expect(restored.plugins[0]).toMatchObject({ enabled: true, starting: true });
  await registry.state(workspace.id, record.manifest.id, true, false);
  await registry.remove(workspace.id, record.manifest.id);
  restored = await registry.open("A");
  expect(restored.plugins).toHaveLength(1);
  expect(await readFile(path.join(record.directory, "main.js"), "utf8")).toContain("不得执行");
});

it("文件缺失或清单与产物一起改动仍保留失败记录，不自动信任新摘要", async () => {
  const record = await fixture();
  expect((await restoreDevelopmentPlugin(record)).artifact?.code).toContain("不得执行");
  const code = "console.log('changed')";
  await writeFile(path.join(record.directory, "main.js"), code);
  await writeFile(
    path.join(record.directory, "manifest.json"),
    JSON.stringify({
      ...record.manifest,
      integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    })
  );
  expect((await restoreDevelopmentPlugin(record)).error).toContain("产物已变化");
  await rm(path.join(record.directory, "main.js"));
  expect((await restoreDevelopmentPlugin(record)).artifact).toBeUndefined();
});

it("损坏的登记文件不覆盖，修复后同一实例可重试", async () => {
  await writeFile(filename, "broken");
  await expect(registry.open("A")).rejects.toThrow();
  expect(await readFile(filename, "utf8")).toBe("broken");
  await writeFile(filename, JSON.stringify({ version: 1, workspaces: [] }));
  expect((await registry.open("A")).plugins).toEqual([]);
});

it("写入失败不返回成功，解除故障后可重试", async () => {
  const blocked = path.join(directory, "blocked");
  await writeFile(blocked, "占位文件");
  const store = new DevelopmentPluginRegistry(path.join(blocked, "registry.json"));
  await expect(store.open("A")).rejects.toThrow();
  await rm(blocked);
  expect((await store.open("A")).name).toBe("A");
});
