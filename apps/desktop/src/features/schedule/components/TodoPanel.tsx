/**
 * 「待安排」面板（日程页纸内右侧常驻栏）：未完成的顶层待办（周期任务是标记，不在此列），按项目分组。
 * 行可拖进月视图日期建全天安排，或拖进周视图网格 / 当日时间线空档安排时段；
 * 已安排的不消失（一条待办可多次安排），淡色 meta 写「已安排 · 周三 9:00」/「上次安排 · 周一」/ 截止日。
 * 勾选圈直接完成待办。数据：待办快照（todos/queries）+ 安排概况（useTodoSchedules）。
 */

import { useMemo, useState, type DragEvent } from "react";
import { dateTimeWord, dayWord } from "@/utils/date-format";
import { scheduleText, useScheduleI18n } from "../i18n";
import { Search, X } from "lucide-react";
import { IconButton, ResizeHandle, cn } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { useTodoMutations, useTodoSnapshot } from "@/features/todos/queries";
import { TODO_DRAG_TYPE, liveEntries, openRoots, priorityOf, tagsOf } from "@/features/todos/model";
import { GroupDot, PriorityBadge, TodoCheck } from "@/features/todos/components/TodoBits";
import type { TodoEntry } from "@/features/todos/types";
import type { TodoScheduleSummary } from "@/types";
import { formatTime } from "@/utils/calendar";
import { useTodoSchedules } from "../queries";
import {
  TODO_PANEL_DEFAULT_WIDTH,
  TODO_PANEL_MIN_WIDTH,
  TODO_PANEL_MAX_WIDTH,
  useScheduleStore,
} from "../uiStore";

export function TodoPanel({ onClose }: { onClose(): void }) {
  useScheduleI18n();
  const { snapshot } = useTodoSnapshot();
  const mutations = useTodoMutations();
  const width = useScheduleStore(s => s.todoPanelWidth);
  const setWidth = useScheduleStore(s => s.setTodoPanelWidth);
  const [query, setQuery] = useState("");
  const now = Date.now();

  const roots = useMemo(
    () =>
      snapshot ? openRoots(liveEntries(snapshot), now).filter(e => e.type !== "recurring") : [],
    // now 每次渲染都变：列表只随快照重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot]
  );
  const schedules = useTodoSchedules(roots.map(e => e.id));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tagNeedle = q.startsWith("#") ? q.slice(1) : q;
    const matched = q
      ? roots.filter(
          e =>
            e.title.toLowerCase().includes(q) ||
            (tagNeedle.length > 0 && tagsOf(e).some(tag => tag.toLowerCase().includes(tagNeedle)))
        )
      : roots;
    return (snapshot?.groups ?? [])
      .map(group => ({ group, entries: matched.filter(e => e.groupId === group.id) }))
      .filter(section => section.entries.length > 0);
  }, [roots, snapshot, query]);

  return (
    <aside
      aria-label={scheduleText("todo.unscheduled")}
      style={{ width }}
      className="border-line-1 relative flex flex-none flex-col border-l"
    >
      <ResizeHandle
        value={width}
        min={TODO_PANEL_MIN_WIDTH}
        max={TODO_PANEL_MAX_WIDTH}
        defaultValue={TODO_PANEL_DEFAULT_WIDTH}
        onChange={setWidth}
        side="right"
        label={scheduleText("todo.width")}
        className="absolute top-4 bottom-4 -left-1 z-20 touch-none"
      />
      <div className="flex items-center gap-1 pt-4 pr-2 pb-1 pl-4">
        <h3 className="text-tau-body flex-1 font-semibold">{scheduleText("todo.unscheduled")}</h3>
        <IconButton
          className="size-7"
          title={scheduleText("todo.collapse")}
          aria-label={scheduleText("todo.collapse")}
          onClick={onClose}
        >
          <X className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <p className="text-ink-3 text-tau-sm px-4 pb-2">{scheduleText("todo.dragDescription")}</p>
      <label className="border-line-1 mx-3 mb-1 flex items-center gap-1.5 rounded-[8px] border px-2">
        <Search className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape" && query) {
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder={scheduleText("todo.search")}
          aria-label={scheduleText("todo.search")}
          className="text-tau-sm placeholder:text-ink-3 min-w-0 flex-1 bg-transparent py-1.5 outline-none"
        />
      </label>
      <FadeScroll className="min-h-0 flex-1 px-2 pb-3">
        {groups.length === 0 && (
          <p className="text-ink-3 text-tau-sm px-2 py-4">
            {query ? scheduleText("todo.noMatches") : scheduleText("todo.empty")}
          </p>
        )}
        {groups.map(({ group, entries }) => (
          <section key={group.id}>
            <h4 className="text-ink-3 text-tau-micro flex items-center gap-1.5 px-2 pt-3 pb-0.5">
              <GroupDot color={group.color} className="size-[7px]" />
              {group.title}
            </h4>
            {entries.map(entry => (
              <TodoRow
                key={entry.id}
                entry={entry}
                schedule={schedules[entry.id]}
                now={now}
                onComplete={() => void mutations.setCompleted(entry, true)}
              />
            ))}
          </section>
        ))}
      </FadeScroll>
    </aside>
  );
}

