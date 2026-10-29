// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { PluginContentInspectionCache } from "../plugin-content-inspection-cache";
import { PluginPackageIntegrityCache } from "../plugin-package-integrity-cache";

const cryptor = {
  encrypt: (value: string) => Buffer.from(value, "utf8"),
  decrypt: (value: Buffer) => value.toString("utf8"),
};

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

it("复用同一插件快照的检查结果，快照变化后失效", async () => {
  root = await mkdtemp(path.join(tmpdir(), "tau-content-inspection-cache-"));
  const filePath = path.join(root, "plugin-content-inspection-cache.bin");
  const first = await PluginContentInspectionCache.load(filePath, "snapshot-a", cryptor);
  expect(first.get("example.plugin")).toBeUndefined();
  first.set("example.plugin", {
    editor: true,
    whiteboard: false,
    metrics: [{ type: "example.node", textFields: ["title"] }],
  });
  await first.save();

  const persisted = JSON.parse(cryptor.decrypt(await readFile(filePath)));
  expect(persisted).toMatchObject({ version: 1, snapshotKey: "snapshot-a" });
  const sameSnapshot = await PluginContentInspectionCache.load(filePath, "snapshot-a", cryptor);
  expect(sameSnapshot.get("example.plugin")).toEqual({
    editor: true,
    whiteboard: false,
    metrics: [{ type: "example.node", textFields: ["title"] }],
  });

  const changedSnapshot = await PluginContentInspectionCache.load(filePath, "snapshot-b", cryptor);
  expect(changedSnapshot.get("example.plugin")).toBeUndefined();
});

it("忽略损坏的检查缓存", async () => {
  root = await mkdtemp(path.join(tmpdir(), "tau-content-inspection-cache-"));
  const filePath = path.join(root, "plugin-content-inspection-cache.bin");
  const cache = await PluginContentInspectionCache.load(filePath, "snapshot", cryptor);
  cache.set("example.plugin", {
    editor: true,
    whiteboard: false,
    metrics: [],
  });
  await cache.save();
  await (await import("node:fs/promises")).writeFile(filePath, "{broken");

  const recovered = await PluginContentInspectionCache.load(filePath, "snapshot", cryptor);
  expect(recovered.get("example.plugin")).toBeUndefined();
});

it("没有系统加密器时不把检查结论写入明文缓存", async () => {
  root = await mkdtemp(path.join(tmpdir(), "tau-content-inspection-cache-"));
  const filePath = path.join(root, "plugin-content-inspection-cache.bin");
  const cache = await PluginContentInspectionCache.load(filePath, "snapshot");
  cache.set("example.plugin", { editor: true, whiteboard: false, metrics: [] });
  await cache.save();
  await expect(readFile(filePath)).rejects.toMatchObject({ code: "ENOENT" });
});

it("仅文件指纹和清单摘要一致时复用包完整性结果", async () => {
  root = await mkdtemp(path.join(tmpdir(), "tau-content-inspection-cache-"));
  const filePath = path.join(root, "plugin-package-integrity-cache.bin");
  const cache = await PluginPackageIntegrityCache.load(filePath, cryptor);
  const fingerprint = {
    size: 100,
    mtimeMs: 1,
    ctimeMs: 2,
    birthtimeMs: 3,
    dev: 4,
    ino: 5,
  };
  cache.set(path.join(root, "plugin", "main.js"), "a".repeat(64), fingerprint);
  await cache.save();

  const restored = await PluginPackageIntegrityCache.load(filePath, cryptor);
  expect(restored.has(path.join(root, "plugin", "main.js"), "a".repeat(64), fingerprint)).toBe(
    true
  );
  expect(restored.has(path.join(root, "plugin", "main.js"), "b".repeat(64), fingerprint)).toBe(
    false
  );
  expect(
    restored.has(path.join(root, "plugin", "main.js"), "a".repeat(64), {
      ...fingerprint,
      size: fingerprint.size + 1,
    })
  ).toBe(false);
});
