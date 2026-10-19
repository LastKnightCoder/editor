import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";
import type { VideoInstance, VideoProviderDefinition } from "../video";

const instance: VideoInstance = {
  matches: () => true,
  resolve: async () => ({ title: "视频", variants: [{ label: "默认", ref: { id: "1" } }] }),
  cacheKey: ref => String(ref.id),
  getPlayback: async () => ({ kind: "file", stream: { url: "https://example.com/a.mp4" } }),
};

it("视频提供方只注册当前插件，创建读取配置副本并校验实例方法，停用后回收", async () => {
  const dispose = vi.fn();
  let context!: PluginContext;
  let definition!: VideoProviderDefinition;
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    video: {
      register(_context, value) {
        definition = value;
        return { dispose };
      },
    },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.video",
      name: "视频",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
          expect(() =>
            value.video.register({ id: "other.video", name: "无效", create: () => instance })
          ).toThrow("属于当前插件");
          value.video.register({
            id: value.pluginId,
            name: "视频",
            create(config) {
              if (config && typeof config === "object" && !Array.isArray(config)) {
                const broken = config.broken === true;
                config.key = "changed";
                if (broken) return { ...instance, cacheKey: undefined } as unknown as VideoInstance;
              }
              return instance;
            },
          });
        },
      }),
    })
  );
  await host.enable("test.video");
  const config = { key: "original" };
  expect(definition.create(config)).toBe(instance);
  expect(config.key).toBe("original");
  expect(() => definition.create({ broken: true })).toThrow("缺少 cacheKey");
  await host.disable("test.video");
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(() =>
    context.video.register({ id: context.pluginId, name: "视频", create: () => instance })
  ).toThrow();
  expect(() => definition.create({})).toThrow();
  await host.dispose();
});

it("宿主未提供视频能力时拒绝注册", async () => {
  let error: unknown;
  const host = new PluginHost({ workspaceId: "test", storage: createMemoryStorage() });
  host.registerTrusted(
    definePlugin({
      id: "test.video",
      name: "视频",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          try {
            value.video.register({ id: value.pluginId, name: "视频", create: () => instance });
          } catch (caught) {
            error = caught;
          }
        },
      }),
    })
  );
  await host.enable("test.video");
  expect(String(error)).toContain("不支持视频提供方");
  await host.dispose();
});
