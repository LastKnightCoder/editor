// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  post: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:inspector", () => ({
  Session: class {
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    post = mocks.post;
  },
}));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile }));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => "test-profile" } }));
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.post.mockImplementation((method, callback) =>
    callback(null, method === "Profiler.stop" ? { profile: { nodes: [] } } : {})
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("按需启动 CPU 采集", () => {
  it("普通启动不连接 inspector 或写文件", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["Tau"]);
    const { startupCpuProfile } = await import("../../startup-cpu-profile");
    expect(startupCpuProfile.status).toBe("disabled");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it("带参数只采集一段，保存完整 profile 并断开", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["Tau", "--tau-profile-startup"]);
    const { startupCpuProfile } = await import("../../startup-cpu-profile");
    expect(startupCpuProfile.status).toBe("recording");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(startupCpuProfile.status).toBe("saved");
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(".cpuprofile"),
      '{"nodes":[]}',
      "utf8"
    );
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
  it("inspector 失败不阻断应用启动", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["Tau", "--tau-profile-startup"]);
    mocks.post.mockImplementation((_method, callback) => callback(new Error("unavailable")));
    const { startupCpuProfile } = await import("../../startup-cpu-profile");
    expect(startupCpuProfile.status).toBe("failed");
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
