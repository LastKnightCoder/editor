// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { isPackaged: true, getVersion: vi.fn(() => "0.59.2") },
  initialize: vi.fn(),
  report: vi.fn(),
}));
vi.mock("electron", () => ({ app: mocks.app }));
vi.mock("electron-log", () => ({ default: { warn: vi.fn() } }));
vi.mock("@tau/analytics/client", () => ({
  VersionClient: class {
    initialize = mocks.initialize;
    report = mocks.report;
  },
}));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => "/tmp/tau-version-test" } }));
vi.mock("../../utils/analytics-storage", () => ({ FileAnalyticsStorage: class {} }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("TAU_TELEMETRY_DEBUG", "0");
  vi.stubEnv("TAU_TELEMETRY_DISABLED", "0");
  mocks.app.isPackaged = true;
  mocks.initialize.mockReset().mockResolvedValue(undefined);
  mocks.report.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("后台初始化只上报当前版本，不注册行为 IPC、聚焦、退出或崩溃监听", async () => {
  const exceptionListeners = process.listenerCount("uncaughtException");
  const rejectionListeners = process.listenerCount("unhandledRejection");
  const module = (await import("../telemetry")).default;
  await module.init();
  expect(mocks.report).toHaveBeenCalledExactlyOnceWith("0.59.2");
  expect(vi.getTimerCount()).toBe(0);
  expect(process.listenerCount("uncaughtException")).toBe(exceptionListeners);
  expect(process.listenerCount("unhandledRejection")).toBe(rejectionListeners);
});

it("失败只进行有界补报，不重新建立持续心跳", async () => {
  mocks.report.mockRejectedValue(new Error("offline"));
  await (await import("../telemetry")).default.init();
  await vi.runAllTimersAsync();
  expect(mocks.report).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
});

it("开发构建和显式停用都不初始化网络上报", async () => {
  mocks.app.isPackaged = false;
  await (await import("../telemetry")).default.init();
  vi.stubEnv("TAU_TELEMETRY_DEBUG", "1");
  vi.stubEnv("TAU_TELEMETRY_DISABLED", "1");
  await (await import("../telemetry")).default.init();
  expect(mocks.initialize).not.toHaveBeenCalled();
  expect(mocks.report).not.toHaveBeenCalled();
});
