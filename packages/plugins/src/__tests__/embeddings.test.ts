import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

it("嵌入提供方只注册当前插件，创建读取配置副本，停用回收并计入贡献", async () => {
  const dispose = vi.fn();
  let context!: PluginContext;
  let definition!: import("../embeddings").EmbeddingProviderDefinition;
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    embeddings: {
      register(_context, value) {
        definition = value;
        return { dispose };
      },
    },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.embeddings",
      name: "嵌入",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
          expect(() =>
            value.embeddings.register({
              id: "other.embeddings",
              name: "无效",
              create: () => ({ embed: async () => [] }),
            })
          ).toThrow("属于当前插件");
          value.embeddings.register({
            id: value.pluginId,
            name: "嵌入",
            maxBatchSize: 8,
            create(config) {
              if (config && typeof config === "object" && !Array.isArray(config))
                config.key = "changed";
              return { embed: async () => [] };
            },
          });
        },
      }),
    })
  );
  await host.enable("test.embeddings");
  expect(host.listContributions("test.embeddings")).toEqual({ embeddings: 1 });
  expect(definition.maxBatchSize).toBe(8);
  const config = { key: "original" };
  definition.create(config, "model");
  expect(config.key).toBe("original");
  await host.disable("test.embeddings");
  expect(host.listContributions("test.embeddings")).toEqual({});
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(() =>
    context.embeddings.register({
      id: context.pluginId,
      name: "嵌入",
      create: () => ({ embed: async () => [] }),
    })
  ).toThrow();
  expect(() => definition.create({}, "model")).toThrow();
  await host.dispose();
});

it("宿主不支持嵌入或单批上限非法时拒绝注册", async () => {
  const bare = new PluginHost({ workspaceId: "test", storage: createMemoryStorage() });
  let context!: PluginContext;
  bare.registerTrusted(
    definePlugin({
      id: "test.embeddings",
      name: "嵌入",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    })
  );
  await bare.enable("test.embeddings");
  expect(() =>
    context.embeddings.register({
      id: context.pluginId,
      name: "嵌入",
      create: () => ({ embed: async () => [] }),
    })
  ).toThrow("当前宿主不支持嵌入提供方");
  await bare.dispose();

  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    embeddings: { register: () => ({ dispose: () => undefined }) },
  });
  let ctx!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: "test.embeddings",
      name: "嵌入",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          ctx = value;
        },
      }),
    })
  );
  await host.enable("test.embeddings");
  for (const maxBatchSize of [0, -1, 1.5, Number.NaN])
    expect(() =>
      ctx.embeddings.register({
        id: ctx.pluginId,
        name: "嵌入",
        maxBatchSize,
        create: () => ({ embed: async () => [] }),
      })
    ).toThrow("正整数");
  await host.dispose();
});
