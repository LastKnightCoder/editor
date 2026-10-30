// 根页（今天 Tab）：纯仪表盘。卡片列表在「卡片库」Tab，底部导航由全局 AppDock 提供。
// 由 PageHost 以 rootContent 渲染：非根时经 Activity hidden 隔离（无惯性滚动/交互）。

import { useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Search } from "lucide-react";
import { HomeDashboard } from "../features/home/HomeDashboard";
import { AskBar } from "../features/aiChat/AskBar";
import { useTodayAgenda } from "../features/home/useTodayAgenda";
import { useTodoStore } from "../features/todo/store/useTodoStore";
import { useEdgeFade } from "../hooks/useScrollState";
import { useRootScrollLock } from "../router/useRootScrollLock";
import { useRouterContext, switchTabScreen } from "../router";
import { useAppContext } from "./AppContext";
import { describeDiaryPeriod, getBaseDateFromDiaryKey } from "../features/diary/dateKey";
import { getTodayDateKey } from "../features/diary/feedUtils";
import { useDiaryStore } from "../features/diary/store/useDiaryStore";
import type { DiaryEntry, DiarySegment } from "../types";

const RECENT_CARD_COUNT = 6;

function getGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatHeadDate(now: Date): string {
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${weekday}`;
}

export function HomeScreen() {
  const now = useMemo(() => new Date(), []);
  const app = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const { state, navigator } = useRouterContext();
  const topKey = state.screens.entries[state.screens.entries.length - 1]?.key;
  useRootScrollLock(topKey !== "home");

  const onPreviewCard = useMemoizedFn((cardId: number) => {
    navigator.push("contentDetail", { cardId });
  });
  const onOpenSearch = useMemoizedFn(() => navigator.push("search"));
  const onOpenCards = useMemoizedFn(() => switchTabScreen(navigator, "cardsLibrary"));
  const onOpenDiary = useMemoizedFn(() => switchTabScreen(navigator, "diaryHome"));
  const onOpenArticles = useMemoizedFn(() => navigator.push("articles"));
  const onOpenProjects = useMemoizedFn(() => navigator.push("projects"));
  const onOpenDiaryEntry = useMemoizedFn((entry: DiaryEntry, segment: DiarySegment) => {
    const baseDate = getBaseDateFromDiaryKey(entry.type, entry.date);
    navigator.push("contentDetail", {
      contentId: segment.contentId,
      contentTitle: "",
      fromDiary: true,
      diaryDate: describeDiaryPeriod(entry.type, baseDate),
    });
  });
  const onOpenArticle = useMemoizedFn((articleId: number) =>
    navigator.push("articleEditor", { articleId })
  );
  const onOpenProjectDoc = useMemoizedFn((itemId: number) =>
    navigator.push("projectDocEditor", { itemId })
  );
  const onOpenTodo = useMemoizedFn(() => {
    const databaseName =
      app.syncSettings.safeSetting?.database?.active ??
      app.bootstrap.databases?.activeDatabase ??
      null;
    void useTodoStore.getState().initialize(databaseName);
    navigator.push("todo");
  });
  const onOpenPomodoro = useMemoizedFn(() => navigator.push("pomodoro"));
  const onOpenCalendar = useMemoizedFn(() => navigator.push("calendarHome"));
  const onOpenFlashcards = useMemoizedFn(() => navigator.push("flashcardHome"));
  const onStartFlashcardReview = useMemoizedFn(() =>
    navigator.push("flashcardReview", { deckId: -1 })
  );
  // 发新日记：与日记页顶部入口一致，新建今天的 segment 而非打开当天已有日记
  const onComposeDiary = useMemoizedFn(() => {
    void (async () => {
      try {
        const today = getTodayDateKey();
        const contentId = await useDiaryStore.getState().startNewSegment("daily", today);
        if (typeof contentId !== "number" || contentId <= 0) {
          throw new Error("DIARY_CONTENT_NOT_FOUND");
        }
        navigator.push("contentDetail", {
          contentId,
          contentTitle: "",
          fromDiary: true,
          diaryDate: describeDiaryPeriod("daily", today),
        });
      } catch (error) {
        app.presentError(error, "打开日记失败");
      }
    })();
  });
  const onError = useMemoizedFn((error: unknown, fallback: string) => {
    app.presentError(error, fallback);
  });

  const modules = {
    todoEnabled: app.todoModuleEnabled,
    diaryEnabled: app.diaryModuleEnabled,
    pomodoroEnabled: app.pomodoroModuleEnabled,
    calendarEnabled: app.calendarModuleEnabled,
  };
  const agenda = useTodayAgenda(modules);
  const agendaHint =
    agenda.items.length === 0
      ? ""
      : agenda.pendingCount > 0
        ? ` · 今天还有 ${agenda.pendingCount} 件事`
        : " · 今天的事都做完了";

  const cards = app.cards.cards;
  const recentItems = cards?.items.slice(0, RECENT_CARD_COUNT) ?? [];

  return (
    <div className="bg-page relative flex h-full flex-col">
      <header className="flex items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <div>
          <h1 className="text-ink-1 text-2xl font-extrabold tracking-tight">{getGreeting(now)}</h1>
          <p className="text-ink-2 mt-1 text-[12.5px]">
            {formatHeadDate(now)}
            {agendaHint}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="搜索所有内容"
          className="bg-surface text-ink-2 shadow-card grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200 active:scale-88"
        >
          <Search size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>
      <div
        ref={scrollRef}
        className="edge-fade-scroll dock-pad scrollbar-hide flex-1 overflow-y-auto overscroll-y-contain"
      >
        <AskBar />
        <HomeDashboard
          cardsTotal={cards?.total ?? 0}
          recentCards={recentItems}
          isLoadingCards={app.cards.isLoadingCards}
          {...modules}
          onOpenCards={onOpenCards}
          onOpenTodo={onOpenTodo}
          onOpenPomodoro={onOpenPomodoro}
          onOpenCalendar={onOpenCalendar}
          onOpenFlashcards={onOpenFlashcards}
          onStartFlashcardReview={onStartFlashcardReview}
          onComposeDiary={onComposeDiary}
          onOpenDiary={onOpenDiary}
          onOpenArticles={onOpenArticles}
          onOpenProjects={onOpenProjects}
          onOpenDiaryEntry={onOpenDiaryEntry}
          onOpenArticle={onOpenArticle}
          onOpenProjectDoc={onOpenProjectDoc}
          onPreviewCard={onPreviewCard}
          onError={onError}
        />
      </div>
    </div>
  );
}
