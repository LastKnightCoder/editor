import { listen } from "@tauri-apps/api/event";

/** WKWebView 的可见性事件可能缺失，窗口聚焦和前台定时核验共同保障撤回刷新。 */
export function subscribePluginForeground(refresh: () => void) {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  const active = () => {
    if (!stopped && document.visibilityState !== "hidden") refresh();
  };
  document.addEventListener("visibilitychange", active);
  window.addEventListener("focus", active);
  const interval = window.setInterval(active, 30_000);
  void listen("tauri://focus", active)
    .then(dispose => {
      if (stopped) dispose();
      else unlisten = dispose;
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", active);
    window.removeEventListener("focus", active);
    window.clearInterval(interval);
    unlisten?.();
  };
}
