import type {
  JsonValue,
  TTSCloneRequest,
  TTSAudio,
  TTSSynthesizeRequest,
  TTSVoice,
} from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type { TTSRendererRequest, TTSSessionInfo } from "@tau/plugins/tts-host";
import type { MobilePluginRuntime } from "../app/plugins/runtime";

export interface MobilePluginTTSOptions {
  pluginId: string;
  config: JsonValue;
  modelId: string;
}

export interface MobilePluginTTSSession {
  readonly info: TTSSessionInfo;
  voices(signal?: AbortSignal): Promise<TTSVoice[]>;
  synthesize(request: TTSSynthesizeRequest, signal?: AbortSignal): Promise<TTSAudio>;
  clone(request: TTSCloneRequest, signal?: AbortSignal): Promise<TTSVoice>;
  dispose(): Promise<void>;
}

export async function openMobilePluginTTS(
  runtime: MobilePluginRuntime,
  { pluginId, config, modelId }: MobilePluginTTSOptions,
  signal?: AbortSignal
): Promise<MobilePluginTTSSession> {
  const session = crypto.randomUUID();
  const configSnapshot = copyJson(config);
  const lifetime = new AbortController();
  const executionSignal = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
  let closed = false;
  let disposePromise: Promise<void> | undefined;
  const onClosed = (id: string) => {
    if (id === session)
      lifetime.abort(new DOMException("语音会话已关闭或插件已停用", "AbortError"));
  };
  const unsubscribe = runtime.tts.onClose(onClosed);
  const throwIfClosed = (taskSignal: AbortSignal) => {
    if (closed || taskSignal.aborted) throw new DOMException("语音任务已结束", "AbortError");
  };
  const execute = async <T>(request: TTSRendererRequest, callSignal?: AbortSignal): Promise<T> => {
    const taskSignal = AbortSignal.any([executionSignal, ...(callSignal ? [callSignal] : [])]);
    throwIfClosed(taskSignal);
    try {
      const result = await runtime.tts.execute(request, taskSignal);
      throwIfClosed(taskSignal);
      return result as T;
    } catch (error) {
      throwIfClosed(taskSignal);
      throw error;
    }
  };
  const dispose = () => {
    if (disposePromise) return disposePromise;
    closed = true;
    unsubscribe();
    signal?.removeEventListener("abort", stop);
    disposePromise = runtime.tts
      .execute({ kind: "close", session }, new AbortController().signal)
      .then(() => undefined);
    return disposePromise;
  };
  const stop = () => {
    void dispose().catch(() => undefined);
  };
  try {
    const info = await execute<TTSSessionInfo>({
      kind: "open",
      session,
      pluginId,
      config: configSnapshot,
      modelId,
    });
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) {
      await dispose();
      throw new DOMException("语音任务已结束", "AbortError");
    }
    return {
      info,
      voices: callSignal => execute<TTSVoice[]>({ kind: "voices", session }, callSignal),
      synthesize: (request, callSignal) =>
        execute<TTSAudio>({ kind: "synthesize", session, request }, callSignal),
      clone: (request, callSignal) =>
        execute<TTSVoice>({ kind: "clone", session, request }, callSignal),
      dispose,
    };
  } catch (error) {
    await dispose().catch(() => undefined);
    throw error;
  }
}

export async function withMobilePluginTTS<T>(
  runtime: MobilePluginRuntime,
  options: MobilePluginTTSOptions,
  run: (session: MobilePluginTTSSession) => T | Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const session = await openMobilePluginTTS(runtime, options, signal);
  try {
    return await run(session);
  } finally {
    await session.dispose();
  }
}
