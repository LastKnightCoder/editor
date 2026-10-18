/**
 * TTS (Text-to-Speech) Provider Types
 * 定义统一的 TTS 服务接口，支持多个提供商
 */

export interface PluginTTSProviderSetting {
  id: string;
  name: string;
  pluginId: string;
  config: unknown;
  models: TTSModelSetting[];
}
export type TTSProviderSetting = PluginTTSProviderSetting;
export type TTSProviderDraft = Omit<TTSProviderSetting, "id">;

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
  provider: string;
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
 * 能力：语音合成（文本 + 音色 → 音频）
 * 消费方（编辑器朗读、播客生成）面向此能力编程，不感知具体提供商/模型。
 */
export interface SpeechSynthesisCapability {
  readonly signal?: AbortSignal;
  dispose?(): Promise<void>;
  /**
   * 获取可用的音色列表
   */
  getVoiceList(): Promise<TTSVoice[]>;

  /**
   * 文本转语音合成
   * @param text 要合成的文本
   * @param voiceId 音色 ID
   * @param options 合成选项
   * @returns 音频字节与实际 MIME
   */
  synthesizeSpeech(
    text: string,
    voiceId: string,
    options?: TTSSynthesizeOptions,
    signal?: AbortSignal
  ): Promise<import("@tau/plugins").TTSAudio>;
}

/**
 * 能力：声音克隆（参考音频 → 服务端音色资产）
 */
export interface VoiceCloneCapability {
  dispose?(): Promise<void>;
  /** 一个参考文件创建一个音色，始终返回实际音色身份。 */
  cloneVoice(file: File, options: VoiceCloneOptions, signal?: AbortSignal): Promise<TTSVoice>;
}

/**
 * TTS 服务商实例：身份 + 声明的能力集合。
 * 能力以可选字段组合（而非单一必选接口）——TTS 模型形态正在分化
 * （如 Audiogen 类"prompt+参考音频→音频"与朗读合成语义不同），
 * 新能力按同样的形态增加独立接口，由提供商/模型声明实现，消费方按能力取用。
 */
export interface ITTSProvider {
  getTextInstructions?(signal?: AbortSignal): Promise<string>;
  /**
   * 获取提供商名称
   */
  getProviderName(): string;

  /**
   * 检查提供商是否已正确配置
   */
  isConfigured(): boolean;

  /**
   * 朗读合成能力（文本 + 音色 → 音频）
   */
  synthesis?: SpeechSynthesisCapability;

  /**
   * 声音克隆能力（参考音频 → 音色资产）
   */
  cloning?: VoiceCloneCapability;
}
