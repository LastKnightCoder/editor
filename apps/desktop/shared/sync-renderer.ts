import type { JsonValue, SyncProvider } from "@tau/plugins/sync";

export type SyncRendererRequest =
  | { kind: "open"; session: string; pluginId: string; config: JsonValue }
  | { kind: "call"; session: string; method: keyof SyncProvider; args: unknown[] }
  | { kind: "close"; session: string };
export type SyncRendererMessage = SyncRendererRequest & { requestId: string };
export interface SyncRendererReply {
  requestId: string;
  result?: unknown;
  error?: string;
  errorName?: string;
}
