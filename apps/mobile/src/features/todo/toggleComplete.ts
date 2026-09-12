// 任务完成状态切换（含循环任务的当日完成语义），首页摘要与任务中心共用。

import * as tauri from "../../services/tauri";
import type { TodoItem } from "../../types";
import { getQueryClient } from "../../router";
import { getTodayNormalized, isTodayScheduled } from "./recurrence";
import { useTodoStore } from "./store/useTodoStore";

export async function toggleTodoComplete(
  item: TodoItem,
  isCompleted: boolean,
  onError: (error: unknown, fallback: string) => void
): Promise<void> {
  try {
    if (item.type === "recurring") {
      const recurrence = item.recurrence ?? (await tauri.todoGetRecurrenceByItem(item.id));
      if (!recurrence) throw new Error("TODO_RECURRENCE_NOT_FOUND: recurrence not found");
      if (!isTodayScheduled(recurrence)) {
        throw new Error("TODO_RECURRENCE_INVALID: today is not scheduled");
      }
      const today = getTodayNormalized();
      if (isCompleted) {
        await tauri.todoCompleteRecurrence(recurrence.id, today);
      } else {
        await tauri.todoUncompleteRecurrence(recurrence.id, today);
      }
      // recurring 打卡绕过了 store 封装，这里手动失效缓存驱动订阅刷新
      getQueryClient().invalidateQueries({ queryKey: ["todo"] });
      return;
    }
    await useTodoStore.getState().toggleCompleteCascade({ id: item.id, isCompleted });
  } catch (error) {
    onError(error, "更新任务完成状态失败");
  }
}
