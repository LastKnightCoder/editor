/**
 * 数据库详情（书单）重建：外壳摘自 features/shared/database/DatabaseWorkspace.tsx，视图摘自 packages/database
 *（ViewTabs / TableView / KanbanView / GalleryView / CalendarView），标签配色同 @tau/ui Tag。
 * 桌面端切视图没有过渡动画，这里也直接切换。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowDownUp,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleChevronDown,
  Filter,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  SquareKanban,
  Star,
  Table2,
  TrendingUp,
  Type,
  type LucideIcon,
} from "lucide-react";
import { COVER_GRADIENTS } from "../cover";
import { BOOKS, type Book, type BookStatus } from "../../mock/deepwork";

export type DatabaseView = "table" | "kanban" | "gallery" | "calendar";

const VIEWS: { key: DatabaseView; name: string; icon: LucideIcon }[] = [
  { key: "table", name: "表格", icon: Table2 },
  { key: "kanban", name: "看板", icon: SquareKanban },
  { key: "gallery", name: "画廊", icon: LayoutGrid },
  { key: "calendar", name: "日历", icon: CalendarDays },
];

/** 单选选项配色（Tag 的 orange / green / blue） */
const STATUS_TONE: Record<BookStatus, { shell: string; dot: string }> = {
  在读: { shell: "bg-accent-soft text-accent-text", dot: "bg-accent" },
  读完: { shell: "bg-ok-soft text-ok", dot: "bg-ok" },
  想读: { shell: "bg-info-soft text-info", dot: "bg-info" },
};

/** 画廊封面渐变：同 utils/cover 的 coverGradientOfKey，按行序错色 */
const coverOf = (index: number) => COVER_GRADIENTS[(index * 7 + 3) % 12];

export function DatabasePage({ view }: { view: DatabaseView }) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] min-w-0 flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mt-5 flex h-10 flex-none items-center gap-2 pr-7 pl-8">
          <span className="text-tau-title-lg min-w-0 flex-1 truncate font-semibold tracking-[-0.01em]">书单</span>
          <span className="text-ink-2 grid size-8 shrink-0 place-items-center rounded-[8px]">
            <ChevronDown className="size-4" strokeWidth={1.75} />
          </span>
        </div>
        <ViewTabs view={view} />
        <div className="min-h-0 w-full flex-1">
          {view === "table" && <TableView />}
          {view === "kanban" && <KanbanView />}
          {view === "gallery" && <GalleryView />}
          {view === "calendar" && <CalendarView />}
        </div>
      </div>
    </div>
  );
}

function ViewTabs({ view }: { view: DatabaseView }) {
  return (
    <div className="border-line-1 flex h-[46px] items-center gap-2 border-b pr-7 pl-8">
      <div className="flex h-full items-center gap-5">
        {VIEWS.map(v => {
          const active = v.key === view;
          return (
            <span key={v.key} className={clsx("relative inline-flex h-full shrink-0 items-center gap-1.5", active ? "text-ink-1 font-medium" : "text-ink-3")}>
              <v.icon className="size-[14px] shrink-0 opacity-80" strokeWidth={1.75} />
              <span className="text-tau-body flex h-7 items-center">{v.name}</span>
              {active && <span className="bg-ink-1 absolute inset-x-0 -bottom-px h-0.5 rounded-full" />}
            </span>
          );
        })}
        <span className="text-ink-3 -ml-2 grid size-6 shrink-0 place-items-center rounded-[6px]">
          <Plus className="size-4" strokeWidth={1.75} />
        </span>
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <span className="text-ink-3 grid size-7 place-items-center rounded-[8px]">
          <Search className="size-[15px]" strokeWidth={1.75} />
        </span>
        <Pill icon={Filter} label="筛选" />
        <Pill icon={ArrowDownUp} label="排序" />
        <Pill icon={Layers} label="分组" />
      </div>
    </div>
  );
}

function Pill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="text-ink-3 flex h-7 items-center gap-1.5 rounded-[8px] px-2.5">
      <Icon className="size-[13px]" strokeWidth={1.75} />
      <span className="text-tau-meta">{label}</span>
    </span>
  );
}

export function StatusTag({ status }: { status: BookStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={clsx("text-tau-sm inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full px-[9px] leading-none", tone.shell)}>
      <span className={clsx("size-1.5 shrink-0 rounded-full", tone.dot)} />
      <span className="truncate">{status}</span>
    </span>
  );
}

function ProgressCell({ value }: { value: number }) {
  return (
    <div className="flex h-full w-full items-center gap-2 px-2 py-1">
      <div className="bg-track h-2 w-full overflow-hidden rounded-full">
        <div className="bg-accent h-full rounded-full" style={{ width: `${value}%` }} />
      </div>
      <div className="font-tau-mono text-ink-2 text-tau-sm tabular-nums">{value}/100</div>
    </div>
  );
}

