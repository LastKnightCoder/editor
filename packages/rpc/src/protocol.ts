/**
 * HTTP/WS RPC 协议类型定义。
 *
 * 该协议同时服务于 Electron 本地 server（127.0.0.1:24678）与未来的 Web Server，
 * 渲染进程仅通过切换 baseUrl 即可在两者之间迁移。
 */

/** 事件广播通道的 WS 路径，服务端鉴权与客户端连接共用，防止两处硬编码漂移 */
export const RPC_EVENTS_WS_PATH = "/rpc-events";

/** RPC 错误码 */
export enum RpcErrorCode {
  /** 未找到 channel 对应的 handler（通常是模块尚未初始化完成） */
  NO_HANDLER = "NO_HANDLER",
  /** token 校验失败 */
  UNAUTHORIZED = "UNAUTHORIZED",
  /** 序列化/反序列化失败：数据格式超出类型白名单 */
  SERIALIZE = "SERIALIZE",
  /** 当前后端不支持该能力（如 Web Server 不支持窗口操作） */
  UNSUPPORTED = "UNSUPPORTED",
  /** handler 执行抛出的业务错误 */
  HANDLER = "HANDLER",
}

/** POST /rpc/invoke 与 /rpc/send 的请求体 */
export interface InvokeRequest {
  channel: string;
  /** 严格序列化后的调用参数 */
  args: unknown[];
  /** 调用方窗口 id，主进程用它还原 event.sender；缺省时回退主窗口 */
  windowId?: number;
  /**
   * 调用方会话标识，Web Server 多用户场景下的路由键。
   * Electron 本地模式为单用户，不传；与 windowId 语义解耦（连接级 vs 窗口级）。
   */
  sessionId?: string;
}

export interface RpcErrorPayload {
  code: RpcErrorCode | string;
  name?: string;
  message: string;
  stack?: string;
  /** 出错的 channel，便于非 Electron 调用链路定位 */
  channel?: string;
}

/** POST /rpc/invoke 的响应体 */
export type InvokeResponse<T = unknown> =
  { ok: true; data: T } | { ok: false; error: RpcErrorPayload };

/**
 * WS /rpc/events 的通知消息。
 * args 为严格序列化后的推送参数；windowId 为目标窗口 id，0 表示广播所有客户端。
 */
export interface EventMessage {
  channel: string;
  args: unknown[];
  windowId: number;
  /**
   * 目标连接 id（WS hub 在连接建立时分配）。
   * 预留给 Web Server 多用户场景：windowId 仅在单用户多窗口内唯一，
   * 多用户事件必须由服务端按 connectionId 定向路由，Electron 本地模式不填。
   */
  connectionId?: string;
}

/** 渲染进程启动引导信息（经一次性 invoke 获取） */
export interface RpcBootstrapInfo {
  token: string;
  windowId: number;
  port: number;
}
