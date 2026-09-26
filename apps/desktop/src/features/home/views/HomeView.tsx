/**
 * 今日视图（原统计页并入）—— 一页滚动，按时间方向分三段：
 *   hero（只放今天的数字）→ 今天（复习/待办/日程，内容等量）→
 *   继续（最近编辑三栏 / 探究中的问题）→ 回顾（RetroSection：热力图 + 窗口化统计，懒加载）。
 * 同一份数据全页只出现一次；每一行点击都落到具体项（卡组 / 任务 / 日程 / 卡片 / 文章 / 日记 / 问题），
 * 目标页经页面参数定位并选中高亮。
 *
 * 模块分工：专注 = 番茄钟（pomodoro 页 / pomodoro 命令）；
 * 日程 = calendar 命令 + schedule page。两者独立，勿混用。
 *
 * 外壳为一整张纸（同文章 / 卡片库 / 白板）：纸顶固定问候与今天的数字，三段在纸内 FadeScroll 滚动，
 * 纸上的卡片用细描边（Panel variant="outline"），不再叠阴影。
 *
 * 容器查询响应式（@container 在根、@max-[…] 断点在行容器）：1180/860 两档。
 */

import { useState } from "react";
import clsx from "clsx";
import { Calendar, ChevronRight, CircleHelp, ListTodo, PenLine, Repeat } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EmptyNote, Panel, PanelNote, PanelTitle, PanelAction, Loading } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { useHomeSnapshot, minutesToHM } from "../queries";
import type { RecentEdit, ReviewDeckLite } from "../types";
import type { ActiveQuestionPreview } from "@/types";
import { Composition, GroupDot, StatusRing } from "@/features/questions/components/QuestionBits";
import { describeEvent, relativeDay } from "@/features/questions/model";
import { RetroSection } from "./RetroSection";
import { SectionHeading } from "./SectionHeading";
import { TitleIcon } from "./TitleIcon";
import "../home.css";

const KIND_LABEL = {
  card: "卡片",
  article: "文章",
  diary: "日记",
  project: "项目",
} as const;
/** 类型色与回顾段「知识构成」一一对应（卡片 accent / 文章 tag-1 / 项目 tag-2 / 日记 tag-4） */
const KIND_TONE = {
  card: "bg-accent-soft text-accent-text",
  article: "bg-tag-1-soft text-tag-1",
  diary: "bg-tag-4-soft text-tag-4",
  project: "bg-tag-2-soft text-tag-2",
} as const;

const ROW =
  "rounded-tau-sm ease-tau-out hover:bg-hover w-full text-left transition-[background] duration-[160ms]";

