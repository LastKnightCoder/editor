/**
 * 当前进行中的番茄会话（只读）：供番茄域以外的入口（日程事件抽屉、待办抽屉）判断
 * 「开始专注」还是「专注于此」。只订阅会话变化通知，不订阅每秒 tick；随组件挂载订阅、卸载退订。
 * 番茄域内部用 timerStore，不经此 hook。
 */

import { useEffect, useState } from "react";
import { getActivePomodoroSession } from "@/commands/pomodoro";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import type { PomodoroSession } from "@/types";

export function useActivePomodoro(): PomodoroSession | null {
  const client = useBackendWebsocketStore(s => s.client);
  const [session, setSession] = useState<PomodoroSession | null>(null);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    const onChanged = (payload: unknown) => setSession((payload as PomodoroSession) ?? null);
    client.registerNotificationHandler("pomodoro:active-session-changed", onChanged);
    getActivePomodoroSession()
      .then(active => alive && setSession(active))
      .catch(error => console.error("读取进行中的番茄失败:", error));
    return () => {
      alive = false;
      client.unregisterNotificationHandler("pomodoro:active-session-changed", onChanged);
    };
  }, [client]);

  return session;
}
