import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASRError,
  type ASRTranscript,
  type SpeechInputService,
  type SpeechInputSession,
  type SpeechRefiner,
} from "@tau/asr";
import {
  useDictationSession,
  type DictationSession,
  type DictationSessionOptions,
} from "../useDictationSession";

/** 可手动驱动的假识别服务：stop 用 finalText 定稿，cancel 以取消错误拒绝 result */
function createFakeService(finalText = "你好世界") {
  const state = {
    signal: null as AbortSignal | null,
    preview: (_text: string) => {},
    resolve: (_value: ASRTranscript) => {},
    reject: (_error: unknown) => {},
    stop: vi.fn(async () => state.resolve({ text: finalText })),
    cancel: vi.fn(async () => state.reject(new ASRError("cancelled", "语音识别已取消"))),
    connect: () => {},
    failConnect: (_error: unknown) => {},
  };
  const service: SpeechInputService = {
    start: vi.fn<SpeechInputService["start"]>(
      options =>
        new Promise<SpeechInputSession>((resolve, reject) => {
          state.signal = options.signal;
          state.preview = options.onPreview;
          const result = new Promise<ASRTranscript>((res, rej) => {
            state.resolve = res;
            state.reject = rej;
          });
          void result.catch(() => undefined);
          state.connect = () => resolve({ result, stop: state.stop, cancel: state.cancel });
          state.failConnect = reject;
        })
    ),
  };
  return { service, state };
}

const flush = () => act(async () => {});

/** jsdom 缺 AbortSignal.any（refineSpeechInput 依赖），WebView 原生具备 */
beforeAll(() => {
  if (typeof AbortSignal.any === "function") return;
  AbortSignal.any = (signals: AbortSignal[]) => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
});

