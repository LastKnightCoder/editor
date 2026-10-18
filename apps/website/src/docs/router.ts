/** 文档页内的前进后退：只在 /docs/ 下用 History API 切换，不整页刷新 */
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) addEventListener("popstate", notify);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) removeEventListener("popstate", notify);
  };
}

export function navigate(href: string) {
  const target = new URL(href, location.href);
  if (target.pathname === location.pathname && target.hash === location.hash) return;
  history.pushState(null, "", target.pathname + target.hash);
  scrollTo({ top: 0 });
  notify();
}

export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);
