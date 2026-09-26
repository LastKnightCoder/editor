/**
 * 议程面板（B3「两块板」左板）：时间主轴分段 —— 已逾期 / 今天 / 明天 / 本周稍后 / 以后 / 无日期，
 * 或按项目分段。段头 sticky（surface 实底 + 底缘渐透），段内零横线、行左侧「时间槽」列，
 * 今天段按时刻插入「现在」刻度线；已完成收进段尾折叠（一次性任务只保留今天完成的）。
 * 按项目分段时段内按 sortIndex 手动序。行用 motion 共享布局（layoutId）——条目变动（完成、改期）
 * 时其余行与段头平滑让位，跨段移动也连续；滚动容器 layoutScroll 校正滚动位移。
 */

import { useMemo, useState, type ReactNode } from "react";
import { motion, type Transition } from "motion/react";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  CornerDownRight,
  Flame,
  Link2,
  ListTree,
  Repeat,
} from "lucide-react";
import { ContextMenu, cn } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import type { TodoGroup } from "@/types";
import {
  bucketOf,
  dayDiff,
  dayWord,
  doneToday,
  hm,
  isDateOnly,
  isOpen,
  isOverdue,
  isRunning,
  monthDay,
  nextOccurrence,
  recurrenceText,
  remindText,
  scheduledToday,
  sortKey,
  startOfDay,
  streakOf,
  WEEKDAY_CN,
  DAY_MS,
} from "../model";
import type { BucketKey, TodoEntry, TodoSnapshot } from "../types";
import { GroupDot, TodoCheck, TypeIcon } from "./TodoBits";

export type AgendaMode = "date" | "group";

/** 让位动画：短促、无回弹（生产力工具不要弹簧晃动） */
export const LAYOUT_TRANSITION: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

const BUCKETS: { key: BucketKey; label: string; hint?(now: number): string }[] = [
  { key: "overdue", label: "已逾期" },
  {
    key: "today",
    label: "今天",
    hint: now => `${monthDay(now)} · ${WEEKDAY_CN[new Date(now).getDay()]}`,
  },
  {
    key: "tomorrow",
    label: "明天",
    hint: now => `${monthDay(now + DAY_MS)} · ${WEEKDAY_CN[new Date(now + DAY_MS).getDay()]}`,
  },
  { key: "week", label: "本周稍后" },
  { key: "later", label: "以后" },
  { key: "none", label: "无日期" },
];

interface Section {
  key: string;
  label: ReactNode;
  hint?: string;
  danger?: boolean;
  open: TodoEntry[];
  done: TodoEntry[];
  bucket?: BucketKey;
  groupId?: number;
}

