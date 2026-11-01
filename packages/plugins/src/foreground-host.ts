export const APP_FOREGROUND_EVENT = "tau:app-foreground";
export const APP_BACKGROUND_EVENT = "tau:app-background";

/** 应用生命周期与页面保活分开；原生恢复不依赖 WebView 是否补发可见性事件。 */
export function createAppForegroundBridge(viewport: Window, debounceMs = 500) {
  const owner = viewport.document;
  let stopped = false;
  let foreground = owner.visibilityState !== "hidden";
  let timer: number | undefined;
  const clear = () => {
    if (timer !== undefined) viewport.clearTimeout(timer);
    timer = undefined;
  };
  const background = () => {
    if (stopped) return;
    clear();
    const changed = foreground;
    foreground = false;
    if (changed) viewport.dispatchEvent(new Event(APP_BACKGROUND_EVENT));
  };
  const resume = (force = true) => {
    if (stopped || (!force && owner.visibilityState === "hidden")) return;
    const changed = !foreground;
    foreground = true;
    if (!changed && !force) return;
    clear();
    timer = viewport.setTimeout(() => {
      timer = undefined;
      if (!stopped && foreground) viewport.dispatchEvent(new Event(APP_FOREGROUND_EVENT));
    }, debounceMs);
  };
  const focus = () => resume(false);
  const visibility = () => (owner.visibilityState === "hidden" ? background() : focus());
  owner.addEventListener("visibilitychange", visibility);
  viewport.addEventListener("focus", focus);
  viewport.addEventListener("blur", background);
  return {
    resume,
    background,
    dispose() {
      stopped = true;
      clear();
      owner.removeEventListener("visibilitychange", visibility);
      viewport.removeEventListener("focus", focus);
      viewport.removeEventListener("blur", background);
    },
  };
}
