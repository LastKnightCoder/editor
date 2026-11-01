import { listen } from "@tauri-apps/api/event";
import { APP_FOREGROUND_EVENT } from "@tau/plugins/environment-host";

export function connectPluginForeground(source: {
  notifyForeground(force?: boolean): void;
  notifyBackground(): void;
}) {
  let stopped = false;
  const releases = new Set<() => void>();
  for (const [name, callback] of [
    ["app-foreground", () => source.notifyForeground()],
    ["tauri://focus", () => source.notifyForeground(false)],
    ["tauri://blur", () => source.notifyBackground()],
  ] as const) {
    void listen(name, () => {
      if (!stopped) callback();
    })
      .then(release => {
        if (stopped) release();
        else releases.add(release);
      })
      .catch(error => {
        if (!stopped) console.warn("应用生命周期监听失败", name, error);
      });
  }
  return () => {
    stopped = true;
    for (const release of releases) release();
    releases.clear();
  };
}

/** 安全核验的周期补偿不广播生命周期，避免把轮询变成业务自动同步。 */
export function subscribePluginForeground(refresh: () => void) {
  let stopped = false;
  const active = () => {
    if (!stopped && document.visibilityState !== "hidden") refresh();
  };
  window.addEventListener(APP_FOREGROUND_EVENT, active);
  const interval = window.setInterval(active, 30_000);
  return () => {
    stopped = true;
    window.removeEventListener(APP_FOREGROUND_EVENT, active);
    window.clearInterval(interval);
  };
}
