/**
 * 今日：问候与今天的数字，下面是复习、待办、日程、最近编辑与今日漫步面板。
 * 点一行看它会带你去哪里；翻漫步牌堆；点「调整首页」进入编辑，隐藏或恢复面板。
 * 结构按 features/home 的 HomeView、HomePanels、TodayPanels、RecentEditsPanel 与 WalkDeckPanel 重建。
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarHeart,
  ChevronRight,
  Clock3,
  EyeOff,
  Footprints,
  GripVertical,
  LayoutDashboard,
  Plus,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { Button, Panel, PanelAction, PanelNote, PanelTitle, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type PanelKey = "review" | "todos" | "schedule" | "recent" | "walk";

const PANEL_LABEL: Record<PanelKey, string> = {
  review: "复习",
  todos: "待办",
  schedule: "日程",
  recent: "最近编辑",
  walk: "今日漫步",
};

const WIDE: PanelKey[] = ["recent", "walk"];
const DEFAULT_ORDER: PanelKey[] = ["review", "todos", "schedule", "recent", "walk"];

const ROW = "rounded-tau-sm ease-tau-out hover:bg-hover transition-[background] duration-[160ms]";

type Go = (where: string) => void;

function ReviewPanel({ go }: { go: Go }) {
  const decks = [
    { name: "操作系统", due: 8, learning: 12, mastered: 30, total: 50 },
    { name: "英语词汇", due: 4, learning: 20, mastered: 96, total: 120 },
  ];
  return (
    <>
      <PanelTitle className="mb-2.5">
        复习 <PanelNote>12 张到期 · 2 个卡组</PanelNote>
        <PanelAction onClick={() => go("闪卡复习")}>
          前往复习 <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {decks.map(deck => (
        <button
          key={deck.name}
          type="button"
          onClick={() => go(`闪卡复习 · ${deck.name}`)}
          className={cn(ROW, "flex w-full items-center gap-2.5 px-2 py-[5px]")}
        >
          <span className="text-tau-meta w-[80px] truncate text-left font-medium">{deck.name}</span>
          <span className="bg-sunken flex h-[7px] flex-1 overflow-hidden rounded">
            <i className="bg-warn" style={{ width: `${(deck.due / deck.total) * 100}%` }} />
            <i
              className="bg-accent opacity-80"
              style={{ width: `${(deck.learning / deck.total) * 100}%` }}
            />
            <i
              className="bg-ok opacity-55"
              style={{ width: `${(deck.mastered / deck.total) * 100}%` }}
            />
          </span>
          <span className="text-tau-tiny text-ink-2 whitespace-nowrap tabular-nums">
            <b className="text-accent-text">{deck.due}</b>/{deck.total}
          </span>
        </button>
      ))}
    </>
  );
}

function TodosPanel({ go }: { go: Go }) {
  const todos = [
    { title: "回复出版社的样章意见", time: "逾期 · 昨天", overdue: true },
    { title: "整理《深度工作》读书卡片", time: "今天 15:00" },
    { title: "晨读 30 分钟", time: "每天" },
  ];
  return (
    <>
      <PanelTitle className="mb-2.5">
        待办 <PanelNote>5 项未完成</PanelNote>
        <PanelAction onClick={() => go("待办")}>
          前往待办 <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {todos.map(todo => (
        <button
          key={todo.title}
          type="button"
          onClick={() => go(`待办 · 「${todo.title}」的详情`)}
          className={cn(ROW, "group flex w-full items-center gap-2.5 px-2 py-[7px] text-left")}
        >
          <span
            className={cn(
              "border-ink-3 group-hover:border-accent size-4 shrink-0 rounded-full border-[1.5px] transition-[border-color] duration-[160ms]",
              todo.overdue && "border-danger"
            )}
          />
          <span className="text-tau-meta min-w-0 flex-1 truncate font-medium">{todo.title}</span>
          <small
            className={cn(
              "shrink-0 text-[10.5px] whitespace-nowrap",
              todo.overdue ? "text-danger" : "text-ink-3"
            )}
          >
            {todo.time}
          </small>
        </button>
      ))}
    </>
  );
}

function SchedulePanel({ go }: { go: Go }) {
  const events = [
    { time: "10:00", title: "选题评审" },
    { time: "14:30", title: "和编辑通电话" },
    { time: "19:30", title: "读书会" },
  ];
  return (
    <>
      <PanelTitle className="mb-2.5">
        日程 <PanelNote>今天 3 项</PanelNote>
        <PanelAction onClick={() => go("日程")}>
          前往日程 <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      <div className="before:bg-sunken relative pl-3.5 before:absolute before:top-2.5 before:bottom-2.5 before:left-[3.5px] before:w-[1.5px] before:rounded-[1px] before:content-['']">
        {events.map(event => (
          <button
            key={event.time}
            type="button"
            onClick={() => go(`日程 · 「${event.title}」`)}
            className={cn(ROW, "flex w-full items-baseline gap-2.5 px-1.5 py-[4.5px] text-left")}
          >
            <span className="font-tau-mono text-tau-micro text-ink-3 min-w-10 shrink-0">
              {event.time}
            </span>
            <span className="text-tau-meta truncate">{event.title}</span>
          </button>
        ))}
      </div>
    </>
  );
}

const KIND_TONE = {
  卡片: "bg-accent-soft text-accent-text",
  文章: "bg-tag-1-soft text-tag-1",
  日记: "bg-tag-4-soft text-tag-4",
  项目: "bg-tag-2-soft text-tag-2",
} as const;

function RecentPanel({ go }: { go: Go }) {
  const items: { kind: keyof typeof KIND_TONE; title: string; meta: string }[] = [
    { kind: "卡片", title: "专注不是性格，是能力", meta: "今天 · 42 字" },
    { kind: "文章", title: "Deep Work 读书笔记", meta: "今天 · 3,260 字" },
    { kind: "日记", title: "日记 · 2026-10-26", meta: "今天 · 86 字" },
    { kind: "项目", title: "学习方法 / 主动回忆", meta: "昨天 · 1,120 字" },
    { kind: "卡片", title: "间隔重复的关键是间隔", meta: "昨天 · 38 字" },
    {
      kind: "文章",
      title: "我的第一次读书会复盘",
      meta: "3 天前 · 2,048 字",
    },
  ];
  return (
    <>
      <PanelTitle className="mb-2.5">
        最近编辑 <PanelNote>卡片 · 文章 · 日记 · 项目</PanelNote>
      </PanelTitle>
      <div className="grid grid-cols-3 gap-x-6 max-md:grid-cols-2 max-sm:grid-cols-1">
        {items.map(item => (
          <button
            key={item.title}
            type="button"
            onClick={() => go(`${item.kind} · 「${item.title}」`)}
            className={cn(
              ROW,
              "grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-[11px] text-left"
            )}
          >
            <span
              className={cn(
                "justify-self-start rounded-[5px] px-[7px] py-px text-[10.5px] font-medium",
                KIND_TONE[item.kind]
              )}
            >
              {item.kind}
            </span>
            <span className="text-tau-meta truncate font-medium">{item.title}</span>
            <span className="text-ink-3 justify-self-end truncate text-[10.5px]">{item.meta}</span>
          </button>
        ))}
      </div>
    </>
  );
}

const DECK: {
  title: string;
  text: string;
  why: string;
  whyIcon: LucideIcon;
  date: string;
}[] = [
  {
    title: "散步时想清楚的事",
    text: "散步时想清楚的事，比坐在桌前想一下午还多。也许是因为身体在动，注意力反而松开了。",
    why: "143 天没见过它了",
    whyIcon: Clock3,
    date: "2026-06-05",
  },
  {
    title: "费曼技巧",
    text: "如果你没法用简单的话讲给外行听，说明你还没真懂。试着把今天读的讲给朋友听。",
    why: "那年今日 · 1 年前的今天",
    whyIcon: CalendarHeart,
    date: "2025-10-26",
  },
  {
    title: "浅层工作的代价",
    text: "回复消息带来的满足感，是一种虚假的生产力。它让人忙碌，却没有留下任何东西。",
    why: "62 天没见过它了",
    whyIcon: Clock3,
    date: "2026-08-25",
  },
];

function WalkPanel({ go }: { go: Go }) {
  const [cursor, setCursor] = useState(0);
  const done = cursor >= DECK.length;
  const card = DECK[cursor];
  return (
    <>
      <PanelTitle className="mb-2.5">
        <Footprints className="text-accent size-3.5" strokeWidth={1.75} />
        今日漫步
        <PanelNote className="tabular-nums">
          {done ? "已走完" : `${cursor + 1} / ${DECK.length}`}
        </PanelNote>
        <PanelAction onClick={() => go("漫步")}>
          进入漫步页 <ChevronRight size={13} strokeWidth={1.75} />
        </PanelAction>
      </PanelTitle>
      {done ? (
        <div className="border-line-2 text-ink-3 rounded-tau-lg animate-doc-in flex h-[150px] flex-col items-center justify-center gap-2 border border-dashed text-center">
          <Footprints className="size-6" strokeWidth={1.75} />
          <p className="text-tau-body text-ink-1 font-medium">今天的 {DECK.length} 张走完了</p>
          <p className="text-tau-meta text-ink-3">明天会有新的 {DECK.length} 张</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCursor(0)}>
              再抽 5 张
            </Button>
            <Button size="sm" variant="primary" onClick={() => go("漫步")}>
              去漫步页继续走
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            key={cursor}
            type="button"
            onClick={() => go(`卡片 · 「${card.title}」`)}
            className="border-line-1 bg-surface rounded-tau-lg animate-doc-in flex h-[150px] flex-col border px-4 py-3 text-left"
          >
            <span className="text-tau-micro text-ink-3 flex items-center gap-2">
              <span className="bg-accent-soft text-accent-text inline-flex h-[22px] items-center gap-1 rounded-full px-2">
                <StickyNote className="size-3.5" strokeWidth={1.75} />
                卡片
              </span>
              <span className="tabular-nums">写于 {card.date}</span>
            </span>
            <span className="text-tau-meta text-ink-2 mt-2.5 flex items-center gap-1.5">
              <card.whyIcon className="text-accent size-3.5 shrink-0" strokeWidth={1.75} />
              {card.why}
            </span>
            <span className="text-tau-body-lg text-ink-1 mt-2 line-clamp-1 font-semibold">
              {card.title}
            </span>
            <span className="text-tau-body text-ink-2 mt-1 line-clamp-2">{card.text}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" icon={Footprints} onClick={() => go("漫步")}>
              从这里继续走
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={EyeOff}
              onClick={() => setCursor(value => value + 1)}
            >
              别再出现
            </Button>
            <span className="flex-1" />
            <Button size="sm" variant="primary" onClick={() => setCursor(value => value + 1)}>
              {cursor === DECK.length - 1 ? "完成" : "下一张"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

const PANEL_BODY: Record<PanelKey, (props: { go: Go }) => ReactNode> = {
  review: ReviewPanel,
  todos: TodosPanel,
  schedule: SchedulePanel,
  recent: RecentPanel,
  walk: WalkPanel,
};

const CHROME_BUTTON =
  "text-ink-2 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[7px]";

export default function TodayDemo() {
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState<PanelKey[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const shown = DEFAULT_ORDER.filter(key => !hidden.includes(key));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const go: Go = where => setToast(`将打开：${where}`);

  return (
    <AppWindow active="home" crumb="今日" height={500} paper={false}>
      <div className="bg-surface shadow-card rounded-tau-lg relative flex h-full flex-col overflow-hidden">
        <header className="mt-5 mb-2 flex flex-none items-baseline gap-4 px-6 max-sm:flex-wrap max-sm:px-4">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em] whitespace-nowrap">
            下午好
          </h3>
          <span className="text-tau-sm text-ink-2 whitespace-nowrap">10月26日星期一</span>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {editing ? (
              <>
                <span className="text-tau-meta text-ink-3 min-w-0 truncate max-md:hidden">
                  点面板右上角的隐藏，或从下方「已隐藏」恢复 · Esc 取消
                </span>
                <Button size="sm" variant="ghost" className="-my-1" onClick={() => setHidden([])}>
                  恢复默认
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  className="-my-1"
                  onClick={() => setEditing(false)}
                >
                  完成
                </Button>
              </>
            ) : (
              <>
                <span className="text-tau-sm text-ink-2 min-w-0 truncate whitespace-nowrap tabular-nums max-md:hidden">
                  <button type="button" className="text-inherit" onClick={() => go("番茄专注")}>
                    已专注 <b className="text-accent-text font-semibold">1h 25m</b> · 3 番茄
                  </button>
                  <span className="text-ink-3 mx-2">·</span>写下{" "}
                  <b className="text-accent-text font-semibold">1280</b> 字
                  <span className="text-ink-3 mx-2">·</span>新建{" "}
                  <b className="text-accent-text font-semibold">4</b> 条
                  <span className="text-ink-3 mx-2">·</span>连续活跃{" "}
                  <b className="text-accent-text font-semibold">12</b> 天
                </span>
                <button
                  type="button"
                  aria-label="调整首页"
                  title="调整首页"
                  onClick={() => setEditing(true)}
                  className="text-ink-2 hover:bg-hover hover:text-ink-1 -my-1 grid size-7 shrink-0 place-items-center rounded-[8px]"
                >
                  <LayoutDashboard className="size-[15px]" strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        </header>

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-4 max-sm:px-4">
          <div className="flex flex-wrap gap-3">
            {shown.map(key => {
              const Body = PANEL_BODY[key];
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-tau-lg animate-doc-in relative flex min-w-0 flex-col",
                    WIDE.includes(key) ? "basis-full" : "min-w-[min(220px,100%)] flex-[1_1_220px]",
                    editing &&
                      "hover:shadow-lift ease-tau-out transition-[box-shadow,translate] duration-[160ms] select-none hover:-translate-y-px"
                  )}
                >
                  <Panel
                    variant="outline"
                    pad="compact"
                    inert={editing || undefined}
                    className="flex-1"
                  >
                    <Body go={go} />
                  </Panel>
                  {editing && (
                    <div className="bg-surface shadow-lift absolute top-2 right-2 flex items-center gap-0.5 rounded-[9px] p-0.5">
                      <span className={cn(CHROME_BUTTON, "cursor-grab")} title="拖动调整位置">
                        <GripVertical className="size-[15px]" strokeWidth={1.75} />
                      </span>
                      <button
                        type="button"
                        aria-label={`隐藏「${PANEL_LABEL[key]}」`}
                        title="隐藏"
                        onClick={() => setHidden(list => [...list, key])}
                        className={CHROME_BUTTON}
                      >
                        <EyeOff className="size-[15px]" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {editing && (
            <div className="border-line-2 rounded-tau-lg animate-doc-in mt-3 flex min-h-[52px] flex-wrap items-center gap-2 border-[1.5px] border-dashed px-4 py-2.5">
              <span className="text-tau-meta text-ink-3 mr-1">已隐藏</span>
              {hidden.map(key => (
                <button
                  key={key}
                  type="button"
                  title="点击恢复到末尾，或拖到想放的位置"
                  onClick={() => setHidden(list => list.filter(item => item !== key))}
                  className="border-line-1 bg-surface text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex items-center gap-1 rounded-[8px] border px-2.5 py-1"
                >
                  <Plus className="size-[13px]" strokeWidth={1.75} />
                  {PANEL_LABEL[key]}
                </button>
              ))}
              {hidden.length === 0 && (
                <span className="text-tau-meta text-ink-3">把面板拖到这里即可隐藏</span>
              )}
            </div>
          )}
        </div>

        {toast && (
          <div
            key={toast}
            className="bg-surface shadow-float text-tau-sm text-ink-1 animate-doc-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 whitespace-nowrap"
          >
            {toast}
          </div>
        )}
      </div>
    </AppWindow>
  );
}