describe("useDictationSession", () => {
  let host: HTMLDivElement;
  let root: Root;
  let session: DictationSession;
  let callbacks: {
    onPreview: ReturnType<typeof vi.fn>;
    onCommit: ReturnType<typeof vi.fn>;
    onPolished: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
  };

  function Harness(props: Pick<DictationSessionOptions, "service" | "refine">) {
    session = useDictationSession({ ...props, ...callbacks });
    return null;
  }

  const render = (props: Pick<DictationSessionOptions, "service" | "refine">) =>
    act(() => root.render(<Harness {...props} />));

  /** 开始并连上，进入 listening */
  async function startListening(fake: ReturnType<typeof createFakeService>) {
    act(() => session.start());
    expect(session.phase).toBe("connecting");
    await act(async () => fake.state.connect());
    expect(session.phase).toBe("listening");
  }

  beforeEach(() => {
    callbacks = {
      onPreview: vi.fn(),
      onCommit: vi.fn(),
      onPolished: vi.fn(),
      onError: vi.fn(),
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("正常写入：预览透传，松手后 onCommit 原文并回到 idle", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    await startListening(fake);
    expect(session.startedAt).toBeTypeOf("number");
    act(() => fake.state.preview("你好"));
    expect(callbacks.onPreview).toHaveBeenCalledWith("你好");
    act(() => session.finish());
    await flush();
    expect(fake.state.stop).toHaveBeenCalledTimes(1);
    expect(callbacks.onCommit).toHaveBeenCalledWith("你好世界", false);
    expect(callbacks.onPolished).not.toHaveBeenCalled();
    expect(session.phase).toBe("idle");
    expect(session.startedAt).toBeNull();
  });

  it("识别结果为空：不调 onCommit，直接回 idle", async () => {
    const fake = createFakeService("  ");
    render({ service: fake.service });
    await startListening(fake);
    act(() => session.finish());
    await flush();
    expect(callbacks.onCommit).not.toHaveBeenCalled();
    expect(session.phase).toBe("idle");
  });

  it("服务层自动停止：result 自然 resolve 也走 onCommit，且只调一次", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    await startListening(fake);
    await act(async () => fake.state.resolve({ text: "两分钟" }));
    expect(callbacks.onCommit).toHaveBeenCalledWith("两分钟", false);
    expect(session.phase).toBe("idle");
    act(() => session.finish());
    await flush();
    expect(callbacks.onCommit).toHaveBeenCalledTimes(1);
  });

  it("取消：调用 cancel，不触发 onCommit 与 onError", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    await startListening(fake);
    act(() => session.cancel());
    await flush();
    expect(fake.state.cancel).toHaveBeenCalledTimes(1);
    expect(fake.state.signal?.aborted).toBe(true);
    expect(callbacks.onCommit).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(session.phase).toBe("idle");
  });

  it("连接中取消：连上后立即释放会话", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    act(() => session.start());
    act(() => session.cancel());
    await act(async () => fake.state.connect());
    expect(fake.state.cancel).toHaveBeenCalledTimes(1);
    expect(session.phase).toBe("idle");
  });

  it("识别出错：onError 并进入 error，下一次 start 可恢复", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    await startListening(fake);
    const error = new ASRError("unavailable", "连接失败");
    await act(async () => fake.state.reject(error));
    expect(callbacks.onError).toHaveBeenCalledWith(error);
    expect(session.phase).toBe("error");

    await startListening(fake);
    act(() => session.finish());
    await flush();
    expect(callbacks.onCommit).toHaveBeenCalledWith("你好世界", false);
  });

  it("连接失败：onError 并进入 error", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    act(() => session.start());
    const error = new Error("麦克风权限被拒");
    await act(async () => fake.state.failConnect(error));
    expect(callbacks.onError).toHaveBeenCalledWith(error);
    expect(session.phase).toBe("error");
  });

  it("service 为 null：start 直接报不可用", () => {
    render({ service: null });
    act(() => session.start());
    expect(callbacks.onError).toHaveBeenCalledWith(new Error("语音输入不可用"));
    expect(session.phase).toBe("error");
  });

  it("润色成功：先 onCommit 原文，再 onPolished(refined)", async () => {
    const fake = createFakeService("嗯你好");
    const refine: SpeechRefiner = vi.fn(async () => "你好。");
    render({ service: fake.service, refine });
    await startListening(fake);
    act(() => session.finish());
    await flush();
    expect(callbacks.onCommit).toHaveBeenCalledWith("嗯你好", true);
    expect(refine).toHaveBeenCalledWith(
      "嗯你好",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(callbacks.onPolished).toHaveBeenCalledWith("你好。", "refined");
    expect(session.phase).toBe("idle");
  });

  it("润色失败：降级为 fallback，保留原文", async () => {
    const fake = createFakeService("原话");
    const refine: SpeechRefiner = vi.fn(async () => {
      throw new Error("模型出错");
    });
    render({ service: fake.service, refine });
    await startListening(fake);
    act(() => session.finish());
    await flush();
    expect(callbacks.onPolished).toHaveBeenCalledWith("原话", "fallback");
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(session.phase).toBe("idle");
  });

  it("润色失败后重试：用同一识别结果再次润色", async () => {
    const fake = createFakeService("原话");
    const refine = vi
      .fn<SpeechRefiner>()
      .mockRejectedValueOnce(new Error("模型出错"))
      .mockResolvedValueOnce("原话。");
    render({ service: fake.service, refine });
    await startListening(fake);
    act(() => session.finish());
    await flush();
    expect(callbacks.onPolished).toHaveBeenLastCalledWith("原话", "fallback");
    act(() => session.retryPolish());
    await flush();
    expect(refine).toHaveBeenCalledTimes(2);
    expect(callbacks.onPolished).toHaveBeenLastCalledWith("原话。", "refined");
    expect(session.phase).toBe("idle");
    act(() => session.retryPolish());
    await flush();
    expect(refine).toHaveBeenCalledTimes(2);
  });

  it("录音开始时固定润色器：录音中撤掉润色器仍按开始时润色", async () => {
    const fake = createFakeService("原话");
    const refine: SpeechRefiner = vi.fn(async () => "原话。");
    render({ service: fake.service, refine });
    await startListening(fake);
    render({ service: fake.service });
    act(() => session.finish());
    await flush();
    expect(callbacks.onCommit).toHaveBeenCalledWith("原话", true);
    expect(callbacks.onPolished).toHaveBeenCalledWith("原话。", "refined");
  });

  it("润色中跳过：中止润色，不调 onPolished，回 idle", async () => {
    const fake = createFakeService("原话");
    let refineSignal: AbortSignal | undefined;
    const refine: SpeechRefiner = vi.fn(
      (_text, { signal }) =>
        new Promise<string>(() => {
          refineSignal = signal;
        })
    );
    render({ service: fake.service, refine });
    await startListening(fake);
    act(() => session.finish());
    await flush();
    expect(session.phase).toBe("polishing");
    act(() => session.skipPolish());
    await flush();
    expect(refineSignal?.aborted).toBe(true);
    expect(callbacks.onPolished).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(session.phase).toBe("idle");
  });

  it("卸载时取消进行中的会话", async () => {
    const fake = createFakeService();
    render({ service: fake.service });
    await startListening(fake);
    act(() => root.unmount());
    await flush();
    expect(fake.state.cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
