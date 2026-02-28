import type {
  ITTSProvider,
  TTSVoice,
  TTSSynthesizeOptions,
  VoiceCloneOptions,
} from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
import {
  getAllSpeakerList,
  textToSpeech,
  trainSpeaker,
} from "@/commands/voice-copy";
import { stripPauseMarkersForNonMinimax } from "@/utils/tts/minimaxSpeech";

export interface IDoubaoConfig {
  accessToken: string;
  secretKey: string;
  appid: string;
  token: string;
}

/**
 * Doubao (豆包) TTS Provider
 * 实现 ITTSProvider 接口，封装豆包 TTS 服务
 */
export class DoubaoTTSProvider implements ITTSProvider {
  private config: IDoubaoConfig;

  constructor(config: IDoubaoConfig) {
    this.config = config;
  }

  getProviderName(): ETTSProvider {
    return ETTSProvider.Doubao;
  }

  isConfigured(): boolean {
    return !!(
      this.config.accessToken &&
      this.config.secretKey &&
      this.config.appid &&
      this.config.token
    );
  }

  supportsVoiceCloning(): boolean {
    return true;
  }

  async getVoiceList(): Promise<TTSVoice[]> {
    if (!this.isConfigured()) {
      throw new Error("豆包 TTS 凭证未完整配置");
    }

    const result = await getAllSpeakerList(
      this.config.accessToken,
      this.config.secretKey,
      this.config.appid,
    );

    if (!result || !result.Result || !result.Result.Statuses) {
      return [];
    }

    return result.Result.Statuses.map((status) => ({
      id: status.SpeakerID,
      name: status.Alias || status.SpeakerID,
      description: `状态: ${status.State}`,
      type: "cloned" as const,
      provider: ETTSProvider.Doubao,
    }));
  }

  async synthesizeSpeech(
    text: string,
    voiceId: string,
    _options?: TTSSynthesizeOptions,
  ): Promise<ArrayBuffer> {
    if (!this.isConfigured()) {
      throw new Error("豆包 TTS 凭证未完整配置");
    }

    const sanitizedText = stripPauseMarkersForNonMinimax(text);
    const audioBase64 = await textToSpeech(
      this.config.appid,
      this.config.token,
      sanitizedText,
      voiceId,
    );

    if (!audioBase64) {
      throw new Error("语音合成失败");
    }

    // 将 base64 转换为 ArrayBuffer
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes.buffer;
  }

  async uploadReferenceAudio(file: File): Promise<string> {
    // 豆包的声音克隆需要先将文件转为 base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }

  async cloneVoice(
    audioBase64: string,
    options: VoiceCloneOptions,
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error("豆包 TTS 凭证未完整配置");
    }

    const result = await trainSpeaker(
      this.config.appid,
      this.config.token,
      options.voiceId,
      audioBase64,
    );

    if (!result || result.BaseResp?.StatusCode !== 0) {
      throw new Error(result?.BaseResp?.StatusMessage || "声音克隆失败");
    }
  }
}