export function AgendaPanel({
  entries,
  snapshot,
  groups,
  mode,
  now,
  showGroup,
  selectedId,
  onOpen,
  onToggle,
  renderMenu,
}: {
  /** 议程条目：按日期 = 顶层任务 + 带日期的子任务；按项目 = 顶层任务 */
  entries: TodoEntry[];
  snapshot: TodoSnapshot;
  groups: TodoGroup[];
  mode: AgendaMode;
  now: number;
  /** 全部视图下行尾显示所属项目 */
  showGroup: boolean;
  selectedId: number | null;
  onOpen(entry: TodoEntry): void;
  onToggle(entry: TodoEntry): void;
  renderMenu(entry: TodoEntry): ReactNode;
}) {
  const [foldOpen, setFoldOpen] = useState<Set<string>>(() => new Set());

  const sections = useMemo<Section[]>(() => {
    const byTime = (a: TodoEntry, b: TodoEntry) =>
      sortKey(a, now) - sortKey(b, now) || a.sortIndex - b.sortIndex;
    const completedToday = (e: TodoEntry) =>
      e.type === "recurring"
        ? scheduledToday(e, now) && doneToday(e, now)
        : e.isCompleted && e.completedAt != null && dayDiff(e.completedAt, now) === 0;

    if (mode === "date") {
      return BUCKETS.map(({ key, label, hint }): Section => {
        const inBucket = entries.filter(e => bucketOf(e, now) === key);
        return {
          key,
          bucket: key,
          label,
          hint: hint?.(now),
          danger: key === "overdue",
          open: inBucket.filter(e => isOpen(e, now)).sort(byTime),
          done: inBucket.filter(completedToday),
        };
      }).filter(s => s.key === "today" || s.open.length || s.done.length);
    }

    return groups
      .map((group): Section => {
        const own = entries.filter(e => e.groupId === group.id);
        return {
          key: `g${group.id}`,
          groupId: group.id,
          label: (
            <span className="flex items-center gap-2">
              <GroupDot color={group.color} className="size-2.5 rounded-[3.5px]" />
              {group.title}
            </span>
          ),
          // 按项目 = 手动序
          open: own.filter(e => isOpen(e, now)).sort((a, b) => a.sortIndex - b.sortIndex),
          done: own
            .filter(e => e.type !== "recurring" && e.isCompleted)
            .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
            .slice(0, 20),
        };
      })
      .filter(s => s.open.length || s.done.length || groups.length <= 1);
  }, [entries, groups, mode, now]);

  const toggleFold = (key: string) =>
    setFoldOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const row = (entry: TodoEntry, bucket: BucketKey | undefined, noSlot: boolean) => (
    <motion.div
      key={entry.id}
      layoutId={`todo-row-${entry.id}`}
      layout="position"
      transition={LAYOUT_TRANSITION}
      data-row-id={entry.id}
    >
      <AgendaRow
        entry={entry}
        bucket={bucket}
        mode={mode}
        now={now}
        noSlot={noSlot}
        snapshot={snapshot}
        group={showGroup ? groups.find(g => g.id === entry.groupId) : undefined}
        selected={selectedId === entry.id}
        onOpen={onOpen}
        onToggle={onToggle}
        menu={renderMenu(entry)}
      />
    </motion.div>
  );

  return (
    // 滚动区离纸底留 16px（同右栏分隔线），滚动条不压纸的圆角；段头吸顶处也走顶部渐隐
    <FadeScroll layoutScroll className="relative mb-4 min-h-0 min-w-0 flex-1 pb-6 pl-[22px] pr-2">
      {sections.length === 0 && (
        <div className="text-ink-3 flex flex-col items-center gap-1.5 py-20 text-center text-[12.5px]">
          <p className="text-ink-2 text-[15px] font-medium">这里很清爽</p>
          <p>用上方输入框添加一条任务</p>
        </div>
      )}
      {sections.map(section => {
        const nowLineAt =
          section.bucket === "today"
            ? section.open.findIndex(e => !isRunning(e, now) && sortKey(e, now) > now)
            : -1;
        const isFoldOpen = foldOpen.has(section.key);
        // 时间槽列只在按日期的带日期段出现（列宽按模式固定，不随数据跳动）；
        // 按项目时时间进元信息行，无日期段本就无时间可显示
        const noSlot = mode === "group" || section.bucket === "none";
        return (
          // 布局动画落在整段（非 sticky 的父级）：段头随段平移、不单独测量——吸顶段头若自带
          // layout，滚动后其「吸住的位置」会被当成位移补偿，出现段头错位
          <motion.section
            key={section.key}
            layout="position"
            transition={LAYOUT_TRANSITION}
            data-bucket={section.bucket}
            className="relative mb-[18px]"
          >
            {/* 段头与行同宽（-mx-1.5）：吸顶时完整盖住下面行的 hover 底色 */}
            <header className="sticky top-0 z-[2] -mx-1.5 flex items-baseline gap-2.5 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_10px),transparent)] px-2.5 pb-2.5 pt-1.5">
              <span
                className={cn(
                  "text-[16px] font-semibold tracking-[-0.01em]",
                  section.danger && "text-danger"
                )}
              >
                {section.label}
              </span>
              {section.hint && <span className="text-ink-3 text-[11.5px]">{section.hint}</span>}
              <span className="text-ink-3 ml-auto text-[11.5px] tabular-nums">
                {section.open.length} 项
                {section.done.length > 0 && ` · ${section.done.length} 已完成`}
              </span>
            </header>
            <div className="-mx-1.5">
              {section.open.length === 0 && (
                <motion.p
                  layout="position"
                  transition={LAYOUT_TRANSITION}
                  className="text-ink-3 px-3.5 py-2.5 text-[12.5px]"
                >
                  {section.bucket === "today" ? "今天的任务都完成了" : "暂无待办"}
                </motion.p>
              )}
              {section.open.map((entry, index) => (
                <div key={entry.id} className="contents">
                  {index === nowLineAt && <NowLine now={now} />}
                  {row(entry, section.bucket, noSlot)}
                </div>
              ))}
              {section.bucket === "today" && nowLineAt === -1 && section.open.length > 0 && (
                <NowLine now={now} />
              )}
              {section.done.length > 0 && (
                <>
                  <motion.button
                    layout="position"
                    transition={LAYOUT_TRANSITION}
                    type="button"
                    onClick={() => toggleFold(section.key)}
                    className={cn(
                      "text-ink-3 hover:text-ink-2 flex items-center gap-1.5 pb-1 pr-3.5 pt-1.5 text-[11.5px]",
                      noSlot ? "pl-5" : "pl-3.5"
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "ease-tau-out size-[13px] transition-transform duration-200",
                        !isFoldOpen && "-rotate-90"
                      )}
                      strokeWidth={1.75}
                    />
                    已完成 {section.done.length}
                  </motion.button>
                  <div
                    className={cn(
                      "ease-tau-out grid grid-rows-[0fr] transition-[grid-template-rows] duration-200",
                      isFoldOpen && "grid-rows-[1fr]"
                    )}
                  >
                    <div className="overflow-hidden">
                      {section.done.map(entry => row(entry, section.bucket, noSlot))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.section>
        );
      })}
    </FadeScroll>
  );
}

function NowLine({ now }: { now: number }) {
  return (
    <motion.div
      layout="position"
      transition={LAYOUT_TRANSITION}
      aria-hidden
      className="text-accent-text after:bg-accent mx-2.5 my-px flex items-center gap-1.5 text-[10.5px] tabular-nums after:h-[1.5px] after:flex-1 after:rounded-[1px] after:opacity-55 after:content-['']"
    >
      现在 {hm(now)}
    </motion.div>
  );
}

/* ---------- 行 ---------- */

function AgendaRow({
  entry,
  bucket,
  mode,
  now,
  noSlot,
  snapshot,
  group,
  selected,
  onOpen,
  onToggle,
  menu,
}: {
  entry: TodoEntry;
  bucket?: BucketKey;
  mode: AgendaMode;
  now: number;
  /** 所在段不留时间槽列 */
  noSlot: boolean;
  snapshot: TodoSnapshot;
  group?: TodoGroup;
  selected: boolean;
  onOpen(entry: TodoEntry): void;
  onToggle(entry: TodoEntry): void;
  menu: ReactNode;
}) {
  const recurring = entry.type === "recurring";
  const checked = recurring ? doneToday(entry, now) : entry.isCompleted;
  const overdue = isOverdue(entry, now);
  const children = entry.childIds
    .map(id => snapshot.byId.get(id))
    .filter((c): c is TodoEntry => Boolean(c));
  const parent = entry.parentId != null ? snapshot.byId.get(entry.parentId) : undefined;
  const streak = recurring ? streakOf(entry, now) : 0;
  const slot = slotOf(entry, bucket, mode, now);

  return (
    <ContextMenu content={menu}>
      <div
        role="button"
        tabIndex={0}
        aria-current={selected || undefined}
        onClick={() => onOpen(entry)}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen(entry);
          } else if (e.key === " ") {
            e.preventDefault();
            onToggle(entry);
          }
        }}
        className={cn(
          "ease-tau-out grid min-h-[42px] cursor-pointer select-none items-center gap-2 rounded-[9px] py-[3px] pr-2.5 outline-none transition-[background,opacity] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
          // 无时间槽列时勾选框相对段头缩进一级
          noSlot
            ? "grid-cols-[22px_minmax(0,1fr)_auto] pl-5"
            : "grid-cols-[74px_22px_minmax(0,1fr)_auto] pl-2",
          selected ? "bg-selected" : "hover:bg-hover"
        )}
      >
        {!noSlot && <Slot slot={slot} checked={checked} />}
        <TodoCheck
          checked={checked}
          recurring={recurring}
          overdue={overdue}
          label={recurring ? "今日打卡" : checked ? "标记未完成" : "完成"}
          onToggle={() => onToggle(entry)}
        />
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "text-tau-body truncate",
              !recurring && checked && "text-ink-3 line-through"
            )}
          >
            {entry.title || "未命名任务"}
          </span>
          <Meta
            items={[
              noSlot && slot && (
                <span
                  className={cn(
                    "inline-flex items-center gap-[3px]",
                    !checked && slot.tone === "overdue" && "text-danger"
                  )}
                >
                  {recurring ? <Repeat strokeWidth={1.75} /> : <CalendarClock strokeWidth={1.75} />}
                  {recurring ? slot.sub : `${slot.main} ${slot.sub}`}
                </span>
              ),
              parent && (
                <>
                  <CornerDownRight strokeWidth={1.75} />
                  <span className="max-w-[16em] truncate">{parent.title}</span>
                </>
              ),
              children.length > 0 && (
                <>
                  <ListTree strokeWidth={1.75} />
                  {children.filter(c => c.isCompleted).length}/{children.length}
                </>
              ),
              entry.noteLinks.length > 0 && (
                <>
                  <Link2 strokeWidth={1.75} />
                  {entry.noteLinks.length}
                </>
              ),
              !checked && entry.remindBefore != null && entry.type !== "normal" && !recurring && (
                <>
                  <Bell strokeWidth={1.75} />
                  {remindText(entry.remindBefore).replace("提前 ", "")}
                </>
              ),
              streak > 0 && (
                <>
                  <Flame strokeWidth={1.75} />
                  连续 {streak}
                </>
              ),
            ]}
          />
        </span>
        <span className="flex items-center gap-2.5">
          {group && (
            <span className="text-ink-2 flex items-center gap-1.5 whitespace-nowrap text-[11.5px]">
              <GroupDot color={group.color} className="size-[7px] rounded-[2.5px]" />
              {group.title}
            </span>
          )}
          <TypeIcon type={entry.type} />
        </span>
      </div>
    </ContextMenu>
  );
}

