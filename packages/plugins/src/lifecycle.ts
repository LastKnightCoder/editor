export class LifecycleTimeoutError extends Error {}

export const ACTIVATION_TIMEOUT_MS = 10_000;
export const CLEANUP_TIMEOUT_MS = 5_000;

/** 只限制异步等待，不能抢占同环境中同步执行的插件代码。 */
export function waitForLifecycle(
  operation: () => void | Promise<void>,
  deadline: number,
  phase: string,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
      settle();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => finish(() => reject(new LifecycleTimeoutError(`插件${phase}超时，需要重启应用`))),
        Math.max(0, deadline - Date.now())
      );
    };
    const cancelled = () => {
      deadline = Math.min(deadline, Date.now() + CLEANUP_TIMEOUT_MS);
      schedule();
    };
    schedule();
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted) cancelled();
    // 保留拒绝处理器，超时后迟到的拒绝也必须被接收。
    Promise.resolve()
      .then(operation)
      .then(
        () => finish(resolve),
        error => finish(() => reject(error))
      );
  });
}
