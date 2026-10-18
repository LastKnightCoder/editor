import type { JsonValue, UploadFile } from "@tau/plugins";

export interface UploadRequest {
  pluginId: string;
  file: UploadFile;
  config: JsonValue;
}
export interface UploadRendererMessage extends UploadRequest {
  requestId: string;
  session: string;
}
export interface UploadRendererReply {
  requestId: string;
  session: string;
  url?: string;
  error?: string;
}