export function HomeView() {
  const { data, loading } = useHomeSnapshot();
  const { navigator } = usePage();
  // 最近编辑直达具体条目：卡片 / 文章进详情，日记定位到当天，项目进详情并定位文档（散页退回项目列表）
  const openRecentEdit = (item: RecentEdit) => {
    switch (item.kind) {
      case "card":
        return navigator.push("card-detail", { id: item.targetId });
      case "article":
        return navigator.push("article-detail", { id: item.targetId });
      case "diary":
        return navigator.push("diary", { date: item.date });
      case "project":
        if (item.projectId != null)
          return navigator.push("project-detail", { id: item.projectId, itemId: item.itemId });
        return navigator.push("projects");
    }
  };
  // 纸内滚动容器：回顾段懒加载以它为可见性根（state 而非 ref，挂载后触发回顾段重新接线）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  if (loading) {
    return <Loading />;
  }
  if (!data) return null;

  const dueDecks = data.reviewDecks.filter(d => d.dueCount > 0).length;

  return (
    // @container：容器查询锚点
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：纸顶固定 hero，三段在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* hero：只放今天的数字，每项全页仅此一处 */}
        <header className="mb-2 mt-6 flex flex-none items-baseline gap-4 px-8">
          <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
            {greeting()}
          </h1>
          <span className="text-tau-sm text-ink-2 shrink-0 whitespace-nowrap">{formatToday()}</span>
          <span className="text-tau-sm text-ink-2 ml-auto flex min-w-0 items-baseline gap-2 truncate whitespace-nowrap tabular-nums">
            <button
              type="button"
              title="前往番茄专注"
              onClick={() => navigator.push("pomodoro")}
              className="text-inherit"
            >
              已专注{" "}
              <b className="text-accent-text font-semibold">
                {minutesToHM(data.focus.focusMinutes)}
              </b>
              {data.focus.sessionCount > 0 && ` · ${data.focus.sessionCount} 番茄`}
            </button>
            <span className="text-ink-3 mx-2">·</span>写下{" "}
            <b className="text-accent-text font-semibold">{data.todayStats.wordsWritten}</b> 字
            <span className="text-ink-3 mx-2">·</span>新建{" "}
            <b className="text-accent-text font-semibold">
              {data.todayStats.cardsCreated + data.todayStats.articlesCreated}
            </b>{" "}
            条<span className="text-ink-3 mx-2">·</span>连续活跃{" "}
            <b className="text-accent-text font-semibold">{data.heatmap.streak}</b> 天
          </span>
        </header>

        {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8），离纸底 16px */}
        <FadeScroll
          scrollRef={setScrollEl}
          className="mb-4 flex min-h-0 flex-1 flex-col gap-3 pb-2 pl-8 pr-[26px]"
        >
          {/* ━━ 今天：要做的事 ━━ */}
          <SectionHeading title="今天" className="pt-1" />
          <div className="@max-[1180px]:grid-cols-2 @max-[860px]:grid-cols-1 grid grid-cols-3 gap-3">
            <Panel variant="outline" pad="compact">
              <PanelTitle className="mb-2.5">
                <TitleIcon icon={Repeat} tone="accent" />
                复习
                <PanelNote>
                  {dueDecks > 0
                    ? `${data.reviewDueCount} 张到期 · ${dueDecks} 个卡组`
                    : "今天没有到期"}
                </PanelNote>
                <PanelAction onClick={() => navigator.push("review")} title="前往闪卡复习">
                  前往复习
                  <ChevronRight size={13} strokeWidth={1.75} />
                </PanelAction>
              </PanelTitle>
              {data.reviewDecks.length > 0 ? (
                data.reviewDecks.map(deck => (
                  <DeckRow
                    key={deck.id}
                    deck={deck}
                    onClick={() => navigator.push("review", { deckId: deck.id })}
                  />
                ))
              ) : (
                <EmptyNote>还没有闪卡卡组</EmptyNote>
              )}
            </Panel>

            <Panel variant="outline" pad="compact">
              <PanelTitle className="mb-2.5">
                <TitleIcon icon={ListTodo} tone="green" />
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
                    className={clsx(ROW, "group flex items-center gap-2.5 px-2 py-[7px]")}
                    onClick={() => navigator.push("todos", { selectedId: todo.id })}
                  >
                    <span
                      className={clsx(
                        "border-ink-3 ease-tau-out group-hover:border-accent size-4 shrink-0 rounded-full border-[1.5px] transition-[border-color] duration-[160ms]",
                        todo.overdue && "border-danger"
                      )}
                    />
                    <span className="text-tau-meta min-w-0 flex-1 truncate font-medium">
                      {todo.title}
                    </span>
                    {(todo.overdue || todo.dueText) && (
                      <small
                        className={clsx(
                          "text-ink-3 shrink-0 whitespace-nowrap text-[10.5px]",
                          todo.overdue && "text-danger"
                        )}
                      >
                        {todo.overdue ? `逾期 · ${todo.dueText ?? ""}` : todo.dueText}
                      </small>
                    )}
                  </button>
                ))
              ) : (
                <EmptyNote>没有待办事项</EmptyNote>
              )}
            </Panel>

            <Panel variant="outline" pad="compact" className="@max-[1180px]:col-span-full">
              <PanelTitle className="mb-2.5">
                <TitleIcon icon={Calendar} tone="blue" />
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
                    <button
                      key={event.id}
                      type="button"
                      className={clsx(
                        ROW,
                        "relative flex items-baseline gap-2.5 px-1.5 py-[4.5px]"
                      )}
                      onClick={() => navigator.push("schedule", { eventId: event.id })}
                    >
                      <span className="font-tau-mono text-tau-micro text-ink-3 min-w-10 shrink-0">
                        {event.timeText}
                      </span>
                      <span className="text-tau-meta truncate">{event.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyNote>今天没有日程安排</EmptyNote>
              )}
            </Panel>
          </div>

          {/* ━━ 继续：手头在做的事 ━━ */}
          <SectionHeading title="继续" className="pt-3" />
          <Panel variant="outline" pad="compact">
            <PanelTitle className="mb-2.5">
              <TitleIcon icon={PenLine} tone="ochre" />
              最近编辑
              <PanelNote>卡片 · 文章 · 日记 · 项目</PanelNote>
            </PanelTitle>
            <div className="@max-[1180px]:grid-cols-2 @max-[860px]:grid-cols-1 grid grid-cols-3 gap-x-6 gap-y-0">
              {data.recentEdits.length > 0 ? (
                data.recentEdits.map(item => (
                  <RecentRow key={item.id} item={item} onClick={() => openRecentEdit(item)} />
                ))
              ) : (
                <EmptyNote>还没有编辑记录——从新建一张卡片开始</EmptyNote>
              )}
            </div>
          </Panel>

          <Panel variant="outline" pad="compact">
            <PanelTitle className="mb-1.5">
              <TitleIcon icon={CircleHelp} tone="purple" />
              探究中的问题
              <PanelNote>{data.activeQuestions.length ? "最近有进展的在前" : ""}</PanelNote>
              <PanelAction onClick={() => navigator.push("questions")} title="前往问题">
                前往问题
                <ChevronRight size={13} strokeWidth={1.75} />
              </PanelAction>
            </PanelTitle>
            {data.activeQuestions.length > 0 ? (
              // 只有 1 条时占满整行，避免右半张卡留空
              <div
                className={clsx(
                  "grid gap-x-6",
                  data.activeQuestions.length > 1
                    ? "@max-[860px]:grid-cols-1 grid-cols-2"
                    : "grid-cols-1"
                )}
              >
                {data.activeQuestions.map(question => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    onClick={() => navigator.push("questions", { selectedId: question.id })}
                  />
                ))}
              </div>
            ) : (
              <EmptyNote>
                没有正在探究的问题——学习时冒出的疑问，按 Ctrl+K 输入「问题:」记下来
              </EmptyNote>
            )}
          </Panel>

          {/* ━━ 回顾：做过了什么（原统计页） ━━ */}
          <RetroSection heatmap={data.heatmap} scrollRoot={scrollEl} />
        </FadeScroll>
      </div>
    </div>
  );
}

