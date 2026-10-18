import { expect, it } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { definePlugin } from "@tau/plugins";
import { RendererTTSRegistry } from "../tts-registry";

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
