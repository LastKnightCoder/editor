/**
 * 日程页视图（方案 C · 月刊：mockups/calendar/index.html）。
 *
 * 无内层侧栏：页头工具条 → 日历 chips（显隐 + 「管理日历」弹窗）→ 主面板（月 / 周 / 议程，
 * 月视图为整块大面板）+ 右栏当日时间线（快速添加）。点日程先出速览浮层，编辑进 EventDialog。
 * 数据仍走 useCalendarStore：切库与 MCP/AI 修改日历后自动重载。
 */

import { useEffect } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { subscribeCalendarMutationEvent } from "@/mcp/calendar/events";
import CalendarHeader from "../components/CalendarHeader";
import CalendarView from "../components/CalendarView";
import EventDialog from "../components/EventDialog";
import { CalendarChips } from "../components/CalendarChips";
import { DayColumn } from "../components/DayColumn";
import { EventPeek } from "../components/EventPeek";

export function ScheduleView() {
  const init = useCalendarStore(s => s.init);

  // 在数据库连接或切换时自动重新加载日历数据
  useDatabaseChangeEffect(() => {
    init();
  });

  useEffect(() => {
    return subscribeCalendarMutationEvent(() => {
      void init();
    });
  }, [init]);

  // 方案 C 没有日视图：legacy 持久化的 day 迁到月视图
  useEffect(() => {
    const { currentView, setCurrentView } = useCalendarStore.getState();
    if (currentView === "day") setCurrentView("month");
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-[1720px] flex-col px-[26px] pb-4">
      <CalendarHeader />
      <CalendarChips />
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="bg-surface shadow-card rounded-tau-lg flex min-w-0 flex-1 flex-col overflow-hidden">
          <CalendarView />
        </div>
        <DayColumn />
      </div>
      <EventDialog />
      <EventPeek />
    </div>
  );
}

export default ScheduleView;
