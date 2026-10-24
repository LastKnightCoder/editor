import { expect, it } from "vitest";
import { PluginHost, createMemoryStorage } from "../host";
import { definePlugin } from "../index";
import { RendererTTSRegistry } from "../tts-host";
import type { TTSCloneRequest } from "../tts";

it("任务冻结账号模型，单次取消不影响另一账号，停用终止所有实例", async () => {
  const registry = new RendererTTSRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    tts: registry,
  });
  const requests: { account: unknown; model: string; signal: AbortSignal }[] = [];
  host.registerTrusted(
    definePlugin({
      id: "test.tts",
      name: "语音",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.tts.register({
            id: context.pluginId,
            name: "语音",
            create(config, model) {
              return {
                textInstructions: model,
                getVoices: async () => [],
                synthesize: async (_request, signal) => {
                  requests.push({ account: config, model, signal });
                  return new Promise(() => {});
                },
              };
            },
          });
        },
      }),
    })
  );
  await host.enable("test.tts");
  const input = { key: "a" },
    signal = new AbortController().signal;
  await registry.execute(
    { kind: "open", session: "a", pluginId: "test.tts", config: input, modelId: "model-a" },
    signal
  );
  input.key = "changed";
  await registry.execute(
    { kind: "open", session: "b", pluginId: "test.tts", config: { key: "b" }, modelId: "model-b" },
    signal
  );
  const cancel = new AbortController();
  const a = registry.execute(
    { kind: "synthesize", session: "a", request: { text: "a", voiceId: "v" } },
    cancel.signal
  );
  const b = registry.execute(
    { kind: "synthesize", session: "b", request: { text: "b", voiceId: "v" } },
    signal
  );
  const checkA = expect(a).rejects.toMatchObject({ name: "AbortError" });
  const checkB = expect(b).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  expect(requests.map(request => [request.account, request.model])).toEqual([
    [{ key: "a" }, "model-a"],
    [{ key: "b" }, "model-b"],
  ]);
  cancel.abort();
  await checkA;
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].signal.aborted).toBe(false);
  await host.disable("test.tts");
  await checkB;
  expect(requests[1].signal.aborted).toBe(true);
  await expect(registry.execute({ kind: "voices", session: "b" }, signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  await host.dispose();
});

it("复刻隔离文件字节，关闭中止在途任务并通知", async () => {
  const registry = new RendererTTSRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    tts: registry,
  });
  let received: TTSCloneRequest | undefined;
  let synthesizeSignal: AbortSignal | undefined;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  host.registerTrusted(
    definePlugin({
      id: "test.tts.clone",
      name: "语音复刻",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.tts.register({
            id: context.pluginId,
            name: "语音复刻",
            create: () => ({
              getVoices: async () => [],
              synthesize: async (_request, signal) => {
                synthesizeSignal = signal;
                markStarted();
                return new Promise(() => {});
              },
              cloneVoice: async request => {
                received = request;
                return { id: "cloned", name: "克隆", type: "cloned" };
              },
            }),
          });
        },
      }),
    })
  );
  await host.enable("test.tts.clone");
  const signal = new AbortController().signal;
  await expect(
    registry.execute(
      {
        kind: "open",
        session: "task",
        pluginId: "test.tts.clone",
        config: {},
        modelId: "model",
      },
      signal
    )
  ).resolves.toMatchObject({ canClone: true });
  const content = new Uint8Array([1, 2, 3]);
  await expect(
    registry.execute(
      {
        kind: "clone",
        session: "task",
        request: {
          file: { name: "sample.wav", mimeType: "audio/wav", content },
          requestedId: "voice",
          name: "音色",
        },
      },
      signal
    )
  ).resolves.toEqual({ id: "cloned", name: "克隆", type: "cloned" });
  expect(received?.file.content).toEqual(new Uint8Array([1, 2, 3]));
  expect(received?.file.content).not.toBe(content);
  content[0] = 9;
  expect(received?.file.content[0]).toBe(1);

  const pending = registry.execute(
    { kind: "synthesize", session: "task", request: { text: "a", voiceId: "v" } },
    signal
  );
  await started;
  const check = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const closed: string[] = [];
  const unsubscribe = registry.onClose(id => closed.push(id));
  await registry.execute({ kind: "close", session: "task" }, signal);
  await check;
  expect(synthesizeSignal?.aborted).toBe(true);
  expect(closed).toEqual(["task"]);
  registry.close("task");
  expect(closed).toEqual(["task"]);
  unsubscribe();
  await expect(registry.execute({ kind: "voices", session: "task" }, signal)).rejects.toMatchObject(
    {
      name: "AbortError",
    }
  );
  await host.dispose();
});
