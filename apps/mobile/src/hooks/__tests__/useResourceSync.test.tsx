import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useResourceSync } from "../useResourceSync";
import * as tauri from "../../services/tauri";
import { setMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { mobilePluginState } from "../../app/plugins/content";
import type { ResourceSyncProgress, ResourceSyncStatusFile, SettingCompat } from "../../types";

vi.mock("../../services/tauri", () => ({
  resourceSyncRefresh: vi.fn(),
  resourceSyncGetStatus: vi.fn(),
  resourceSyncGetProgress: vi.fn(),
  resourceSyncStart: vi.fn(),
  resourceSyncRetryFailed: vi.fn(),
  resourceSyncCancel: vi.fn(),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let hook: ReturnType<typeof useResourceSync>;
function Probe() {
  hook = useResourceSync();
  return null;
}
async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Probe />));
}
const setting = (database: string) =>
  ({ database: { active: database, databases: [] } }) as unknown as SettingCompat;
function deferred() {
  let resolve!: (value: ResourceSyncStatusFile | null) => void;
  const promise = new Promise<ResourceSyncStatusFile | null>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  mobilePluginState.set({ phase: "ready", message: "" });
  setMobileSettingSnapshot(setting("A.db"));
  vi.mocked(tauri.resourceSyncRefresh).mockResolvedValue(null);
  vi.mocked(tauri.resourceSyncStart).mockResolvedValue({ ok: true, message: "资源同步已启动" });
  vi.mocked(tauri.resourceSyncGetStatus).mockResolvedValue(null);
  vi.mocked(tauri.resourceSyncGetProgress).mockResolvedValue({
    status: "idle",
  } as ResourceSyncProgress);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  setMobileSettingSnapshot(null);
  root = null;
  container = null;
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("页面进入与恢复同时刷新时复用请求，完成后可重新检查", async () => {
  const remote = deferred();
  vi.mocked(tauri.resourceSyncRefresh).mockReturnValueOnce(remote.promise);
  await mount();
  const first = hook.refreshResourceStatus();
  const second = hook.refreshResourceStatus();
  expect(first).toBe(second);
  expect(tauri.resourceSyncRefresh).toHaveBeenCalledTimes(1);
  await act(async () => {
    remote.resolve(null);
    await Promise.all([first, second]);
  });
  await act(async () => {
    await hook.refreshResourceStatus();
  });
  expect(tauri.resourceSyncRefresh).toHaveBeenCalledTimes(2);
});

it("切换设置后使用新请求，迟到的旧账本不覆盖当前状态", async () => {
  const old = deferred();
  vi.mocked(tauri.resourceSyncRefresh).mockReturnValueOnce(old.promise);
  await mount();
  const first = hook.refreshResourceStatus();
  setMobileSettingSnapshot(setting("B.db"));
  await act(async () => {
    await hook.refreshResourceStatus();
  });
  expect(tauri.resourceSyncRefresh).toHaveBeenCalledTimes(2);
  await act(async () => {
    old.resolve({ provider: "旧服务" } as ResourceSyncStatusFile);
    await first;
  });
  expect(hook.statusFile).toBeNull();
});

it("云端检查失败保持未知和错误，不把旧账本作为检查成功返回", async () => {
  vi.mocked(tauri.resourceSyncRefresh).mockRejectedValue(new Error("SYNC_PLUGIN_FAILED:网络超时"));
  await mount();
  await act(async () => {
    await expect(hook.refreshResourceStatus()).rejects.toThrow("网络超时");
  });
  expect(hook.progress).toMatchObject({ status: "error", errorMessage: "网络超时" });
  expect(hook.statusFile).toBeNull();
  expect(tauri.resourceSyncGetStatus).not.toHaveBeenCalled();
});

it("启动返回失败时记录真实错误，不能只当作资源同步已开始", async () => {
  vi.mocked(tauri.resourceSyncStart).mockResolvedValue({
    ok: false,
    code: "SYNC_PROVIDER_UNAVAILABLE",
    message: "插件工作区已失效",
  });
  await mount();
  await act(async () => {
    await expect(hook.startResourceSync()).rejects.toThrow("插件工作区已失效");
  });
  expect(hook.progress.status).toBe("error");
  expect(hook.progress.errorMessage).toContain("插件工作区已失效");
});

it("下载后的插件会话尚在重建时等待就绪，再启动资源同步", async () => {
  mobilePluginState.set({ phase: "starting", message: "" });
  await mount();
  let task!: ReturnType<typeof hook.startResourceSync>;
  await act(async () => {
    task = hook.startResourceSync();
  });
  expect(tauri.resourceSyncStart).not.toHaveBeenCalled();
  expect(hook.isResourceSyncing).toBe(true);
  await act(async () => {
    mobilePluginState.set({ phase: "ready", message: "" });
    await task;
  });
  expect(tauri.resourceSyncStart).toHaveBeenCalledTimes(1);
});

it("等待插件就绪时停止同步，插件恢复后也不会继续下载", async () => {
  mobilePluginState.set({ phase: "starting", message: "" });
  await mount();
  let task!: ReturnType<typeof hook.startResourceSync>;
  await act(async () => {
    task = hook.startResourceSync();
  });
  await act(async () => {
    await hook.cancelResourceSync();
    await task;
    mobilePluginState.set({ phase: "ready", message: "" });
  });
  expect(tauri.resourceSyncStart).not.toHaveBeenCalled();
  expect(hook.progress.status).toBe("cancelled");
});

it("插件重建超时时明确显示失败，结束准备中的状态", async () => {
  vi.useFakeTimers();
  mobilePluginState.set({ phase: "starting", message: "" });
  await mount();
  await act(async () => {
    const failure = expect(hook.startResourceSync()).rejects.toThrow("准备超时");
    await vi.advanceTimersByTimeAsync(30000);
    await failure;
  });
  expect(hook.progress.status).toBe("error");
  expect(hook.progress.errorMessage).toContain("准备超时");
  expect(tauri.resourceSyncStart).not.toHaveBeenCalled();
});

it("先前的云端检查迟到时，不能覆盖新一轮资源同步的准备状态", async () => {
  const remote = deferred();
  vi.mocked(tauri.resourceSyncRefresh).mockReturnValueOnce(remote.promise);
  mobilePluginState.set({ phase: "starting", message: "" });
  await mount();
  const refresh = hook.refreshResourceStatus();
  let task!: ReturnType<typeof hook.startResourceSync>;
  await act(async () => {
    task = hook.startResourceSync();
  });
  await act(async () => {
    remote.resolve({ provider: "旧计划", files: {} } as ResourceSyncStatusFile);
    await refresh;
  });
  expect(hook.progress.status).toBe("scanning");
  expect(hook.statusFile).toBeNull();
  await act(async () => {
    await hook.cancelResourceSync();
    await task;
  });
});

it("后台任务失败后读取本轮账本，保留失败状态和文件而不重新检查云端", async () => {
  vi.useFakeTimers();
  const status = { provider: "plugin", files: {} } as ResourceSyncStatusFile;
  vi.mocked(tauri.resourceSyncGetProgress)
    .mockResolvedValueOnce({ status: "syncing" } as ResourceSyncProgress)
    .mockResolvedValue({ status: "error", errorCount: 1 } as ResourceSyncProgress);
  vi.mocked(tauri.resourceSyncGetStatus).mockResolvedValue(status);
  await mount();
  await act(async () => {
    await hook.startResourceSync();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(hook.progress).toMatchObject({ status: "error", errorCount: 1 });
  expect(hook.statusFile).toEqual(status);
  expect(tauri.resourceSyncRefresh).not.toHaveBeenCalled();
  const calls = vi.mocked(tauri.resourceSyncGetProgress).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(tauri.resourceSyncGetProgress).toHaveBeenCalledTimes(calls);
});
