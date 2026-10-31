import { describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
} from "../index";
import { createMemoryStorage, PluginHost, type SpeechAdapter } from "../host";

async function setup(
  declared: readonly PluginPermission[] = ["speech:input"],
  speech?: SpeechAdapter
) {
  let context!: PluginContext;
  const ensure = vi.fn(async () => undefined);
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    speech,
    permissions: {
      ensure,
      query: async () => "granted",
      request: async () => true,
      subscribe: () => () => undefined,
    },
  });
  host.registerTrusted({
    ...definePlugin({
      id: "example.speech",
      name: "语音",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    }),
    permissions: declared,
  });
  await host.enable("example.speech");
  return { host, context, ensure };
}

function adapter(text = "奶茶一杯") {
  let resolve!: (value: string) => void;
  const result = new Promise<string>(r => (resolve = r));
  const stop = vi.fn(async () => resolve(text));
  const cancel = vi.fn(async () => undefined);
  const start = vi.fn<SpeechAdapter["start"]>(async (_context, options) => {
    options.onPreview("奶茶");
    return { result, stop, cancel };
  });
  return { speech: { unavailableReason: () => null, start } satisfies SpeechAdapter, start, stop };
}

describe("插件语音输入", () => {
  it("授权后开始录音，转发预览与识别结果", async () => {
    const { speech, start } = adapter();
    const { host, context, ensure } = await setup(["speech:input"], speech);
    const previews: string[] = [];
    const session = await context.speech.start({ onPreview: text => previews.push(text) });
    expect(ensure).toHaveBeenCalledWith(expect.anything(), { id: "example.speech", name: "语音" }, [
      "speech:input",
    ]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(previews).toEqual(["奶茶"]);
    await session.stop();
    await expect(session.result).resolves.toBe("奶茶一杯");
    await host.dispose();
  });

  it("未声明权限时拒绝，不触发录音", async () => {
    const { speech, start } = adapter();
    const { host, context } = await setup([], speech);
    await expect(context.speech.start()).rejects.toBeInstanceOf(PluginPermissionError);
    expect(start).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("宿主没有语音时给出原因并拒绝开始", async () => {
    const { host, context, ensure } = await setup();
    expect(context.speech.unavailableReason()).toBe("当前设备不支持插件语音输入");
    await expect(context.speech.start()).rejects.toThrow(/^SPEECH_UNAVAILABLE/);
    expect(ensure).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("停用插件时中止录音信号，迟到的结果不再交付", async () => {
    const { speech, start } = adapter();
    const { host, context } = await setup(["speech:input"], speech);
    const session = await context.speech.start();
    const signal = start.mock.calls[0][1].signal;
    await host.disable("example.speech");
    expect(signal.aborted).toBe(true);
    await session.stop();
    await expect(session.result).rejects.toThrow();
    await host.dispose();
  });
});
