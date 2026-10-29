import type { MobileAiService } from "./service";

/** 只绑定宿主生命周期，不创建页面，也不在恢复前台时重放任务。 */
export function bindMobileAiLifecycle(
  service: MobileAiService,
  owner: Document | undefined = typeof document === "undefined" ? undefined : document,
  onError?: (error: unknown) => void
): () => void {
  if (!owner) return () => undefined;
  const observe = (operation: Promise<void>) => {
    void operation.catch(error => {
      try {
        onError?.(error);
      } catch {
        /* 观察者不拥有运行生命周期。 */
      }
    });
  };
  const visibility = () => {
    observe(
      owner.visibilityState === "hidden" ? service.lifecycle.suspend() : service.lifecycle.resume()
    );
  };
  const hide = () => observe(service.lifecycle.suspend());
  const show = () => {
    if (owner.visibilityState !== "hidden") observe(service.lifecycle.resume());
  };
  owner.addEventListener("visibilitychange", visibility);
  owner.defaultView?.addEventListener("pagehide", hide);
  owner.defaultView?.addEventListener("pageshow", show);
  visibility();
  return () => {
    owner.removeEventListener("visibilitychange", visibility);
    owner.defaultView?.removeEventListener("pagehide", hide);
    owner.defaultView?.removeEventListener("pageshow", show);
  };
}
