import type { ImageEditRequest, ImageGenerateRequest, JsonValue } from "@tau/plugins";

export type ImagesRendererRequest =
  | { kind: "open"; session: string; pluginId: string; config: JsonValue; modelId: string }
  | { kind: "generate"; session: string; request: ImageGenerateRequest }
  | { kind: "edit"; session: string; request: ImageEditRequest }
  | { kind: "close"; session: string };

export interface ImagesSessionInfo {
  canGenerate: boolean;
  canEdit: boolean;
}

export interface ImagesRendererMessage {
  requestId: string;
  hostSession: string;
  request: ImagesRendererRequest;
}

export interface ImagesRendererReply {
  requestId: string;
  hostSession: string;
  result?: unknown;
  error?: string;
  errorName?: string;
}
