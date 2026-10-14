// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: { readFile } }));
vi.mock("fs-extra/esm", () => ({ default: { pathExists: async () => true } }));
beforeEach(() => {
  vi.resetModules();
  readFile.mockReset();
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
  });
  it("失败后允许重新加载", async () => {
    readFile.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce("{}");
    const { default: settings } = await import("../user-setting");
    await expect(settings.getSettingSnapshot()).rejects.toThrow("temporary");
    await expect(settings.getSettingSnapshot()).resolves.toEqual({});
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});
