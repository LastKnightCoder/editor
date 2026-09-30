import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;
const listeners = new Set<() => void>();
let timer: number | undefined;

// 取整到分钟：同一分钟内快照恒定，未订阅时读取也不会拿到过期值
const getSnapshot = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

// 所有日期单元格共享一个定时器，对齐整分钟触发，无订阅者时停表
const schedule = () => {
  timer = window.setTimeout(
    () => {
      listeners.forEach(listener => listener());
      schedule();
    },
    MINUTE_MS - (Date.now() % MINUTE_MS)
  );
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) schedule();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.clearTimeout(timer);
  };
};

/** 分钟级「现在」，供相对时间文案（剩 N 天 / 3 天后）随时间推进刷新 */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