/* ---------- 域内私有组件 ---------- */

function QuestionRow({
  question,
  onClick,
}: {
  question: ActiveQuestionPreview;
  onClick: () => void;
}) {
  const now = Date.now();
  const progress = question.lastEvent ? describeEvent(question.lastEvent) : null;
  const progressText = progress
    ? progress.tone === "note"
      ? progress.text
      : [
          progress.verb,
          question.lastEventTitle && progress.tone !== "start"
            ? `「${question.lastEventTitle}」`
            : "",
        ].join("")
    : "";
  return (
    <button
      type="button"
      className="rounded-tau-sm ease-tau-out hover:bg-hover flex w-full items-start gap-2.5 px-2.5 py-[9px] text-left transition-[background] duration-[160ms]"
      onClick={onClick}
    >
      <StatusRing status={question.status} className="mt-[3px]" />
      <span className="min-w-0 flex-1">
        <b className="text-tau-meta block truncate font-medium">{question.questionContent}</b>
        <span className="text-ink-3 mt-0.5 flex min-w-0 items-center gap-2.5 text-[11px]">
          <span className="inline-flex shrink-0 items-center gap-[5px]">
            <GroupDot color={question.groupColor} />
            {question.groupTitle}
          </span>
          <Composition counts={question.linkCounts} className="shrink-0" />
          <span className="min-w-0 truncate">
            {relativeDay(question.lastActivityTime, now)}
            {progressText ? ` · ${progressText}` : ""}
          </span>
        </span>
      </span>
    </button>
  );
}

function RecentRow({ item, onClick }: { item: RecentEdit; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-tau-sm ease-tau-out hover:bg-hover grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-[11px] text-left transition-[background] duration-[160ms]"
      onClick={onClick}
    >
      <span
        className={clsx(
          "justify-self-start rounded-[5px] px-[7px] py-px text-[10.5px] font-medium",
          KIND_TONE[item.kind]
        )}
      >
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

/** 复习卡的卡组行：三段条 = 到期 / 学习中 / 已掌握（其余为新卡），点击进复习页选中该卡组 */
function DeckRow({ deck, onClick }: { deck: ReviewDeckLite; onClick: () => void }) {
  const mastered = Math.max(
    0,
    deck.totalCards - deck.dueCount - deck.learningCount - deck.newCount
  );
  return (
    <button
      type="button"
      className={clsx(ROW, "flex items-center gap-2.5 px-2 py-[5px]")}
      onClick={onClick}
      title={`到期 ${deck.dueCount} · 学习中 ${deck.learningCount} · 新卡 ${deck.newCount} · 已掌握 ${mastered}`}
    >
      <span className="text-tau-meta w-[108px] truncate font-medium">{deck.name}</span>
      <span className="bg-sunken flex h-[7px] flex-1 overflow-hidden rounded">
        <i className="bg-warn" style={{ width: pct(deck.dueCount, deck.totalCards) }} />
        <i
          className="bg-accent opacity-80"
          style={{ width: pct(deck.learningCount, deck.totalCards) }}
        />
        <i className="bg-ok opacity-55" style={{ width: pct(mastered, deck.totalCards) }} />
      </span>
      <span className="text-tau-tiny text-ink-2 whitespace-nowrap tabular-nums">
        <b className={deck.dueCount > 0 ? "text-accent-text" : "text-ink-1"}>{deck.dueCount}</b>/
        {deck.totalCards}
      </span>
    </button>
  );
}

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
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
