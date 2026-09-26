/**
 * 日程页视图（方案 C · 月刊：mockups/calendar/index.html）。
 *
 * 一整张纸对开两栏（月刊摊开）：左栏 = 页头工具条 + 日历 chips（显隐 + 「管理日历」弹窗）+
 * 主视图（月 / 周 / 议程）；右栏 = 当日时间线（快速添加），全高贴纸右缘，可收起。点日程先出速览浮层，编辑进 EventDialog。
 * 数据仍走 useCalendarStore：切库与 MCP/AI 修改日历后自动重载。
 */

import { useEffect } from "react";
import { cn } from "@tau/ui";
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
  const showDayPanel = useCalendarStore(s => s.showDayPanel);

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-[26px] pb-4 pt-1">
      {/* 一整张纸对开两栏：左栏页头 + chips + 主视图，右栏当日时间线全高贴纸右缘 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-none flex-col px-8 pt-5">
            <CalendarHeader />
            <CalendarChips />
          </div>
          {/* 左 26px + 各视图 6px = 页头的 px-8；右侧只留 8px，滚动条贴近右栏分隔线，
              内容右侧留白由各视图自己补 */}
          <div className="flex min-h-0 flex-1 flex-col pl-[26px] pr-2">
            <CalendarView />
          </div>
        </div>
        {/* 右栏：宽度动画收起（内层定宽不挤压），收起后不可聚焦 */}
        <div
          inert={!showDayPanel}
          className={cn(
            "ease-tau-out flex flex-none overflow-hidden transition-[width] duration-[240ms]",
            showDayPanel ? "w-[360px]" : "w-0"
          )}
        >
          <DayColumn />
        </div>
      </div>
      <EventDialog />
      <EventPeek />
    </div>
  );
}

export default ScheduleView;
