export interface NotionSync {
  id: number;
  pageId: string;
  syncMode: "bidirectional" | "json";
  codeBlockId?: string;
  lastLocalContentHash?: string;
  pendingSync: boolean;
  lastSyncAttempt?: number;
  syncError?: string;
  createTime: number;
  updateTime: number;
}

export type CreateNotionSync = Omit<
  NotionSync,
  "id" | "createTime" | "updateTime"
>;

export type UpdateNotionSync = Partial<
  Omit<NotionSync, "id" | "createTime" | "updateTime">
>;
