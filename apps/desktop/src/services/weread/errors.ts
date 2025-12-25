import useSettingStore from "@/stores/useSettingStore";

/**
 * 微信读书错误基类
 */
export class WeReadError extends Error {
  constructor(
    message: string,
    public code: number,
    public shouldLogout: boolean = false,
  ) {
    super(message);
    this.name = "WeReadError";
  }
}

/**
 * API 限流错误
 */
export class WeReadRateLimitError extends WeReadError {
  constructor(message = "API 调用频率超限，请稍后重试") {
    super(message, -10102, false);
    this.name = "WeReadRateLimitError";
  }
}

/**
 * 登录过期错误
 */
export class WeReadSessionExpiredError extends WeReadError {
  constructor(message = "登录状态已过期，请重新登录微信读书") {
    super(message, -2012, true);
    this.name = "WeReadSessionExpiredError";
  }
}

/**
 * 网络错误
 */
export class WeReadNetworkError extends WeReadError {
  constructor(message = "网络请求失败，请检查网络连接") {
    super(message, -1, false);
    this.name = "WeReadNetworkError";
  }
}

/**
 * 未登录错误
 */
export class WeReadNotLoggedInError extends WeReadError {
  constructor(message = "请先登录微信读书") {
    super(message, 0, false);
    this.name = "WeReadNotLoggedInError";
  }
}

/**
 * 登录过期的错误码
 */
const SESSION_EXPIRED_CODES = [-2011, -2012];

/**
 * API 限流错误码
 */
const RATE_LIMIT_CODES = [-10102];

/**
 * 需要清除登录状态的 HTTP 状态码
 */
const LOGOUT_HTTP_CODES = [401, 403];

/**
 * 统一错误处理函数
 * 根据错误类型转换为对应的 WeReadError 子类
 */
export function handleWeReadError(error: unknown): never {
  // 如果已经是 WeReadError，直接处理
  if (error instanceof WeReadError) {
    if (error.shouldLogout) {
      clearLoginState();
    }
    throw error;
  }

  // 处理 API 响应中的错误码
  const data = (error as { data?: { errcode?: number; errmsg?: string } })
    ?.data;
  if (data && typeof data === "object" && typeof data.errcode === "number") {
    if (SESSION_EXPIRED_CODES.includes(data.errcode)) {
      clearLoginState();
      throw new WeReadSessionExpiredError(data.errmsg);
    }
    if (RATE_LIMIT_CODES.includes(data.errcode)) {
      throw new WeReadRateLimitError(data.errmsg);
    }
  }

  // 处理 HTTP 状态码
  const status = (error as { status?: number })?.status;
  if (status && LOGOUT_HTTP_CODES.includes(status)) {
    clearLoginState();
    throw new WeReadSessionExpiredError();
  }

  // 处理标准 Error
  if (error instanceof Error) {
    throw new WeReadNetworkError(error.message);
  }

  // 未知错误
  throw new WeReadError("未知错误", -1);
}

/**
 * 清除登录状态
 */
function clearLoginState() {
  useSettingStore.getState().updateWeReadUserInfo({
    name: "",
    vid: "",
    isConnected: false,
  });
}

/**
 * 判断错误是否为限流错误
 */
export function isRateLimitError(error: unknown): boolean {
  return error instanceof WeReadRateLimitError;
}

/**
 * 判断错误是否为登录过期错误
 */
export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof WeReadSessionExpiredError;
}

/**
 * 判断错误是否需要重试
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof WeReadRateLimitError) {
    return true;
  }
  if (error instanceof WeReadNetworkError) {
    return true;
  }
  return false;
}
