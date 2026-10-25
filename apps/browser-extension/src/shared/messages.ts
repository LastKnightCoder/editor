/**
 * 内容脚本 ↔ 后台 service worker 的消息（经 runtime.Port「tau-companion」）。
 * 只有后台持有到 Tau 的 WebSocket（内容脚本发起的连接 Origin 是网页，过不了 Tau 的来源校验）。
 */
import type { AppearanceData, CompanionScope, WebAnnotation } from "@tau/shared/browser-companion";

export const PORT_NAME = "tau-companion";

export type ConnectionState =
  /** 还没配对过；打开面板时自动发起 */
  | "unpaired"
  | "connecting"
  /** 等用户在 Tau 里确认，带校验码 */
  | "pairing"
  | "ready"
  /** 已配对但连不上 Tau（没运行） */
  | "offline"
  | "denied"
  | "revoked"
  /** Tau 关闭了「接受新的连接请求」 */
  | "closed"
  | "throttled";

export interface ConnectionStatus {
  state: ConnectionState;
  code?: string;
  retryAt?: number;
  scopes?: CompanionScope[];
  appearance?: AppearanceData;
}

/** 后台代办的方法：Tau RPC 透传 + 本地缓存读写 */
export interface BackgroundMethods {
  status: { params: void; result: ConnectionStatus };
  /** 发起配对或立即重连 */
  connect: { params: void; result: ConnectionStatus };
  /** 透传给 Tau（ai.run.*、chat.history、models.list、note.save、note.open） */
  rpc: { params: { method: string; params?: unknown }; result: unknown };
  "annotations.load": { params: { url: string }; result: WebAnnotation[] };
  "annotations.save": {
    params: { url: string; title: string; items: WebAnnotation[] };
    result: void;
  };
}

export type BackgroundMethod = keyof BackgroundMethods;

export type ContentToBackground =
  | { kind: "page"; url: string }
  | { kind: "call"; id: number; method: BackgroundMethod; params: unknown }
  | { kind: "pageToolResult"; id: string; content?: string; error?: string };

export type BackgroundToContent =
  | { kind: "result"; id: number; result?: unknown; error?: string }
  | { kind: "status"; status: ConnectionStatus }
  | { kind: "notify"; method: string; data: unknown }
  | { kind: "pageTool"; id: string; name: string; args: unknown }
  | { kind: "toggle" };

/** 页面键：只去掉 #hash（与 Tau 的 normalizeWebPageUrl 一致） */
export const pageKeyOf = (url: string): string => url.split("#", 1)[0] ?? url;

export const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);
