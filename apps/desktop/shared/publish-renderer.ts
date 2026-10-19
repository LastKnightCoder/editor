import type { JsonValue } from "@tau/plugins";

export type PublishRendererRequest =
  | { kind: "open"; session: string; pluginId: string; config: JsonValue }
  | {
      kind: "call";
      session: string;
      method: "describe" | "checkConnection" | "uploadFile" | "deleteFile" | "publish";
      args: unknown[];
    }
  | { kind: "close"; session: string };
export type PublishRendererMessage = PublishRendererRequest & { requestId: string };
export interface PublishRendererReply {
  requestId: string;
  result?: unknown;
  error?: string;
}
