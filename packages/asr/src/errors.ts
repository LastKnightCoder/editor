export type ASRErrorCode =
  | "cancelled"
  | "unsupported"
  | "invalid-input"
  | "needs-assets"
  | "unavailable"
  | "busy"
  | "timeout"
  | "protocol"
  | "internal";

export class ASRError extends Error {
  constructor(
    readonly code: ASRErrorCode,
    message: string
  ) {
    super(message);
    this.name = code === "cancelled" ? "AbortError" : "ASRError";
  }
}
export function asrAbortError(): ASRError {
  return new ASRError("cancelled", "语音识别已取消");
}
export function throwIfASRAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof ASRError ? signal.reason : asrAbortError();
}

/** 停止等待后仍观察原任务拒绝，资源释放由驱动的 dispose 负责。 */
export function waitForASR<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(signal.reason ?? asrAbortError());
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? asrAbortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
