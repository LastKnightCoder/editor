import type {
  ITTSProvider,
  TTSVoice,
  TTSSynthesizeOptions,
  VoiceCloneOptions,
} from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import type { MinimaxSpeechModel, MinimaxVoice } from "@/types/minimax";
import {
  getVoiceList as minimaxGetVoiceList,
  synthesizeSpeech as minimaxSynthesizeSpeech,
  uploadReferenceAudio as minimaxUploadReferenceAudio,
  cloneVoice as minimaxCloneVoice,
} from "@/services/minimax";

export interface IMinimaxConfig {
  apiKey: string;
  model: MinimaxSpeechModel;
}

/**
 * Minimax TTS Provider
 * 实现 ITTSProvider 接口，封装 Minimax TTS 服务
 */
export class MinimaxTTSProvider implements ITTSProvider {
  private config: IMinimaxConfig;

  constructor(config: IMinimaxConfig) {
    this.config = config;
  }

  getProviderName(): ETTSProvider {
    return ETTSProvider.Minimax;
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  supportsVoiceCloning(): boolean {
    return true;
  }

  /**
   * 将 Minimax 音色转换为统一的 TTSVoice 格式
   */
  private convertVoice(voice: MinimaxVoice): TTSVoice {
    let type: TTSVoice["type"] = "system";
    if (voice.voice_type === "voice_cloning") {
      type = "cloned";
    } else if (voice.voice_type === "voice_generation") {
      type = "custom";
    }

    return {
      id: voice.voice_id,
      name: voice.voice_name || voice.voice_id,
      description: voice.description?.join(", "),
      type,
      provider: ETTSProvider.Minimax,
    };
  }

  async getVoiceList(): Promise<TTSVoice[]> {
    if (!this.isConfigured()) {
      throw new Error("Minimax API Key 未配置");
    }

    const minimaxVoices = await minimaxGetVoiceList(this.config.apiKey);
    return minimaxVoices.map((voice) => this.convertVoice(voice));
  }

  async synthesizeSpeech(
    text: string,
    voiceId: string,
    _options?: TTSSynthesizeOptions,
  ): Promise<ArrayBuffer> {
    if (!this.isConfigured()) {
      throw new Error("Minimax API Key 未配置");
    }

    // Minimax synthesizeSpeech 已内置 speed, vol, pitch 参数
    // 这里暂时使用默认值，后续可扩展支持自定义选项
    return minimaxSynthesizeSpeech(
      text,
      voiceId,
      this.config.apiKey,
      this.config.model,
    );
  }

  async uploadReferenceAudio(file: File): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Minimax API Key 未配置");
    }

    return minimaxUploadReferenceAudio(file, this.config.apiKey);
  }

  async cloneVoice(fileId: string, options: VoiceCloneOptions): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("Minimax API Key 未配置");
    }

    await minimaxCloneVoice(fileId, options.voiceId, this.config.apiKey);
  }
}
