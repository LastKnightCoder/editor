import { describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
  type TTSSynthesizeRequest,
} from "../index";
import { createMemoryStorage, PluginHost, type TTSSynthesisAdapter } from "../host";

async function setup(
  declared: readonly PluginPermission[] = ["tts:synthesize"],
  ttsSynthesis?: TTSSynthesisAdapter,
  save?: (file: { name: string }, signal: AbortSignal) => Promise<string>
) {
  let context!: PluginContext;
  const ensure = vi.fn(async () => undefined);
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    ttsSynthesis,
    upload: save ? { register: () => ({ dispose() {} }), save } : undefined,
    permissions: {
      ensure,
      query: async () => "granted",
      request: async () => true,
      subscribe: () => () => undefined,
    },
  });
  host.registerTrusted({
    ...definePlugin({
      id: "example.podcast",
      name: "播客",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    }),
    permissions: declared,
  });
  await host.enable("example.podcast");
  return { host, context, ensure };
}

function adapter() {
  const close = vi.fn(async () => undefined);
  const synthesize = vi.fn(async (_request: TTSSynthesizeRequest, _signal: AbortSignal) => ({
    audio: new Uint8Array([1, 2, 3]),
    mime: "audio/mpeg",
  }));
  const open = vi.fn<TTSSynthesisAdapter["open"]>(async () => ({
    providerName: "示例语音",
    textInstructions: "可用 <#0.5#> 停顿",
    getVoices: async () => [{ id: "male", name: "温润男声", type: "system" as const }],
    synthesize,
    close,
  }));
  return { ttsSynthesis: { unavailableReason: () => null, open }, open, synthesize, close };
}

describe("插件语音合成", () => {
  it("授权后打开会话，列音色、合成并关闭", async () => {
    const { ttsSynthesis, synthesize, close } = adapter();
    const { host, context, ensure } = await setup(["tts:synthesize"], ttsSynthesis);
    const session = await context.tts.open();
    expect(ensure).toHaveBeenCalledWith(
      expect.anything(),
      { id: "example.podcast", name: "播客" },
      ["tts:synthesize"]
    );
    expect(session.providerName).toBe("示例语音");
    expect(session.textInstructions).toBe("可用 <#0.5#> 停顿");
    await expect(session.getVoices()).resolves.toEqual([
      { id: "male", name: "温润男声", type: "system" },
    ]);
    const audio = await session.synthesize({ text: "你好", voiceId: "male" });
    expect(audio).toEqual({ audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" });
    expect(synthesize.mock.calls[0][0]).toEqual({ text: "你好", voiceId: "male" });
    await session.close();
    expect(close).toHaveBeenCalledTimes(1);
    await expect(session.synthesize({ text: "再见", voiceId: "male" })).rejects.toThrow();
    await host.dispose();
  });

  it("未声明权限时拒绝，不打开会话", async () => {
    const { ttsSynthesis, open } = adapter();
    const { host, context } = await setup([], ttsSynthesis);
    await expect(context.tts.open()).rejects.toBeInstanceOf(PluginPermissionError);
    expect(open).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("宿主没有语音合成时给出原因并拒绝", async () => {
    const { host, context, ensure } = await setup();
    expect(context.tts.unavailableReason()).toBe("当前设备不支持插件语音合成");
    await expect(context.tts.open()).rejects.toThrow(/^TTS_UNAVAILABLE/);
    expect(ensure).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("停用插件时关闭会话", async () => {
    const { ttsSynthesis, close } = adapter();
    const { host, context } = await setup(["tts:synthesize"], ttsSynthesis);
    await context.tts.open();
    await host.disable("example.podcast");
    expect(close).toHaveBeenCalledTimes(1);
    await host.dispose();
  });
});

describe("插件保存资源文件", () => {
  it("交给宿主保存并返回地址", async () => {
    const save = vi.fn(
      async (_file: { name: string }, _signal: AbortSignal) => "~/.editor/resources/podcast.mp3"
    );
    const { host, context } = await setup([], undefined, save);
    const url = await context.upload.save({
      name: "podcast.mp3",
      mimeType: "audio/mpeg",
      content: new Uint8Array([1]),
    });
    expect(url).toBe("~/.editor/resources/podcast.mp3");
    expect(save.mock.calls[0][0]).toMatchObject({ name: "podcast.mp3", mimeType: "audio/mpeg" });
    await host.dispose();
  });

  it("宿主不支持时报 UPLOAD_UNAVAILABLE", async () => {
    const { host, context } = await setup();
    await expect(
      context.upload.save({ name: "a.mp3", mimeType: "audio/mpeg", content: new Uint8Array() })
    ).rejects.toThrow(/^UPLOAD_UNAVAILABLE/);
    await host.dispose();
  });
});
