import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleConfig } from "../types";
import { InitLayer } from "../types";

const mocks = vi.hoisted(() => ({
  configs: [] as ModuleConfig[],
  handle: vi.fn(),
}));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("../module-config", () => ({ MODULE_CONFIGS: mocks.configs }));
vi.mock("../../modules/user-setting", () => ({ default: {} }));
vi.mock("../../modules/pomodoro", () => ({ default: {} }));
vi.mock("../../modules/web-clip", () => ({ default: {} }));
vi.mock("../../modules/resource-sync", () => ({ default: {} }));
vi.mock("../../modules/publish", () => ({ default: {} }));

beforeEach(() => {
  vi.resetModules();
  mocks.configs.length = 0;
  mocks.handle.mockClear();
});

describe("当前模块就绪保障", () => {
  it("启动与 IPC 并发初始化共享依赖，已就绪模块不重复注册", async () => {
    let finish!: () => void;
    const initDependency = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const initFeature = vi.fn<ModuleConfig["init"]>().mockResolvedValue(undefined);
    mocks.configs.push(
      { name: "dependency", layer: InitLayer.BACKGROUND, init: initDependency },
      {
        name: "feature",
        layer: InitLayer.BACKGROUND,
        dependencies: ["dependency"],
        init: initFeature,
      }
    );
    const { default: manager } = await import("../ModuleInitManager");
    const startup = manager.initBackground();
    const handler = mocks.handle.mock.calls[0][1];
    const first = handler({}, "feature");
    const second = handler({}, "feature");
    expect(initDependency).toHaveBeenCalledTimes(1);
    expect(initFeature).not.toHaveBeenCalled();
    finish();
    await startup;
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(second).resolves.toMatchObject({ success: true });
    await manager.initModule("feature");
    expect(initFeature).toHaveBeenCalledTimes(1);
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual([
      "module-init:init-module",
    ]);
  });

  it("失败传给所有等待者，下一次调用可以重试", async () => {
    const init = vi
      .fn()
      .mockRejectedValueOnce(new Error("暂时不可用"))
      .mockResolvedValue(undefined);
    mocks.configs.push({ name: "feature", layer: InitLayer.BACKGROUND, init });
    const { default: manager } = await import("../ModuleInitManager");
    const outcomes = await Promise.all([
      manager.initModule("feature"),
      manager.initModule("feature"),
    ]);
    expect(outcomes).toEqual([
      { success: false, error: "暂时不可用" },
      { success: false, error: "暂时不可用" },
    ]);
    expect(manager.isModuleReady("feature")).toBe(false);
    await expect(manager.initModule("feature")).resolves.toEqual({ success: true });
    expect(init).toHaveBeenCalledTimes(2);
  });

  it("依赖失败阻止业务初始化，未知模块返回错误", async () => {
    const initFeature = vi.fn();
    mocks.configs.push(
      {
        name: "dependency",
        layer: InitLayer.BACKGROUND,
        init: async () => {
          throw new Error("依赖失败");
        },
      },
      {
        name: "feature",
        layer: InitLayer.BACKGROUND,
        dependencies: ["dependency"],
        init: initFeature,
      }
    );
    const { default: manager } = await import("../ModuleInitManager");
    await expect(manager.initModule("feature")).resolves.toMatchObject({ success: false });
    expect(initFeature).not.toHaveBeenCalled();
    await expect(manager.initModule("unknown")).resolves.toMatchObject({ success: false });
  });
});
