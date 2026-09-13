const bridge = window.electron;

export const platform: string = bridge?.platform ?? "web";
/** 是否运行在 Electron 环境；Web 端据此隐藏窗口概念相关的 UI 入口 */
export const isElectron: boolean = platform !== "web";

const ensureBridge = (): ElectronAPI => {
  if (!bridge) {
    throw new Error("Electron API is not available in this runtime");
  }
  return bridge;
};

// 启动竞态兜底：BACKGROUND 层模块的 handler 注册晚于窗口创建，此窗口期内的
// "No handler registered" 做有限重试；收到过任意成功响应后视为确定性错误不再空等
const RETRY_INTERVAL_MS = 500;
const RETRY_TIMEOUT_MS = 5000;

let ipcReady = false;

function isNoHandlerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("No handler registered");
}

async function invokeWithRetry<T>(channel: string, args: unknown[]): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt <= RETRY_TIMEOUT_MS) {
    try {
      const result = await ensureBridge().invoke<T>(channel, ...args);
      ipcReady = true;
      return result;
    } catch (error) {
      if (!isNoHandlerError(error) || ipcReady) {
        throw error;
      }
      lastError = error;
    }
    // 重试等待不越过窗口边界，保证整体重试时长不超过 RETRY_TIMEOUT_MS
    const remaining = RETRY_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(RETRY_INTERVAL_MS, remaining)));
  }
  throw lastError;
}

export const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
  return invokeWithRetry<T>(channel, args);
};

// 以下三者对齐 HTTP 版语义：订阅与单向通知在无 bridge 环境（单测/浏览器预览）
// 降级并告警，不阻断模块加载；仅 invoke 因需要返回值而必须抛错
export const send = (channel: string, ...args: unknown[]): void => {
  if (!bridge) {
    console.error(`[electron] send "${channel}" 在无 Electron 环境下被丢弃`);
    return;
  }
  bridge.send(channel, ...args);
};

export const on = <Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void
): void => {
  if (!bridge) {
    return;
  }
  bridge.on(channel, listener as (...args: unknown[]) => void);
};

export const off = <Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void
): void => {
  if (!bridge) {
    return;
  }
  bridge.off(channel, listener as (...args: unknown[]) => void);
};
