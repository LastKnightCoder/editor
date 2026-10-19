// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  migratePublishSettings,
  assertCurrentPublishSettings,
} from "../publish-settings-migration";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-publish-migrate-"));
  roots.push(root);
  return root;
}
const legacy = () => ({
  integration: {
    github: { token: "github-secret", user: { name: "owner", email: "a@example.invalid" } },
    s3: {
      accessKeyId: "access",
      secretAccessKey: "s3-secret",
      endpoint: "https://s3.invalid",
      urlStyle: "path",
    },
    youtube: { proxy: "" },
  },
  publish: {
    active: "github",
    github: {
      repo: "owner/blog",
      branch: "gh-pages",
      basePath: "/blog/",
      useGitCli: true,
      gitWorkingDir: "/approved/cache",
    },
    s3: { bucket: "blog", region: "region", path: "site/", basePath: "/" },
    local: { basePath: "/local/" },
    site: { templateId: "tau.blog" },
  },
});
it("同时迁移活动和非活动目标，保留站点及本地配置，不安装启用插件", async () => {
  const root = await directory(),
    source = legacy();
  const save = vi.fn().mockResolvedValue(undefined),
    register = vi.fn().mockResolvedValue({ id: "cache-id", label: "/approved/cache" });
  const result = await migratePublishSettings(source, root, save, register);
  expect(result.publish).toMatchObject({
    active: "plugin",
    plugin: {
      id: "tau.publish-github",
      configurations: {
        "tau.publish-github": {
          token: "github-secret",
          repo: "owner/blog",
          branch: "gh-pages",
          cacheId: "cache-id",
        },
        "tau.publish-s3": { bucket: "blog", pathPrefix: "site/", secretAccessKey: "s3-secret" },
      },
    },
    local: source.publish.local,
    site: source.publish.site,
  });
  expect(result.integration).toEqual({ youtube: { proxy: "" } });
  expect(source).toEqual(legacy());
  expect(save).toHaveBeenCalledTimes(1);
  const backup = (await readdir(root)).find(name => name.endsWith(".bak"))!;
  expect(JSON.parse(await readFile(path.join(root, backup), "utf8"))).toEqual(source);
  expect(await readdir(root)).not.toContain("plugins");
  await migratePublishSettings(result, root, save, register);
  expect(save).toHaveBeenCalledTimes(1);
});
it("保存失败可从原设置重试，已有插件配置优先，不覆盖用户选择", async () => {
  const root = await directory();
  const source = {
    ...legacy(),
    publish: {
      ...legacy().publish,
      active: "plugin",
      plugin: { id: "other.plugin", configurations: { "tau.publish-github": { token: "edited" } } },
    },
  };
  const register = vi.fn().mockResolvedValue({ id: "id", label: "cache" });
  await expect(
    migratePublishSettings(
      source,
      root,
      async () => {
        throw new Error("磁盘失败");
      },
      register
    )
  ).rejects.toThrow("磁盘失败");
  expect(source.integration.github.token).toBe("github-secret");
  const result = await migratePublishSettings(source, root, async () => {}, register);
  expect(result.publish.plugin.id).toBe("other.plugin");
  expect(result.publish.plugin.configurations["tau.publish-github"]).toEqual({ token: "edited" });
  expect(register).not.toHaveBeenCalled();
  expect((await readdir(root)).filter(name => name.endsWith(".bak"))).toHaveLength(1);
});
it("新写入拒绝旧窗口回灌，空设置无需升级", async () => {
  expect(() => assertCurrentPublishSettings(legacy())).toThrow("重新加载");
  const save = vi.fn();
  expect(await migratePublishSettings({}, await directory(), save, vi.fn())).toEqual({});
  expect(save).not.toHaveBeenCalled();
});
