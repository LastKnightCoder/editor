import {
  ASRError,
  type ASRErrorCode,
  type ASRTranscript,
  type SpeechInputService,
  waitForASR,
} from "@tau/asr";
import { Channel, invoke } from "@tauri-apps/api/core";

interface NativeSpeechEvent {
  id: string;
  type: "partial" | "final" | "error";
  text: string;
  code?: ASRErrorCode;
}

const command = (action: "start" | "stop" | "cancel") => `plugin:native-speech|${action}`;

function recognitionError(error: unknown): Error {
  if (error instanceof Error && error.name === "AbortError")
    return new ASRError("cancelled", "语音识别已取消");
  return error instanceof Error ? error : new ASRError("unavailable", String(error));
}

export async function startNativeSpeechInput(
  language: string,
  options: Parameters<SpeechInputService["start"]>[0]
) {
  options.signal.throwIfAborted();
  const id = crypto.randomUUID();
  const channel = new Channel<NativeSpeechEvent>();
  let resolveResult!: (transcript: ASRTranscript) => void;
  let rejectResult!: (error: unknown) => void;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopping: Promise<void> | undefined;
  let cancelling: Promise<void> | undefined;
  const result = new Promise<ASRTranscript>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => undefined);

  const cancelNative = () => {
    cancelling ??= invoke<void>(command("cancel"), { id }).catch(() => undefined);
    return cancelling;
  };
  const settle = (text: string, error?: unknown, cancelNativeSession = false) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("pagehide", abort);
    channel.onmessage = () => undefined;
    if (cancelNativeSession) void cancelNative();
    if (error !== undefined) {
      rejectResult(recognitionError(error));
    } else resolveResult({ text, language });
  };
  const abort = () => settle("", new ASRError("cancelled", "语音识别已取消"), true);
  const visibilityChanged = () => {
    if (document.visibilityState === "hidden") abort();
  };

  channel.onmessage = event => {
    if (settled) return;
    if (
      !event ||
      typeof event.text !== "string" ||
      !["partial", "final", "error"].includes(event.type)
    ) {
      settle("", new ASRError("protocol", "系统语音识别事件无效"), true);
      return;
    }
    if (event.id !== id) return;
    if (event.type === "error") {
      const code =
        event.code === "needs-assets" || event.code === "cancelled" || event.code === "timeout"
          ? event.code
          : "unavailable";
      settle("", new ASRError(code, event.text));
      return;
    }
    options.onPreview(event.text);
    if (event.type === "final") settle(event.text);
  };

  const stop = () => {
    if (settled) return Promise.resolve();
    stopping ??= (async () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => settle("", new ASRError("timeout", "系统语音识别未能及时结束"), true),
        10_000
      );
      try {
        await invoke<void>(command("stop"), { id });
      } catch (error) {
        settle("", error, true);
        throw recognitionError(error);
      }
    })();
    return stopping;
  };

  // start 和 cancel 共用 session ID；权限弹窗期间先发取消也会由原生端排队丢弃该会话。
  const starting = invoke<void>(command("start"), { id, language, onEvent: channel });
  options.signal.addEventListener("abort", abort, { once: true });
  window.addEventListener("pagehide", abort);
  if (options.signal.aborted) abort();
  timer = setTimeout(
    () => settle("", new ASRError("timeout", "系统语音识别启动超时，请检查权限与识别服务"), true),
    30_000
  );
  try {
    await waitForASR(Promise.race([starting, result.then(() => undefined)]), options.signal);
    options.signal.throwIfAborted();
    clearTimeout(timer);
    if (!settled) {
      document.addEventListener("visibilitychange", visibilityChanged);
      timer = setTimeout(() => void stop().catch(() => undefined), 120_000);
    }
    return {
      result,
      stop,
      async cancel() {
        if (settled) return;
        abort();
        await cancelNative();
      },
    };
  } catch (error) {
    settle("", error);
    if (options.signal.aborted) throw new ASRError("cancelled", "语音识别已取消");
    throw recognitionError(error);
  }
}
