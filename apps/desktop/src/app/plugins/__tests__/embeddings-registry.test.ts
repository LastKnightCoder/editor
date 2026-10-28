import { expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { definePlugin, type EmbeddingInstance, type JsonValue } from "@tau/plugins";
import { RendererEmbeddingsRegistry } from "../embeddings-registry";

function setup(
  create: (config: JsonValue, model: string) => EmbeddingInstance,
  maxBatchSize?: number
) {
  const registry = new RendererEmbeddingsRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    embeddings: registry,
  });
  host.registerTrusted(
    definePlugin({
      id: "test.embeddings",
      name: "嵌入",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.embeddings.register({ id: context.pluginId, name: "嵌入", maxBatchSize, create });
        },
      }),
    })
  );
  return { registry, host };
}
const request = (texts: string[], config: JsonValue = {}, modelId = "model") => ({
  pluginId: "test.embeddings",
  config,
  modelId,
  texts,
});
const fresh = () => new AbortController().signal;

it("按插件唯一注册并通知变更，每次执行新建实例且读取配置副本", async () => {
  const seenConfigs: JsonValue[] = [];
  const create = vi.fn((config: JsonValue) => {
    seenConfigs.push(config);
    return { embed: async (texts: string[]) => texts.map(() => [0.5, -0.5]) };
  });
  const { registry, host } = setup(create, 4);
  const changed = vi.fn();
  registry.onChange(changed);
  expect(registry.has("test.embeddings")).toBe(false);
  await host.enable("test.embeddings");
  expect(registry.has("test.embeddings")).toBe(true);
  expect(registry.maxBatchSize("test.embeddings")).toBe(4);
  expect(changed).toHaveBeenCalledTimes(1);
  const config = { key: "a" };
  const vectors = await registry.execute(request(["你好", "世界"], config), fresh());
  config.key = "changed";
  expect(vectors).toEqual([
    [0.5, -0.5],
    [0.5, -0.5],
  ]);
  await registry.execute(request(["再来一批"], config), fresh());
  expect(create).toHaveBeenCalledTimes(2);
  expect(seenConfigs.map(value => (value as { key: string }).key)).toEqual(["a", "changed"]);
  await host.disable("test.embeddings");
  expect(registry.has("test.embeddings")).toBe(false);
  expect(registry.maxBatchSize("test.embeddings")).toBeUndefined();
  await host.dispose();
});

it("未激活、调用前已取消或文本非法时直接拒绝", async () => {
  const { registry, host } = setup(() => ({ embed: async () => [] }));
  await expect(registry.execute(request(["文本"]), fresh())).rejects.toThrow("嵌入插件未激活");
  await host.enable("test.embeddings");
  const aborted = new AbortController();
  aborted.abort();
  await expect(registry.execute(request(["文本"]), aborted.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  await expect(registry.execute(request([]), fresh())).rejects.toThrow("texts");
  await expect(registry.execute(request(["正常", ""]), fresh())).rejects.toThrow("texts");
  await host.dispose();
});

it("超过单批上限时拒绝，由主进程负责分批", async () => {
  const { registry, host } = setup(() => ({ embed: async () => [] }), 2);
  await host.enable("test.embeddings");
  await expect(registry.execute(request(["一", "二", "三"]), fresh())).rejects.toThrow("上限");
  await host.dispose();
});

it("返回条数不符、维度不一致、含非有限数字均拒绝", async () => {
  const broken = (vectors: unknown) => setup(() => ({ embed: async () => vectors as number[][] }));
  const missing = broken([[1, 2]]);
  await missing.host.enable("test.embeddings");
  await expect(missing.registry.execute(request(["一", "二"]), fresh())).rejects.toThrow("条数");
  await missing.host.dispose();

  const ragged = broken([[1, 2], [1]]);
  await ragged.host.enable("test.embeddings");
  await expect(ragged.registry.execute(request(["一", "二"]), fresh())).rejects.toThrow("维度");
  await ragged.host.dispose();

  for (const invalid of [
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    ["0.1", 1],
  ]) {
    const entry = broken([invalid]);
    await entry.host.enable("test.embeddings");
    await expect(entry.registry.execute(request(["一"]), fresh())).rejects.toThrow("有限数字");
    await entry.host.dispose();
  }

  const empty = broken([[]]);
  await empty.host.enable("test.embeddings");
  await expect(empty.registry.execute(request(["一"]), fresh())).rejects.toThrow("非空向量");
  await empty.host.dispose();
});
