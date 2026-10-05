/**
 * 「待安排」面板（日程页纸内右侧常驻栏）：未完成的顶层待办（周期任务是标记，不在此列），按项目分组。
 * 行可拖进周视图网格或当日时间线的空档 = 把它安排进那个时段（新建关联该待办的日程）；
 * 已安排的不消失（一条待办可多次安排），淡色 meta 写「已安排 · 周三 9:00」/「上次安排 · 周一」/ 截止日。
 * 勾选圈直接完成待办。数据：待办快照（todos/queries）+ 安排概况（useTodoSchedules）。
 */

import { useMemo, useState, type DragEvent } from "react";
import { Search, X } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { useTodoMutations, useTodoSnapshot } from "@/features/todos/queries";
import {
  TODO_DRAG_TYPE,
  dateTimeWord,
  dayWord,
  liveEntries,
  openRoots,
} from "@/features/todos/model";
import { GroupDot, TodoCheck } from "@/features/todos/components/TodoBits";
import type { TodoEntry } from "@/features/todos/types";
import type { TodoScheduleSummary } from "@/types";
import { formatTime } from "@/utils/calendar";
import { useTodoSchedules } from "../queries";

export function TodoPanel({ onClose }: { onClose(): void }) {
  const { snapshot } = useTodoSnapshot();
  const mutations = useTodoMutations();
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
    const matched = q ? roots.filter(e => e.title.toLowerCase().includes(q)) : roots;
    return (snapshot?.groups ?? [])
      .map(group => ({ group, entries: matched.filter(e => e.groupId === group.id) }))
      .filter(section => section.entries.length > 0);
  }, [roots, snapshot, query]);

  return (
    <aside aria-label="待安排" className="border-line-1 flex w-[248px] flex-none flex-col border-l">
      <div className="flex items-center gap-1 pb-1 pl-4 pr-2 pt-4">
        <h3 className="text-tau-body flex-1 font-semibold">待安排</h3>
        <IconButton className="size-7" title="收起待安排" aria-label="收起待安排" onClick={onClose}>
          <X className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <p className="text-ink-3 text-tau-sm px-4 pb-2">
        拖进日程 = 给它一段时间。没做完不会消失，可以再拖。
      </p>
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
          placeholder="搜索待办"
          aria-label="搜索待办"
          className="text-tau-sm placeholder:text-ink-3 min-w-0 flex-1 bg-transparent py-1.5 outline-none"
        />
      </label>
      <FadeScroll className="min-h-0 flex-1 px-2 pb-3">
        {groups.length === 0 && (
          <p className="text-ink-3 text-tau-sm px-2 py-4">
            {query ? "没有匹配的待办" : "没有待安排的待办"}
          </p>
        )}
        {groups.map(({ group, entries }) => (
          <section key={group.id}>
            <h4 className="text-ink-3 text-tau-micro flex items-center gap-1.5 px-2 pb-0.5 pt-3">
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
  const [dragging, setDragging] = useState(false);
  const meta = todoMeta(entry, schedule, now);
  return (
    <div
      draggable
      title="拖进日程安排时间"
      onDragStart={(e: DragEvent) => {
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
        label={`完成「${entry.title}」`}
        onToggle={onComplete}
      />
      <div className="min-w-0 flex-1">
        <div className="text-tau-sm truncate">{entry.title}</div>
        {meta && <div className="text-ink-3 text-tau-micro truncate tabular-nums">{meta}</div>}
      </div>
    </div>
  );
}

/** 淡色 meta：安排优先，其次截止日 */
function todoMeta(entry: TodoEntry, schedule: TodoScheduleSummary | undefined, now: number) {
  if (schedule?.next) {
    const e = schedule.next;
    const time = e.allDay || e.startTime == null ? "全天" : formatTime(e.startTime);
    return `已安排 · ${dayWord(e.startDate, now)} ${time}`;
  }
  if (schedule?.last) return `上次安排 · ${dayWord(schedule.last.startDate, now)}`;
  if (entry.type === "deadline" && entry.dueAt != null)
    return `截止 · ${dateTimeWord(entry.dueAt, now)}`;
  return null;
}
