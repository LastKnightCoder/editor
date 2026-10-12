/**
 * 主窗口通知桥：把跨窗口的通知事件接回本窗口卡栈，AppShell 调用一次。
 *
 * - onRunAction：系统通知窗口里点了按钮 → 回本窗口执行 runLocal（appNotify 登记
 *   的原 onClick），封装层负责把成败回报给系统窗口的等待方；
 * - onInApp：主进程 main origin 直投的应用内通知 → 入本窗口卡栈，按钮经
 *   inAppAction 转回主进程执行；
 * - 返回的 onItemsChange 接给壳层 NotificationHost：main origin 卡从栈里消失时
 *   回报 inAppClosed 清理主进程侧登记。
 */

import { useCallback, useEffect, useRef } from "react";
import { notify } from "@tau/ui";
import { platform } from "@/platform";
import { toNotifyOptions } from "./payload";
import { runLocal } from "./notify";

export function useNotificationBridge(): (ids: string[]) => void {
  /** main origin 直投的卡 id：关闭时需要回报主进程清理 */
  const mainOriginIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const offRunAction = platform.notification.onRunAction(request =>
      runLocal(request.id, request.index)
    );
    const offInApp = platform.notification.onInApp(payload => {
      mainOriginIdsRef.current.add(payload.id);
      notify(
        toNotifyOptions(payload, index => platform.notification.inAppAction(payload.id, index))
      );
    });
    return () => {
      offRunAction();
      offInApp();
    };
  }, []);

  // 挂载时的首次回报只记录不 diff（初始为空不该误报 closed）
  const lastIdsRef = useRef<string[] | null>(null);
  return useCallback((ids: string[]) => {
    const prev = lastIdsRef.current;
    lastIdsRef.current = ids;
    if (prev === null) return;
    const current = new Set(ids);
    for (const id of prev) {
      if (current.has(id)) continue;
      if (mainOriginIdsRef.current.delete(id)) void platform.notification.inAppClosed(id);
    }
  }, []);
}