/** 评分：Material 星形，满星实心、未满描边，同为 warn 色（StarPlugin，size 18） */
const STAR_FULL = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";
const STAR_BORDER =
  "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z";

function Stars({ value }: { value: number }) {
  return (
    <span className="text-warn flex items-center">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
          <path d={i < value ? STAR_FULL : STAR_BORDER} />
        </svg>
      ))}
    </span>
  );
}

const finishedText = (book: Book) => (book.finished ? `10月${book.finished}日` : "");

const COLUMNS: { title: string; icon: LucideIcon; width: number; render: (book: Book) => ReactNode; summary?: [string, string] }[] = [
  {
    title: "书名",
    icon: Type,
    width: 220,
    render: book => (
      <div className="text-ink-1 text-tau-body relative flex h-full w-full items-center px-2 py-2">
        {book.title}
        <span className="bg-surface-hover text-ink-2 rounded-tau-sm absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-1 px-1.5 py-1">
          <PanelRight className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
    ),
    summary: ["计数", "6"],
  },
  { title: "作者", icon: Type, width: 190, render: book => <div className="text-ink-1 text-tau-body flex h-full items-center px-2">{book.author}</div> },
  {
    title: "状态",
    icon: CircleChevronDown,
    width: 130,
    render: book => (
      <div className="flex h-full items-center px-2">
        <StatusTag status={book.status} />
      </div>
    ),
  },
  { title: "进度", icon: TrendingUp, width: 210, render: book => <ProgressCell value={book.progress} />, summary: ["平均", "50%"] },
  { title: "评分", icon: Star, width: 150, render: book => <div className="flex h-full items-center px-2">{book.rating > 0 && <Stars value={book.rating} />}</div>, summary: ["平均", "4.5"] },
  {
    title: "读完日期",
    icon: CalendarDays,
    width: 150,
    render: book => <div className="text-tau-body text-ink-3 flex h-full items-center px-2 tabular-nums">{finishedText(book)}</div>,
    summary: ["非空", "2"],
  },
];

