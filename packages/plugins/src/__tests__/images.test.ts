import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

it("图片提供方只注册当前插件，创建读取配置副本，停用回收并拒绝旧上下文", async () => {
  const dispose = vi.fn();
  let context!: PluginContext;
  let definition!: import("../images").ImageProviderDefinition;
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    images: {
      register(_context, value) {
        definition = value;
        return { dispose };
      },
    },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.images",
      name: "图片",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
          expect(() =>
            value.images.register({ id: "other.images", name: "无效", create: () => ({}) })
          ).toThrow("属于当前插件");
          value.images.register({
            id: value.pluginId,
            name: "图片",
            create(config) {
              if (config && typeof config === "object" && !Array.isArray(config))
                config.key = "changed";
              return { generate: async () => [] };
            },
          });
        },
      }),
    })
  );
  await host.enable("test.images");
  const config = { key: "original" };
  definition.create(config, "model");
  expect(config.key).toBe("original");
  await host.disable("test.images");
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(() =>
    context.images.register({ id: context.pluginId, name: "图片", create: () => ({}) })
  ).toThrow();
  expect(() => definition.create({}, "model")).toThrow();
  await host.dispose();
});
