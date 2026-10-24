import type { ASRInstance } from "@tau/asr";
import type { Disposable, JsonValue } from "./contract";

export interface ASRProviderDefinition {
  id: string;
  name: string;
  /** 固定本次账号与模型，不在创建时联网或录音。 */
  create(config: JsonValue, modelId: string): ASRInstance;
}
export interface PluginASR {
  register(definition: ASRProviderDefinition): Disposable;
}

export type {
  ASRWord,
  ASRSegment,
  ASRTranscript,
  ASRAudioFormat,
  ASRAudioFrame,
  ASRAudioFile,
  ASRRequest,
  ASRFileRequest,
  ASRStreamRequest,
  ASRProbeRequest,
  ASRAvailability,
  ASREventPayload,
  ASREvent,
  ASRRunOptions,
  ASRTask,
  ASRStreamSession,
  ASRInstance,
  ASRStreamDriver,
  ASRErrorCode,
} from "@tau/asr";
export { ASRError, createASRStreamSession, createASRTask, throwIfASRAborted } from "@tau/asr";
