// tab 滑动手势期间的“逻辑激活 tab”：push 预推入在 engage 时即同步改栈，
// 但 Dock 高亮只应在手势落定（页面滑完）后跟随，否则高亮先于页面、取消时来回跳。
// PageHost 在手势生命周期内写入 origin，AppDock 读取覆盖栈顶推导；
// 手势清除后回落 null，高亮交还栈顶（落定后的真实导航态）。

import { useSyncExternalStore } from "react";

let originKey: string | null = null;
const listeners = new Set<() => void>();

export function setTabSwipeOrigin(key: string | null): void {
  if (originKey === key) return;
  originKey = key;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTabSwipeOrigin(): string | null {
  return useSyncExternalStore(subscribe, () => originKey);
}
