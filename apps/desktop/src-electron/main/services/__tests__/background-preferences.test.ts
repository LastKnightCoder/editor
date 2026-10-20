// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const state = vi.hoisted(() => ({ directory: "", open: false, requested: false, set: vi.fn() }));
vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => state.directory,
    getLoginItemSettings: () => ({
      openAtLogin: state.open,
      executableWillLaunchAtLogin: state.open,
      status: "requires-approval",
      wasOpenedAtLogin: true,
    }),
    setLoginItemSettings: state.set,
  },
}));

describe("宿主后台运行设置", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    state.open = false;
    state.directory = await mkdtemp(path.join(tmpdir(), "tau-background-prefs-"));
  });
  afterEach(async () => {
    await rm(state.directory, { recursive: true, force: true });
  });
  it("首次读取默认不开启，不自动修改系统登录项", async () => {
    const service = await import("../background-preferences");
    const snapshot = await service.backgroundPreferencesSnapshot();
    expect(snapshot.keepBackground).toBe(false);
    expect(snapshot.startHidden).toBe(false);
    expect(state.set).not.toHaveBeenCalled();
  });
  it("保活同时需要用户设置、实际后台与可操作托盘", async () => {
    const service = await import("../background-preferences");
    service.setBackgroundActivityProbe(() => true);
    service.setBackgroundTrayAvailable(true);
    expect(service.shouldKeepBackgroundAlive()).toBe(false);
    await service.updateBackgroundPreferences({ keepBackground: true });
    expect(service.shouldKeepBackgroundAlive()).toBe(true);
    service.setBackgroundTrayAvailable(false);
    expect(service.shouldKeepBackgroundAlive()).toBe(false);
    service.setBackgroundTrayAvailable(true);
    service.setBackgroundActivityProbe(() => false);
    expect(service.shouldKeepBackgroundAlive()).toBe(false);
    expect(
      JSON.parse(await readFile(path.join(state.directory, "background-preferences.json"), "utf8"))
    ).toMatchObject({ keepBackground: true });
  });
  it.skipIf(process.platform === "linux")(
    "保存登录意图后返回系统真实状态，不伪报生效",
    async () => {
      const service = await import("../background-preferences");
      const snapshot = await service.updateBackgroundPreferences({ openAtLogin: true });
      expect(state.set).toHaveBeenCalledWith(expect.objectContaining({ openAtLogin: true }));
      expect(snapshot.openAtLogin).toBe(false);
      expect(snapshot.loginStatus).toBe("requires-approval");
    }
  );
  it("拒绝任意设置字段和错误类型", async () => {
    const service = await import("../background-preferences");
    await expect(
      service.updateBackgroundPreferences({ keepBackground: "yes" } as never)
    ).rejects.toThrow();
    await expect(
      service.updateBackgroundPreferences({ executable: "/other" } as never)
    ).rejects.toThrow();
  });
});
