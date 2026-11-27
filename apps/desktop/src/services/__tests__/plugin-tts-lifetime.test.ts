import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), call: vi.fn() }));
vi.mock("@/electron", () => ({ on: mocks.on, off: mocks.off }));
vi.mock("@/commands/plugin-tts", () => ({ callPluginTTS: mocks.call }));
import { openPluginTTS } from "../plugin-tts";
import { createPluginTTSProvider } from "@/utils/tts/PluginTTSProvider";
afterEach(() => vi.clearAllMocks());
it("无在途请求时也能收到关闭通知，并中止后续调用", async () => {
  mocks.call.mockImplementation(async (request: { kind: string }) =>
    request.kind === "open" ? { canClone: true, textInstructions: "plain" } : undefined
  );
  const task = await openPluginTTS(
    { id: "a", pluginId: "test.tts", name: "a", models: [], config: { key: "a" } },
    "model"
  );
  const session = mocks.call.mock.calls[0][0].session;
  const handler = mocks.on.mock.calls[0][1];
  handler(undefined, { session: "other" });
  expect(task.signal.aborted).toBe(false);
  handler(undefined, { session });
  expect(task.signal.aborted).toBe(true);
  expect(task.signal.reason).toMatchObject({
    code: "sessionClosed",
    name: "AbortError",
    message: "语音会话已关闭或插件已停用",
  });
  await task.dispose();
  expect(mocks.off).toHaveBeenCalledWith("plugin-tts:session-closed", handler);
});

it("调用方取消保留原reason，关闭后调用不再次打开会话", async () => {
  mocks.call.mockImplementation(async (request: { kind: string }, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    return request.kind === "open" ? { canClone: true } : undefined;
  });
  const controller = new AbortController();
  const task = await openPluginTTS(
    { id: "a", pluginId: "test.tts", name: "原账号名", models: [], config: {} },
    "original-model",
    controller.signal
  );
  const reason = new TypeError("caller original cancellation");
  controller.abort(reason);
  expect(task.signal.reason).toBe(reason);
  await task.dispose();
  expect(() =>
    task.synthesize({ text: "原输入", voiceId: "原voice-id" }, new AbortController().signal)
  ).toThrow("语音任务已结束");
  expect(mocks.call.mock.calls.filter(([request]) => request.kind === "open")).toHaveLength(1);
});
it("不支持克隆时保留原诊断，已结束的惰性provider不重新建立会话", async () => {
  mocks.call.mockImplementation(async (request: { kind: string }) =>
    request.kind === "open" ? { canClone: false, textInstructions: "原模型指令" } : undefined
  );
  const provider = createPluginTTSProvider(
    { id: "a", pluginId: "test.tts", name: "原账号名", models: [], config: { opaque: "raw" } },
    "original-model"
  );
  expect(mocks.call).not.toHaveBeenCalled();
  if (!provider.cloning || !provider.getTextInstructions)
    throw new Error("missing clone capability adapter");
  await expect(
    provider.cloning.cloneVoice(new File(["raw"], "原参考.wav", { type: "audio/wav" }), {
      voiceId: "requested-id",
      voiceName: "原名称",
    })
  ).rejects.toThrow("当前模型不支持音色复刻");
  await expect(
    provider.cloning.cloneVoice(new File(["raw"], "reference.wav"), { voiceId: "same-id" })
  ).rejects.toHaveProperty("code", "cloneUnsupported");
  expect(await provider.getTextInstructions()).toBe("原模型指令");
  await provider.cloning.dispose?.();
  await expect(provider.getTextInstructions()).rejects.toMatchObject({
    name: "AbortError",
    message: "语音任务已结束",
  });
  expect(mocks.call.mock.calls.filter(([request]) => request.kind === "open")).toHaveLength(1);
});
