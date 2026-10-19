// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrateImageSettings } from "../image-settings-migration";

const directories: string[] = [];
async function directory() {
  const value = await mkdtemp(join(tmpdir(), "tau-image-setting-"));
  directories.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
const account = (id: string) => ({
  id,
  name: id,
  providerType: "openai",
  baseUrl: `https://${id}.test/v1`,
  apiKey: `test-${id}`,
  modelName: `model-${id}`,
});

it("保留多个账号与当前选择，新配置优先，备份原始设置", async () => {
  const root = await directory();
  const current = {
    id: "new",
    pluginId: "test.custom",
    name: "新",
    modelId: "model",
    config: { region: "a" },
  };
  const setting = {
    imageGeneration: { providers: [account("a"), account("b"), current], currentProviderId: "b" },
  };
  const save = vi.fn();
  const next = await migrateImageSettings(setting, root, save);
  expect(next.imageGeneration).toEqual({
    currentProviderId: "b",
    providers: ["a", "b"]
      .map(id => ({
        id,
        name: id,
        pluginId: "tau.images-openai",
        modelId: `model-${id}`,
        config: { baseUrl: `https://${id}.test/v1`, apiKey: `test-${id}` },
      }))
      .concat([current] as never[]),
  });
  expect(save).toHaveBeenCalledWith(next);
  const [backup] = await readdir(root);
  expect(JSON.parse(await readFile(join(root, backup), "utf8"))).toEqual(setting);
});

it("未知提供方与保存失败不改变原设置，空列表不复活账号", async () => {
  const root = await directory();
  const unknown = {
    imageGeneration: {
      providers: [{ ...account("a"), providerType: "unknown" }],
      currentProviderId: "a",
    },
  };
  const save = vi.fn();
  await expect(migrateImageSettings(unknown, root, save)).rejects.toThrow("无法迁移");
  expect(save).not.toHaveBeenCalled();
  expect(unknown.imageGeneration.providers[0].providerType).toBe("unknown");
  const legacy = { imageGeneration: { providers: [account("a")], currentProviderId: "a" } };
  await expect(
    migrateImageSettings(legacy, root, async () => {
      throw new Error("disk");
    })
  ).rejects.toThrow("disk");
  expect(legacy.imageGeneration.providers[0]).toEqual(account("a"));
  const empty = { imageGeneration: { providers: [], currentProviderId: "" } };
  expect(await migrateImageSettings(empty, root, save)).toBe(empty);
});
