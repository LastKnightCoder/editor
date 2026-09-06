import { afterEach, expect, it, vi } from "vitest";
import { getDevelopmentServerUrl } from "../collaboration/dev-server";

const mockApp = vi.hoisted(() => ({ isPackaged: false }));
vi.mock("electron", () => ({ app: mockApp }));

afterEach(() => {
  vi.unstubAllEnvs();
  mockApp.isPackaged = false;
});

it("普通启动不覆盖已保存的服务器配置", () => {
  vi.stubEnv("TAU_COLLAB_DEV_SERVER_URL", "");
  expect(getDevelopmentServerUrl()).toBeUndefined();
});

it("开发启动使用规范化后的本地地址", () => {
  vi.stubEnv("TAU_COLLAB_DEV_SERVER_URL", "http://127.0.0.1:3210/");
  expect(getDevelopmentServerUrl()).toBe("http://127.0.0.1:3210");
});

it("发行版忽略开发服务器环境变量", () => {
  mockApp.isPackaged = true;
  vi.stubEnv("TAU_COLLAB_DEV_SERVER_URL", "http://127.0.0.1:3210");
  expect(getDevelopmentServerUrl()).toBeUndefined();
});

it("开发地址仍遵循已有服务器地址校验", () => {
  vi.stubEnv("TAU_COLLAB_DEV_SERVER_URL", "http://example.com");
  expect(() => getDevelopmentServerUrl()).toThrow("HTTPS");
});
