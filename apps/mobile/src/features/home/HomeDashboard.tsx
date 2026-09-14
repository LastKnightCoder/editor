// 首页（今天）：纯仪表盘（v2 模板）——搜索条 + Bento 统计 + 今日任务摘要 + 最近动态。
// 卡片全量列表在「卡片库」Tab；这里只做数据与最近活动的聚合呈现。
// 数据全部走 query 缓存，模块关闭时对应请求与区块一并隐藏。

import { useMemo } from "react";
import {
  Article,
  BookOpen,
  Books,
  Brain,
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
import { useDocumentItemsQuery } from "../knowledge/queries";
import { useHomeStatsQuery } from "./queries";
import {
  todayReviewedCount,
  totalDueOf,
  useFlashcardDecks,
  useFlashcardReviewStats,
} from "../flashcard/queries";
import { useTodoGroupStats, useTodoItems, useTodoSystemGroups } from "../todo/queries";
import { toggleTodoComplete } from "../todo/toggleComplete";
import { TodoCheck } from "../todo/TodoCheck";
import { usePomodoroTodaySummary } from "../pomodoro/queries";
import { formatFocusDuration } from "../pomodoro/timer";
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

const BENTO_CARD_CLASS =
  "rounded-bento p-4 shadow-card transition-transform duration-200 active:scale-[0.97] pop-in";

type HomeDashboardProps = {
  cardsTotal: number;
  recentCards: CardListItem[];
  isLoadingCards: boolean;
  todoEnabled: boolean;
  diaryEnabled: boolean;
  pomodoroEnabled: boolean;
  onOpenSearch: () => void;
  onOpenCards: () => void;
  onOpenTodo: () => void;
  onOpenPomodoro: () => void;
  /** dueCount>0 直达全库复习，否则进闪卡首页（由 HomeScreen 决定跳转目标） */
  onOpenFlashcards: (dueCount: number) => void;
  onOpenDiary: () => void;
  onOpenArticles: () => void;
  onOpenProjects: () => void;
  onOpenKnowledge: () => void;
  onOpenArticle: (articleId: number) => void;
  onOpenProjectDoc: (itemId: number) => void;
  onOpenKnowledgeDoc: (itemId: number) => void;
  onOpenDiaryEntry: (entry: DiaryEntry, segment: DiarySegment) => void;
  onPreviewCard: (cardId: number) => void;
  onError: (error: unknown, fallback: string) => void;
};

export function HomeDashboard(props: HomeDashboardProps) {
  const now = useMemo(() => new Date(), []);
  const todoStatsQuery = useTodoGroupStats(props.todoEnabled);
  const systemGroupsQuery = useTodoSystemGroups(props.todoEnabled);
  const allItemsQuery = useTodoItems(
    props.todoEnabled ? { systemType: "all" as const } : { groupId: -1 }
  );
  const diaryEntriesQuery = useDiaryEntries(props.diaryEnabled);
  const flashcardDecksQuery = useFlashcardDecks();
  const flashcardStatsQuery = useFlashcardReviewStats(1);
  const flashcardDue = totalDueOf(flashcardDecksQuery.data ?? []);
  const flashcardReviewedToday = todayReviewedCount(flashcardStatsQuery.data);
  const articlesQuery = useArticlesQuery();
  const projectItemsQuery = useProjectItemsQuery();
  const documentItemsQuery = useDocumentItemsQuery();
  const homeStatsQuery = useHomeStatsQuery();
  const homeStats = homeStatsQuery.data ?? null;
  const pomodoroSummaryQuery = usePomodoroTodaySummary(props.pomodoroEnabled);
  const pomodoroSummary = pomodoroSummaryQuery.data ?? null;

  const todoStats = useMemo(() => {
    if (!props.todoEnabled) return null;
    const allGroupId = (systemGroupsQuery.data ?? []).find(group => group.systemType === "all")?.id;
    const stats = allGroupId != null ? todoStatsQuery.data?.[allGroupId] : undefined;
    if (!stats) return null;
    return {
      total: stats.total,
      uncompleted: stats.uncompleted,
      completed: Math.max(0, stats.total - stats.uncompleted),
    };
  }, [props.todoEnabled, systemGroupsQuery.data, todoStatsQuery.data]);

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

  const diaryEntries = diaryEntriesQuery.data ?? [];

  const diaryBlock = useMemo(() => {
    if (!props.diaryEnabled) return null;
    const dailyDates = new Set(diaryEntries.filter(e => e.type === "daily").map(e => e.date));
    const DAY_MS = 24 * 60 * 60 * 1000;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cursor = dailyDates.has(key(today)) ? today : new Date(today.getTime() - DAY_MS);
    let streak = 0;
    const day = new Date(cursor.getTime());
    while (dailyDates.has(key(day))) {
      streak += 1;
      day.setDate(day.getDate() - 1);
    }
    const weekday = (now.getDay() + 6) % 7;
    const weekStart = new Date(today.getTime() - weekday * DAY_MS);
    const dots = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getTime() + i * DAY_MS);
      return { hit: dailyDates.has(key(d)), today: i === weekday };
    });
    return { streak, dots };
  }, [props.diaryEnabled, diaryEntries, now]);

  const todoPct =
    todoStats && todoStats.total > 0
      ? Math.round((todoStats.completed / todoStats.total) * 100)
      : 0;

  // 最近动态：卡片 / 日记 / 文章 / 项目文档 / 知识库文档 / 完成的任务按时间混排
  const recentFeed = useMemo(() => {
    type FeedItem = {
      key: string;
      kind: "card" | "diary" | "todo" | "article" | "projectDoc" | "knowledgeDoc";
      title: string;
      time: number;
      action: () => void;
    };
    const items: FeedItem[] = [];
    const pickRecent = <T extends { updateTime: number }>(list: T[], count: number) =>
      [...list].sort((a, b) => b.updateTime - a.updateTime).slice(0, count);

    props.recentCards.slice(0, 3).forEach(card => {
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
      .slice(0, 3)
      .forEach(article => {
        items.push({
          key: `article-${article.id}`,
          kind: "article",
          title: article.title || "无标题文章",
          time: article.updateTime,
          action: () => props.onOpenArticle(article.id),
        });
      });

    diaryEntries
      .flatMap(entry => entry.segments.map(segment => ({ entry, segment })))
      .sort((a, b) => b.segment.updateTime - a.segment.updateTime)
      .slice(0, 3)
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
      ),
      3
    ).forEach(item => {
      items.push({
        key: `projectDoc-${item.id}`,
        kind: "projectDoc",
        title: item.title,
        time: item.updateTime,
        action: () => props.onOpenProjectDoc(item.id),
      });
    });

    // 知识库文档：仅自持正文节点（refType 为空），引用型同理排除
    pickRecent(
      (documentItemsQuery.data ?? []).filter(item => !item.refType),
      3
    ).forEach(item => {
      items.push({
        key: `knowledgeDoc-${item.id}`,
        kind: "knowledgeDoc",
        title: item.title,
        time: item.updateTime,
        action: () => props.onOpenKnowledgeDoc(item.id),
      });
    });

    return items.sort((a, b) => b.time - a.time).slice(0, 10);
  }, [
    props,
    diaryEntries,
    allItemsQuery.data,
    articlesQuery.data,
    projectItemsQuery.data,
    documentItemsQuery.data,
  ]);

  const feedKindStyle: Record<
    string,
    { label: string; chip: string; icon: Icon; tone: string; soft: string }
  > = {
    card: {
      label: "卡片",
      chip: "bg-sky-soft text-sky",
      icon: Stack,
      tone: "var(--sky)",
      soft: "var(--sky-soft)",
    },
    diary: {
      label: "日记",
      chip: "bg-sage-soft text-sage",
      icon: BookOpen,
      tone: "var(--sage)",
      soft: "var(--sage-soft)",
    },
    todo: {
      label: "任务",
      chip: "bg-butter-soft text-butter",
      icon: CheckCircle,
      tone: "var(--butter)",
      soft: "var(--butter-soft)",
    },
    article: {
      label: "文章",
      chip: "bg-apricot-soft text-apricot",
      icon: Article,
      tone: "var(--apricot)",
      soft: "var(--apricot-soft)",
    },
    projectDoc: {
      label: "项目",
      chip: "bg-lilac-soft text-lilac",
      icon: FolderOpen,
      tone: "var(--lilac)",
      soft: "var(--lilac-soft)",
    },
    knowledgeDoc: {
      label: "知识库",
      chip: "bg-sage-soft text-sage",
      icon: Books,
      tone: "var(--sage)",
      soft: "var(--sage-soft)",
    },
  };

  return (
    <div className="px-[18px] pt-5">
      <div className="grid grid-cols-2 gap-[11px]">
        {props.todoEnabled ? (
          <button
            type="button"
            onClick={props.onOpenTodo}
            className={`${BENTO_CARD_CLASS} col-span-2 flex items-center gap-[15px]`}
            style={{
              animationDelay: "0.02s",
              background: "linear-gradient(135deg, var(--rose-soft), var(--apricot-soft))",
            }}
          >
            <span className="flex shrink-0 items-baseline gap-[3px]">
              <span className="text-accent text-[34px] font-extrabold tabular-nums leading-none">
                {todoStats ? todoStats.completed : "…"}
              </span>
              <span className="text-ink-3 text-base font-bold">
                / {todoStats ? todoStats.total : "…"}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="text-ink block text-[14.5px] font-bold">今日任务</span>
              <span className="text-ink-2 mt-0.5 block text-[12px]">
                {!todoStats
                  ? "加载中"
                  : todoStats.total === 0
                    ? "还没有任务"
                    : `还剩 ${todoStats.uncompleted} 项`}
              </span>
              <span className="mt-2 block h-[6px] overflow-hidden rounded-full bg-[var(--ring-track)]">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${todoPct}%`,
                    backgroundImage: "linear-gradient(90deg, var(--brand-strong), var(--brand))",
                  }}
                />
              </span>
            </span>
          </button>
        ) : null}

        {props.pomodoroEnabled ? (
          <button
            type="button"
            onClick={props.onOpenPomodoro}
            className={`${BENTO_CARD_CLASS} col-span-2 flex items-center gap-[15px]`}
            style={{
              animationDelay: "0.04s",
              background: "linear-gradient(135deg, var(--rose-soft), var(--bg-surface))",
            }}
          >
            <span className="text-[28px] leading-none">🍅</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="text-ink block text-[14.5px] font-bold">番茄专注</span>
              <span className="text-ink-2 mt-0.5 block text-[12px]">
                {pomodoroSummary
                  ? pomodoroSummary.count > 0
                    ? `今日 ${formatFocusDuration(pomodoroSummary.focusMs)} · ${pomodoroSummary.count} 个番茄`
                    : "今天还没有专注，开始一次？"
                  : "加载中"}
              </span>
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => props.onOpenFlashcards(flashcardDue)}
          className={`${BENTO_CARD_CLASS} col-span-2 flex items-center gap-[15px]`}
          style={{
            animationDelay: "0.06s",
            background: "linear-gradient(135deg, var(--butter-soft), var(--bg-surface))",
          }}
        >
          <Brain size={28} weight="duotone" className="text-butter flex-none" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-left">
            <span className="text-ink block text-[14.5px] font-bold">闪卡复习</span>
            <span className="text-ink-2 mt-0.5 block text-[12px]">
              {flashcardDecksQuery.isLoading
                ? "加载中"
                : flashcardDue > 0
                  ? `今日待复习 · 已复习 ${flashcardReviewedToday} 张`
                  : flashcardReviewedToday > 0
                    ? `今日已清空 · 共复习 ${flashcardReviewedToday} 张`
                    : "今日没有待复习的卡片"}
            </span>
          </span>
          <span className="flex shrink-0 items-baseline gap-[3px]">
            <span className="text-butter text-[34px] font-extrabold tabular-nums leading-none">
              {flashcardDecksQuery.isLoading ? "…" : flashcardDue}
            </span>
            <span className="text-ink-3 text-base font-bold">张</span>
          </span>
        </button>

        {props.diaryEnabled && diaryBlock ? (
          <button
            type="button"
            onClick={props.onOpenDiary}
            className={`${BENTO_CARD_CLASS} bg-sage-soft text-left`}
            style={{ animationDelay: "0.07s" }}
          >
            <span className="text-sage block text-2xl font-extrabold tabular-nums leading-tight">
              {diaryBlock.streak}
              <em className="ml-0.5 text-[12.5px] font-semibold not-italic">天</em>
            </span>
            <span className="text-ink-2 mt-0.5 block text-[11.5px]">日记连续</span>
            <span className="mt-2 flex gap-[6px]">
              {diaryBlock.dots.map((dot, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={`h-[11px] w-[11px] rounded-full ${
                    dot.hit ? "bg-sage" : "bg-[var(--ring-track)]"
                  } ${dot.today && !dot.hit ? "shadow-[inset_0_0_0_2px_var(--sage)]" : ""}`}
                />
              ))}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={props.onOpenCards}
          className={`${BENTO_CARD_CLASS} bg-lilac-soft text-left`}
          style={{ animationDelay: "0.12s" }}
        >
          <span className="text-lilac block text-2xl font-extrabold tabular-nums leading-tight">
            {props.isLoadingCards && props.cardsTotal === 0 ? "…" : props.cardsTotal}
            <em className="ml-0.5 text-[12.5px] font-semibold not-italic">张</em>
          </span>
          <span className="text-ink-2 mt-0.5 block text-[11.5px]">卡片总数</span>
        </button>

        <button
          type="button"
          onClick={props.onOpenArticles}
          className={`${BENTO_CARD_CLASS} bg-apricot-soft text-left`}
          style={{ animationDelay: "0.17s" }}
        >
          <span className="text-apricot block text-2xl font-extrabold tabular-nums leading-tight">
            {homeStats ? homeStats.articlesTotal : "…"}
            <em className="ml-0.5 text-[12.5px] font-semibold not-italic">篇</em>
          </span>
          <span className="text-ink-2 mt-0.5 block text-[11.5px]">文章</span>
        </button>

        <button
          type="button"
          onClick={props.onOpenKnowledge}
          className={`${BENTO_CARD_CLASS} bg-sage-soft text-left`}
          style={{ animationDelay: "0.22s" }}
        >
          <span className="text-sage block text-2xl font-extrabold tabular-nums leading-tight">
            {homeStats ? homeStats.documentLibrariesTotal : "…"}
            <em className="ml-0.5 text-[12.5px] font-semibold not-italic">个</em>
          </span>
          <span className="text-ink-2 mt-0.5 block text-[11.5px]">
            知识库{homeStats ? ` · ${homeStats.knowledgeDocumentsTotal} 篇文档` : ""}
          </span>
        </button>

        <button
          type="button"
          onClick={props.onOpenProjects}
          className={`${BENTO_CARD_CLASS} bg-butter-soft col-span-2 flex items-center gap-[15px] text-left`}
          style={{ animationDelay: "0.27s" }}
        >
          <span className="flex shrink-0 items-baseline gap-[3px]">
            <span className="text-butter text-[34px] font-extrabold tabular-nums leading-none">
              {homeStats ? homeStats.projectsTotal : "…"}
            </span>
            <span className="text-ink-3 text-base font-bold">个</span>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="text-ink block text-[14.5px] font-bold">项目</span>
            <span className="text-ink-2 mt-0.5 block text-[12px]">
              {homeStats ? `${homeStats.projectDocumentsTotal} 篇项目文档` : "加载中"}
            </span>
          </span>
        </button>
      </div>

      {props.todoEnabled ? (
        <section className="mt-6">
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-ink text-[16.5px] font-extrabold">今日任务</h2>
            <button
              type="button"
              onClick={props.onOpenTodo}
              className="text-ink-3 active:text-ink text-[12.5px] font-semibold"
            >
              全部 ›
            </button>
          </div>
          <div className="list-group pop-in" style={{ animationDelay: "0.06s" }}>
            {todayTodos.length === 0 ? (
              <p className="text-ink-3 px-4 py-6 text-center text-[13px]">
                {todoStats && todoStats.total > 0
                  ? "今天的任务都完成了，休息一下"
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
        <div className="mb-2.5 flex items-baseline justify-between px-1">
          <h2 className="text-ink text-[16.5px] font-extrabold">最近</h2>
        </div>
        <div className="list-group pop-in px-4 py-1" style={{ animationDelay: "0.1s" }}>
          {props.isLoadingCards && recentFeed.length === 0 ? (
            <div className="space-y-3 py-3">
              {[1, 2].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="bg-input h-9 w-9 animate-pulse rounded-[13px]" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="bg-input h-3.5 w-3/4 animate-pulse rounded" />
                    <div className="bg-input h-3 w-16 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentFeed.length === 0 ? (
            <p className="text-ink-3 py-6 text-center text-[13px]">还没有动态，写下第一条记录吧</p>
          ) : (
            recentFeed.map(item => {
              const style = feedKindStyle[item.kind];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.action}
                  className="border-line active:bg-press -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 border-b border-dashed px-4 py-3 text-left last:border-b-0"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px]"
                    style={{ background: style.soft }}
                  >
                    <style.icon size={18} color={style.tone} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[14px] font-semibold">
                      {item.title}
                    </span>
                    <span className="text-ink-3 mt-0.5 flex items-center gap-1.5 text-[11.5px]">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.chip}`}
                      >
                        {style.label}
                      </span>
                      {formatRelativeTime(item.time)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function TodoSummaryRow({ title, onToggle }: { title: string; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <TodoCheck checked={false} onToggle={onToggle} />
      <span className="text-ink min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</span>
    </div>
  );
}

export default HomeDashboard;
