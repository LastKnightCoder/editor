/**
 * 浏览器伴读扩展 ↔ 桌面主进程的协议（`ws://127.0.0.1:<port>/browser`）。
 *
 * 帧沿用 JSON-RPC 信封（JsonRpcRequest / JsonRpcResponse / JsonRpcNotification，见 {@link RpcFrame}）；
 * 连接是对等的：扩展发请求给桌面，桌面也会反向请求扩展执行页面工具（{@link COMPANION_METHODS.pageTool}）。
 *
 * 握手：连接后扩展的第一帧必须是 `hello`（已配对）或 `pair.request`（首次），否则桌面关闭连接。
 * 之后每个方法按授予的 scope 校验，见 {@link METHOD_SCOPES}。
 */
import type { AiRunStartParams } from "../chat-core/aiRunProtocol";
import type { ChatSessionMessage } from "../chat-core/messages";

export const BROWSER_COMPANION_PATH = "/browser";
/** 桌面本地服务固定端口（跨应用契约，桌面 server 模块同值） */
export const BROWSER_COMPANION_PORT = 24678;
/** 握手首帧必须在此时间内到达 */
export const HANDSHAKE_TIMEOUT_MS = 3000;

export const COMPANION_SCOPES = ["chat", "annotations", "notes", "tools"] as const;
export type CompanionScope = (typeof COMPANION_SCOPES)[number];
/** 配对时必需的权限；tools（对话里使用 Tau 的工具）可选，授权弹窗里默认勾选 */
export const REQUIRED_SCOPES: readonly CompanionScope[] = ["chat", "annotations", "notes"];

export const COMPANION_METHODS = {
  // 握手（扩展 → 桌面）
  hello: "hello",
  pairRequest: "pair.request",
  // 握手（桌面 → 扩展，通知）
  pairGranted: "pair.granted",
  pairDenied: "pair.denied",
  ready: "ready",
  revoked: "revoked",
  // 对话
  runStart: "ai.run.start",
  runAbort: "ai.run.abort",
  runState: "ai.run.state",
  runApprove: "ai.run.approve",
  runAnswer: "ai.run.answer",
  runEvent: "ai.run.event",
  chatHistory: "chat.history",
  /** 在 Tau 里打开这段网页对话（看完整的工具卡片） */
  chatOpen: "chat.open",
  modelsList: "models.list",
  // 页面工具（桌面 → 扩展，请求）
  pageTool: "page.tool",
  // 标注与笔记
  annotationsList: "annotations.list",
  annotationsSync: "annotations.sync",
  noteSave: "note.save",
  noteOpen: "note.open",
  // 外观（桌面 → 扩展，通知）
  appearanceChanged: "appearance.changed",
} as const;

/** 每个扩展可调方法需要的 scope；不在表里的方法一律拒绝 */
export const METHOD_SCOPES: Readonly<Record<string, CompanionScope>> = {
  [COMPANION_METHODS.runStart]: "chat",
  [COMPANION_METHODS.runAbort]: "chat",
  [COMPANION_METHODS.runState]: "chat",
  [COMPANION_METHODS.runApprove]: "chat",
  [COMPANION_METHODS.runAnswer]: "chat",
  [COMPANION_METHODS.chatHistory]: "chat",
  [COMPANION_METHODS.chatOpen]: "chat",
  [COMPANION_METHODS.modelsList]: "chat",
  [COMPANION_METHODS.annotationsList]: "annotations",
  [COMPANION_METHODS.annotationsSync]: "annotations",
  [COMPANION_METHODS.noteSave]: "notes",
  [COMPANION_METHODS.noteOpen]: "notes",
};

export const RPC_FRAME = {
  request: "JsonRpcRequest",
  response: "JsonRpcResponse",
  notification: "JsonRpcNotification",
} as const;

