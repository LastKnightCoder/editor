import { webcrypto } from "node:crypto";
import { transferableAbortController } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin, type TTSAudio, type TTSProviderDefinition } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { openMobilePluginTTS, withMobilePluginTTS } from "../plugin-tts";

const runtimes: MobilePluginRuntime[] = [];
function createRuntime() {
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "android",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "A",
    { push: vi.fn() },
    "0.2.4"
  );
  runtimes.push(runtime);
  return runtime;
}

async function enableTTS(runtime: MobilePluginRuntime, create: TTSProviderDefinition["create"]) {
  runtime.host.registerTrusted(
    definePlugin({
      id: "fixture.tts",
      name: "fixture",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.tts.register({ id: context.pluginId, name: "fixture", create });
        },
      }),
    })
  );
  await runtime.host.enable("fixture.tts");
}

beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.dispose()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("本地会话固定配置模型并提供 voices/synthesize/clone，dispose 幂等退订", async () => {
  const runtime = createRuntime();
  const created: { config: unknown; model: string }[] = [];
  const getVoices = vi.fn(async () => [{ id: "v", name: "Voice", type: "system" as const }]);
  await enableTTS(runtime, (config, model) => {
    created.push({ config, model });
    return {
      textInstructions: `说明:${model}`,
      getVoices,
      synthesize: async request => ({
        audio: new TextEncoder().encode(request.text),
        mime: "audio/wav",
      }),
      cloneVoice: async request => ({
        id: request.requestedId ?? "cloned",
        name: request.name ?? "Clone",
        type: "cloned",
      }),
    };
  });
  const onClose = runtime.tts.onClose.bind(runtime.tts);
  const unsubscribe = vi.fn();
  vi.spyOn(runtime.tts, "onClose").mockImplementation(listener => {
    const release = onClose(listener);
    return () => {
      unsubscribe();
      release();
    };
  });
  const close = vi.spyOn(runtime.tts, "close");
  const config = { key: "original" };
  const request = { pluginId: "fixture.tts", config, modelId: "model-a" };
  const opening = openMobilePluginTTS(runtime, request);
  config.key = "changed";
  request.modelId = "model-b";
  const session = await opening;
  expect(session.info).toEqual({ canClone: true, textInstructions: "说明:model-a" });
  expect(created[0]).toEqual({ config: { key: "original" }, model: "model-a" });
  await expect(session.voices()).resolves.toEqual([{ id: "v", name: "Voice", type: "system" }]);
  await expect(session.synthesize({ text: "你好", voiceId: "v" })).resolves.toEqual({
    audio: new TextEncoder().encode("你好"),
    mime: "audio/wav",
  });
  await expect(
    session.clone({
      file: { name: "sample.wav", mimeType: "audio/wav", content: new Uint8Array([1, 2]) },
      requestedId: "clone",
      name: "克隆",
    })
  ).resolves.toEqual({ id: "clone", name: "克隆", type: "cloned" });
  await session.dispose();
  await session.dispose();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  await expect(session.voices()).rejects.toMatchObject({ name: "AbortError" });
  expect(getVoices).toHaveBeenCalledTimes(1);
});

it("with 在回调成功或失败后都释放会话", async () => {
  const runtime = createRuntime();
  await enableTTS(runtime, () => ({
    textInstructions: "说明",
    getVoices: async () => [],
    synthesize: async () => ({ audio: new Uint8Array(), mime: "audio/wav" }),
  }));
  const close = vi.spyOn(runtime.tts, "close");
  const options = { pluginId: "fixture.tts", config: {}, modelId: "model" };
  await expect(
    withMobilePluginTTS(runtime, options, session => session.info.textInstructions)
  ).resolves.toBe("说明");
  expect(close).toHaveBeenCalledTimes(1);
  await expect(
    withMobilePluginTTS(runtime, options, () => {
      throw new Error("失败");
    })
  ).rejects.toThrow("失败");
  expect(close).toHaveBeenCalledTimes(2);
});

it("单任务取消不影响其他会话，外部 signal 中止并阻止后续调用", async () => {
  const runtime = createRuntime();
  const requests: { text: string; signal: AbortSignal }[] = [];
  const getVoices = vi.fn(async () => []);
  await enableTTS(runtime, () => ({
    getVoices,
    synthesize: (request, signal) => {
      requests.push({ text: request.text, signal });
      return new Promise<TTSAudio>(() => {});
    },
  }));
  const first = await openMobilePluginTTS(runtime, {
    pluginId: "fixture.tts",
    config: { account: "a" },
    modelId: "model-a",
  });
  const external = new AbortController();
  const second = await openMobilePluginTTS(
    runtime,
    { pluginId: "fixture.tts", config: { account: "b" }, modelId: "model-b" },
    external.signal
  );
  const cancel = new AbortController();
  const firstPending = first.synthesize({ text: "a", voiceId: "v" }, cancel.signal);
  const secondPending = second.synthesize({ text: "b", voiceId: "v" });
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  const firstCheck = expect(firstPending).rejects.toMatchObject({ name: "AbortError" });
  const secondCheck = expect(secondPending).rejects.toMatchObject({ name: "AbortError" });
  cancel.abort();
  await firstCheck;
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].signal.aborted).toBe(false);
  await expect(first.voices()).resolves.toEqual([]);
  external.abort();
  await secondCheck;
  expect(requests[1].signal.aborted).toBe(true);
  await expect(second.voices()).rejects.toMatchObject({ name: "AbortError" });
  expect(getVoices).toHaveBeenCalledTimes(1);
  await Promise.all([first.dispose(), second.dispose()]);
});

it.each(["disable", "dispose"] as const)("%s 关闭会话并发出通知，迟到结果不交付", async action => {
  const runtime = createRuntime();
  let finish!: (audio: TTSAudio) => void;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  const getVoices = vi.fn(async () => []);
  await enableTTS(runtime, () => ({
    getVoices,
    synthesize: () =>
      new Promise<TTSAudio>(resolve => {
        finish = resolve;
        markStarted();
      }),
  }));
  const session = await openMobilePluginTTS(runtime, {
    pluginId: "fixture.tts",
    config: {},
    modelId: "model",
  });
  const closed = vi.fn();
  const unsubscribe = runtime.tts.onClose(closed);
  const delivered = vi.fn();
  const pending = session.synthesize({ text: "late", voiceId: "v" });
  void pending.then(delivered, () => undefined);
  await started;
  const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  if (action === "disable") await runtime.host.disable("fixture.tts");
  else await runtime.dispose();
  await rejection;
  expect(closed).toHaveBeenCalledTimes(1);
  finish({ audio: new Uint8Array([1]), mime: "audio/wav" });
  await Promise.resolve();
  await Promise.resolve();
  expect(delivered).not.toHaveBeenCalled();
  await expect(session.voices()).rejects.toMatchObject({ name: "AbortError" });
  expect(getVoices).not.toHaveBeenCalled();
  await session.dispose();
  await session.dispose();
  expect(closed).toHaveBeenCalledTimes(1);
  unsubscribe();
});
