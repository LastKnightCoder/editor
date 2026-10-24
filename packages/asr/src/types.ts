export interface ASRWord {
  text: string;
  startMs: number;
  endMs: number;
}
export interface ASRSegment {
  id: string;
  text: string;
  final: boolean;
  startMs?: number;
  endMs?: number;
  speakerId?: string;
}
export interface ASRTranscript {
  text: string;
  segments?: readonly ASRSegment[];
  words?: readonly ASRWord[];
  language?: string;
  durationMs?: number;
}
export interface ASRAudioFormat {
  encoding: "pcm-s16le";
  sampleRateHz: number;
  channels: 1;
}
export interface ASRAudioFrame {
  seq: number;
  startSample: number;
  data: Uint8Array;
}
export interface ASRAudioFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  open(signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}
export interface ASRRequest {
  language: string;
}
export interface ASRFileRequest extends ASRRequest {
  audio: ASRAudioFile;
}
export interface ASRStreamRequest extends ASRRequest {
  format: ASRAudioFormat;
}
export interface ASRProbeRequest extends ASRRequest {
  input: "file" | "stream";
}
export interface ASRAvailability {
  state:
    "ready" | "needs-permission" | "needs-assets" | "needs-config" | "unavailable" | "unsupported";
  reason?: string;
  execution: "device" | "remote" | "unknown";
  textUpdates: "partial" | "segments" | "final-only";
  timestamps: "none" | "segment" | "word";
  speakerLabels: boolean;
  acceptedAudio?: { streamFormats?: readonly ASRAudioFormat[]; fileMimeTypes?: readonly string[] };
  maxDurationMs?: number;
}
export type ASREventPayload =
  | {
      type: "segments";
      baseRevision: number;
      revision: number;
      startIndex: number;
      deleteCount: number;
      segments: readonly ASRSegment[];
    }
  | { type: "progress"; stage: "uploading" | "recognizing"; fraction?: number; message?: string };
export type ASREvent = { taskId: string; seq: number } & ASREventPayload;
export interface ASRRunOptions {
  taskId: string;
  signal: AbortSignal;
  onEvent: (event: ASREvent) => void;
}
export interface ASRTask<T extends ASRTranscript = ASRTranscript> {
  readonly result: Promise<T>;
  /** 等待底层资源清理；完成后调用不会撤回已经交付的结果。 */
  cancel(): Promise<void>;
}
export interface ASRStreamSession extends ASRTask {
  write(frame: ASRAudioFrame): Promise<void>;
  /** 停止接收并排空已接受帧；最终识别结果仍从 result 取得。 */
  endInput(): Promise<void>;
}
export interface ASRInstance {
  probe(request: ASRProbeRequest, signal: AbortSignal): Promise<ASRAvailability>;
  transcribeFile?(request: ASRFileRequest, options: ASRRunOptions): Promise<ASRTask>;
  openStream?(request: ASRStreamRequest, options: ASRRunOptions): Promise<ASRStreamSession>;
}

export const MAC_NATIVE_ASR_DEFAULTS = Object.freeze({
  vad: "medium" as const,
  format: Object.freeze({
    encoding: "pcm-s16le" as const,
    sampleRateHz: 16000,
    channels: 1 as const,
  }),
  tailTimeoutMs: 10_000,
  maxBufferedMs: 2_000,
});