export type RpcFrame =
  | { type: typeof RPC_FRAME.request; id: string; method: string; params?: unknown }
  | {
      type: typeof RPC_FRAME.response;
      id: string;
      method: string;
      result?: unknown;
      error?: { code: number; message: string } | null;
    }
  | { type: typeof RPC_FRAME.notification; method: string; data?: unknown };

/** 解析一帧；不是合法信封返回 null（对端不可信，不抛） */
export const parseRpcFrame = (raw: string): RpcFrame | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const frame = value as Record<string, unknown>;
  if (typeof frame.method !== "string") return null;
  if (frame.type === RPC_FRAME.notification) return frame as RpcFrame;
  if (typeof frame.id !== "string") return null;
  if (frame.type === RPC_FRAME.request || frame.type === RPC_FRAME.response) {
    return frame as RpcFrame;
  }
  return null;
};

// ———————— 握手 ————————

export interface ClientInfo {
  /** 浏览器名称（Chrome / Edge / Arc / Firefox…） */
  browser: string;
  /** 操作系统 */
  os: string;
  /** 扩展版本 */
  version: string;
}

export interface HelloParams {
  clientId: string;
  token: string;
  info: ClientInfo;
}

export interface PairRequestParams {
  clientId: string;
  info: ClientInfo;
  /** 扩展随机数（hex），与桌面随机数共同推导校验码 */
  nonce: string;
}

/** pair.request 的结果：pending 时带桌面随机数，扩展据此算出校验码并等待 pair.granted / pair.denied */
export type PairRequestResult =
  | { status: "pending"; nonce: string }
  | { status: "closed" }
  | { status: "throttled"; retryAt: number };

export interface PairGrantedData {
  token: string;
  scopes: CompanionScope[];
}

export interface PairDeniedData {
  reason: "denied";
}

export type HelloRejectReason = "unknown-client" | "bad-token";

export interface AppearanceData {
  theme: string;
  mode: "light" | "dark";
}

export interface ReadyData {
  scopes: CompanionScope[];
  appVersion: string;
  appearance: AppearanceData;
}

// ———————— 对话 ————————

/** 扩展发起一轮对话：比通用 v2 协议多了模型覆盖 */
export type CompanionRunStartParams = AiRunStartParams & {
  session: { id: string; pageUrl: string };
  model?: { providerId: string; modelId: string };
};

/** 某个页面最近一次对话（没有则 sessionId 为 null） */
export interface ChatHistoryResult {
  sessionId: string | null;
  messages: ChatSessionMessage[];
}

export interface ModelOption {
  providerId: string;
  modelId: string;
  label: string;
  isDefault: boolean;
}

export interface PageToolParams {
  /** 发起这轮对话的页面，扩展据此找到对应标签页 */
  pageUrl: string;
  name: string;
  args: unknown;
}

export interface PageToolResult {
  content: string;
}

// ———————— 标注与笔记 ————————

/** 网页标注的锚点：W3C Web Annotation 的 TextQuote + TextPosition 选择器组合，外加块级提示 */
export interface WebAnchor {
  quote: { exact: string; prefix: string; suffix: string };
  /** 正文纯文本中的字符偏移 */
  position: { start: number; end: number };
}

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "purple", "red"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export interface WebAnnotation {
  id: string;
  color: HighlightColor;
  text: string;
  note: string;
  anchor: WebAnchor | null;
  createdAt: number;
}

export interface AnnotationsSyncParams {
  url: string;
  title: string;
  items: WebAnnotation[];
}

/** 页面笔记存为一张新卡片：正文是编辑器原生数据（Slate 节点），桌面在末尾附上来源链接 */
export interface NoteSaveParams {
  url: string;
  title: string;
  content: unknown[];
}

export interface NoteSaveResult {
  cardId: number;
}

/** 从 Tau 打开网页划线时附在 URL 上的 hash（桌面 excerpt 同值） */
export const WEB_HIGHLIGHT_HASH = "tau-hl";
