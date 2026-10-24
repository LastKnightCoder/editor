import type { TTSRendererRequest } from "@tau/plugins/tts-host";
export type { TTSRendererRequest, TTSSessionInfo } from "@tau/plugins/tts-host";
export interface TTSRendererMessage {
  requestId: string;
  hostSession: string;
  request: TTSRendererRequest;
}
export interface TTSRendererReply {
  requestId: string;
  hostSession: string;
  result?: unknown;
  error?: string;
  errorName?: string;
}
