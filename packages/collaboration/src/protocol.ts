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

export interface SourceBinding {
  databaseName: string;
  contentId: number;
  contentCreatedAt: number;
  sourceType?: SourceType;
  sourceId?: number;
  sourceTitle?: string;
}

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

export interface AssetInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
}

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
