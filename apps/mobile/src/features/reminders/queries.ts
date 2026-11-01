import { useQuery } from "@tanstack/react-query";
import { getQueryClient } from "../../router";
import * as tauri from "../../services/tauri";

const key = (kind: tauri.ReminderOwnerKind, id: number) => ["reminders", kind, id] as const;

/** 事项的提醒列表；待办改了 remindBefore（其他入口）时随 ["todo"] 失效一起刷新 */
export function useReminders(kind: tauri.ReminderOwnerKind, id: number, revision?: unknown) {
  return useQuery({
    queryKey: [...key(kind, id), revision],
    queryFn: () => tauri.reminderList(kind, id),
    enabled: id > 0,
    staleTime: 0,
  });
}

export async function saveReminders(kind: tauri.ReminderOwnerKind, id: number, offsets: number[]) {
  const saved = await tauri.reminderSet(kind, id, offsets);
  const client = getQueryClient();
  void client.invalidateQueries({ queryKey: key(kind, id) });
  if (kind === "todo") void client.invalidateQueries({ queryKey: ["todo"] });
  return saved;
}
