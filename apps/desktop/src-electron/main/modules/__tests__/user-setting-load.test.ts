// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { readFile, writeFile } = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: { readFile, writeFile } }));
vi.mock("fs-extra/esm", () => ({ default: { pathExists: async () => true } }));
beforeEach(() => {
  vi.resetModules();
  readFile.mockReset();
  writeFile.mockReset();
});
describe("设置文件并发读取", () => {
  it("多个启动模块共享一次读取", async () => {
    readFile.mockResolvedValue('{"database":{"active":"test.db"}}');
    const { default: settings } = await import("../user-setting");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => settings.getSettingSnapshot())
    );
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(results.every(result => result.database.active === "test.db")).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("失败后允许重新加载", async () => {
    readFile.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce("{}");
    const { default: settings } = await import("../user-setting");
    await expect(settings.getSettingSnapshot()).rejects.toThrow("temporary");
    await expect(settings.getSettingSnapshot()).resolves.toEqual({});
    expect(readFile).toHaveBeenCalledTimes(2);
  });
  it("旧服务设置拒绝读取且不改写文件，修正后可重新读取", async () => {
    readFile
      .mockResolvedValueOnce('{"sync":{"active":"s3","s3":{"bucket":"notes"}}}')
      .mockResolvedValueOnce('{"sync":{"active":"plugin","plugin":{"id":"test.sync"}}}');
    const { default: settings } = await import("../user-setting");
    await expect(settings.getSettingSnapshot()).rejects.toThrow("SETTING_INVALID");
    expect(writeFile).not.toHaveBeenCalled();
    await expect(settings.getSettingSnapshot()).resolves.toEqual({
      sync: { active: "plugin", plugin: { id: "test.sync" } },
    });
    expect(writeFile).not.toHaveBeenCalled();
  });
  it.each(["null", "[]", '"settings"'])("拒绝非对象设置 %s，不回写空配置", async raw => {
    readFile.mockResolvedValue(raw);
    const { default: settings } = await import("../user-setting");
    await expect(settings.getSettingSnapshot()).rejects.toThrow("设置 必须是对象");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
