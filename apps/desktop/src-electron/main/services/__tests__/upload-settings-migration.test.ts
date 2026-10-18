// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { LocalPluginPreferences, readLocalPluginState } from "@tau/plugins/local-state";
import { migrateUploadSettings } from "../upload-settings-migration";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-upload-"));
  roots.push(root);
  return root;
}

it("迁移旧S3目标并保留博客账号、已有停用意图和访问加速", async () => {
  const root = await setup();
  const prefs = new LocalPluginPreferences(path.join(root, "plugins"));
  await prefs.load();
  await prefs.set("tau.upload-s3", false);
  const setting = {
    imageBed: {
      active: "s3",
      enableCompression: true,
      s3: { bucket: "test", region: "us-east-1", pathPrefix: "images" },
      github: { cdn: "jsdelivr" },
    },
    integration: { s3: { accessKeyId: "test", secretAccessKey: "test" } },
  };
  const before = structuredClone(setting),
    save = vi.fn();
  const next = await migrateUploadSettings(setting, root, save);
  expect(setting).toEqual(before);
  expect(next.imageBed).toMatchObject({
    active: "plugin",
    githubCdn: "jsdelivr",
    plugin: {
      id: "tau.upload-s3",
      configurations: { "tau.upload-s3": { bucket: "test", pathPrefix: "images" } },
    },
  });
  expect(next.imageBed).not.toHaveProperty("s3");
  expect(next.integration).toEqual(setting.integration);
  expect((await readLocalPluginState(path.join(root, "plugins"))).enabled["tau.upload-s3"]).toBe(
    false
  );
  expect(await migrateUploadSettings(next, root, save)).toBe(next);
  expect(save).toHaveBeenCalledTimes(1);
});

it("WebDAV图床直接退役，已迁移的WebDAV同步插件配置不变", async () => {
  const setting = {
    imageBed: { active: "webdav", webdav: { pathPrefix: "/images" } },
    integration: { webdav: { password: "test" }, aliOSS: {} },
    sync: {
      plugin: {
        id: "tau.sync-webdav",
        configurations: { "tau.sync-webdav": { url: "https://example.test" } },
      },
    },
  };
  const next = await migrateUploadSettings(setting, await setup(), vi.fn());
  expect(next.imageBed).toEqual({ active: "local", githubCdn: null });
  expect(next.integration).toEqual({});
  expect(next.sync).toEqual(setting.sync);
});

it("保存失败不修改输入，已保存插件配置优先", async () => {
  const setting = {
    imageBed: {
      active: "plugin",
      github: {},
      plugin: { id: "custom.upload", configurations: { "custom.upload": { path: "new" } } },
    },
  };
  const before = structuredClone(setting);
  await expect(
    migrateUploadSettings(setting, await setup(), async () => {
      throw new Error("磁盘写入失败");
    })
  ).rejects.toThrow("磁盘写入失败");
  expect(setting).toEqual(before);
  const next = await migrateUploadSettings(setting, await setup(), vi.fn());
  expect(next.imageBed).toMatchObject({ active: "plugin", plugin: setting.imageBed.plugin });
});
