import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireDatabaseSyncLock, assertDatabaseNotSyncing } from "@tau/db-schema/sync";
import { CliSyncCoordinator } from "../cli-sync";

const roots: string[] = [];
const releases: Array<() => void> = [];
afterEach(() => {
  releases.splice(0).forEach(release => release());
  roots.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
  vi.useRealTimers();
});
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "cli-sync-coordinator-"));
  roots.push(root);
  const file = join(root, "data.db");
  writeFileSync(file, "fixture");
  const rawRelease = acquireDatabaseSyncLock(file);
  let released = false;
  const unlock = () => {
    if (!released) {
      released = true;
      rawRelease();
    }
  };
  releases.push(unlock);
  const releaseSessions = vi.fn();
  const deps = {
    appDir: root,
    acquireSessions: vi.fn(async () => releaseSessions),
    closeDatabase: vi.fn(),
    reconnect: vi.fn(async () => {
      expect(() => acquireDatabaseSyncLock(file)).toThrow("正在同步");
      expect(() => assertDatabaseNotSyncing(file, true)).not.toThrow();
    }),
    saveVersion: vi.fn(async () => {}),
  };
  return { coordinator: new CliSyncCoordinator(deps), deps, releaseSessions, unlock };
};
it("CLI 持锁期间不允许提前重连，完成后走维护重连并释放会话", async () => {
  const { coordinator, deps, releaseSessions, unlock } = setup();
  const { token } = await coordinator.begin("data.db", "pull");
  expect(deps.closeDatabase).toHaveBeenCalledWith("data.db");
  await coordinator.saveVersion(token, 3);
  expect(deps.saveVersion).toHaveBeenCalledWith("data.db", 3);
  await expect(coordinator.finish(token)).rejects.toThrow("释放");
  unlock();
  await coordinator.finish(token);
  expect(deps.reconnect).toHaveBeenCalledWith("data.db", "sync_download_reconnect");
  expect(releaseSessions).toHaveBeenCalledOnce();
  await coordinator.finish(token);
  expect(releaseSessions).toHaveBeenCalledOnce();
});
it("CLI 退出释放文件锁后桌面自动恢复，不留永久会话锁", async () => {
  vi.useFakeTimers();
  const { coordinator, deps, releaseSessions, unlock } = setup();
  await coordinator.begin("data.db", "push");
  unlock();
  await vi.advanceTimersByTimeAsync(1000);
  expect(deps.reconnect).toHaveBeenCalledWith("data.db", "sync_upload_reconnect");
  expect(releaseSessions).toHaveBeenCalledOnce();
});
it("数据库无法安全关闭时释放已取得的会话租约", async () => {
  const { coordinator, deps, releaseSessions } = setup();
  deps.closeDatabase.mockImplementation(() => {
    throw new Error("checkpoint busy");
  });
  await expect(coordinator.begin("data.db", "push")).rejects.toThrow("checkpoint busy");
  expect(releaseSessions).toHaveBeenCalledOnce();
});
it("重连失败也会释放会话租约并向 CLI 报错", async () => {
  const { coordinator, deps, releaseSessions, unlock } = setup();
  const { token } = await coordinator.begin("data.db", "pull");
  unlock();
  deps.reconnect.mockRejectedValueOnce(new Error("open failed"));
  await expect(coordinator.finish(token)).rejects.toThrow("open failed");
  expect(releaseSessions).toHaveBeenCalledOnce();
});
