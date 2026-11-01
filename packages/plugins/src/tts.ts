import type { Disposable, JsonValue } from "./contract";
import type { UploadFile } from "./upload";

export interface TTSVoice {
  id: string;
  name: string;
  type: "system" | "cloned" | "custom";
  description?: string;
}
export interface TTSSynthesizeOptions {
  speed?: number;
  volume?: number;
  pitch?: number;
}
export interface TTSSynthesizeRequest {
  text: string;
  voiceId: string;
  options?: TTSSynthesizeOptions;
}
export interface TTSAudio {
  audio: Uint8Array;
  mime: string;
}
export interface TTSCloneRequest {
  file: UploadFile;
  requestedId?: string;
  name?: string;
}
export interface TTSInstance {
  readonly textInstructions?: string;
  getVoices(signal: AbortSignal): Promise<TTSVoice[]>;
  synthesize(request: TTSSynthesizeRequest, signal: AbortSignal): Promise<TTSAudio>;
  cloneVoice?(request: TTSCloneRequest, signal: AbortSignal): Promise<TTSVoice>;
}
export interface TTSProviderDefinition {
  id: string;
  name: string;
  /** 每次任务固定配置和模型，创建时不发网络请求。 */
  create(config: JsonValue, modelId: string): TTSInstance;
}
/** 一次语音合成会话：固定打开时用户选的服务与模型，用完 close；插件停用时宿主自动关闭 */
export interface TTSSynthesisSession {
  /** 用户所选服务的显示名，如「MiniMax 语音」 */
  readonly providerName: string;
  /** 服务对朗读文本的要求（如可用的停顿标签），写给 AI 的提示词可以带上 */
  readonly textInstructions?: string;
  getVoices(options?: { signal?: AbortSignal }): Promise<TTSVoice[]>;
  synthesize(request: TTSSynthesizeRequest, options?: { signal?: AbortSignal }): Promise<TTSAudio>;
  close(): Promise<void>;
}

export interface PluginTTS {
  register(definition: TTSProviderDefinition): Disposable;
  /** 当前不能合成的原因（如「还没有选择语音服务」），可用时为 null；不触发授权询问 */
  unavailableReason(): string | null;
  /**
   * 用用户在 Tau「语音」设置里选的服务朗读文字。需要在 manifest 声明 tts:synthesize，第一次调用时
   * Tau 询问用户；宿主不支持时抛 TTS_UNAVAILABLE 开头的错误。
   */
  open(options?: { signal?: AbortSignal }): Promise<TTSSynthesisSession>;
}
