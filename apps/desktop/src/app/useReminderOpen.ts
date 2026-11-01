import { useEffect } from "react";
import { off, on } from "@/electron";
import { openPage } from "@/services/page-navigation";

interface ReminderOpenTarget {
  page: "todos" | "schedule";
  params: Record<string, unknown>;
}

/** 主进程提醒通知点「查看」：打开对应待办或日程（窗口已由主进程带到前台） */
export function useReminderOpen() {
  useEffect(() => {
    const handler = (_event: unknown, target: ReminderOpenTarget) => {
      try {
        openPage(target.page, target.params);
      } catch (error) {
        console.warn("打开提醒对应页面失败:", error);
      }
    };
    on("reminder:open", handler);
    return () => off("reminder:open", handler);
  }, []);
}
