import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useResourceSync } from "../useResourceSync";
import * as tauri from "../../services/tauri";
import { setMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import type { ResourceSyncProgress, ResourceSyncStatusFile, SettingCompat } from "../../types";

vi.mock("../../services/tauri", () => ({
  resourceSyncRefresh: vi.fn(),
  resourceSyncGetStatus: vi.fn(),
  resourceSyncGetProgress: vi.fn(),
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
  setMobileSettingSnapshot(setting("A.db"));
  vi.mocked(tauri.resourceSyncRefresh).mockResolvedValue(null);
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
