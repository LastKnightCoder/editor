/**
 * 今日页重建：结构与类名摘自 apps/desktop/src/features/home/views/HomeView.tsx（hero / 今天 / 继续），
 * Panel 系列直接用 @tau/ui 真实组件；数据为演示数据（缺省是场景片的）。
 * 主片「汇进今日」：hero 的数字由调用方逐个推进；addedEvent / addedRecent 是新汇进来的一行（appear 0→1），
 * glow 是某块刚收到东西时的 accent 光圈。
 */
import clsx from "clsx";
import { ChevronRight, Link2, Sparkles } from "lucide-react";
import { Panel, PanelAction, PanelNote, PanelTitle } from "@tau/ui";
import { demoToday } from "../../mock/day";

const KIND_LABEL = { card: "卡片", article: "文章", diary: "日记", project: "项目" } as const;
const KIND_TONE = {
  card: "bg-accent-soft text-accent-text",
  article: "bg-tag-1-soft text-tag-1",
  diary: "bg-tag-4-soft text-tag-4",
  project: "bg-tag-2-soft text-tag-2",
} as const;

const ROW = "rounded-tau-sm w-full text-left";

type TodayData = Omit<typeof demoToday, "recent" | "focus" | "words"> & {
  focus: string;
  words: number;
  recent: readonly { kind: keyof typeof KIND_LABEL; title: string; meta: string }[];
  /** 今天的番茄个数（hero「· N 番茄」，0 不显示） */
  pomos?: number;
};
type GlowKey = "hero" | "todos" | "events" | "recent";

