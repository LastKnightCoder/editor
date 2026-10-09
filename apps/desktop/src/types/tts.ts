/**
 * TTS (Text-to-Speech) Provider Types
 * 定义统一的 TTS 服务接口，支持多个提供商
 */

export enum ETTSProvider {
  Minimax = "minimax",
  Qwen = "qwen",
}

/**
 * TTS 服务商配置（对齐 LLMProviderSetting 的多实例模式）
 */
export interface TTSProviderSetting {
  id: string;
  name: string;
  providerType: ETTSProvider;
  /** 服务地址覆盖；空则用 providerType 对应的官方默认域名 */
  baseUrl?: string;
  apiKey: string;
  models: TTSModelSetting[];
}

/** 请求体里的模型条目：id 即 API 的 model 名，provider 内唯一 */
export interface TTSModelSetting {
  id: string;
  /** 展示名，缺省同 id */
  label?: string;
}

/** 当前使用的语音服务（对齐 LLMUsageConfigV2，多一个 voiceId） */
export interface TTSUsageConfig {
  providerId: string;
  modelId: string;
  voiceId: string;
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
    options?: TTSSynthesizeOptions
  ): Promise<ArrayBuffer>;

  /**
   * 检查提供商是否已正确配置
   */
  isConfigured(): boolean;

  /**
   * 上传参考音频用于声音克隆（可选）
   * @param file 音频文件
   * @returns 文件 ID（语义随提供商而异：文件上传 ID 或公网音频 URL）
   */
  uploadReferenceAudio?(file: File): Promise<string>;

  /**
   * 克隆音色（可选）
   * @param fileId 上传的参考音频文件 ID
   * @param options 克隆选项
   * @returns 提供商生成的音色 ID；未返回时（如 Minimax 以自定义 voiceId 命名）为 undefined
   */
  cloneVoice?(fileId: string, options: VoiceCloneOptions): Promise<string | void>;

  /**
   * 检查是否支持声音克隆
   */
  supportsVoiceCloning(): boolean;
}
