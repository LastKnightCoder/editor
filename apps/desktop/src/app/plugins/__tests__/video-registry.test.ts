import { expect, it, vi } from "vitest";
import type { PluginContext, VideoInstance, VideoProviderDefinition } from "@tau/plugins";
import { RendererVideoRegistry } from "../video-registry";

const context = (pluginId: string, controller = new AbortController()) =>
  ({ pluginId, signal: controller.signal }) as unknown as PluginContext;

const instance = (overrides: Partial<VideoInstance> = {}): VideoInstance => ({
  matches: url => url.includes("a.test"),
  resolve: async () => ({
    title: "标题",
    cover: undefined,
    variants: [{ label: "1080P", hint: undefined, ref: { id: "1", q: 80 } }],
    defaultVariant: 3,
  }),
  cacheKey: ref => `${ref.id}-${ref.q}`,
  getPlayback: async () => ({
    kind: "split",
    video: { url: "https://cdn.test/v", headers: { Referer: "https://a.test" } },
    audio: { url: "https://cdn.test/a" },
  }),
  ...overrides,
});

const definition = (id: string, create: VideoProviderDefinition["create"]) => ({
  id,
  name: id,
  create,
});

it("按当前配置创建实例，识别链接并返回校验后的结果副本", async () => {
  const configs: Record<string, unknown> = { "a.video": { token: "t" } };
  const create = vi.fn(() => instance());
  const registry = new RendererVideoRegistry(id => configs[id] as never);
  const changed = vi.fn();
  registry.onChange(changed);
  registry.register(context("a.video"), definition("a.video", create));
  registry.register(
    context("b.video"),
    definition("b.video", () => instance({ matches: () => false }))
  );
  expect(changed).toHaveBeenCalledTimes(2);
  expect(registry.state()).toMatchObject({ ready: false });
  registry.markReady();
  expect(changed).toHaveBeenCalledTimes(3);
  expect(registry.state().providers.map(item => item.id)).toEqual(["a.video", "b.video"]);
  expect(await registry.execute({ kind: "match", url: "https://a.test/1" })).toBe("a.video");
  expect(await registry.execute({ kind: "match", url: "https://c.test/1" })).toBeNull();
  expect(create).toHaveBeenCalledWith({ token: "t" });
  const resolved = await registry.execute({ kind: "resolve", pluginId: "a.video", url: "u" });
  // 可选字段为 undefined 时省略，越界的默认项被丢弃
  expect(resolved).toEqual({
    title: "标题",
    variants: [{ label: "1080P", ref: { id: "1", q: 80 } }],
  });
  expect(
    await registry.execute({ kind: "cacheKey", pluginId: "a.video", ref: { id: "1", q: 80 } })
  ).toBe("1-80");
  expect(
    await registry.execute({ kind: "playback", pluginId: "a.video", ref: { id: "1" } })
  ).toMatchObject({ kind: "split", video: { headers: { Referer: "https://a.test" } } });
});

it("拒绝无效结果、未注册或已停用的提供方", async () => {
  const registry = new RendererVideoRegistry(() => ({}));
  const controller = new AbortController();
  registry.register(
    context("bad.video", controller),
    definition("bad.video", () =>
      instance({
        resolve: async () => ({ title: "x", variants: [] }),
        getPlayback: async () => ({ kind: "file" }) as never,
        cacheKey: () => "",
      })
    )
  );
  await expect(
    registry.execute({ kind: "resolve", pluginId: "bad.video", url: "u" })
  ).rejects.toThrow("清晰度");
  await expect(
    registry.execute({ kind: "playback", pluginId: "bad.video", ref: {} })
  ).rejects.toThrow("播放源无效");
  await expect(
    registry.execute({ kind: "cacheKey", pluginId: "bad.video", ref: {} })
  ).rejects.toThrow("缓存身份无效");
  await expect(registry.execute({ kind: "resolve", pluginId: "none", url: "u" })).rejects.toThrow(
    "安装并启用"
  );
  controller.abort();
  await expect(
    registry.execute({ kind: "resolve", pluginId: "bad.video", url: "u" })
  ).rejects.toThrow("安装并启用");
});

it("调用中插件停用或调用方取消时立即结束，注销后不再列出", async () => {
  const registry = new RendererVideoRegistry(() => ({}));
  const lifetime = new AbortController();
  let pluginSignal!: AbortSignal;
  const handle = registry.register(
    context("slow.video", lifetime),
    definition("slow.video", () =>
      instance({
        resolve: (_url, signal) => {
          pluginSignal = signal;
          return new Promise(() => undefined);
        },
      })
    )
  );
  const call = new AbortController();
  const pending = registry.execute(
    { kind: "resolve", pluginId: "slow.video", url: "u" },
    call.signal
  );
  await Promise.resolve();
  call.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(pluginSignal.aborted).toBe(true);
  const second = registry.execute({ kind: "resolve", pluginId: "slow.video", url: "u" });
  await Promise.resolve();
  lifetime.abort();
  await expect(second).rejects.toMatchObject({ name: "AbortError" });
  await handle.dispose();
  expect(registry.state().providers).toEqual([]);
});

it("字幕为可选能力，空结果返回 null，有效字幕按时间排序并复制", async () => {
  const registry = new RendererVideoRegistry(() => ({}));
  const captions = {
    language: "zh",
    segments: [
      { text: " 第二句 ", start: 2000, end: 3000 },
      { text: "第一句", start: 0, end: 1000 },
    ],
  };
  const getCaptions = vi.fn(async () => captions);
  registry.register(
    context("a.video"),
    definition("a.video", () => instance())
  );
  expect(await registry.execute({ kind: "captions", pluginId: "a.video", ref: {} })).toBeNull();
  registry.register(
    context("b.video"),
    definition("b.video", () => instance({ getCaptions }))
  );
  const result = await registry.execute({
    kind: "captions",
    pluginId: "b.video",
    ref: { id: "1" },
  });
  expect(result).toEqual({
    language: "zh",
    segments: [
      { text: "第一句", start: 0, end: 1000 },
      { text: "第二句", start: 2000, end: 3000 },
    ],
  });
  expect(result?.segments[0]).not.toBe(captions.segments[1]);
  getCaptions.mockResolvedValue({ language: "zh", segments: [] });
  expect(await registry.execute({ kind: "captions", pluginId: "b.video", ref: {} })).toBeNull();
  getCaptions.mockResolvedValue({ language: "zh", segments: [{ text: "错", start: 10, end: 5 }] });
  await expect(
    registry.execute({ kind: "captions", pluginId: "b.video", ref: {} })
  ).rejects.toThrow("时间戳");
});

it("停用字幕提供方后拒绝迟到结果", async () => {
  const registry = new RendererVideoRegistry(() => ({}));
  const lifetime = new AbortController();
  let finish!: (value: null) => void;
  registry.register(
    context("a.video", lifetime),
    definition("a.video", () =>
      instance({
        getCaptions: () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      })
    )
  );
  const result = registry.execute({ kind: "captions", pluginId: "a.video", ref: {} });
  await Promise.resolve();
  lifetime.abort();
  finish(null);
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});
