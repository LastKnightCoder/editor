import type {
  ITTSProvider,
  SpeechSynthesisCapability,
  VoiceCloneCapability,
  TTSVoice,
  TTSSynthesizeOptions,
  VoiceCloneOptions,
} from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import { buildMinimaxSpeechPromptRules } from "./minimaxSpeech";
import type { MinimaxSpeechModel } from "@/types/minimax";
import { ttsCommands } from "@/commands/contracts/tts";
import {
  uploadReferenceAudio as minimaxUploadReferenceAudio,
  cloneVoice as minimaxCloneVoice,
} from "@/services/minimax";

export interface IMinimaxConfig {
  apiKey: string;
  baseUrl?: string;
  model: MinimaxSpeechModel;
}

/**
 * Minimax TTS Provider
 * 合成与音色列表经主进程 tts 模块执行（网络出口收敛主进程：免 CORS）；
 * 声音克隆走 Minimax 自有的文件上传接口（本地音频直传，无需中转），
 * 保留渲染端既有链路。
 */
export function createMinimaxTTSProvider(config: IMinimaxConfig): ITTSProvider {
  const assertConfigured = () => {
    if (!config.apiKey) {
      throw new Error("Minimax API Key 未配置");
    }
  };

  const synthesis: SpeechSynthesisCapability = {
    async getVoiceList(): Promise<TTSVoice[]> {
      assertConfigured();
      return ttsCommands.voiceList.call({
        providerType: ETTSProvider.Minimax,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      });
    },

    async synthesizeSpeech(
      text: string,
      voiceId: string,
      options?: TTSSynthesizeOptions
    ): Promise<import("@tau/plugins").TTSAudio> {
      assertConfigured();
      const result = await ttsCommands.synthesize.call({
        providerType: ETTSProvider.Minimax,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        text,
        voiceId,
        options,
      });
      return result;
    },
  };

  const cloning: VoiceCloneCapability = {
    async cloneVoice(file: File, options: VoiceCloneOptions): Promise<TTSVoice> {
      assertConfigured();
      const fileId = await minimaxUploadReferenceAudio(file, config.apiKey);
      await minimaxCloneVoice(fileId, options.voiceId, config.apiKey);
      return {
        id: options.voiceId,
        name: options.voiceName || options.voiceId,
        type: "cloned",
        provider: ETTSProvider.Minimax,
      };
    },
  };

  return {
    getTextInstructions: async () => buildMinimaxSpeechPromptRules(true, config.model),
    getProviderName: () => ETTSProvider.Minimax,
    isConfigured: () => Boolean(config.apiKey),
    synthesis,
    cloning,
  };
}