function TodoRow({
  entry,
  schedule,
  now,
  onComplete,
}: {
  entry: TodoEntry;
  schedule: TodoScheduleSummary | undefined;
  now: number;
  onComplete(): void;
}) {
  const { locale } = useScheduleI18n();
  const [dragging, setDragging] = useState(false);
  const meta = todoMeta(entry, schedule, now, locale);
  return (
    <div
      draggable
      title={scheduleText("todo.dragTitle")}
      onDragStart={(e: DragEvent) => {
        // 原生待办拖拽不交给全局 react-dnd，否则起拖会被取消。
        e.stopPropagation();
        e.dataTransfer.setData(TODO_DRAG_TYPE, String(entry.id));
        e.dataTransfer.effectAllowed = "copy";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "hover:bg-hover flex cursor-grab items-start gap-2 rounded-[8px] px-2 py-1.5 active:cursor-grabbing",
        dragging && "opacity-50"
      )}
    >
      <TodoCheck
        size="sm"
        className="mt-0.5"
        checked={false}
        label={scheduleText("todo.completeNamed", { title: entry.title })}
        onToggle={onComplete}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <PriorityBadge priority={priorityOf(entry)} compact />
          <span className="text-tau-sm min-w-0 truncate">{entry.title}</span>
        </div>
        {meta && <div className="text-ink-3 text-tau-micro truncate tabular-nums">{meta}</div>}
      </div>
    </div>
  );
}

/** 淡色 meta：安排优先，其次截止日 */
function todoMeta(
  entry: TodoEntry,
  schedule: TodoScheduleSummary | undefined,
  now: number,
  locale: string
) {
  const tags = tagsOf(entry);
  const tagSuffix =
    tags.length > 0
      ? tags
          .slice(0, 2)
          .map(tag => `#${tag}`)
          .join(" ")
      : "";
  const join = (head: string | null) =>
    head && tagSuffix ? `${head} · ${tagSuffix}` : (head ?? (tagSuffix || null));
  if (schedule?.next) {
    const e = schedule.next;
    const time =
      e.allDay || e.startTime == null ? scheduleText("time.allDay") : formatTime(e.startTime);
    return join(scheduleText("todo.scheduled", { date: dayWord(e.startDate, now, locale), time }));
  }
  if (schedule?.last)
    return join(
      scheduleText("todo.lastScheduled", {
        date: dayWord(schedule.last.startDate, now, locale),
      })
    );
  if (entry.type === "deadline" && entry.dueAt != null)
    return join(scheduleText("todo.due", { date: dateTimeWord(entry.dueAt, now, locale) }));
  return join(null);
}
