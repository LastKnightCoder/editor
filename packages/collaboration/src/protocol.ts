export const COLLABORATION_VERSION = 1;
export const DEFAULT_COLLABORATION_URL = "https://collab.xiongtao.life";
export const ASSET_PREFIX = "tau-collab-asset:";

// 共享来源类型：与桌面端 projectContentTitle 的表名映射保持一致，拼错会在编译期报错。
export const SOURCE_TYPES = [
  "article",
  "card",
  "document-item",
  "project-item",
  "content",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface ContentNode {
  type?: string;
  text?: string;
  children?: ContentNode[];
  [key: string]: unknown;
}

export interface SharedContent {
  title: string;
  content: ContentNode[];
  bannerBg: string;
  // "top" | "center" | "bottom" 或自定义百分比，如 "35%"
  bannerPosition: string;
}

export interface DeviceIdentity {
  id: string;
  secret: string;
  nickname: string;
}

export interface Member {
  deviceId: string;
  nickname: string;
  role: "owner" | "editor";
  online: boolean;
  activity: "editing" | "viewing" | "background";
}

export interface SharedDocumentInfo {
  id: string;
  title: string;
  ownerId: string;
  role: "owner" | "editor";
  status: "active" | "closed";
  members: Member[];
  updatedAt: number;
}

export interface JoinRequest {
  id: string;
  documentId: string;
  deviceId: string;
  nickname: string;
  status: "pending" | "approved" | "rejected" | "expired";
  expiresAt: number;
}

/** POST /v1/join-requests 的响应；pending 也返回 documentId，客户端据此精确判定批准（文档出现在会话列表） */
export type JoinRequestResult =
  | { id: string; status: "pending"; documentId: string }
  | { status: "approved"; documentId: string };

export interface SourceBinding {
  databaseName: string;
  contentId: number;
  contentCreatedAt: number;
  sourceType?: SourceType;
  sourceId?: number;
  sourceTitle?: string;
}

/** 创建共享文档的幂等键（POST /v1/documents idempotencyKey）为**端侧私有派生**：
 *  桌面端绑定（库名/内容创建时间/代次），移动端绑定（服务器/内容/来源），两端互不互认——
 *  防重复发布各自依赖本机的 collaboration_bindings 表，跨端对同一内容重复发布会得到
 *  两个房间（已知边界，如需跨端去重须先统一此处的字段与派生规则）。服务端只做
 *  同键幂等（见 store.create 的 UNIQUE(owner_id, creation_key)），不解释键的含义。 */

export interface CollaborationSession extends SharedDocumentInfo {
  mode?: "local" | "shared";
  frozen?: boolean;
  serverUrl: string;
  connection: "connecting" | "connected" | "offline" | "error";
  pending: boolean;
  leaving: boolean;
  source?: SourceBinding;
  error?: string;
}

export interface ContentSessionTarget {
  contentId: number;
  sourceType?: SourceType;
  sourceId?: number;
  sourceTitle?: string;
}

export interface ContentSessionSnapshot {
  documentId: string;
  mode: "local" | "shared";
  title: string;
  frozen: boolean;
  source?: SourceBinding;
}

export interface CollaborationState {
  serverUrl: string;
  nickname: string;
  deviceId?: string;
  sessions: CollaborationSession[];
  requests: JoinRequest[];
  error?: string;
}

export type CollaborationEvent =
  | { type: "refresh" }
  | { type: "revoked" | "closed"; documentId: string }
  | { type: "presence"; documentId: string; members: Member[] };

export class CollaborationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400
  ) {
    super(message);
    this.name = "CollaborationError";
  }
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("协作服务器地址不能包含凭据、路径或查询参数");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("协作服务器必须使用 HTTPS，本机调试可使用 HTTP");
  }
  return url.origin;
}
