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
export interface PluginTTS {
  register(definition: TTSProviderDefinition): Disposable;
}
