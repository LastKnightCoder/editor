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
    await expect(store().set("w1", "weekly", "cards:rename", "granted")).rejects.toThrow(
      "未知的插件权限"
    );
    await expect(store().set("w1", "weekly", "cards:read", "maybe" as "granted")).rejects.toThrow(
      "授权状态无效"
    );
  });

  it("后台授权绑定版本和作用域，临时授权不跨重启", async () => {
    const permissions = store();
    const digest = "a".repeat(64);
    await permissions.setBackend("test.backend", "application", digest, "once");
    expect(await permissions.backendGranted("test.backend", "application", digest)).toBe(true);
    expect(await store().backendGranted("test.backend", "application", digest)).toBe(false);
    permissions.clearBackendSession("test.backend");
    expect(await permissions.backendGranted("test.backend", "application", digest)).toBe(false);
    await permissions.setBackend("test.backend", "application", digest, "always");
    expect(await store().backendGranted("test.backend", "application", digest)).toBe(true);
    expect(await permissions.backendGranted("test.backend", "other", digest)).toBe(false);
    expect(await permissions.backendGranted("test.backend", "application", "b".repeat(64))).toBe(
      false
    );
    await permissions.setBackend("test.backend", "application", digest, null);
    expect(await permissions.backendGranted("test.backend", "application", digest)).toBe(false);
  });

  it("调用计数只保留最近 7 天", async () => {
    const permissions = store();
    await permissions.record("w1", "weekly", { read: 3 });
    now += 3 * 86_400_000;
    await permissions.record("w1", "weekly", { read: 2, delete: 1 });
    expect(await permissions.usage("w1", "weekly")).toEqual({
      days: 7,
      read: 5,
      write: 0,
      delete: 1,
    });
    now += 6 * 86_400_000;
    expect(await permissions.usage("w1", "weekly")).toEqual({
      days: 7,
      read: 2,
      write: 0,
      delete: 1,
    });
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
    expect(await permissions.usage("w1", "weekly")).toEqual({
      days: 7,
      read: 0,
      write: 0,
      delete: 0,
    });
  });
});
