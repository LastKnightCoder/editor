// single-flight 的 React 版：把并发的幂等调用合并为一次执行（进行中复用同一 promise）。
// 实例经 ref 惰性创建、跨渲染持久；执行体每次经 latest-ref 读最新闭包，
// 与 ahooks useMemoizedFn 的「稳定引用 + 最新闭包」语义保持一致。

import { useRef } from "react";
import { createSingleFlight, type SingleFlightFn } from "../utils/singleFlight";

export function useSingleFlight<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>
): SingleFlightFn<Args, R> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const runRef = useRef<SingleFlightFn<Args, R> | null>(null);
  if (runRef.current === null) {
    runRef.current = createSingleFlight((...args: Args) => fnRef.current(...args));
  }
  return runRef.current;
}
