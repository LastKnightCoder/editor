import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Set<(event: unknown, value: unknown) => void>(),
  ensure: vi.fn(),
}));
vi.mock("@/electron", () => ({
  invoke: mocks.invoke,
  on: (_channel: string, listener: (event: unknown, value: unknown) => void) =>
    mocks.listeners.add(listener),
  off: (_channel: string, listener: (event: unknown, value: unknown) => void) =>
    mocks.listeners.delete(listener),
}));
vi.mock("../module-init", () => ({ ensureModule: mocks.ensure }));
import { transcribeAudio } from "../transcription";
beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.listeners.clear();
  mocks.ensure.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window, "electron", {
    configurable: true,
    value: { invoke: mocks.invoke },
  });
});

describe("转录命令作用域", () => {
  it("同窗口进度按 taskId 隔离，取消会通知后端且拒绝迟到成功", async () => {
    const pending: Array<{ id: string; resolve: (value: unknown) => void }> = [];
    mocks.invoke.mockImplementation(
      (channel: string, _path: string, _options: unknown, id: string) => {
        if (channel === "transcription-cancel") return Promise.resolve();
        return new Promise(resolve => pending.push({ id, resolve }));
      }
    );
    const controller = new AbortController();
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();
    const first = transcribeAudio(
      "first.wav",
      {},
      { signal: controller.signal, onProgress: firstProgress }
    );
    void first.catch(() => undefined);
    const second = transcribeAudio("second.wav", {}, { onProgress: secondProgress });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    for (const listener of mocks.listeners)
      listener({}, { taskId: pending[1].id, message: "第二个任务" });
    expect(firstProgress).not.toHaveBeenCalled();
    expect(secondProgress).toHaveBeenCalledWith({ message: "第二个任务" });
    controller.abort();
    expect(mocks.invoke).toHaveBeenCalledWith("transcription-cancel", pending[0].id);
    pending[0].resolve({ success: true, data: { text: "迟到" } });
    pending[1].resolve({ success: true, data: { text: "正确" } });
    await expect(first).rejects.toMatchObject({ code: "cancelled" });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(mocks.listeners.size).toBe(0);
  });
  it("模块准备期间取消不提交识别请求", async () => {
    let ready!: () => void;
    mocks.ensure.mockReturnValue(
      new Promise<void>(resolve => {
        ready = resolve;
      })
    );
    const controller = new AbortController();
    const result = transcribeAudio("file.wav", {}, { signal: controller.signal });
    controller.abort();
    ready();
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
