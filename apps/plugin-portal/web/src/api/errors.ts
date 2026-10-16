import type { ApiError, ErrorCode } from "../../../contracts";

/** 客户端本地错误：不是服务端返回的协议错误码 */
export type ClientErrorCode = "NETWORK_ERROR" | "ABORTED" | "BAD_RESPONSE";
export type PortalErrorCode = ErrorCode | ClientErrorCode;

export class PortalApiError extends Error {
  readonly status: number;
  readonly code: PortalErrorCode;
  readonly fields: Record<string, string> | undefined;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: PortalErrorCode,
    message: string,
    extra: { fields?: Record<string, string>; requestId?: string } = {}
  ) {
    super(message);
    this.name = "PortalApiError";
    this.status = status;
    this.code = code;
    this.fields = extra.fields;
    this.requestId = extra.requestId;
  }
}

export function isApiErrorBody(value: unknown): value is ApiError {
  const error = (value as ApiError | null)?.error;
  return !!error && typeof error.code === "string" && typeof error.message === "string";
}

/** 把非 2xx 响应体转成统一错误；响应体不合协议时按状态码兜底 */
export function errorFromResponse(status: number, body: unknown): PortalApiError {
  if (isApiErrorBody(body)) {
    const { code, message, fields, requestId } = body.error;
    return new PortalApiError(status, code, message, { fields, requestId });
  }
  return new PortalApiError(
    status,
    status === 401 ? "UNAUTHENTICATED" : status >= 500 ? "SERVICE_UNAVAILABLE" : "BAD_RESPONSE",
    `服务返回了无法识别的响应（HTTP ${status}）`
  );
}

export const networkError = () =>
  new PortalApiError(0, "NETWORK_ERROR", "网络连接中断，请求结果未知");

export const abortedError = () => new PortalApiError(0, "ABORTED", "已取消");

export function asPortalError(error: unknown): PortalApiError {
  if (error instanceof PortalApiError) return error;
  return new PortalApiError(0, "BAD_RESPONSE", error instanceof Error ? error.message : "未知错误");
}

export function hasCode(error: unknown, ...codes: PortalErrorCode[]): boolean {
  return error instanceof PortalApiError && codes.includes(error.code);
}

/** 写操作发出后网络中断：服务端可能已处理，需要读取核对而不是直接判失败 */
export const isOutcomeUnknown = (error: unknown) => hasCode(error, "NETWORK_ERROR");

/** 错误提示统一出口：协议规定具体文案取服务端 message */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
