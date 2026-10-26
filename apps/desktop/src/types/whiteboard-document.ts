export interface WhiteboardDocumentIdentity {
  databaseName: string;
  documentId: string;
  sourceId: string;
  baselineId: string;
  epoch: number;
}
export interface WhiteboardDocumentReceipt {
  revision: number;
  projectedRevision: number;
  error?: string;
}
export interface WhiteboardDocumentOpen extends WhiteboardDocumentReceipt {
  identity: WhiteboardDocumentIdentity;
  leaseId: string;
  pageId: string;
  state: Uint8Array;
}
export interface WhiteboardDocumentEvent
  extends WhiteboardDocumentReceipt, WhiteboardDocumentIdentity {
  update?: Uint8Array;
}
export interface WhiteboardDocumentFlushRequest {
  requestId: string;
  leaseId: string;
  sealed: boolean;
}
export interface WhiteboardDocumentTarget {
  databaseName: string;
  contentId: number;
}
/** 协作页「共享本地内容」的白板候选：已转换为白板文档、尚未共享的整块白板。 */
export interface WhiteboardShareCandidate {
  boardId: number;
  title: string;
  documentId: string;
  /** 第一页的页面内容 id，用于打开白板文档会话 */
  contentId: number;
  pages: number;
}
/** 本机白板与共享房间的绑定、未完成的首次发布；不含房间正文。 */
export interface WhiteboardShareStatus {
  binding: { serverUrl: string; documentId: string } | null;
  publication: { operationId: string; roomCreated: boolean } | null;
}
/**
 * 远端会话摘要：requiresRebind 时本机副本不能继续发送，reason 区分远端已换代（可采用新版本）
 * 与同一代次的被拒分支（材料已保留，等待处理）。
 */
export interface WhiteboardRemoteStatus {
  requiresRebind: boolean;
  reason?: "epoch" | "rejected";
  /** 网络等待期间本机又有新修订，需要再同步一次。 */
  requiresSync?: boolean;
  /** 已投影到本机的远端确认对应的本机修订。 */
  localRevision?: number;
  pending: number;
}