function TableView() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-line-1 bg-surface flex w-full border-b">
        <div className="border-line-2 h-10 w-[50px] min-w-[50px] border-r" />
        {COLUMNS.map(c => (
          <div key={c.title} className="border-line-2 relative h-10 border-r" style={{ width: c.width }}>
            <div className="flex h-full items-center px-2 py-2">
              <div className="flex h-full flex-1 items-center overflow-hidden font-medium whitespace-nowrap">
                <span className="text-ink-2 mr-1.5 inline-flex items-center justify-center">
                  <c.icon className="size-[14px]" strokeWidth={1.75} />
                </span>
                <span className="text-tau-sm text-ink-2 flex h-full items-center truncate">{c.title}</span>
              </div>
              <MoreHorizontal className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
            </div>
          </div>
        ))}
        <div className="flex w-[40px] min-w-[40px] items-center justify-center">
          <span className="text-ink-3 grid h-6 w-6 place-items-center rounded-full">
            <Plus className="size-4" strokeWidth={1.75} />
          </span>
        </div>
      </div>
      {BOOKS.map((book, i) => (
        <div key={book.title} className="border-line-2 flex h-10 w-full border-b">
          <div className="border-line-2 flex w-[50px] min-w-[50px] items-center justify-center border-r">
            <span className="text-ink-3 text-tau-sm tabular-nums">{i + 1}</span>
          </div>
          {COLUMNS.map(c => (
            <div key={c.title} className="border-line-2 relative h-10 overflow-hidden border-r" style={{ width: c.width }}>
              {c.render(book)}
            </div>
          ))}
        </div>
      ))}
      <div className="border-line-1 bg-surface flex w-full border-t">
        <div className="border-line-2 h-9 w-[50px] min-w-[50px] border-r" />
        {COLUMNS.map(c => (
          <div key={c.title} className="border-line-2 flex h-9 items-center border-r px-1" style={{ width: c.width }}>
            {c.summary && (
              <span className="text-tau-sm flex h-7 w-full items-center justify-end px-2">
                <span className="flex min-w-0 items-baseline justify-end gap-1.5">
                  <span className="text-ink-3 text-tau-tiny shrink-0">{c.summary[0]}</span>
                  <span className="text-ink-1 truncate tabular-nums">{c.summary[1]}</span>
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex h-12 items-center gap-[10px]">
        <span className="text-ink-2 rounded-tau-sm text-tau-sm flex items-center gap-1.5 p-2">
          <Plus className="size-[14px]" strokeWidth={1.75} />
          添加行
        </span>
      </div>
    </div>
  );
}

const KANBAN_ORDER: BookStatus[] = ["想读", "在读", "读完"];

function KanbanView() {
  return (
    <div className="flex h-full w-max gap-2 px-2 pt-3 pb-2">
      {KANBAN_ORDER.map(status => {
        const rows = BOOKS.filter(b => b.status === status);
        return (
          <div key={status} className="flex h-full shrink-0 flex-col px-2" style={{ width: 308 }}>
            <div className="mb-1 flex items-center justify-between px-2 py-2">
              <div className="text-ink-1 flex items-center gap-2 font-medium">
                <StatusTag status={status} />
              </div>
              <span className="text-ink-3 text-tau-sm px-1 tabular-nums">{rows.length}</span>
            </div>
            <div className="px-1">
              {rows.map(book => (
                <div key={book.title} className="pt-2">
                  <div className="bg-surface border-line-1 shadow-card rounded-tau-md relative border p-3">
                    <div className="space-y-2">
                      <div className="text-ink-1 text-tau-body px-2 py-2 font-medium">{book.title}</div>
                      <div className="border-line-2 space-y-1.5 border-t pt-2">
                        <div className="flex items-start gap-2">
                          <div className="min-h-5 min-w-0 flex-1">
                            <div className="text-ink-2 text-tau-body px-2">{book.author}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="min-h-5 min-w-0 flex-1">
                            <ProgressCell value={book.progress} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2">
              <div className="text-ink-3 rounded-tau-md flex h-9 items-center justify-center gap-1.5">
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span className="text-tau-sm">添加卡片</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GalleryView() {
  return (
    <div className="p-6">
      <div className="mb-4 grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {BOOKS.map((book, i) => (
          <div key={book.title} className="bg-surface border-line-1 rounded-tau-md relative flex h-[240px] flex-col overflow-hidden border">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-0" style={{ backgroundImage: coverOf(i) }} />
            </div>
            <div className="border-line-2 bg-surface flex h-[60px] items-center border-t px-4 py-3">
              <span className="text-ink-1 text-tau-body-lg w-full truncate font-medium">{book.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 2026 年 10 月：1 日是周四，周一开头；本月之外的格子只画边线 */
const MONTH = { year: 2026, month: 10, firstWeekday: 3, days: 31, today: 18 };
const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

function CalendarView() {
  const cells: (number | null)[] = [...Array.from({ length: MONTH.firstWeekday }, () => null), ...Array.from({ length: MONTH.days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = cells.length / 7;
  const events = BOOKS.filter(b => b.finished).map(b => ({ day: b.finished!, title: b.title }));
  return (
    <div className="flex h-full flex-col">
      <div className="border-line-2 flex items-center justify-between border-b py-2.5 pr-7 pl-8">
        <div className="flex items-center gap-1">
          <span className="text-ink-2 grid size-7 place-items-center rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </span>
          <span className="text-ink-2 grid size-7 place-items-center rounded-full">
            <ChevronRight className="h-4 w-4" />
          </span>
          <span className="text-tau-meta border-line-1 bg-surface text-ink-1 ml-1 inline-flex h-[28px] items-center rounded-[10px] border px-[13px] font-[550]">今天</span>
        </div>
        <h2 className="text-ink-1 text-tau-title-lg font-semibold">
          {MONTH.year}年{MONTH.month}月
        </h2>
        <div className="w-32" />
      </div>
      <div className="border-line-2 grid grid-cols-7 border-b">
        {WEEK.map((w, i) => (
          <div key={w} className={clsx("border-line-2 text-ink-2 text-tau-sm py-3 text-center font-medium", i < 6 && "border-r")}>
            {w}
          </div>
        ))}
      </div>
      <div className="relative grid flex-1 grid-cols-7 overflow-hidden" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {cells.map((day, i) => {
          const event = events.find(e => e.day === day);
          return (
            <div key={i} className={clsx("border-line-2 relative flex flex-col p-2", i % 7 < 6 && "border-r", i < cells.length - 7 && "border-b")}>
              {day && (
                <div className="mb-1 flex justify-end">
                  <span
                    className={clsx("text-tau-sm flex h-7 w-7 items-center justify-center rounded-full tabular-nums", day === MONTH.today ? "bg-accent text-ink-inverse font-semibold" : "text-ink-1")}
                  >
                    {day}
                  </span>
                </div>
              )}
              {event && (
                <div
                  className="text-ink-inverse absolute flex items-center shadow-sm"
                  style={{ left: 4, right: 4, top: 40, height: 18, paddingLeft: 6, paddingRight: 6, fontSize: 11, borderRadius: 4, backgroundColor: "var(--tau-accent)" }}
                >
                  <div className="truncate font-medium">{event.title}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
