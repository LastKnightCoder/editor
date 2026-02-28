/**
 * TTS (Text-to-Speech) Provider Types
 * 定义统一的 TTS 服务接口，支持多个提供商
 */

export enum ETTSProvider {
  Minimax = "minimax",
}

/**
 * 统一的音色信息接口
 */
export interface TTSVoice {
  id: string;
  name: string;
  description?: string;
  type: "system" | "cloned" | "custom";
  provider: ETTSProvider;
}

/**
 * TTS 合成选项
 */
export interface TTSSynthesizeOptions {
  speed?: number;
  volume?: number;
  pitch?: number;
}

/**
 * 声音克隆选项（可选功能）
 */
export interface VoiceCloneOptions {
  voiceId: string;
  voiceName?: string;
}

/**
 * TTS Provider 接口
 * 所有 TTS 提供商必须实现此接口
 */
export interface ITTSProvider {
  /**
   * 获取提供商名称
   */
  getProviderName(): ETTSProvider;

  /**
   * 获取可用的音色列表
   */
  getVoiceList(): Promise<TTSVoice[]>;

  /**
   * 文本转语音合成
   * @param text 要合成的文本
   * @param voiceId 音色 ID
   * @param options 合成选项
   * @returns 音频数据 ArrayBuffer
   */
  synthesizeSpeech(
    text: string,
    voiceId: string,
    options?: TTSSynthesizeOptions,
  ): Promise<ArrayBuffer>;

  /**
   * 检查提供商是否已正确配置
   */
  isConfigured(): boolean;

  /**
   * 上传参考音频用于声音克隆（可选）
   * @param file 音频文件
   * @returns 文件 ID
   */
  uploadReferenceAudio?(file: File): Promise<string>;

  /**
   * 克隆音色（可选）
   * @param fileId 上传的参考音频文件 ID
   * @param options 克隆选项
   */
  cloneVoice?(fileId: string, options: VoiceCloneOptions): Promise<void>;

  /**
   * 检查是否支持声音克隆
   */
  supportsVoiceCloning(): boolean;
}
