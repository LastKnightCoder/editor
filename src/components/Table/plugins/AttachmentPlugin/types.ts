export interface AttachmentItem {
  id: string;
  fileName: string;
  filePath: string;
  isLocal: boolean;
  size?: number;
}

export type AttachmentPluginValue = AttachmentItem[];

export interface AttachmentPluginConfig {
  maxFiles?: number;
}
