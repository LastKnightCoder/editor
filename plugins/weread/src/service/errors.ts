/** 微信读书错误：限流与连接失效需要调用方区别处理（重试 / 提示重新配置） */
export class WeReadError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message);
    this.name = "WeReadError";
  }
}

export class WeReadRateLimitError extends WeReadError {
  constructor(message = "API 调用频率超限，请稍后重试") {
    super(message, -10102);
    this.name = "WeReadRateLimitError";
  }
}

export class WeReadSessionExpiredError extends WeReadError {
  constructor(message = "连接状态已失效，请重新检查微信读书 API Key") {
    super(message, -2012);
    this.name = "WeReadSessionExpiredError";
  }
}

export class WeReadNotLoggedInError extends WeReadError {
  constructor(message = "请先配置微信读书 API Key") {
    super(message, 0);
    this.name = "WeReadNotLoggedInError";
  }
}
