import { useQuery } from "@tanstack/react-query";
import { getQueryClient } from "../../router";
import * as tauri from "../../services/tauri";

const key = (kind: tauri.ReminderOwnerKind, id: number) => ["reminders", kind, id] as const;

export function isReminderConflictError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return message.includes("REMINDER_CONFLICT");
}

/** 事项的提醒列表；待办改了提醒或时间戳时随 ["todo"] 失效一起刷新 */
export function useReminders(kind: tauri.ReminderOwnerKind, id: number, revision?: unknown) {
  return useQuery({
    queryKey: [...key(kind, id), revision],
    queryFn: () => tauri.reminderList(kind, id),
    enabled: id > 0,
    staleTime: 0,
  });
}

export async function saveReminders(
  kind: tauri.ReminderOwnerKind,
  id: number,
  offsets: number[],
  expectedOffsets?: number[]
) {
  const client = getQueryClient();
  try {
    const saved = await tauri.reminderSet(kind, id, offsets, expectedOffsets);
    void client.invalidateQueries({ queryKey: key(kind, id) });
    if (kind === "todo") void client.invalidateQueries({ queryKey: ["todo"] });
    return saved;
  } catch (error) {
    if (isReminderConflictError(error)) {
      void client.invalidateQueries({ queryKey: key(kind, id) });
      if (kind === "todo") void client.invalidateQueries({ queryKey: ["todo"] });
    }
    throw error;
  }
}
