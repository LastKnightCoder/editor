/**
 * 待办拖进日程（周视图网格、当日时间线空档共用）：读 dataTransfer、换算落点、新建安排，
 * 放下即建不弹窗，Toast 回执带「撤销」（撤销 = 删掉刚建的这条）。
 */

import type { DragEvent } from "react";
import { toast } from "@tau/ui";
import { TODO_DRAG_TYPE } from "@/features/todos/model";
import { formatTime } from "@/utils/calendar";
import { useScheduleMutations } from "./queries";

/** 拖入的安排默认 1 小时 */
export const DROP_MINUTES = 60;
const DAY_END = 24 * 60 - 1;

export const isTodoDrag = (e: DragEvent) => e.dataTransfer.types.includes(TODO_DRAG_TYPE);

export const readTodoDrag = (e: DragEvent): number | null => {
  const id = Number(e.dataTransfer.getData(TODO_DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** 15 分钟吸附的落点分钟（clientY 相对网格顶，cellHeight = 15 分钟的像素高） */
export function dropMinutes(offsetY: number, cellHeight: number): number {
  const minutes = Math.round(offsetY / cellHeight) * 15;
  return Math.min(Math.max(minutes, 0), DAY_END - 15);
}

export function useScheduleTodo() {
  const { scheduleTodo, deleteEvent } = useScheduleMutations();
  return async (
    todoItemId: number,
    startDate: number,
    startTime: number,
    minutes = DROP_MINUTES
  ) => {
    try {
      const event = await scheduleTodo({
        todoItemId,
        startDate,
        startTime,
        endTime: Math.min(startTime + minutes, DAY_END),
      });
      const d = new Date(startDate);
      toast.success(
        `已安排「${event.title}」· ${d.getMonth() + 1}月${d.getDate()}日 ${formatTime(startTime)}`,
        {
          action: {
            label: "撤销",
            onClick: () => void deleteEvent(event.id).catch(() => undefined),
          },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(message.includes("NO_USER_CALENDAR") ? "请先创建一个日历" : "安排失败");
    }
  };
}
