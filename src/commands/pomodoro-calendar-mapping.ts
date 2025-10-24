import { invoke } from "@/electron";

/**
 * 根据番茄钟会话 ID 获取关联的日历事件 ID 列表
 */
export async function getEventsBySessionId(
  sessionId: number,
): Promise<number[]> {
  return invoke("pomodoro-calendar:get-events-by-session", sessionId);
}

/**
 * 根据日历事件 ID 获取关联的番茄钟会话 ID
 */
export async function getSessionByEventId(
  eventId: number,
): Promise<number | null> {
  return invoke("pomodoro-calendar:get-session-by-event", eventId);
}

/**
 * 根据番茄钟会话 ID 删除所有映射关系
 */
export async function deleteBySessionId(sessionId: number): Promise<number> {
  return invoke("pomodoro-calendar:delete-by-session", sessionId);
}

/**
 * 根据日历事件 ID 删除映射关系
 */
export async function deleteByEventId(eventId: number): Promise<number> {
  return invoke("pomodoro-calendar:delete-by-event", eventId);
}