function Meta({ items }: { items: ReactNode[] }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <span className="text-ink-3 flex items-center gap-2.5 text-[11.5px] tabular-nums">
      {shown.map((node, i) => (
        <span key={i} className="inline-flex items-center gap-[3px] [&_svg]:size-[11px]">
          {node}
        </span>
      ))}
    </span>
  );
}

interface SlotInfo {
  main: string;
  sub: string;
  tone: "overdue" | "now" | null;
}

/** 时间槽：一眼读出节奏——截止显示时刻 + 截止、计划显示开始 + 至、周期显示打卡；无日期为 null */
function slotOf(
  entry: TodoEntry,
  bucket: BucketKey | undefined,
  mode: AgendaMode,
  now: number
): SlotInfo | null {
  const far = mode === "group" || bucket === "week" || bucket === "later";
  let main: string;
  let sub: string;
  let tone: SlotInfo["tone"] = null;

  if (entry.type === "deadline" && entry.dueAt != null) {
    const dateOnly = isDateOnly(entry.dueAt);
    if (bucket === "overdue" || (mode === "group" && isOverdue(entry, now))) {
      main = monthDay(entry.dueAt);
      sub = `逾期 ${-dayDiff(entry.dueAt, now)} 天`;
      tone = "overdue";
    } else if (far) {
      main = dayWord(entry.dueAt, now);
      sub = dateOnly ? "截止" : `${hm(entry.dueAt)} 截止`;
    } else {
      main = dateOnly ? "全天" : hm(entry.dueAt);
      sub = "截止";
      if (bucket === "today") tone = "now";
    }
  } else if (entry.type === "planned" && (entry.startAt ?? entry.dueAt) != null) {
    const start = entry.startAt ?? entry.dueAt!;
    const end = entry.dueAt ?? start;
    if (bucket === "overdue") {
      main = monthDay(end);
      sub = `逾期 ${-dayDiff(end, now)} 天`;
      tone = "overdue";
    } else if (far) {
      main = dayWord(start, now);
      sub = `${hm(start)} 开始`;
    } else {
      const running = isRunning(entry, now);
      main = running && dayDiff(start, now) < 0 ? "进行中" : hm(start);
      sub = startOfDay(start) === startOfDay(end) ? `至 ${hm(end)}` : `至${dayWord(end, now)}`;
      if (running) tone = "now";
    }
  } else if (entry.type === "recurring" && entry.recurrence) {
    if (mode === "group") {
      main = "周期";
      sub = recurrenceText(entry.recurrence);
    } else {
      const next = nextOccurrence(entry.recurrence, now);
      main =
        bucket === "today" || bucket === "tomorrow" || next == null ? "全天" : dayWord(next, now);
      sub = "打卡";
    }
  } else {
    return null;
  }
  return { main, sub, tone };
}

function Slot({ slot, checked }: { slot: SlotInfo | null; checked: boolean }) {
  if (!slot) return <span />;
  const { main, sub, tone } = slot;
  return (
    <span className="flex min-w-0 flex-col leading-[1.25]">
      <b
        className={cn(
          "truncate text-[12.5px] font-medium tabular-nums",
          checked ? "text-ink-3" : "text-ink-1",
          !checked && tone === "overdue" && "text-danger",
          !checked && tone === "now" && "text-accent-text"
        )}
      >
        {main}
      </b>
      <span className="text-ink-3 truncate text-[10.5px]">{sub}</span>
    </span>
  );
}
