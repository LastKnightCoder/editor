/**
 * 今日（首页）视图 —— 行式单列流（样式 Tailwind 优先）：
 * hero 条 → 行动三卡（复习/待办/日程，内容等量）→ 继续编辑（全宽三栏）→
 * 热力图（直接复用旧 CalendarHeatmap）→ 统计四卡（sparkline）。
 *
 * 模块分工：专注 = 番茄钟（openPomodoroWindow 独立窗口 / pomodoro 命令）；
 * 日程 = calendar 命令 + schedule page。两者独立，勿混用。
 *
 * 容器查询响应式（@container 在根、@max-[…] 断点在行容器）：1400/1180/860 三档。
 */

import { useState } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { openPomodoroWindow } from "@/commands";
import { usePage } from "@/page/PageProvider";
import {
  useEdgeFade,
  EmptyNote,
  Panel,
  PanelNote,
  PanelTitle,
  PanelAction,
  Loading,
  YearHeatmap,
} from "@tau/ui";
import { useHomeSnapshot, minutesToHM } from "../queries";
import type { RecentEdit } from "../types";
import "../home.css";

const KIND_LABEL = {
  card: "卡片",
  article: "文章",
  diary: "日记",
  document: "知识库",
  project: "项目",
} as const;
const KIND_TARGET = {
  card: "cards",
  article: "articles",
  diary: "diary",
  document: "library",
  project: "projects",
} as const;

