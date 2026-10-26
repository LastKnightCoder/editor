/**
 * 日程月视图：从右栏「待安排」把待办拖进某一天，或双击空格子新建全天日程；点一天选中。
 * 结构按 features/schedule 的 CalendarHeader、MonthView、EventChips 与 TodoPanel 重建。
 */
import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, ListTodo, Plus } from "lucide-react";
import { Button, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type Cal = "work" | "life" | "study";

interface Event {
  id: number;
  day: number;
  title: string;
  cal: Cal;
  time?: string;
  fresh?: boolean;
}

const CAL_VAR: Record<Cal, string> = {
  work: "var(--tau-tag-1)",
  life: "var(--tau-tag-3)",
  study: "var(--tau-tag-2)",
};
const CAL_NAME: Record<Cal, string> = {
  work: "工作",
  life: "生活",
  study: "学习",
};

/** 与 schedule/eventTone.ts 同一套：数据色 + 14% 混入纸面的软底 */
const toneStyle = (cal: Cal) =>
  ({
    "--cal": CAL_VAR[cal],
    "--cal-soft": "color-mix(in srgb, var(--cal) 14%, var(--tau-bg-surface))",
  }) as CSSProperties;

const INITIAL_EVENTS: Event[] = [
  { id: 1, day: 6, title: "读书会", cal: "study", time: "19:30" },
  { id: 2, day: 13, title: "季度复盘", cal: "work" },
  { id: 3, day: 16, title: "体检", cal: "life", time: "08:30" },
  { id: 4, day: 21, title: "选题评审", cal: "work", time: "10:00" },
  { id: 5, day: 26, title: "写作日", cal: "study" },
  { id: 6, day: 27, title: "交周报", cal: "work", time: "17:00" },
  { id: 7, day: 30, title: "看展", cal: "life" },
];

const INITIAL_PENDING = [
  { id: 101, title: "整理读书卡片", cal: "study" as Cal },
  { id: 102, title: "给房东打电话", cal: "life" as Cal },
  { id: 103, title: "准备分享提纲", cal: "work" as Cal },
];

const TODAY = 26;
/** 2026 年 10 月：1 号是周四，月视图从周一开始 */
const FIRST_OFFSET = 3;
const DAYS_IN_MONTH = 31;
const WEEKDAYS = "一二三四五六日";

export default function ScheduleDemo() {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [pending, setPending] = useState(INITIAL_PENDING);
  const [selected, setSelected] = useState(TODAY);
  const [dropDay, setDropDay] = useState<number | null>(null);
  const [panel, setPanel] = useState(true);

  const cells = Array.from({ length: 35 }, (_, index) => index - FIRST_OFFSET + 1);

  const place = (day: number, todoId: number) => {
    const todo = pending.find(item => item.id === todoId);
    if (!todo) return;
    setPending(list => list.filter(item => item.id !== todoId));
    setEvents(list => [
      ...list.map(item => ({ ...item, fresh: false })),
      { id: todo.id, day, title: todo.title, cal: todo.cal, fresh: true },
    ]);
    setSelected(day);
  };

  return (
    <AppWindow active="schedule" crumb="日程" height={440}>
      <div className="flex h-full">
        <div className="flex min-w-0 flex-1 flex-col pt-5 pr-2 pl-[26px] max-sm:pl-3">
          <div className="mb-2 flex h-10 flex-none items-center gap-2">
            <span className="-ml-2 flex items-baseline gap-2 rounded-[10px] px-2 py-0.5 whitespace-nowrap">
              <span className="text-tau-title-lg font-semibold tracking-[-0.01em]">十月</span>
              <small className="text-ink-3 font-tau-mono text-[12px]">2026 · OCT</small>
              <ChevronDown className="text-ink-3 size-3.5 self-center" strokeWidth={1.75} />
            </span>
            <span className="text-ink-2 ml-1.5 flex items-center gap-1 max-sm:hidden">
              <ChevronLeft className="size-4" strokeWidth={1.75} />
              <ChevronRight className="size-4" strokeWidth={1.75} />
            </span>
            <Button variant="secondary" size="sm" onClick={() => setSelected(TODAY)}>
              今天
            </Button>
            <span className="flex-1" />
            <Button variant="primary" size="sm" icon={Plus} className="max-md:hidden">
              新建日程
            </Button>
            <Button
              variant={panel ? "soft" : "secondary"}
              size="sm"
              icon={ListTodo}
              aria-pressed={panel}
              onClick={() => setPanel(open => !open)}
            >
              待安排
            </Button>
          </div>

          <div className="mb-1 flex items-center gap-1.5">
            {(Object.keys(CAL_NAME) as Cal[]).map(cal => (
              <span
                key={cal}
                style={toneStyle(cal)}
                className="border-line-1 bg-surface text-ink-1 text-tau-sm flex h-[26px] items-center gap-1.5 rounded-full border pr-2.5 pl-2"
              >
                <i className="size-2 rounded-full bg-[var(--cal)]" />
                {CAL_NAME[cal]}
              </span>
            ))}
          </div>

          <div className="grid flex-none grid-cols-7 pt-2 pb-1.5">
            {Array.from(WEEKDAYS, day => (
              <span key={day} className="text-ink-3 pl-2.5 text-[12px]">
                周{day}
              </span>
            ))}
          </div>
          <div className="mb-4 grid min-h-0 flex-1 grid-cols-7 grid-rows-5">
            {cells.map((day, index) => {
              const inMonth = day >= 1 && day <= DAYS_IN_MONTH;
              const label = inMonth ? day : day < 1 ? 30 + day : day - DAYS_IN_MONTH;
              const dayEvents = inMonth ? events.filter(event => event.day === day) : [];
              return (
                <div
                  key={index}
                  onClick={() => inMonth && setSelected(day)}
                  onDoubleClick={() => {
                    if (!inMonth) return;
                    setEvents(list => [
                      ...list.map(item => ({ ...item, fresh: false })),
                      {
                        id: Date.now(),
                        day,
                        title: "新日程",
                        cal: "work",
                        fresh: true,
                      },
                    ]);
                  }}
                  onDragOver={event => {
                    if (!inMonth) return;
                    event.preventDefault();
                    setDropDay(day);
                  }}
                  onDragLeave={() => setDropDay(null)}
                  onDrop={event => {
                    event.preventDefault();
                    setDropDay(null);
                    place(day, Number(event.dataTransfer.getData("text/plain")));
                  }}
                  className={cn(
                    "border-line-2 flex min-h-0 cursor-pointer flex-col overflow-hidden transition-colors duration-[160ms]",
                    index % 7 !== 6 && "border-r",
                    index < 28 && "border-b",
                    dropDay === day
                      ? "bg-accent-soft"
                      : selected === day && inMonth
                        ? "bg-selected"
                        : "hover:bg-hover"
                  )}
                >
                  <div className="flex h-[28px] shrink-0 items-center px-2 pt-1">
                    <span
                      className={cn(
                        "font-tau-mono grid h-[22px] min-w-[22px] place-items-center rounded-full px-[5px] text-[12px] tabular-nums",
                        inMonth ? "text-ink-2" : "text-ink-3",
                        day === TODAY && "bg-accent text-ink-inverse font-semibold"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-1 pb-1">
                    {dayEvents.slice(0, 2).map(event =>
                      event.time ? (
                        <span
                          key={event.id}
                          style={toneStyle(event.cal)}
                          className={cn(
                            "flex h-5 items-center gap-1.5 rounded-[6px] px-1.5 text-[12px]",
                            event.fresh && "animate-doc-flash"
                          )}
                        >
                          <i className="size-1.5 shrink-0 rounded-full bg-[var(--cal)]" />
                          <span className="text-ink-3 font-tau-mono shrink-0 text-[11px] tabular-nums max-lg:hidden">
                            {event.time}
                          </span>
                          <span className="truncate">{event.title}</span>
                        </span>
                      ) : (
                        <span
                          key={event.id}
                          style={toneStyle(event.cal)}
                          className={cn(
                            "flex h-5 items-center truncate rounded-[6px] bg-[var(--cal-soft)] px-[7px] text-[11.5px] font-medium text-[color-mix(in_srgb,var(--cal)_78%,var(--tau-ink-1))]",
                            event.fresh && "animate-doc-in"
                          )}
                        >
                          <span className="truncate">{event.title}</span>
                        </span>
                      )
                    )}
                    {dayEvents.length > 2 && (
                      <span className="text-ink-2 px-[7px] text-[11.5px]">
                        还有 {dayEvents.length - 2} 项
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside
          className={cn(
            "border-line-2 ease-tau-out shrink-0 overflow-hidden border-l transition-[width] duration-[220ms] max-sm:hidden",
            panel ? "w-[220px]" : "w-0 border-l-0"
          )}
        >
          <div className="w-[220px] px-4 pt-6">
            <p className="text-tau-body font-semibold">待安排</p>
            <p className="text-ink-3 text-tau-tiny mt-1">拖到左边的日期上</p>
            <div className="mt-3 flex flex-col gap-1">
              {pending.map(todo => (
                <div
                  key={todo.id}
                  draggable
                  onDragStart={event => event.dataTransfer.setData("text/plain", String(todo.id))}
                  style={toneStyle(todo.cal)}
                  className="border-line-1 bg-surface hover:shadow-lift flex cursor-grab items-center gap-2 rounded-[9px] border px-2 py-2 text-[13px] transition-shadow active:cursor-grabbing"
                >
                  <GripVertical className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
                  <i className="size-1.5 shrink-0 rounded-full bg-[var(--cal)]" />
                  <span className="truncate">{todo.title}</span>
                </div>
              ))}
              {pending.length === 0 && (
                <p className="text-ink-3 py-6 text-center text-[12.5px]">没有待安排的待办</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppWindow>
  );
}
