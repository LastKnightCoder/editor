// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { readLocalPluginState } from "@tau/plugins/local-state";
import { migrateS3SyncSettings } from "../sync-settings-migration";
import { pluginSyncStatusFile } from "../plugin-sync-status";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const setup = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-sync-migration-"));
  roots.push(root);
  return root;
};
const legacy = () => ({
  sync: {
    active: "s3",
    autoSyncEnabled: true,
    s3: { bucket: "bucket", region: "test", pathPrefix: "note" },
  },
  integration: { s3: { accessKeyId: "test-only", secretAccessKey: "test-only", urlStyle: "path" } },
  database: { active: "data.db", databases: [{ name: "data.db", version: 7 }] },
});

it("配置字段重排不丢失资源同步账本身份", () => {
  expect(pluginSyncStatusFile("tau.sync-s3", { region: "test", bucket: "a" })).toBe(
    pluginSyncStatusFile("tau.sync-s3", { bucket: "a", region: "test" })
  );
});
it("迁移旧目标、启用意图和资源账本，不改版本、自动同步与共享凭据；重复执行无写入", async () => {
  const root = await setup(),
    setting = legacy(),
    save = vi.fn(async () => {});
  await mkdir(path.join(root, "sync-status"));
  const oldStatus = path.join(
    root,
    "sync-status",
    "s3-bucket-" + createHash("md5").update("note").digest("hex").slice(0, 8) + ".json"
  );
  await writeFile(
    oldStatus,
    JSON.stringify({
      provider: "s3",
      files: { "a.png": { syncStatus: "synced" } },
      lastSyncTime: 123,
    })
  );
  const result = await migrateS3SyncSettings(setting, root, save);
  expect(result.sync).toMatchObject({
    active: "plugin",
    autoSyncEnabled: true,
    plugin: { id: "tau.sync-s3" },
  });
  expect(result.sync).not.toHaveProperty("s3");
  expect(result.integration).toEqual(setting.integration);
  expect(result.database).toEqual(setting.database);
  expect((await readLocalPluginState(path.join(root, "plugins"))).enabled["tau.sync-s3"]).toBe(
    true
  );
  const config = result.sync?.plugin?.configurations?.["tau.sync-s3"];
  const status = JSON.parse(
    await readFile(
      path.join(root, "sync-status", pluginSyncStatusFile("tau.sync-s3", config)),
      "utf8"
    )
  );
  expect(status).toMatchObject({
    provider: "plugin",
    files: { "a.png": { syncStatus: "synced" } },
    lastSyncTime: 123,
  });
  expect(JSON.stringify(status)).not.toContain("test-only");
  expect(await migrateS3SyncSettings(result, root, save)).toBe(result);
  expect(save).toHaveBeenCalledTimes(1);
});
it("失败保留原配置可重试，已有插件配置优先，其他目标不被切换", async () => {
  const root = await setup(),
    setting = legacy();
  await expect(
    migrateS3SyncSettings(setting, root, async () => {
      throw new Error("disk");
    })
  ).rejects.toThrow("disk");
  expect(setting.sync.active).toBe("s3");
  expect(setting.sync.s3.bucket).toBe("bucket");
  const next = await migrateS3SyncSettings(
    {
      ...setting,
      sync: {
        ...setting.sync,
        active: "aliOSS",
        plugin: { id: "other", configurations: { "tau.sync-s3": { bucket: "new" } } },
      },
    },
    root,
    async () => {}
  );
  expect(next.sync).toMatchObject({
    active: "aliOSS",
    plugin: { id: "other", configurations: { "tau.sync-s3": { bucket: "new" } } },
  });
});
