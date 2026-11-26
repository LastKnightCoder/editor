import { scheduleText, scheduleValue, scheduleFormat, useScheduleI18n } from "../../i18n";
import { useState } from "react";
import dayjs from "dayjs";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays, ListTodo, Plus } from "lucide-react";
import { Button, DatePickerPanel, IconButton, Popover, Segmented, cn, toast } from "@tau/ui";
import { useScheduleStore } from "../../uiStore";
import { useCalendarCatalog } from "../../queries";
import { getDateStart } from "@/utils/calendar";
import type { CalendarEvent, CalendarViewType } from "@/types";
import { useDayEvents } from "../DayColumn";

// 「日」由右栏当日时间线承担
const VIEWS: { value: CalendarViewType; label: string }[] = [
  {
    value: "week",
    get label() {
      return scheduleText("view.week");
    },
  },
  {
    value: "month",
    get label() {
      return scheduleText("view.month");
    },
  },
  {
    value: "agenda",
    get label() {
      return scheduleText("view.agenda");
    },
  },
];

const CalendarHeader = () => {
  useScheduleI18n();

  const currentView = useScheduleStore(s => s.currentView);
  const currentDate = useScheduleStore(s => s.currentDate);
  const { calendars } = useCalendarCatalog();
  const showDayPanel = useScheduleStore(s => s.showDayPanel);
  const showTodoPanel = useScheduleStore(s => s.showTodoPanel);
  const {
    setCurrentView,
    setCurrentDate,
    goToToday,
    goToPrevious,
    goToNext,
    setEditingEvent,
    setShowDayPanel,
    setShowTodoPanel,
  } = useScheduleStore.getState();
  const [jumpOpen, setJumpOpen] = useState(false);

  const title = scheduleFormat.header(currentView, currentDate);

  const handleCreate = () => {
    const target = calendars.find(c => !c.isInSystemGroup && !c.archived);
    if (!target) {
      toast.warning(scheduleText("feedback.createCalendarFirst"));
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
    // @container：待安排栏打开后工具条变窄，按宽度逐级收起次要文字，所有项不被压缩
    <div className="@container mb-2 flex h-10 flex-none items-center gap-2">
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
            title={scheduleText("navigation.jumpDate")}
            className={cn(
              "hover:bg-hover -ml-2 flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded-[10px] px-2 py-0.5",
              "text-tau-title-lg font-semibold tracking-[-0.01em] transition-colors",
              jumpOpen && "bg-hover"
            )}
          >
            {title.main}
            {title.sub && (
              <small className="text-ink-3 font-tau-mono text-[12px] font-normal @max-[860px]:hidden">
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
        <IconButton
          title={scheduleText("navigation.previous")}
          aria-label={scheduleText("navigation.previous")}
          onClick={goToPrevious}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton
          title={scheduleText("navigation.next")}
          aria-label={scheduleText("navigation.next")}
          onClick={goToNext}
        >
          <ChevronRight className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <Button variant="secondary" size="sm" onClick={goToToday} className="shrink-0">
        {scheduleText("today")}
      </Button>
      <span className="flex-1" />
      <Segmented
        label={scheduleText("view.label")}
        size="sm"
        value={currentView === "day" ? "month" : currentView}
        onValueChange={value => setCurrentView(value)}
        className="shrink-0"
      >
        {VIEWS.map(view => (
          <Segmented.Item key={view.value} value={view.value} label={view.label} />
        ))}
      </Segmented>
      <Button
        variant="primary"
        size="sm"
        icon={Plus}
        title={scheduleText("event.create")}
        aria-label={scheduleText("event.create")}
        onClick={handleCreate}
        className="shrink-0 @max-[720px]:px-[7px]"
      >
        <span className="@max-[720px]:hidden">{scheduleText("event.create")}</span>
      </Button>
      <Button
        variant={showTodoPanel ? "soft" : "secondary"}
        size="sm"
        icon={ListTodo}
        aria-pressed={showTodoPanel}
        title={showTodoPanel ? scheduleText("todo.collapse") : scheduleText("todo.dragHint")}
        onClick={() => setShowTodoPanel(!showTodoPanel)}
        aria-label={scheduleText("todo.unscheduled")}
        className="shrink-0 whitespace-nowrap @max-[720px]:px-[7px]"
      >
        <span className="@max-[720px]:hidden">{scheduleText("todo.unscheduled")}</span>
      </Button>
      <DayPanelButton open={showDayPanel} onToggle={() => setShowDayPanel(!showDayPanel)} />
    </div>
  );
};

/** 当日抽屉开关：写明打开的是哪天、有几项，而不是一个孤立图标 */
function DayPanelButton({ open, onToggle }: { open: boolean; onToggle(): void }) {
  useScheduleI18n();

  const { day, isToday, dayEvents } = useDayEvents();
  const dayText = isToday ? scheduleText("today") : scheduleFormat.monthDayWeekday(day);
  return (
    <Button
      variant={open ? "soft" : "secondary"}
      size="sm"
      icon={CalendarDays}
      aria-pressed={open}
      title={open ? scheduleText("day.collapse") : scheduleText("day.expandHint")}
      onClick={onToggle}
      className="shrink-0 whitespace-nowrap tabular-nums"
    >
      {dayText}
      <span className={cn("font-normal @max-[860px]:hidden", open ? "opacity-80" : "text-ink-3")}>
        ·{" "}
        {dayEvents.length
          ? scheduleText("summary.items", { count: scheduleValue(dayEvents.length) })
          : scheduleText("day.noPlans")}
      </span>
    </Button>
  );
}

export default CalendarHeader;
