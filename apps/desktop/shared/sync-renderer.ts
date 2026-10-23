import type { SyncRendererRequest } from "@tau/plugins/provider-host";
export type { SyncRendererRequest } from "@tau/plugins/provider-host";
export type SyncRendererMessage = SyncRendererRequest & { requestId: string };
export interface SyncRendererReply {
  requestId: string;
  result?: unknown;
  error?: string;
  errorName?: string;
}
