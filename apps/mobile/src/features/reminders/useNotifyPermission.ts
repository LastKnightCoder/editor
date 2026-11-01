import { useCallback, useEffect, useState } from "react";
import {
  isNativeNotifyAvailable,
  notifyOpenSettings,
  notifyPermissionState,
  notifyRequestPermission,
  type NotifyState,
} from "./native";
import { resyncReminders } from "./scheduler";

/** 通知权限状态：active 时读取一次，回到前台再读（用户可能刚去系统设置改过） */
export function useNotifyPermission(active = true) {
  const [state, setState] = useState<NotifyState | null>(null);

  const refresh = useCallback(async () => {
    if (!isNativeNotifyAvailable()) return;
    try {
      setState(await notifyPermissionState());
    } catch (error) {
      console.warn("读取通知权限失败:", error);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, refresh]);

  const request = useCallback(async () => {
    const next = await notifyRequestPermission();
    setState(next);
    // 授权后把已有提醒排进系统（拒绝前排期会被系统静默丢弃）
    if (next.notifications === "granted") void resyncReminders();
    return next;
  }, []);

  const openSettings = useCallback(
    (target: "notifications" | "exactAlarm" = "notifications") => notifyOpenSettings(target),
    []
  );

  return { state, refresh, request, openSettings };
}
