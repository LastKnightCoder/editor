import type { JsonValue, TTSCloneRequest, TTSSynthesizeRequest } from "@tau/plugins";
export type TTSRendererRequest =
  | { kind: "open"; session: string; pluginId: string; config: JsonValue; modelId: string }
  | { kind: "voices"; session: string }
  | { kind: "synthesize"; session: string; request: TTSSynthesizeRequest }
  | { kind: "clone"; session: string; request: TTSCloneRequest }
  | { kind: "close"; session: string };
export interface TTSSessionInfo {
  textInstructions?: string;
  canClone: boolean;
}
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
