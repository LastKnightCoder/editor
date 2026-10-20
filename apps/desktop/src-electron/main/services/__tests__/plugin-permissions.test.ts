import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PluginPermissionStore } from "../plugin-permissions";

describe("PluginPermissionStore", () => {
  let directory: string;
  let now = new Date(2026, 9, 20, 12).getTime();
  const store = () => new PluginPermissionStore(path.join(directory, "p.json"), () => now);

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "plugin-permissions-"));
    now = new Date(2026, 9, 20, 12).getTime();
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it("按工作区保存授权，清空后不留空记录", async () => {
    const permissions = store();
    await permissions.set("w1", "weekly", "cards:read", "granted");
    await permissions.set("w1", "weekly", "todos:read", "blocked");
    expect(await permissions.snapshot("w1")).toEqual({
      weekly: { "cards:read": "granted", "todos:read": "blocked" },
    });
    expect(await permissions.snapshot("w2")).toEqual({});
    await permissions.set("w1", "weekly", "cards:read", null);
    await permissions.set("w1", "weekly", "todos:read", null);
    expect(JSON.parse(await readFile(path.join(directory, "p.json"), "utf8")).grants).toEqual({});
  });

  it("拒绝未知权限与非法状态", async () => {
    await expect(store().set("w1", "weekly", "cards:write", "granted")).rejects.toThrow(
      "未知的插件权限"
    );
    await expect(store().set("w1", "weekly", "cards:read", "maybe" as "granted")).rejects.toThrow(
      "授权状态无效"
    );
  });

  it("调用计数只保留最近 7 天", async () => {
    const permissions = store();
    await permissions.record("w1", "weekly", { read: 3 });
    now += 3 * 86_400_000;
    await permissions.record("w1", "weekly", { read: 2 });
    expect(await permissions.usage("w1", "weekly")).toEqual({ days: 7, read: 5 });
    now += 6 * 86_400_000;
    expect(await permissions.usage("w1", "weekly")).toEqual({ days: 7, read: 2 });
  });

  it("卸载时清除所有工作区的授权与计数", async () => {
    const permissions = store();
    await permissions.set("w1", "weekly", "cards:read", "granted");
    await permissions.set("w2", "weekly", "cards:read", "granted");
    await permissions.set("w2", "other", "cards:read", "granted");
    await permissions.record("w1", "weekly", { read: 1 });
    await permissions.forget("weekly");
    expect(await permissions.snapshot("w1")).toEqual({});
    expect(await permissions.snapshot("w2")).toEqual({ other: { "cards:read": "granted" } });
    expect(await permissions.usage("w1", "weekly")).toEqual({ days: 7, read: 0 });
  });
});
