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
/** 本机白板与共享房间的绑定、未完成的首次发布；不含房间正文。 */
export interface WhiteboardShareStatus {
  binding: { serverUrl: string; documentId: string } | null;
  publication: { operationId: string; roomCreated: boolean } | null;
  /** 已固定候选、尚未安装完的本机转换或新代次采用。 */
  migration: { operationId: string; phase: string } | null;
  /** 已冻结来源、尚未提交的插件数据升级。 */
  upgrade: { operationId: string } | null;
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
