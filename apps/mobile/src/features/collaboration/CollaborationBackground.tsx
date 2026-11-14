import { useEffect, useSyncExternalStore } from "react";
import { useAppContext } from "../../app/AppContext";
import { mobilePluginState } from "../../app/plugins/content";
import { collabListCache } from "../../services/tauri";

/** 恢复作者资源与未确认改动，不为未使用协作的用户注册设备。 */
export function CollaborationBackground() {
  const setting = useAppContext().syncSettings.safeSetting;
  const phase = useSyncExternalStore(mobilePluginState.subscribe, mobilePluginState.get);
  useEffect(() => {
    if (!setting || phase.phase === "starting") return;
    let disposed = false;
    let retained: { release(): void } | undefined;
    let running: Promise<void> | undefined;
    const resume = () => {
      if (disposed || document.visibilityState === "hidden") return;
      running ??= (async () => {
        const cached = await collabListCache();
        if (
          disposed ||
          !cached.some(
            session =>
              session.mode !== "local" &&
              Boolean(session.serverUrl) &&
              (session.role === "owner" || session.pending) &&
              (session.status === "active" || Boolean(session.close))
          )
        )
          return;
        const { collaborationManager } = await import("./core/manager");
        if (disposed) return;
        if (!retained) {
          collaborationManager.retain();
          retained = collaborationManager;
        }
        await collaborationManager.start({
          nickname: setting.collaboration?.nickname || "Tau 用户",
        });
        if (!disposed) await collaborationManager.refresh();
      })()
        .catch(error => console.warn("协作图片后台恢复暂未完成", error))
        .finally(() => {
          running = undefined;
        });
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      disposed = true;
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      retained?.release();
    };
  }, [setting, phase]);
  return null;
}
