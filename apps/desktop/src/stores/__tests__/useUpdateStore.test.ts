import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  install: vi.fn(),
  listeners: new Map<string, (value: any) => void>(),
}));
vi.mock("@/commands/updater", () => {
  const listen = (name: string) => (callback: (value: any) => void) => {
    state.listeners.set(name, callback);
    return () => state.listeners.delete(name);
  };
  return {
    installUpdate: state.install,
    downloadUpdate: vi.fn(async () => ({ started: true })),
    checkForUpdate: vi.fn(),
    onUpdateDownloadProgress: listen("progress"),
    onUpdateDownloaded: listen("ready"),
    onUpdateError: listen("error"),
  };
});
import { initUpdateListeners, useUpdateStore } from "../useUpdateStore";

beforeEach(() => {
  state.listeners.clear();
  state.install.mockReset();
  useUpdateStore.setState({ status: "idle", progress: 0, errorMessage: null });
});

it("下载进度到 100% 仍等待原生就绪事件，取消监听后不再订阅", () => {
  const stop = initUpdateListeners();
  useUpdateStore.setState({ status: "downloading" });
  state.listeners.get("progress")!({ percent: 100 });
  expect(useUpdateStore.getState().status).toBe("downloading");
  state.listeners.get("ready")!({ version: "0.61.0" });
  expect(useUpdateStore.getState()).toMatchObject({ status: "ready", newVersion: "0.61.0" });
  stop();
  expect(state.listeners.size).toBe(0);
});

it("保存屏障拒绝安装时显示具体错误，不留下未处理的 Promise 拒绝", async () => {
  useUpdateStore.setState({ status: "ready" });
  state.install.mockRejectedValueOnce(new Error("正文未确认保存"));
  await expect(useUpdateStore.getState().install()).resolves.toBeUndefined();
  expect(useUpdateStore.getState()).toMatchObject({
    status: "error",
    errorMessage: "正文未确认保存",
  });
});

it("原生验包错误不会继续显示可安装状态", () => {
  const stop = initUpdateListeners();
  useUpdateStore.setState({ status: "downloading" });
  state.listeners.get("error")!({ message: "签名校验失败" });
  expect(useUpdateStore.getState()).toMatchObject({
    status: "error",
    errorMessage: "签名校验失败",
  });
  stop();
});
