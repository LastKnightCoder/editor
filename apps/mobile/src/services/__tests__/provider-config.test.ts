import { expect, it } from "vitest";
import {
  enqueueProviderConfigWrite,
  flushProviderConfigWrites,
  mergeProviderSettings,
} from "../provider-config";
import type { SettingCompat } from "../../types";

it("保存错误返回给本次调用，不阻断后续服务动作", async () => {
  await expect(
    enqueueProviderConfigWrite(async () => {
      throw "写入失败";
    })
  ).rejects.toThrow("写入失败");
  await expect(flushProviderConfigWrites()).resolves.toBeUndefined();
  await expect(enqueueProviderConfigWrite(async () => "next")).resolves.toBe("next");
});

it("配置操作按提交顺序执行，等待会覆盖当前在途保存", async () => {
  const events: string[] = [];
  let finish!: () => void;
  const first = enqueueProviderConfigWrite(async () => {
    events.push("first");
    await new Promise<void>(resolve => {
      finish = resolve;
    });
  });
  const second = enqueueProviderConfigWrite(async () => {
    events.push("second");
  });
  for (let attempt = 0; attempt < 10 && events.length === 0; attempt++) await Promise.resolve();
  expect(events).toEqual(["first"]);
  finish();
  await Promise.all([first, second, flushProviderConfigWrites()]);
  expect(events).toEqual(["first", "second"]);
});

it("权威快照只覆盖原生管理字段，保留仍在编辑的普通设置", () => {
  const previous = {
    database: { active: "A.db", databases: [] },
    sync: { active: "plugin", plugin: { id: "old", configurations: {} }, autoSyncEnabled: true },
    imageBed: { active: "local", enableCompression: false, local: { path: "resources" } },
  } as SettingCompat;
  const snapshot = {
    database: { active: "B.db", databases: [{ name: "B.db", version: 7 }] },
    sync: {
      active: "plugin",
      plugin: { id: "fixture.sync", configurations: { "fixture.sync": { token: "fixture" } } },
      autoSyncEnabled: false,
    },
    imageBed: {
      active: "plugin",
      enableCompression: true,
      plugin: { id: "fixture.upload", configurations: {} },
      local: { path: "resources" },
    },
  } as SettingCompat;
  const result = mergeProviderSettings(previous, snapshot);
  expect(result.database.active).toBe("B.db");
  expect(result.sync).toMatchObject({ plugin: { id: "fixture.sync" }, autoSyncEnabled: true });
  expect(result.imageBed.enableCompression).toBe(false);
  expect(result.imageBed.plugin?.id).toBe("fixture.upload");
});
