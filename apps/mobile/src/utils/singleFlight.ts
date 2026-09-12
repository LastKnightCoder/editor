// single-flight：并发的幂等调用合并为一次执行，进行中时后来者复用同一 promise。
// 用于「关闭/落库」这类必须收敛为单次执行的链路——关闭按钮连击与系统返回键
// 同时到达时若各自执行一遍，会叠加成重复落库/刷新的 IPC 风暴。

export type SingleFlightFn<Args extends unknown[], R> = {
  (...args: Args): Promise<R>;
  /** 是否有执行进行中（供调用方做前置检查，如复用时跳过互斥判断） */
  isActive: () => boolean;
};

export function createSingleFlight<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>
): SingleFlightFn<Args, R> {
  let inFlight: Promise<R> | null = null;
  const run = (...args: Args): Promise<R> => {
    if (inFlight) return inFlight;
    inFlight = fn(...args).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  run.isActive = () => inFlight !== null;
  return run;
}
