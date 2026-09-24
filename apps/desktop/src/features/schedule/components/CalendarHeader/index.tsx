import { useState } from "react";
import dayjs from "dayjs";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, DatePickerPanel, IconButton, Popover, Segmented, cn, toast } from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { getDateStart, getWeekStart } from "@/utils/calendar";
import type { CalendarEvent, CalendarViewType } from "@/types";

// 方案 C：「日」由右栏当日时间线承担
const VIEWS: { value: CalendarViewType; label: string }[] = [
  { value: "week", label: "周" },
  { value: "month", label: "月" },
  { value: "agenda", label: "议程" },
];

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const CN_MONTHS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];
const EN_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** 标题 = 中文主 + mono 副（年份 / 周次） */
function formatTitle(view: CalendarViewType, current: number) {
  const date = new Date(current);
  const year = date.getFullYear();
  if (view === "day") {
    return {
      main: `${date.getMonth() + 1} 月 ${date.getDate()} 日`,
      sub: `周${WEEKDAYS[date.getDay()]} · ${year}`,
    };
  }
  if (view === "week") {
    const start = new Date(getWeekStart(current));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const main =
      start.getMonth() === end.getMonth()
        ? `${start.getMonth() + 1} 月 ${start.getDate()} – ${end.getDate()} 日`
        : `${start.getMonth() + 1} 月 ${start.getDate()} 日 – ${end.getMonth() + 1} 月 ${end.getDate()} 日`;
    return { main, sub: `${start.getFullYear()} · W${String(isoWeek(start)).padStart(2, "0")}` };
  }
  return {
    main: CN_MONTHS[date.getMonth()],
    sub: `${year} · ${view === "agenda" ? "议程" : EN_MONTHS[date.getMonth()]}`,
  };
}

/** ISO 周次（周一起始，含 1 月 4 日的周为第 1 周） */
function isoWeek(monday: Date) {
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

const CalendarHeader = () => {
  const currentView = useCalendarStore(s => s.currentView);
  const currentDate = useCalendarStore(s => s.currentDate);
  const calendars = useCalendarStore(s => s.calendars);
  const { setCurrentView, setCurrentDate, goToToday, goToPrevious, goToNext, setEditingEvent } =
    useCalendarStore.getState();
  const [jumpOpen, setJumpOpen] = useState(false);

  const title = formatTitle(currentView, currentDate);

  const handleCreate = () => {
    const target = calendars.find(c => !c.isInSystemGroup && !c.archived);
    if (!target) {
      toast.warning("请先创建一个日历");
      return;
    }
    const day = getDateStart(currentDate);
    const draft: CalendarEvent = {
      id: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
      calendarId: target.id,
      title: "",
      detailContentId: 0,
      startDate: day,
      endDate: day,
      startTime: 9 * 60,
      endTime: 10 * 60,
      color: null,
      allDay: false,
    };
    setEditingEvent(draft);
  };

  return (
    <div className="flex h-[44px] flex-none items-center gap-2">
      {/* 标题即跳转入口：点开小日历选任意一天，主视图翻到对应月 / 周，右栏跟随这一天 */}
      <Popover
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        placement="bottom-start"
        arrow={false}
        className="w-auto"
        trigger={
          <button
            type="button"
            title="跳转到日期"
            className={cn(
              "hover:bg-hover -ml-2 flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded-[10px] px-2 py-0.5",
              "text-[19px] font-semibold tracking-[-0.01em] transition-colors",
              jumpOpen && "bg-hover"
            )}
          >
            {title.main}
            {title.sub && (
              <small className="text-ink-3 font-tau-mono text-[12px] font-normal">
                {title.sub}
              </small>
            )}
            <ChevronDown
              className={cn(
                "text-ink-3 size-3.5 self-center transition-transform duration-[160ms]",
                jumpOpen && "rotate-180"
              )}
              strokeWidth={1.75}
            />
          </button>
        }
      >
        <DatePickerPanel
          value={dayjs(currentDate).format("YYYY-MM-DD")}
          onCommit={value => {
            if (value) setCurrentDate(dayjs(value).valueOf());
            setJumpOpen(false);
          }}
        />
      </Popover>
      <div className="ml-1.5 flex items-center">
        <IconButton title="上一页" aria-label="上一页" onClick={goToPrevious}>
          <ChevronLeft className="size-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton title="下一页" aria-label="下一页" onClick={goToNext}>
          <ChevronRight className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <Button variant="secondary" size="sm" onClick={goToToday}>
        今天
      </Button>
      <span className="flex-1" />
      <Segmented
        label="视图"
        size="sm"
        value={currentView === "day" ? "month" : currentView}
        onValueChange={value => setCurrentView(value)}
      >
        {VIEWS.map(view => (
          <Segmented.Item key={view.value} value={view.value} label={view.label} />
        ))}
      </Segmented>
      <Button variant="primary" size="sm" icon={Plus} onClick={handleCreate}>
        新建日程
      </Button>
    </div>
  );
};

export default CalendarHeader;
