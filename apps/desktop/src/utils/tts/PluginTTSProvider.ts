import type { ITTSProvider, PluginTTSProviderSetting } from "@/types/tts";
import { openPluginTTS, withPluginTTS } from "@/services/plugin-tts";

export function createPluginTTSProvider(
  setting: PluginTTSProviderSetting,
  model: string
): ITTSProvider {
  const snapshot = structuredClone(setting);
  let task: ReturnType<typeof openPluginTTS> | undefined;
  let disposed = false;
  const getTask = (signal?: AbortSignal) => {
    if (disposed) throw new DOMException("语音任务已结束", "AbortError");
    return (task ??= openPluginTTS(snapshot, model, signal));
  };
  const dispose = async () => {
    disposed = true;
    if (task)
      await task.then(
        instance => instance.dispose(),
        () => undefined
      );
  };
  return {
    getProviderName: () => snapshot.name,
    isConfigured: () => Boolean(model),
    synthesis: {
      dispose,
      getVoiceList: () =>
        withPluginTTS(snapshot, model, async (instance, signal) =>
          (await instance.getVoices(signal)).map(voice => ({
            ...voice,
            provider: snapshot.pluginId,
          }))
        ),
      synthesizeSpeech: async (text, voiceId, options, signal = new AbortController().signal) =>
        (await getTask(signal)).synthesize(
          { text, voiceId, ...(options ? { options } : {}) },
          signal
        ),
    },
    cloning: {
      dispose,
      cloneVoice: async (file, options, signal = new AbortController().signal) => {
        const instance = await getTask(signal);
        if (!instance.cloneVoice) throw new Error("当前模型不支持音色复刻");
        const voice = await instance.cloneVoice(
          {
            file: {
              name: file.name,
              mimeType: file.type,
              content: new Uint8Array(await file.arrayBuffer()),
            },
            requestedId: options.voiceId,
            name: options.voiceName,
          },
          signal
        );
        return { ...voice, provider: snapshot.pluginId };
      },
    },
  };
}
