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
  it("空服务字段和旧选用值不阻断启动读取，数据库配置保持可用", async () => {
    // 启动事故：默认生成的空账号字段曾让插件、数据库及设置 RPC 初始化失败。
    const setting = {
      database: { active: "notes.db", databases: [{ name: "notes.db", version: 1 }] },
      integration: {
        github: { enabled: false, token: "" },
        bilibili: { enabled: false, credentials: { SESSDATA: "" } },
      },
      sync: { active: "s3", s3: { bucket: "notes" } },
      ttsProviders: [{ providerType: "qwen", models: [] }],
    };
    readFile.mockResolvedValue(JSON.stringify(setting));
    const { default: settings } = await import("../user-setting");
    await expect(settings.getSettingSnapshot()).resolves.toEqual(setting);
    await expect(settings.getSettingSnapshot()).resolves.toEqual(setting);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
  });
  it.each(["null", "[]", '"settings"'])("拒绝非对象设置 %s，不回写空配置", async raw => {
    readFile.mockResolvedValue(raw);
    const { default: settings } = await import("../user-setting");
    await expect(settings.getSettingSnapshot()).rejects.toThrow("设置 必须是对象");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
