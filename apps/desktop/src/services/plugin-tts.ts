import type { TTSInstance, JsonValue } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type { PluginTTSProviderSetting } from "@/types/tts";
import { callPluginTTS } from "@/commands/plugin-tts";
import type { TTSSessionInfo } from "../../shared/tts-renderer";

export async function openPluginTTS(
  setting: PluginTTSProviderSetting,
  modelId: string,
  signal?: AbortSignal
) {
  const session = crypto.randomUUID();
  const config: JsonValue = copyJson(setting.config);
  let info: TTSSessionInfo;
  try {
    info = await callPluginTTS<TTSSessionInfo>(
      { kind: "open", session, pluginId: setting.pluginId, config, modelId },
      signal
    );
  } catch (error) {
    await callPluginTTS<void>({ kind: "close", session }).catch(() => undefined);
    throw error;
  }
  let closed = false;
  const dispose = async () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener("abort", stop);
    await callPluginTTS<void>({ kind: "close", session });
  };
  const stop = () => {
    void dispose().catch(() => undefined);
  };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) {
    await dispose();
    signal.throwIfAborted();
  }
  const taskSignal = (call: AbortSignal) => {
    if (closed) throw new DOMException("语音任务已结束", "AbortError");
    return signal ? AbortSignal.any([signal, call]) : call;
  };
  const instance: TTSInstance & { dispose(): Promise<void> } = {
    textInstructions: info.textInstructions,
    getVoices: call => callPluginTTS({ kind: "voices", session }, taskSignal(call)),
    synthesize: (request, call) =>
      callPluginTTS({ kind: "synthesize", session, request }, taskSignal(call)),
    ...(info.canClone
      ? {
          cloneVoice: (
            request: Parameters<NonNullable<TTSInstance["cloneVoice"]>>[0],
            call: AbortSignal
          ) =>
            callPluginTTS<Awaited<ReturnType<NonNullable<TTSInstance["cloneVoice"]>>>>(
              { kind: "clone", session, request },
              taskSignal(call)
            ),
        }
      : {}),
    dispose,
  };
  return instance;
}

export async function withPluginTTS<T>(
  setting: PluginTTSProviderSetting,
  model: string,
  run: (instance: TTSInstance, signal: AbortSignal) => Promise<T>,
  signal = new AbortController().signal
) {
  const instance = await openPluginTTS(setting, model, signal);
  try {
    return await run(instance, signal);
  } finally {
    await instance.dispose();
  }
}
