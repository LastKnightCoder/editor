import { Channel, invoke } from "@tauri-apps/api/core";
import { decodePluginBytes } from "../app/plugins/transport";

/** 录音落点：所属文档与找回时的定位文字 */
export type RecordingTargetInfo = {
  document: string;
  afterText?: string;
};

export type RecordingEvent =
  | { id: string; type: "level"; level: number; elapsedMs: number; freeBytes?: number }
  | { id: string; type: "paused"; reason: "user" | "interruption" | "route"; elapsedMs: number }
  | { id: string; type: "resumed"; elapsedMs: number }
  | { id: string; type: "error"; message: string };

export type StoredRecording = { src: string; durationMs: number; sizeBytes: number };

export type PendingRecording = {
  id: string;
  target: RecordingTargetInfo;
  title: string;
  startedAt: number;
  durationMs?: number;
};

export async function startRecording(
  target: RecordingTargetInfo,
  title: string,
  onEvent: (event: RecordingEvent) => void
): Promise<{ id: string; freeBytes?: number }> {
  const channel = new Channel<RecordingEvent>();
  channel.onmessage = onEvent;
  return invoke("recording_start", { target, title, onEvent: channel });
}

export const pauseRecording = (id: string) => invoke<void>("recording_pause", { id });
export const resumeRecording = (id: string) => invoke<void>("recording_resume", { id });
export const stopRecording = (id: string) => invoke<StoredRecording>("recording_stop", { id });
export const cancelRecording = (id: string) => invoke<void>("recording_cancel", { id });
/** 已插入文档或用户放弃找回：删除旁注，资源本身保留 */
export const discardRecording = (id: string) => invoke<void>("recording_discard", { id });
export const pendingRecordings = (document: string) =>
  invoke<PendingRecording[]>("recording_pending", { document });
export const recoverRecording = (id: string) =>
  invoke<StoredRecording>("recording_recover", { id });

export type PreparedTranscriptAudio = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** 原样交出且容器头没有帧数时为 null */
  durationMs: number | null;
  url?: string | null;
};

/** 按识别服务声明的格式准备：`accepted` 为空表示收任何格式，原样交出 */
export const prepareTranscriptAudio = (id: string, src: string, accepted: readonly string[]) =>
  invoke<PreparedTranscriptAudio>("transcript_audio_prepare", { id, src, accepted });
export const releaseTranscriptAudio = (id: string) =>
  invoke<void>("transcript_audio_release", { id }).catch(() => undefined);

/** 按块读取准备好的音频；每次 open 从头读 */
export function readTranscriptAudio(id: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted) {
        controller.error(signal.reason);
        return;
      }
      const chunk = await invoke<string | null>("transcript_audio_read", { id, offset });
      if (chunk === null) {
        controller.close();
        return;
      }
      const bytes = decodePluginBytes(chunk);
      offset += bytes.length;
      controller.enqueue(bytes);
    },
  });
}
export const openRecordingSettings = () => invoke<void>("recording_open_settings");
