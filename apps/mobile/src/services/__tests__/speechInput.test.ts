import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSpeechInputSetting } from "@tau/asr";
import { setMobileSettingSnapshot } from "../mobileSettingsBridge";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  Channel: class Channel<T> {
    onmessage?: (event: T) => void;
  },
}));

import { createMobileSpeechInputService } from "../speechInput";

describe("移动端系统语音输入", () => {
  let event:
    | ((value: { id: string; type: string; text: string; code?: string }) => void)
    | undefined;
  let sessionId = "";

  beforeEach(() => {
    native.invoke
      .mockReset()
      .mockImplementation(
        (command: string, args?: { id?: string; onEvent?: { onmessage?: typeof event } }) => {
          if (command.endsWith("|start") && args?.onEvent) {
            sessionId = args.id ?? "";
            event = args.onEvent.onmessage;
          }
          return Promise.resolve();
        }
      );
    setMobileSettingSnapshot({ speechInput: defaultSpeechInputSetting() } as never);
  });

  afterEach(() => {
    setMobileSettingSnapshot(null);
  });

  it("转发 partial 预览，松手后只用 final 结果定稿", async () => {
    const service = createMobileSpeechInputService({} as never);
    const onPreview = vi.fn();
    const session = await service.start({ signal: new AbortController().signal, onPreview });
    event?.({ id: "retired-session", type: "partial", text: "过期结果" });
    event?.({ id: sessionId, type: "partial", text: "今天天气" });
    const stopping = session.stop();
    event?.({ id: sessionId, type: "final", text: "今天天气很好" });
    await stopping;

    expect(onPreview.mock.calls.map(([text]) => text)).toEqual(["今天天气", "今天天气很好"]);
    await expect(session.result).resolves.toMatchObject({
      text: "今天天气很好",
      language: "zh-CN",
    });
    expect(native.invoke).toHaveBeenCalledWith("plugin:native-speech|stop", { id: sessionId });
  });

  it("原生引擎报错时拒绝结果且不提交预览", async () => {
    const service = createMobileSpeechInputService({} as never);
    const session = await service.start({
      signal: new AbortController().signal,
      onPreview: vi.fn(),
    });
    event?.({
      id: sessionId,
      type: "error",
      text: "系统语音识别尚未安装此语言包",
      code: "needs-assets",
    });

    await expect(session.result).rejects.toThrow("尚未安装此语言包");
  });

  it("取消时调用原生 cancel 并以取消错误结束", async () => {
    const service = createMobileSpeechInputService({} as never);
    const session = await service.start({
      signal: new AbortController().signal,
      onPreview: vi.fn(),
    });
    await session.cancel();

    await expect(session.result).rejects.toMatchObject({ code: "cancelled" });
    expect(native.invoke).toHaveBeenCalledWith("plugin:native-speech|cancel", { id: sessionId });
  });

  it("权限弹窗仍在等待时取消，会按会话 ID 排队取消", async () => {
    let acknowledgeStart!: () => void;
    native.invoke.mockImplementation(
      (command: string, args?: { id?: string; onEvent?: { onmessage?: typeof event } }) => {
        if (command.endsWith("|start")) {
          sessionId = args?.id ?? "";
          event = args?.onEvent?.onmessage;
          return new Promise<void>(resolve => {
            acknowledgeStart = resolve;
          });
        }
        return Promise.resolve();
      }
    );
    const controller = new AbortController();
    const service = createMobileSpeechInputService({} as never);
    const opening = service.start({ signal: controller.signal, onPreview: vi.fn() });
    controller.abort();

    await expect(opening).rejects.toMatchObject({ code: "cancelled" });
    expect(native.invoke).toHaveBeenCalledWith("plugin:native-speech|cancel", {
      id: sessionId,
    });
    acknowledgeStart();
    await Promise.resolve();
    await Promise.resolve();
    expect(
      native.invoke.mock.calls.filter(([name]) => name === "plugin:native-speech|cancel")
    ).toHaveLength(1);
  });
});
