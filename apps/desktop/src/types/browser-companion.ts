import type { ClientInfo, CompanionScope } from "@tau/shared/browser-companion";

/** 已授权的浏览器扩展实例（给渲染端看的视图，不含 token 哈希） */
export interface BrowserClientView {
  clientId: string;
  info: ClientInfo;
  origin: string;
  scopes: CompanionScope[];
  createdAt: number;
  lastSeenAt: number;
}

export interface BrowserClientRejection {
  clientId: string;
  label: string;
  reason: string;
  at: number;
}

export interface BrowserCompanionSnapshot {
  acceptNew: boolean;
  clients: BrowserClientView[];
  rejections: BrowserClientRejection[];
  /** 当前在线的 clientId */
  online: string[];
}

/** 等用户裁决的配对请求（主进程 → 主窗口授权弹窗） */
export interface PairPrompt {
  requestId: string;
  info: ClientInfo;
  origin: string;
  /** 与扩展面板显示的同一组校验码 */
  code: string;
  requestedAt: number;
}
