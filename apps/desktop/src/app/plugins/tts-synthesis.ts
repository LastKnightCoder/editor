import type { TTSSynthesisAdapter } from "@tau/plugins/host";
import { TTSProviderFactory } from "@/utils/tts";

/** 插件调用语音合成：与编辑器朗读同一条路径，沿用「设置 › 语音」当前选的服务与模型 */
export const desktopTTSSynthesis: TTSSynthesisAdapter = {
  unavailableReason() {
    const provider = TTSProviderFactory.getTTSProvider();
    if (!provider) return "还没有选择语音服务，请先在「设置 › 语音」里配置";
    if (!provider.synthesis) return "当前语音服务不支持朗读";
    return null;
  },
  async open(_context, signal) {
    signal.throwIfAborted();
    const provider = TTSProviderFactory.getTTSProvider();
    const synthesis = provider?.synthesis;
    if (!provider || !synthesis)
      throw new Error("TTS_UNAVAILABLE：还没有选择语音服务，请先在「设置 › 语音」里配置");
    try {
      const textInstructions = await provider.getTextInstructions?.(signal);
      return {
        providerName: provider.getProviderName(),
        ...(textInstructions ? { textInstructions } : {}),
        getVoices: async callSignal => {
          callSignal.throwIfAborted();
          return synthesis.getVoiceList();
        },
        synthesize: (request, callSignal) =>
          synthesis.synthesizeSpeech(request.text, request.voiceId, request.options, callSignal),
        close: async () => {
          await synthesis.dispose?.();
        },
      };
    } catch (error) {
      await synthesis.dispose?.().catch(() => undefined);
      throw error;
    }
  },
};
