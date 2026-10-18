// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { readLocalPluginState } from "@tau/plugins/local-state";
import { migrateSyncPluginSettings } from "../sync-settings-migration";
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
  const result = await migrateSyncPluginSettings(setting, root, save);
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
  expect(await migrateSyncPluginSettings(result, root, save)).toBe(result);
  expect(save).toHaveBeenCalledTimes(1);
});
it("失败保留原配置可重试，已有插件配置优先，其他目标不被切换", async () => {
  const root = await setup(),
    setting = legacy();
  await expect(
    migrateSyncPluginSettings(setting, root, async () => {
      throw new Error("disk");
    })
  ).rejects.toThrow("disk");
  expect(setting.sync.active).toBe("s3");
  expect(setting.sync.s3.bucket).toBe("bucket");
  const next = await migrateSyncPluginSettings(
    {
      ...setting,
      sync: {
        ...setting.sync,
        active: "github",
        plugin: { id: "other", configurations: { "tau.sync-s3": { bucket: "new" } } },
      },
    },
    root,
    async () => {}
  );
  expect(next.sync).toMatchObject({
    active: "github",
    plugin: { id: "other", configurations: { "tau.sync-s3": { bucket: "new" } } },
  });
});

it("WebDAV迁移保存失败可重试，保留账本、版本、共享凭据及明确停用意图", async () => {
  const root = await setup();
  const { LocalPluginPreferences } = await import("@tau/plugins/local-state");
  const preferences = new LocalPluginPreferences(path.join(root, "plugins"));
  await preferences.load();
  await preferences.set("tau.sync-webdav", false);
  const setting = {
    sync: { active: "webdav", autoSyncEnabled: true, webdav: { pathPrefix: "/note" } },
    integration: {
      webdav: {
        url: "https://example.test/dav",
        username: "user",
        password: "secret",
        enabled: true,
      },
    },
    database: { version: 7 },
  };
  const hash = (value: string) => createHash("md5").update(value).digest("hex").slice(0, 8);
  await mkdir(path.join(root, "sync-status"));
  const oldStatus = path.join(
    root,
    "sync-status",
    `webdav-${hash("example.test")}-${hash("/note")}.json`
  );
  await writeFile(
    oldStatus,
    JSON.stringify({ files: { "a.png": { syncStatus: "synced" } }, lastSyncTime: 42 })
  );
  await expect(
    migrateSyncPluginSettings(setting, root, async () => {
      throw new Error("disk");
    })
  ).rejects.toThrow("disk");
  expect(setting.sync.active).toBe("webdav");
  expect(await readFile(oldStatus, "utf8")).toContain("a.png");
  const save = vi.fn(async () => {});
  const next = await migrateSyncPluginSettings(setting, root, save);
  expect(next.sync).not.toHaveProperty("webdav");
  expect(next.sync).toMatchObject({
    active: "plugin",
    autoSyncEnabled: true,
    plugin: { id: "tau.sync-webdav" },
  });
  expect(next.integration).toEqual(setting.integration);
  expect(next.database).toEqual(setting.database);
  expect((await readLocalPluginState(path.join(root, "plugins"))).enabled["tau.sync-webdav"]).toBe(
    false
  );
  const config = next.sync?.plugin?.configurations?.["tau.sync-webdav"];
  expect(config).toMatchObject({
    url: "https://example.test/dav",
    username: "user",
    password: "secret",
    pathPrefix: "/note",
  });
  const status = await readFile(
    path.join(root, "sync-status", pluginSyncStatusFile("tau.sync-webdav", config)),
    "utf8"
  );
  expect(JSON.parse(status)).toMatchObject({
    files: { "a.png": { syncStatus: "synced" } },
    lastSyncTime: 42,
  });
  expect(status).not.toContain("secret");
  await expect(readFile(oldStatus)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await migrateSyncPluginSettings(next, root, save)).toBe(next);
  expect(save).toHaveBeenCalledTimes(1);
});

it("WebDAV已有插件配置优先，不改变其他活动同步目标", async () => {
  const root = await setup();
  const next = await migrateSyncPluginSettings(
    {
      sync: {
        active: "github",
        webdav: { pathPrefix: "/old" },
        plugin: { id: "other", configurations: { "tau.sync-webdav": { url: "new" } } },
      },
      integration: { webdav: { url: "old" } },
    },
    root,
    async () => {}
  );
  expect(next.sync).toMatchObject({
    active: "github",
    plugin: { id: "other", configurations: { "tau.sync-webdav": { url: "new" } } },
  });
});

it("OSS迁移保留内嵌凭据回退、资源账本、自动同步与停用意图，并可同时升级S3", async () => {
  const root = await setup();
  const { LocalPluginPreferences } = await import("@tau/plugins/local-state");
  const preferences = new LocalPluginPreferences(path.join(root, "plugins"));
  await preferences.load();
  await preferences.set("tau.sync-oss", false);
  await mkdir(path.join(root, "sync-status"));
  const hash = createHash("md5").update("/note").digest("hex").slice(0, 8);
  await writeFile(
    path.join(root, "sync-status", `alioss-bucket-${hash}.json`),
    JSON.stringify({ files: { "a.png": { syncStatus: "synced" } }, lastSyncTime: 42 })
  );
  const setting = {
    ...legacy(),
    sync: {
      ...legacy().sync,
      active: "aliOSS",
      aliOSS: {
        bucket: "bucket",
        region: "oss-cn-hangzhou",
        path: "/note",
        accessKeyId: "embedded",
        accessKeySecret: "",
      },
    },
    integration: {
      ...legacy().integration,
      aliOSS: { accessKeyId: "shared", accessKeySecret: "shared-secret" },
    },
  };
  const saved = vi.fn(async () => {});
  const result = await migrateSyncPluginSettings(setting, root, saved);
  expect(result.sync).not.toHaveProperty("s3");
  expect(result.sync).not.toHaveProperty("aliOSS");
  expect(result.sync).toMatchObject({
    active: "plugin",
    autoSyncEnabled: true,
    plugin: {
      id: "tau.sync-oss",
      configurations: {
        "tau.sync-oss": { accessKeyId: "shared", accessKeySecret: "shared-secret", path: "/note" },
        "tau.sync-s3": { bucket: "bucket" },
      },
    },
  });
  expect(result.integration).toEqual(setting.integration);
  expect((await readLocalPluginState(path.join(root, "plugins"))).enabled["tau.sync-oss"]).toBe(
    false
  );
  const status = JSON.parse(
    await readFile(
      path.join(
        root,
        "sync-status",
        pluginSyncStatusFile("tau.sync-oss", result.sync?.plugin?.configurations?.["tau.sync-oss"])
      ),
      "utf8"
    )
  );
  expect(status).toMatchObject({
    provider: "plugin",
    files: { "a.png": { syncStatus: "synced" } },
    lastSyncTime: 42,
  });
  expect(await migrateSyncPluginSettings(result, root, saved)).toBe(result);
  expect(saved).toHaveBeenCalledTimes(1);
});
