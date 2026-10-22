// 首页（今天）：「接下来」议程清单 + 任务摘要 + 最近动态（按类型筛选，筛选按钮带资料库总数）。
// 卡片全量列表在「卡片库」Tab；这里只做今日待办与最近活动的聚合呈现。
// 数据全部走 query 缓存，模块关闭时对应请求与条目一并隐藏。

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Article,
  BookOpen,
  Brain,
  CalendarCheck,
  CheckCircle,
  FolderOpen,
  Stack,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { Descendant } from "slate";
import { Text as SlateText } from "slate";
import type { CardListItem, DiaryEntry, DiarySegment } from "../../types";
import { useDiaryEntries } from "../diary/queries";
import { useArticlesQuery } from "../articles/queries";
import { useProjectItemsQuery } from "../projects/queries";
import { useHomeStatsQuery } from "./queries";
import { useTodayAgenda } from "./useTodayAgenda";
import type { AgendaItem, AgendaKind } from "./useTodayAgenda";
import { useTodoItems } from "../todo/queries";
import { toggleTodoComplete } from "../todo/toggleComplete";
import { TodoCheck } from "../todo/TodoCheck";
import { dfs } from "../cards/editorContentUtils";

/** 日记动态标题：取正文开头的纯文本（首页最近动态单行展示，仅前几条调用） */
function diaryFeedTitle(content: Descendant[] | null | undefined, max = 96): string {
  if (!content?.length) return "";
  let text = "";
  dfs(content, node => {
    if (text.length >= max) return;
    if (SlateText.isText(node)) text += `${node.text} `;
  });
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const diff = Date.now() - normalized;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

/** 「全部」默认展示条数，「显示更多」展开到 FEED_EXPANDED_COUNT */
const FEED_COLLAPSED_COUNT = 5;
const FEED_EXPANDED_COUNT = 10;
/** 每类候选条数：保证按类型筛选时也能凑满 FEED_COLLAPSED_COUNT */
const FEED_PER_KIND = 5;

type FeedKind = "card" | "diary" | "todo" | "article" | "projectDoc";
type FeedFilter = "all" | Exclude<FeedKind, "todo">;

const FEED_KIND_STYLE: Record<
  FeedKind,
  { label: string; chip: string; icon: Icon; tone: string; soft: string }
> = {
  card: {
    label: "卡片",
    chip: "bg-tag-2-soft text-tag-2",
    icon: Stack,
    tone: "var(--tau-tag-2)",
    soft: "var(--tau-tag-2-soft)",
  },
  diary: {
    label: "日记",
    chip: "bg-tag-1-soft text-tag-1",
    icon: BookOpen,
    tone: "var(--tau-tag-1)",
    soft: "var(--tau-tag-1-soft)",
  },
  todo: {
    label: "任务",
    chip: "bg-tag-4-soft text-tag-4",
    icon: CheckCircle,
    tone: "var(--tau-tag-4)",
    soft: "var(--tau-tag-4-soft)",
  },
  article: {
    label: "文章",
    chip: "bg-accent-soft text-accent-text",
    icon: Article,
    tone: "var(--tau-accent)",
    soft: "var(--tau-accent-soft)",
  },
  projectDoc: {
    label: "项目",
    chip: "bg-tag-3-soft text-tag-3",
    icon: FolderOpen,
    tone: "var(--tau-tag-3)",
    soft: "var(--tau-tag-3-soft)",
  },
};

const AGENDA_STYLE: Record<AgendaKind, { icon: ReactNode; tone: string; soft: string }> = {
  calendar: {
    icon: <CalendarCheck size={19} weight="duotone" color="var(--tau-tag-2)" aria-hidden="true" />,
    tone: "var(--tau-tag-2)",
    soft: "var(--tau-tag-2-soft)",
  },
  flashcard: {
    icon: <Brain size={19} weight="duotone" color="var(--tau-tag-4)" aria-hidden="true" />,
    tone: "var(--tau-tag-4)",
    soft: "var(--tau-tag-4-soft)",
  },
  todo: {
    icon: <CheckCircle size={19} weight="duotone" color="var(--tau-accent)" aria-hidden="true" />,
    tone: "var(--tau-accent)",
    soft: "var(--tau-accent-soft)",
  },
  diary: {
    icon: <BookOpen size={19} weight="duotone" color="var(--tau-tag-1)" aria-hidden="true" />,
    tone: "var(--tau-tag-1)",
    soft: "var(--tau-tag-1-soft)",
  },
  pomodoro: {
    icon: (
      <span className="text-[18px] leading-none" aria-hidden="true">
        🍅
      </span>
    ),
    tone: "var(--tau-tag-5)",
    soft: "var(--tau-tag-5-soft)",
  },
};

type HomeDashboardProps = {
  cardsTotal: number;
  recentCards: CardListItem[];
  isLoadingCards: boolean;
  todoEnabled: boolean;
  diaryEnabled: boolean;
  pomodoroEnabled: boolean;
  calendarEnabled: boolean;
  onOpenCards: () => void;
  onOpenTodo: () => void;
  onOpenPomodoro: () => void;
  onOpenCalendar: () => void;
  onOpenFlashcards: () => void;
  onStartFlashcardReview: () => void;
  onOpenDiary: () => void;
  onComposeDiary: () => void;
  onOpenArticles: () => void;
  onOpenProjects: () => void;
  onOpenArticle: (articleId: number) => void;
  onOpenProjectDoc: (itemId: number) => void;
  onOpenDiaryEntry: (entry: DiaryEntry, segment: DiarySegment) => void;
  onPreviewCard: (cardId: number) => void;
  onError: (error: unknown, fallback: string) => void;
};

export function HomeDashboard(props: HomeDashboardProps) {
  const agenda = useTodayAgenda(props);
  const allItemsQuery = useTodoItems(
    props.todoEnabled ? { systemType: "all" as const } : { groupId: -1 }
  );
  const diaryEntriesQuery = useDiaryEntries(props.diaryEnabled);
  const articlesQuery = useArticlesQuery();
  const projectItemsQuery = useProjectItemsQuery();
  const homeStats = useHomeStatsQuery().data ?? null;
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [feedExpanded, setFeedExpanded] = useState(false);

  // 今日任务摘要：未完成的排前面（截止早的靠前），最多 3 条
  const todayTodos = useMemo(() => {
    const items = allItemsQuery.data ?? [];
    return items
      .filter(item => !item.isCompleted && !item.isArchived && !item.parentId)
      .sort((a, b) => {
        const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        return b.updateTime - a.updateTime;
      })
      .slice(0, 3);
  }, [allItemsQuery.data]);

  // 最近动态：卡片 / 日记 / 文章 / 项目文档 / 完成的任务按时间混排，每类取前 FEED_PER_KIND 条
  const recentFeed = useMemo(() => {
    type FeedItem = {
      key: string;
      kind: FeedKind;
      title: string;
      time: number;
      action: () => void;
    };
    const items: FeedItem[] = [];
    const pickRecent = <T extends { updateTime: number }>(list: T[]) =>
      [...list].sort((a, b) => b.updateTime - a.updateTime).slice(0, FEED_PER_KIND);

    props.recentCards.slice(0, FEED_PER_KIND).forEach(card => {
      items.push({
        key: `card-${card.id}`,
        kind: "card",
        title: card.excerpt?.split("\n")[0]?.trim() || `卡片 #${card.id}`,
        time: card.updateTime,
        action: () => props.onPreviewCard(card.id),
      });
    });

    (articlesQuery.data?.pages ?? [])
      .flatMap(page => page.items)
      .slice(0, FEED_PER_KIND)
      .forEach(article => {
        items.push({
          key: `article-${article.id}`,
          kind: "article",
          title: article.title || "无标题文章",
          time: article.updateTime,
          action: () => props.onOpenArticle(article.id),
        });
      });

    (diaryEntriesQuery.data ?? [])
      .flatMap(entry => entry.segments.map(segment => ({ entry, segment })))
      .sort((a, b) => b.segment.updateTime - a.segment.updateTime)
      .slice(0, FEED_PER_KIND)
      .forEach(({ entry, segment }) => {
        items.push({
          key: `diary-${segment.contentId}`,
          kind: "diary",
          title: diaryFeedTitle(segment.content) || "一篇空白日记",
          time: segment.updateTime,
          action: () => props.onOpenDiaryEntry(entry, segment),
        });
      });

    if (props.todoEnabled) {
      (allItemsQuery.data ?? [])
        .filter(item => item.isCompleted && !item.isArchived)
        .sort((a, b) => (b.completedAt ?? b.updateTime) - (a.completedAt ?? a.updateTime))
        .slice(0, 2)
        .forEach(item => {
          items.push({
            key: `todo-${item.id}`,
            kind: "todo",
            title: `完成了「${item.title}」`,
            time: item.completedAt ?? item.updateTime,
            action: props.onOpenTodo,
          });
        });
    }

    // 项目文档：仅自持正文的 document 节点（引用型节点会与卡片/文章条目重复）
    pickRecent(
      (projectItemsQuery.data ?? []).filter(
        item => item.projectItemType === "document" && !item.refType
      )
    ).forEach(item => {
      items.push({
        key: `projectDoc-${item.id}`,
        kind: "projectDoc",
        title: item.title,
        time: item.updateTime,
        action: () => props.onOpenProjectDoc(item.id),
      });
    });

    return items.sort((a, b) => b.time - a.time);
  }, [
    props,
    diaryEntriesQuery.data,
    allItemsQuery.data,
    articlesQuery.data,
    projectItemsQuery.data,
  ]);

  const feedFilters: {
    key: FeedFilter;
    label: string;
    count?: number;
    viewAll?: () => void;
    viewAllLabel?: string;
  }[] = [
    { key: "all", label: "全部" },
    {
      key: "card",
      label: "卡片",
      count: props.cardsTotal,
      viewAll: props.onOpenCards,
      viewAllLabel: `查看全部 ${props.cardsTotal} 张卡片`,
    },
    {
      key: "article",
      label: "文章",
      count: homeStats?.articlesTotal,
      viewAll: props.onOpenArticles,
      viewAllLabel: `查看全部 ${homeStats?.articlesTotal ?? ""} 篇文章`,
    },
    {
      key: "projectDoc",
      label: "项目",
      count: homeStats?.projectsTotal,
      viewAll: props.onOpenProjects,
      viewAllLabel: `查看全部 ${homeStats?.projectsTotal ?? ""} 个项目`,
    },
    ...(props.diaryEnabled
      ? [
          {
            key: "diary" as const,
            label: "日记",
            viewAll: props.onOpenDiary,
            viewAllLabel: "查看全部日记",
          },
        ]
      : []),
  ];
  const activeFilter = feedFilters.find(filter => filter.key === feedFilter) ?? feedFilters[0];
  const filteredFeed =
    feedFilter === "all" ? recentFeed : recentFeed.filter(item => item.kind === feedFilter);
  const visibleFeed = filteredFeed.slice(
    0,
    feedFilter === "all" && feedExpanded ? FEED_EXPANDED_COUNT : FEED_COLLAPSED_COUNT
  );
  const canExpandFeed =
    feedFilter === "all" && !feedExpanded && filteredFeed.length > FEED_COLLAPSED_COUNT;

  const agendaHandlers: Record<AgendaKind, { open: () => void; action?: [string, () => void] }> = {
    calendar: { open: props.onOpenCalendar },
    flashcard: { open: props.onOpenFlashcards, action: ["开始", props.onStartFlashcardReview] },
    todo: { open: props.onOpenTodo },
    diary: { open: props.onOpenDiary, action: ["写", props.onComposeDiary] },
    pomodoro: { open: props.onOpenPomodoro, action: ["开始", props.onOpenPomodoro] },
  };

  return (
    <div className="px-[18px] pt-5">
      {agenda.items.length > 0 ? (
        <div className="list-group pop-in py-1" style={{ animationDelay: "0.02s" }}>
          {agenda.items.map(item => (
            <AgendaRow key={item.kind} item={item} {...agendaHandlers[item.kind]} />
          ))}
        </div>
      ) : null}

      {props.todoEnabled ? (
        <section className="mt-6">
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-ink-1 text-[16.5px] font-extrabold">任务</h2>
            <button
              type="button"
              onClick={props.onOpenTodo}
              className="text-ink-3 active:text-ink-1 text-[12.5px] font-semibold"
            >
              全部 ›
            </button>
          </div>
          <div className="list-group pop-in" style={{ animationDelay: "0.06s" }}>
            {todayTodos.length === 0 ? (
              <p className="text-ink-3 px-4 py-6 text-center text-[13px]">
                {agenda.todoTotals && agenda.todoTotals.total > 0
                  ? "任务都完成了，休息一下"
                  : "还没有安排任务"}
              </p>
            ) : (
              todayTodos.map(item => (
                <TodoSummaryRow
                  key={item.id}
                  title={item.title}
                  onToggle={isCompleted => {
                    void toggleTodoComplete(item, isCompleted, props.onError);
                  }}
                />
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-2.5 px-1">
          <h2 className="text-ink-1 text-[16.5px] font-extrabold">最近</h2>
        </div>
        <div className="scrollbar-hide -mx-[18px] mb-2.5 flex gap-1.5 overflow-x-auto px-[18px] py-1">
          {feedFilters.map(filter => {
            const on = filter.key === feedFilter;
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFeedFilter(filter.key)}
                className={`shadow-card flex h-[30px] flex-none items-center gap-1 rounded-full px-3 text-[12px] font-bold transition-colors ${
                  on ? "bg-ink-1 text-surface" : "bg-surface text-ink-2"
                }`}
              >
                {filter.label}
                {filter.count != null ? (
                  <span
                    className={`font-semibold tabular-nums ${on ? "opacity-60" : "text-ink-3"}`}
                  >
                    {filter.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="list-group pop-in px-4 py-1" style={{ animationDelay: "0.1s" }}>
          {props.isLoadingCards && recentFeed.length === 0 ? (
            <div className="space-y-3 py-3">
              {[1, 2].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="bg-page h-9 w-9 animate-pulse rounded-[13px]" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="bg-page h-3.5 w-3/4 animate-pulse rounded" />
                    <div className="bg-page h-3 w-16 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleFeed.length === 0 ? (
            <p className="text-ink-3 py-6 text-center text-[13px]">
              {feedFilter === "all"
                ? "还没有动态，写下第一条记录吧"
                : `还没有${activeFilter.label}`}
            </p>
          ) : (
            visibleFeed.map(item => {
              const style = FEED_KIND_STYLE[item.kind];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.action}
                  className="border-line-1 active:bg-hover -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 border-b border-dashed px-4 py-3 text-left last:border-b-0"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px]"
                    style={{ background: style.soft }}
                  >
                    <style.icon size={18} color={style.tone} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 block truncate text-[14px] font-semibold">
                      {item.title}
                    </span>
                    <span className="text-ink-3 mt-0.5 flex items-center gap-1.5 text-[11.5px]">
                      {feedFilter === "all" ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.chip}`}
                        >
                          {style.label}
                        </span>
                      ) : null}
                      {formatRelativeTime(item.time)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
          {canExpandFeed ? (
            <button
              type="button"
              onClick={() => setFeedExpanded(true)}
              className="text-ink-3 active:text-ink-1 border-line-1 -mx-4 block w-[calc(100%+2rem)] border-t border-dashed py-3 text-center text-[12.5px] font-semibold"
            >
              显示更多
            </button>
          ) : null}
          {feedFilter !== "all" && activeFilter.viewAll ? (
            <button
              type="button"
              onClick={activeFilter.viewAll}
              className="text-ink-3 active:text-ink-1 border-line-1 -mx-4 block w-[calc(100%+2rem)] border-t border-dashed py-3 text-center text-[12.5px] font-semibold"
            >
              {activeFilter.viewAllLabel} ›
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AgendaRow({
  item,
  open,
  action,
}: {
  item: AgendaItem;
  open: () => void;
  action?: [string, () => void];
}) {
  const style = AGENDA_STYLE[item.kind];
  const progressPct = item.progress
    ? Math.round((item.progress.completed / item.progress.total) * 100)
    : 0;
  return (
    <div
      className={`border-line-1 flex items-center gap-3 border-b border-dashed px-4 py-3 last:border-b-0 ${
        item.done ? "opacity-50" : ""
      }`}
    >
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-60"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"
          style={{ background: style.soft }}
        >
          {style.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block truncate text-[14.5px] font-bold">{item.title}</span>
          {item.progress ? (
            <span className="mt-[7px] block h-[6px] overflow-hidden rounded-full bg-[var(--ring-track)]">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${progressPct}%`,
                  backgroundImage:
                    "linear-gradient(90deg, var(--tau-accent-hover), var(--tau-accent))",
                }}
              />
            </span>
          ) : item.subtitle ? (
            <span className="text-ink-2 mt-0.5 block truncate text-[12px]">{item.subtitle}</span>
          ) : null}
        </span>
      </button>
      {item.progress ? (
        <span className="text-ink-2 shrink-0 text-[12px] font-bold tabular-nums">
          {item.progress.completed}/{item.progress.total}
        </span>
      ) : null}
      {action && !item.done ? (
        <button
          type="button"
          onClick={action[1]}
          className="h-[30px] shrink-0 rounded-full px-3.5 text-[12px] font-bold transition-transform active:scale-95"
          style={{ background: style.tone, color: "var(--tau-bg-surface)" }}
        >
          {action[0]}
        </button>
      ) : null}
    </div>
  );
}

function TodoSummaryRow({ title, onToggle }: { title: string; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <TodoCheck checked={false} onToggle={onToggle} />
      <span className="text-ink-1 min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</span>
    </div>
  );
}

export default HomeDashboard;
