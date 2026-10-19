// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrateVideoSettings } from "../video-settings-migration";

const directories: string[] = [];
async function directory() {
  const value = await mkdtemp(join(tmpdir(), "tau-video-setting-"));
  directories.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

const legacy = {
  integration: {
    bilibili: {
      enabled: true,
      credentials: { SESSDATA: " sess ", bfe_id: "bfe" },
      userInfo: { name: "用户", avatar: "https://a.test/a.png", isLogin: true, vipStatus: 1 },
    },
    youtube: { enabled: false, proxy: "http://127.0.0.1:7890" },
    github: { enabled: true, token: "t" },
  },
};

it("凭据与代理迁入同名插件配置，删除旧集成项并备份原设置", async () => {
  const root = await directory();
  const save = vi.fn();
  const next = await migrateVideoSettings(legacy, root, save);
  expect(next).toEqual({
    integration: { github: { enabled: true, token: "t" } },
    onlineVideo: {
      configurations: {
        bilibili: {
          SESSDATA: "sess",
          bfe_id: "bfe",
          user: { name: "用户", avatar: "https://a.test/a.png", vipStatus: 1 },
        },
        youtube: { proxy: "http://127.0.0.1:7890" },
      },
    },
  });
  expect(save).toHaveBeenCalledWith(next);
  const [backup] = await readdir(root);
  expect(JSON.parse(await readFile(join(root, backup), "utf8"))).toEqual(legacy);
});

it("空凭据不生成配置，已有新配置不覆盖，无旧项时原样返回", async () => {
  const root = await directory();
  const existing = { bilibili: { SESSDATA: "new" } };
  const next = await migrateVideoSettings(
    {
      integration: {
        bilibili: { credentials: { SESSDATA: "old" }, userInfo: {} },
        youtube: { proxy: "" },
      },
      onlineVideo: { configurations: existing },
    },
    root,
    vi.fn()
  );
  expect(next.onlineVideo).toEqual({ configurations: existing });
  expect(next.integration).toEqual({});
  const untouched = { integration: { github: {} } };
  const save = vi.fn();
  expect(await migrateVideoSettings(untouched, root, save)).toBe(untouched);
  expect(save).not.toHaveBeenCalled();
});

it("保存失败时抛出，调用方保留原设置", async () => {
  const root = await directory();
  const failure = new Error("disk");
  await expect(migrateVideoSettings(legacy, root, () => Promise.reject(failure))).rejects.toBe(
    failure
  );
});
