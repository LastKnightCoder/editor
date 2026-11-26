import { pomoText, pomoValue, usePomodoroI18n } from "../i18n";
/**
 * 「专注于…」选择器：可选地把这次专注关联到今天的一条日程或一条待办。
 * 触发行显示当前选择（未选 = 「可选」）；点开 Popover：搜索框 + 两组候选 + 「不关联」，
 * 上下键移动、回车选定。开始前由番茄页暂存选择，专注中直接改会话绑定。
 */

import { useMemo, useState } from "react";
import { CalendarClock, CircleCheck, Link2, X } from "lucide-react";
import { Popover, cn } from "@tau/ui";
import { useCalendarRoles, useEventsOfDay } from "@/features/schedule/queries";
import { useTodoSnapshot } from "@/features/todos/queries";
import { liveEntries, openRoots } from "@/features/todos/model";
import { getDateStart } from "@/utils/calendar";
import type { PomodoroBindTarget } from "@/types";
import {
  eventCandidates,
  filterCandidates,
  sameTarget,
  todoCandidates,
  type BindCandidate,
} from "../bindTargets";

export interface BindChoice {
  target: PomodoroBindTarget;
  title: string;
}

export function BindPicker({
  value,
  onChange,
  className,
}: {
  value: BindChoice | null;
  onChange(choice: BindChoice | null): void;
  className?: string;
}) {
  usePomodoroI18n();

  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      arrow={false}
      className="w-[320px]"
      trigger={
        <button
          type="button"
          aria-label={
            value
              ? pomoText("bind.current", { name: pomoValue(value.title) })
              : pomoText("ui.chooseWhatToFocusOn")
          }
          className={cn(
            "text-tau-sm hover:bg-hover group/bind flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-[8px] px-2 text-left transition-colors",
            value ? "text-ink-1" : "text-ink-3",
            className
          )}
        >
          <Link2 className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-ink-3 shrink-0">{pomoText("ui.focusOn")}</span>
          <span className="min-w-0 flex-1 truncate">
            {value ? value.title : pomoText("ui.optional")}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={pomoText("ui.noLink")}
              title={pomoText("ui.noLink")}
              onClick={e => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-ink-3 hover:text-ink-1 grid size-5 shrink-0 place-items-center rounded-[5px] opacity-0 group-hover/bind:opacity-100"
            >
              <X className="size-3" strokeWidth={2} />
            </span>
          )}
        </button>
      }
    >
      {open && (
        <PickerPanel
          value={value?.target ?? null}
          onPick={choice => {
            onChange(choice);
            setOpen(false);
          }}
        />
      )}
    </Popover>
  );
}

function PickerPanel({
  value,
  onPick,
}: {
  value: PomodoroBindTarget | null;
  onPick(choice: BindChoice | null): void;
}) {
  usePomodoroI18n();

  const nowMs = Date.now();
  const events = useEventsOfDay(getDateStart(nowMs));
  const roles = useCalendarRoles();
  const { snapshot } = useTodoSnapshot();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const candidates = useMemo(() => {
    const todos = snapshot ? todoCandidates(openRoots(liveEntries(snapshot), nowMs)) : [];
    return filterCandidates([...eventCandidates(events, roles, nowMs), ...todos], query);
    // nowMs 每次渲染都变：候选只随数据与搜索词重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, roles, snapshot, query]);
  // 最后一项是「不关联」
  const count = candidates.length + 1;
  const pick = (index: number) => {
    const candidate = candidates[index];
    onPick(candidate ? { target: candidate.target, title: candidate.title } : null);
  };

  return (
    <div className="flex max-h-[420px] flex-col py-2">
      <input
        data-autofocus
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setCursor(c => (c + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(cursor);
          }
        }}
        placeholder={pomoText("ui.searchTodaySEventsOrTasks")}
        aria-label={pomoText("ui.searchFocusTargets")}
        className="text-tau-body placeholder:text-ink-3 border-line-1 mx-3 mb-1.5 rounded-[8px] border bg-transparent px-2.5 py-1.5 outline-none focus:border-[var(--tau-accent)]"
      />
      <div
        role="listbox"
        aria-label={pomoText("ui.focusTarget")}
        className="min-h-0 overflow-y-auto px-1.5"
      >
        {candidates.length === 0 && (
          <p className="text-ink-3 text-tau-sm px-2.5 py-3">
            {query
              ? pomoText("ui.noMatchingEventsOrTasks")
              : pomoText("ui.noEventsTodayOrUnfinishedTasks")}
          </p>
        )}
        {candidates.map((candidate, index) => (
          <CandidateRow
            key={candidate.key}
            candidate={candidate}
            heading={
              index === 0 || candidates[index - 1].group !== candidate.group
                ? candidate.group === "event"
                  ? pomoText("ui.todaySEvents")
                  : pomoText("ui.task")
                : null
            }
            active={cursor === index}
            selected={sameTarget(value, candidate.target)}
            onHover={() => setCursor(index)}
            onPick={() => pick(index)}
          />
        ))}
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onMouseEnter={() => setCursor(candidates.length)}
          onClick={() => pick(candidates.length)}
          className={cn(
            "text-ink-2 text-tau-sm mt-1 w-full rounded-[7px] px-2.5 py-1.5 text-left",
            cursor === candidates.length && "bg-hover"
          )}
        >
          {pomoText("ui.noLink")}
        </button>
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  heading,
  active,
  selected,
  onHover,
  onPick,
}: {
  candidate: BindCandidate;
  heading: string | null;
  active: boolean;
  selected: boolean;
  onHover(): void;
  onPick(): void;
}) {
  usePomodoroI18n();
  const Icon = candidate.group === "event" ? CalendarClock : CircleCheck;
  return (
    <>
      {heading && <div className="text-ink-3 text-tau-micro px-2.5 pt-2 pb-0.5">{heading}</div>}
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onMouseEnter={onHover}
        onClick={onPick}
        className={cn(
          "text-tau-body flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left",
          active && "bg-hover",
          selected && "text-accent-text"
        )}
      >
        <Icon className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
        {candidate.group === "event" && (
          <span className="text-ink-3 font-tau-mono shrink-0 text-[11px] tabular-nums">
            {candidate.phase === "live"
              ? pomoText("bind.live", { range: candidate.range ?? "" })
              : candidate.range}
          </span>
        )}
      </button>
    </>
  );
}