export function HomeView() {
  const { data, loading } = useHomeSnapshot();
  const { navigator } = usePage();
  // callback ref（非 useRef）：loading 早退分支下滚动容器晚于首帧挂载，
  // 经 state 触发 useEdgeFade 在挂载后重新接线
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  if (loading) {
    return <Loading />;
  }
  if (!data) return null;

  return (
    // @container：容器查询锚点；外层底部留白让滚动条避开窗口底边
    <div className="@container pt-6.5 mx-auto flex h-full max-w-[1680px] flex-col gap-3 px-[34px] pb-4">
      {/* ① hero 紧凑条（专注摘要可点击打开番茄钟） */}
      <header className="flex items-baseline gap-4">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{greeting()}</h1>
        <span className="text-tau-sm text-ink-2">{formatToday()}</span>
        <span className="text-tau-sm text-ink-2 ml-auto flex items-baseline gap-2">
          <button
            type="button"
            title="打开番茄钟"
            onClick={() => openPomodoroWindow()}
            className="text-inherit"
          >
            已专注{" "}
            <b className="text-ink-1 font-semibold">{minutesToHM(data.focus.focusMinutes)}</b>
          </button>
          <span className="text-ink-3 mx-2">·</span>写下{" "}
          <b className="text-ink-1 font-semibold">{data.todayStats.wordsWritten}</b> 字
          <span className="text-ink-3 mx-2">·</span>新建{" "}
          <b className="text-ink-1 font-semibold">
            {data.todayStats.cardsCreated + data.todayStats.articlesCreated}
          </b>{" "}
          条
        </span>
      </header>

      {/* 滚动区：hero 固定于滚动区外（渐隐带直接作用于内容，不被容器 padding 稀释），
          边缘渐隐由 useEdgeFade 驱动（.home-scroll 的 mask 渐变，见 home.css）；
          -mr/pr 借 .wide 右内边距把滚动条移进留白（内容盒右缘不动） */}
      <div
        ref={setScrollEl}
        className="home-scroll -mr-[18px] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 pr-[18px] pt-2"
      >
        {/* ②③④ 行动三卡（“前往”箭头在标题行右缘） */}
        <div className="@max-[1180px]:grid-cols-2 @max-[860px]:grid-cols-1 grid grid-cols-3 gap-3">
          <Panel pad="compact">
            <PanelTitle className="mb-2.5">
              复习
              <PanelNote>
                {data.reviewDecks.filter(d => d.dueCount > 0).length} 个牌组有到期
              </PanelNote>
              <PanelAction onClick={() => navigator.push("review")} title="前往闪卡复习">
                前往复习
                <ChevronRight size={13} strokeWidth={1.75} />
              </PanelAction>
            </PanelTitle>
            {data.reviewDecks.length > 0 ? (
              data.reviewDecks.map(deck => (
                <div
                  key={deck.id}
                  className="rounded-tau-sm ease-tau-out hover:bg-hover flex items-center gap-2.5 px-2 py-[5px] transition-[background] duration-[160ms]"
                >
                  <span className="text-tau-meta w-[108px] truncate font-medium" title={deck.name}>
                    {deck.name}
                  </span>
                  <span className="bg-sunken h-[7px] flex-1 overflow-hidden rounded">
                    <i
                      className="bg-accent block h-full rounded"
                      style={{
                        width:
                          deck.totalCards > 0
                            ? `${(deck.dueCount / deck.totalCards) * 100}%`
                            : "0%",
                      }}
                    />
                  </span>
                  <span className="text-tau-tiny text-ink-2 whitespace-nowrap">
                    <b className="text-ink-1">{deck.dueCount}</b>/{deck.totalCards}
                  </span>
                </div>
              ))
            ) : (
              <EmptyNote>还没有闪卡牌组</EmptyNote>
            )}
          </Panel>

          <Panel pad="compact">
            <PanelTitle className="mb-2.5">
              待办
              <PanelNote>{data.todoRemainingCount} 项未完成</PanelNote>
              <PanelAction onClick={() => navigator.push("todos")} title="前往待办">
                前往待办
                <ChevronRight size={13} strokeWidth={1.75} />
              </PanelAction>
            </PanelTitle>
            {data.todos.length > 0 ? (
              data.todos.map(todo => (
                <button
                  key={todo.id}
                  type="button"
                  className="rounded-tau-sm ease-tau-out hover:bg-hover group flex w-full items-center gap-2.5 px-2 py-[5px] text-left transition-[background] duration-[160ms]"
                  onClick={() => navigator.push("todos")}
                >
                  <span
                    className={clsx(
                      "border-ink-3 ease-tau-out group-hover:border-accent size-4 shrink-0 rounded-full border-[1.5px] transition-[border-color] duration-[160ms]",
                      todo.overdue && "border-danger"
                    )}
                  />
                  <span>
                    <b className="text-tau-meta block font-medium">{todo.title}</b>
                    <small
                      className={clsx("text-ink-2 text-[10.5px]", todo.overdue && "text-danger")}
                    >
                      {todo.overdue ? `逾期 · ${todo.dueText ?? ""}` : (todo.dueText ?? "待办")}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <EmptyNote>没有待办事项</EmptyNote>
            )}
          </Panel>

          <Panel pad="compact" className="@max-[1180px]:col-span-full">
            <PanelTitle className="mb-2.5">
              日程
              <PanelNote>今天 {data.events.length} 项</PanelNote>
              <PanelAction onClick={() => navigator.push("schedule")} title="前往日程">
                前往日程
                <ChevronRight size={13} strokeWidth={1.75} />
              </PanelAction>
            </PanelTitle>
            {data.events.length > 0 ? (
              <div className="before:bg-sunken relative pl-3.5 before:absolute before:bottom-2.5 before:left-[3.5px] before:top-2.5 before:w-[1.5px] before:rounded-[1px] before:content-['']">
                {data.events.map(event => (
                  <div
                    key={event.id}
                    className="rounded-tau-sm ease-tau-out hover:bg-hover relative flex items-baseline gap-2.5 px-1.5 py-[4.5px] transition-[background] duration-[160ms]"
                  >
                    <span className="font-tau-mono text-tau-micro text-ink-3 min-w-10 shrink-0">
                      {event.timeText}
                    </span>
                    <span className="text-tau-meta">{event.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote>今天没有日程安排</EmptyNote>
            )}
          </Panel>
        </div>

        {/* ⑤ 最近编辑：全宽三栏（卡片/文章/日记/知识库/项目） */}
        <Panel pad="compact">
          <PanelTitle className="mb-2.5">
            最近编辑
            <PanelNote>卡片 · 文章 · 日记 · 知识库 · 项目</PanelNote>
          </PanelTitle>
          <div className="@max-[1180px]:grid-cols-2 @max-[860px]:grid-cols-1 grid grid-cols-3 gap-x-6 gap-y-0">
            {data.recentEdits.length > 0 ? (
              data.recentEdits.map(item => (
                <RecentRow
                  key={item.id}
                  item={item}
                  onClick={() => navigator.push(KIND_TARGET[item.kind])}
                />
              ))
            ) : (
              <EmptyNote>还没有编辑记录——从新建一张卡片开始</EmptyNote>
            )}
          </div>
        </Panel>

        {/* ⑥ 活动热力图（模板 1:1 自绘；无图例与角标） */}
        <Panel pad="compact">
          <PanelTitle className="mb-2.5">
            活动
            <PanelNote>{new Date().getFullYear()} 年 · 每日操作</PanelNote>
            <PanelAction onClick={() => navigator.push("stats")} title="查看完整统计">
              完整统计
              <ChevronRight size={13} strokeWidth={1.75} />
            </PanelAction>
          </PanelTitle>
          <YearHeatmap days={data.heatmapItems} />
        </Panel>

        {/* ⑦-⑩ 统计四卡（sparkline；与其他卡同构，不放按钮） */}
        <div className="@max-[1180px]:grid-cols-2 @max-[1400px]:grid-cols-3 grid grid-cols-4 gap-3">
          <StatCard
            label="今日专注"
            note={`${data.focus.sessionCount} 番茄`}
            value={minutesToHM(data.focus.focusMinutes)}
            dates={data.trend.dates}
            values={data.trend.focusMinutes}
            unit="分钟"
          />
          <StatCard
            label="今日写下"
            note={`本周 ${data.weekly.wordsWritten}`}
            value={String(data.todayStats.wordsWritten)}
            unit="字"
            suffix="字"
            dates={data.trend.dates}
            values={data.trend.words}
          />
          <StatCard
            label="本周新建"
            note={`卡片 ${data.weekly.cardsCreated} · 文章 ${data.weekly.articlesCreated}`}
            value={String(data.weekly.cardsCreated + data.weekly.articlesCreated)}
            unit="条"
            suffix="条"
            dates={data.trend.dates}
            values={data.trend.created}
            tint
          />
          <StatCard
            label="累计"
            note={`日记 ${data.totals.diaries}`}
            value={String(data.totals.cards + data.totals.articles)}
            unit="字"
            suffix="条"
            dates={data.trend.dates}
            values={data.trend.words}
            tint
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- 域内私有组件 ---------- */

function RecentRow({ item, onClick }: { item: RecentEdit; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-tau-sm ease-tau-out hover:bg-hover grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-[11px] text-left transition-[background] duration-[160ms]"
      onClick={onClick}
    >
      <span className="bg-hover text-ink-2 justify-self-start rounded-[5px] px-[7px] py-px text-[10.5px]">
        {KIND_LABEL[item.kind]}
      </span>
      <span className="text-tau-meta truncate font-medium">{item.title}</span>
      <span className="text-ink-3 justify-self-end truncate text-[10.5px]">
        {item.updatedText}
        {item.wordsCount > 0 ? ` · ${item.wordsCount} 字` : ""}
      </span>
    </button>
  );
}

function StatCard({
  label,
  note,
  value,
  suffix,
  unit,
  tint,
  dates,
  values,
}: {
  label: string;
  note: string;
  value: string;
  suffix?: string;
  unit: string;
  tint?: boolean;
  dates: string[];
  values: number[];
}) {
  return (
    <Panel pad="none" className="flex flex-col px-4 pb-2.5 pt-[13px]">
      <div className="flex items-baseline gap-2">
        <span className="text-tau-micro text-ink-3">{label}</span>
        <span className="text-tau-tiny text-ink-3 ml-auto">{note}</span>
      </div>
      <b className="text-[21px] font-[650] leading-[1.2] tracking-[-0.01em]">
        {value}
        {suffix && (
          <small className="text-tau-tiny text-ink-3 ml-[3px] font-normal">{suffix}</small>
        )}
      </b>
      <Sparkline dates={dates} values={values} unit={unit} tint={tint} />
    </Panel>
  );
}

function Sparkline({
  dates,
  values,
  unit,
  tint,
}: {
  dates: string[];
  values: number[];
  unit: string;
  tint?: boolean;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="mt-2 flex h-[26px] items-end gap-0.5">
      {values.map((v, i) => (
        <i
          key={i}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
          className={clsx(
            "ease-tau-out min-h-0.5 flex-1 rounded-t-[2px] transition-opacity duration-[160ms] hover:opacity-100",
            tint ? "bg-info" : "bg-accent",
            i === values.length - 1 ? "opacity-100" : "opacity-55"
          )}
          title={`${dates[i]} · ${v} ${unit}`}
        />
      ))}
    </div>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}
