import { describe, expect, it, vi } from "vitest";
import { ASRProviderRegistry } from "../asr-host";
import type { PluginContext } from "../contract";
import type { ASRStreamSession, ASRTask } from "@tau/asr";
const request = {
  language: "zh-CN",
  format: { encoding: "pcm-s16le" as const, sampleRateHz: 16000, channels: 1 as const },
};
const fileRequest = {
  language: "zh-CN",
  audio: {
    name: "a.ogg",
    mimeType: "audio/ogg",
    sizeBytes: 1,
    open: async () => new ReadableStream<Uint8Array>(),
  },
};
function fixture(openStream: any, transcribeFile?: any) {
  const controller = new AbortController();
  const registry = new ASRProviderRegistry();
  const context = { pluginId: "test.asr", signal: controller.signal } as PluginContext;
  const registration = registry.register(context, {
    id: context.pluginId,
    name: "测试",
    create: () => ({ probe: vi.fn(), openStream, transcribeFile }),
  });
  const options = { signal: new AbortController().signal, taskId: "test", onEvent: vi.fn() };
  return { registry, registration, controller, options };
}
describe("ASR 提供方作用域", () => {
  it("创建中停用立即取消，并回收迟到会话", async () => {
    let resolve!: (value: ASRStreamSession) => void;
    const { registry, controller, options } = fixture(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const opening = registry.openStream("test.asr", null, "model", request, options);
    controller.abort();
    await expect(opening).rejects.toThrow();
    const cancel = vi.fn(async () => undefined);
    resolve({ result: new Promise(() => {}), write: vi.fn(), endInput: vi.fn(), cancel });
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(registry.list()).toEqual([]);
  });
  it("文件识别：创建中停用立即取消，并回收迟到任务", async () => {
    let resolve!: (value: ASRTask) => void;
    const { registry, controller, options } = fixture(
      undefined,
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const starting = registry.transcribeFile("test.asr", null, "model", fileRequest, options);
    controller.abort();
    await expect(starting).rejects.toThrow();
    const cancel = vi.fn(async () => undefined);
    resolve({ result: new Promise(() => {}), cancel });
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("文件识别：结果经校验，提供方不支持时明确报错", async () => {
    const { registry, options } = fixture(undefined, async () => ({
      result: Promise.resolve({ text: "好", segments: [{ id: "1", text: "好", final: false }] }),
      cancel: vi.fn(async () => undefined),
    }));
    const task = await registry.transcribeFile("test.asr", null, "model", fileRequest, options);
    await expect(task.result).rejects.toThrow("未确认分段");
    const bare = fixture(vi.fn());
    await expect(
      bare.registry.transcribeFile("test.asr", null, "model", fileRequest, bare.options)
    ).rejects.toThrow("不支持录音转文字");
  });
  it("单独注销提供方同样取消会话并抑制迟到事件", async () => {
    let emit!: (event: any) => void;
    const cancel = vi.fn(async () => undefined);
    const { registry, registration, options } = fixture(async (_: unknown, run: any) => {
      emit = run.onEvent;
      return { result: new Promise(() => {}), write: vi.fn(), endInput: vi.fn(), cancel };
    });
    const session = await registry.openStream("test.asr", null, "model", request, options);
    await registration.dispose();
    emit({ type: "progress" });
    await expect(session.result).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
    expect(options.onEvent).not.toHaveBeenCalled();
    await expect(
      session.write({ seq: 0, startSample: 0, data: new Uint8Array(2) })
    ).rejects.toThrow();
  });
});
