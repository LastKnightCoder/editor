/**
 * 日程页视图（方案 C · 月刊：mockups/calendar/index.html）。
 *
 * 一整张纸：页头工具条 + 日历 chips（显隐 + 「管理日历」弹窗）+ 主视图（月 / 周 / 议程）占满宽度；
 * 当日时间线（快速添加）是纸内右侧的非模态抽屉（整张纸高度），由工具条末尾「今天 · N 项」按钮开关
 * （开合状态持久化）。点日程在同位打开详情抽屉（可直接编辑保存），新建进 EventDialog。
 * 「待安排」面板是纸内右侧常驻栏（开合持久化）：开着时两个抽屉左移一栏让位，面板与当日时间线可同屏拖放。
 * 数据按数据库和日期窗口查询；界面偏好与编辑状态归日程域。
 */

import { useEffect } from "react";
import { Drawer, cn } from "@tau/ui";
import { ErrorState } from "@/components/ErrorState";
import { useOverlayDismiss, usePage, usePageParams } from "@/page/PageProvider";
import { useScheduleStore } from "../uiStore";
import { useCalendarEventDetail, useCalendarEvents } from "../queries";
import CalendarHeader from "../components/CalendarHeader";
import CalendarView from "../components/CalendarView";
import EventDialog from "../components/EventDialog";
import { CalendarChips } from "../components/CalendarChips";
import { DayColumn } from "../components/DayColumn";
import { EventDrawer } from "../components/EventDrawer";
import { TodoPanel } from "../components/TodoPanel";
import { flushEventDeletes } from "../pendingDeleteStore";
import { usePeekStore } from "../peekStore";
import { useAppContextProvider } from "@/hooks/useAppContextProvider";

/** 待安排栏 248px + 抽屉原本的 12px 边距 */
const DRAWER_BESIDE_PANEL = "right-[260px] max-w-[calc(100%-272px)]";

export function ScheduleView() {
  const { error, retry } = useCalendarEvents();
  const showDayPanel = useScheduleStore(s => s.showDayPanel);
  const showTodoPanel = useScheduleStore(s => s.showTodoPanel);
  // 离开日程页时延迟删除立即落库
  useEffect(() => flushEventDeletes, []);
  // 日程详情抽屉与时间线同位：详情打开时暂代时间线，关掉回到时间线
  const peeking = usePeekStore(s => s.event !== null);
  const closeDayPanel = () => useScheduleStore.getState().setShowDayPanel(false);
  useOverlayDismiss(closeDayPanel, showDayPanel && !peeking);

  // AI 上下文：详情抽屉当前查看的日程（pull 模式读取 store，抽屉关闭时为 null）
  useAppContextProvider("schedule-peek", "日程详情", () => {
    const event = usePeekStore.getState().event;
    if (!event) return null;
    return {
      id: event.id,
      title: event.title,
      calendarId: event.calendarId,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      allDay: event.allDay,
    };
  });

  /* 外部带 eventId 进入（今日页日程卡等）：翻到该日程所在日期并打开详情，参数随即消费掉（原位更新） */
  const { navigator } = usePage();
  const params = usePageParams<{ eventId?: number }>();
  const detail = useCalendarEventDetail(params.eventId);
  useEffect(() => {
    const id = params.eventId;
    if (id == null) return;
    if (!detail.isSuccess && !detail.isError) return;
    if (detail.data) {
      useScheduleStore.getState().setCurrentDate(detail.data.startDate);
      usePeekStore.getState().peek(detail.data);
    }
    if (detail.error) console.warn("[schedule] 定位日程失败：", detail.error);
    navigator.push("schedule", {});
  }, [params.eventId, detail.data, detail.error, detail.isSuccess, detail.isError, navigator]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：页头 + chips 固定在纸顶，主视图占满；当日抽屉盖在纸内右侧、与纸同高 */}
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-none flex-col px-8 pt-5">
            <CalendarHeader />
            <CalendarChips />
          </div>
          {/* 左 26px + 各视图 6px = 页头的 px-8；内容右侧留白由各视图自己补 */}
          <div className="flex min-h-0 flex-1 flex-col pl-[26px] pr-2">
            {error ? (
              <ErrorState
                title="日程加载失败"
                error={error}
                description="请重试加载日历与日程。"
                actions={[{ label: "重试", onClick: () => void retry() }]}
              />
            ) : (
              <CalendarView />
            )}
          </div>
        </div>
        {showTodoPanel && (
          <TodoPanel onClose={() => useScheduleStore.getState().setShowTodoPanel(false)} />
        )}
        <Drawer
          modal={false}
          open={showDayPanel && !peeking}
          onOpenChange={open => !open && closeDayPanel()}
          label="当日时间线"
          width={360}
          fill
          className={cn(showTodoPanel && DRAWER_BESIDE_PANEL)}
        >
          <DayColumn />
        </Drawer>
        <EventDrawer className={cn(showTodoPanel && DRAWER_BESIDE_PANEL)} />
      </div>
      <EventDialog />
    </div>
  );
}

export default ScheduleView;