export function TodayPage({
  greeting = "早上好",
  doneTodos = 0,
  highlightPanel,
  data = demoToday,
  addedEvent,
  addedRecent,
  glow = {},
}: {
  greeting?: string;
  /** 已勾掉的待办条数（动画驱动） */
  doneTodos?: number;
  highlightPanel?: "review" | "todos" | "events";
  data?: TodayData;
  addedEvent?: { time: string; title: string; appear: number };
  addedRecent?: { kind: keyof typeof KIND_LABEL; title: string; meta: string; appear: number };
  glow?: Partial<Record<GlowKey, number>>;
}) {
  const ring = (key: string) => (highlightPanel === key ? "ring-accent/50 ring-2 ring-offset-0 transition-none" : undefined);
  const glowStyle = (key: GlowKey) => {
    const g = glow[key] ?? 0;
    return g > 0 ? { boxShadow: `0 0 0 ${2 * g}px color-mix(in srgb, var(--tau-accent) ${Math.round(45 * g)}%, transparent)` } : undefined;
  };
  const events = [...data.events.map(e => ({ ...e, appear: 1 })), ...(addedEvent && addedEvent.appear > 0 ? [addedEvent] : [])];
  const recent = [...(addedRecent && addedRecent.appear > 0 ? [addedRecent] : []), ...data.recent.map(r => ({ ...r, appear: 1 }))];
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="mt-6 mb-2 flex flex-none items-baseline gap-4 px-8">
          <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">{greeting}</h1>
          <span className="text-tau-sm text-ink-2 shrink-0 whitespace-nowrap">{data.dateText}</span>
          <span className="text-tau-sm text-ink-2 rounded-tau-sm ml-auto flex min-w-0 items-baseline gap-2 truncate whitespace-nowrap tabular-nums" style={glowStyle("hero")}>
            <span>
              已专注 <b className="text-accent-text font-semibold">{data.focus}</b>
              {!!data.pomos && (
                <>
                  <span className="text-ink-3 mx-2">·</span>
                  <b className="text-accent-text font-semibold">{data.pomos}</b> 番茄
                </>
              )}
            </span>
            <span className="text-ink-3 mx-2">·</span>写下 <b className="text-accent-text font-semibold">{data.words.toLocaleString("en-US")}</b> 字<span className="text-ink-3 mx-2">·</span>新建{" "}
            <b className="text-accent-text font-semibold">{data.created}</b> 条<span className="text-ink-3 mx-2">·</span>连续活跃 <b className="text-accent-text font-semibold">{data.streak}</b> 天
          </span>
        </header>

        <div className="mb-4 flex min-h-0 flex-1 flex-col gap-3 pr-[26px] pb-2 pl-8">
          <SectionHeading title="今天" className="pt-1" />
          <div className="grid grid-cols-3 gap-3">
            <Panel variant="outline" pad="compact" className={ring("review")}>
              <PanelTitle className="mb-2.5">
                复习
                <PanelNote>
                  {data.decks.reduce((n, d) => n + d.due, 0)} 张到期 · {data.decks.length} 个卡组
                </PanelNote>
                <PanelAction>
                  前往复习
                  <ChevronRight size={13} strokeWidth={1.75} />
                </PanelAction>
              </PanelTitle>
              {data.decks.map(deck => {
                const mastered = deck.total - deck.due - deck.learning - deck.fresh;
                const pct = (n: number) => `${(n / deck.total) * 100}%`;
                return (
                  <div key={deck.name} className={clsx(ROW, "flex items-center gap-2.5 px-2 py-[5px]")}>
                    <span className="text-tau-meta w-[108px] truncate font-medium">{deck.name}</span>
                    <span className="bg-sunken flex h-[7px] flex-1 overflow-hidden rounded">
                      <i className="bg-warn" style={{ width: pct(deck.due) }} />
                      <i className="bg-accent opacity-80" style={{ width: pct(deck.learning) }} />
                      <i className="bg-ok opacity-55" style={{ width: pct(mastered) }} />
                    </span>
                    <span className="text-tau-tiny text-ink-2 whitespace-nowrap tabular-nums">
                      <b className="text-accent-text">{deck.due}</b>/{deck.total}
                    </span>
                  </div>
                );
              })}
            </Panel>

            <Panel variant="outline" pad="compact" className={ring("todos")} style={glowStyle("todos")}>
              <PanelTitle className="mb-2.5">
                待办
                <PanelNote>{data.todos.length - doneTodos} 项未完成</PanelNote>
                <PanelAction>
                  前往待办
                  <ChevronRight size={13} strokeWidth={1.75} />
                </PanelAction>
              </PanelTitle>
              {data.todos.map((todo, i) => {
                const done = i < doneTodos;
                return (
                  <div key={todo.title} className={clsx(ROW, "group flex items-center gap-2.5 px-2 py-[7px]")}>
                    <span className={clsx("grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]", done ? "border-accent bg-accent" : "border-ink-3")}>
                      {done && (
                        <svg viewBox="0 0 10 10" className="size-2.5 text-white">
                          <path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={clsx("text-tau-meta min-w-0 flex-1 truncate font-medium", done && "text-ink-3 line-through")}>{todo.title}</span>
                    {todo.due && <small className="text-ink-3 shrink-0 text-[10.5px] whitespace-nowrap">{todo.due}</small>}
                  </div>
                );
              })}
            </Panel>

            <Panel variant="outline" pad="compact" className={ring("events")} style={glowStyle("events")}>
              <PanelTitle className="mb-2.5">
                日程
                <PanelNote>今天 {events.length} 项</PanelNote>
                <PanelAction>
                  前往日程
                  <ChevronRight size={13} strokeWidth={1.75} />
                </PanelAction>
              </PanelTitle>
              <div className="before:bg-sunken relative pl-3.5 before:absolute before:top-2.5 before:bottom-2.5 before:left-[3.5px] before:w-[1.5px] before:rounded-[1px] before:content-['']">
                {events.map(event => (
                  <div
                    key={event.time + event.title}
                    className={clsx(ROW, "relative flex items-baseline gap-2.5 px-1.5 py-[4.5px]")}
                    style={event.appear < 1 ? { opacity: event.appear, background: `color-mix(in srgb, var(--tau-accent-soft) ${Math.round((1 - event.appear) * 100)}%, transparent)` } : undefined}
                  >
                    <span className="font-tau-mono text-tau-micro text-ink-3 min-w-10 shrink-0">{event.time}</span>
                    <span className="text-tau-meta truncate">{event.title}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <SectionHeading title="继续" className="pt-3" />
          <Panel variant="outline" pad="compact">
            <PanelTitle className="mb-1.5">
              <Sparkles className="text-accent size-3.5" strokeWidth={1.75} />
              洞见
              <PanelNote>1 条新发现</PanelNote>
            </PanelTitle>
            <div className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-2 py-2">
              <span className="rounded-tau-sm bg-info-soft text-info grid size-[30px] place-items-center">
                <Link2 className="size-[15px]" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2.5">
                  <p className="text-ink-1 min-w-0 flex-1 text-[14px] leading-[1.65] font-medium">
                    {data.insight.before}
                    <em className="bg-[linear-gradient(var(--tau-info),var(--tau-info))] bg-[length:100%_2px] bg-bottom bg-no-repeat not-italic">{data.insight.em}</em>
                    {data.insight.after}
                  </p>
                  <span className="text-tau-micro text-info shrink-0 font-medium">可以连起来</span>
                  <span className="text-tau-micro text-ink-3 shrink-0 tabular-nums">知识地图 · 今天</span>
                </div>
                <p className="text-tau-meta text-ink-2 mt-0.5 leading-[1.65]">{data.insight.desc}</p>
              </div>
            </div>
          </Panel>
          <Panel variant="outline" pad="compact" style={glowStyle("recent")}>
            <PanelTitle className="mb-2.5">
              最近编辑
              <PanelNote>卡片 · 文章 · 日记 · 项目</PanelNote>
            </PanelTitle>
            <div className="grid grid-cols-3 gap-x-6 gap-y-0">
              {recent.map(item => (
                <div
                  key={item.title}
                  className="rounded-tau-sm grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-[11px] text-left"
                  style={item.appear < 1 ? { opacity: item.appear, background: `color-mix(in srgb, var(--tau-accent-soft) ${Math.round((1 - item.appear) * 100)}%, transparent)` } : undefined}
                >
                  <span className={clsx("justify-self-start rounded-[5px] px-[7px] py-px text-[10.5px] font-medium", KIND_TONE[item.kind])}>{KIND_LABEL[item.kind]}</span>
                  <span className="text-tau-meta truncate font-medium">{item.title}</span>
                  <span className="text-ink-3 justify-self-end truncate text-[10.5px]">{item.meta}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, className }: { title: string; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <h2 className="text-tau-micro text-ink-3 m-0 font-medium tracking-[0.12em]">{title}</h2>
      <span className="bg-line-1 h-px flex-1" />
    </div>
  );
}
