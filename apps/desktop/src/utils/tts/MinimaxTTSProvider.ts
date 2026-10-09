import type { ITTSProvider, TTSVoice, TTSSynthesizeOptions, VoiceCloneOptions } from "@/types/tts";
import { ETTSProvider } from "@/types/tts";
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
 * 合成与音色列表经主进程 tts 模块执行；声音克隆走 Minimax 自有的
 * 文件上传接口（本地音频直传，无需中转），保留渲染端既有链路。
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

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error("Minimax API Key 未配置");
    }
  }

  async getVoiceList(): Promise<TTSVoice[]> {
    this.assertConfigured();
    return ttsCommands.voiceList.call({
      providerType: ETTSProvider.Minimax,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
    });
  }

  async synthesizeSpeech(
    text: string,
    voiceId: string,
    options?: TTSSynthesizeOptions
  ): Promise<ArrayBuffer> {
    this.assertConfigured();
    const result = await ttsCommands.synthesize.call({
      providerType: ETTSProvider.Minimax,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      text,
      voiceId,
      options,
    });
    // IPC 返回 Uint8Array；接口契约是 ArrayBuffer，拷贝出精确长度的缓冲
    return result.audio.slice().buffer;
  }

  async uploadReferenceAudio(file: File): Promise<string> {
    this.assertConfigured();
    return minimaxUploadReferenceAudio(file, this.config.apiKey);
  }

  async cloneVoice(fileId: string, options: VoiceCloneOptions): Promise<void> {
    this.assertConfigured();
    await minimaxCloneVoice(fileId, options.voiceId, this.config.apiKey);
  }
}
