import { useMobileHomeI18n } from "../features/home/i18n";
// 根页（今天 Tab）：纯仪表盘。卡片列表在「卡片库」Tab，底部导航由全局 AppDock 提供。
// 由 PageHost 以 rootContent 渲染：非根时经 Activity hidden 隔离（无惯性滚动/交互）。

import { useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Search } from "lucide-react";
import { HomeDashboard } from "../features/home/HomeDashboard";
import { AskBar } from "../features/aiChat/AskBar";
import { PluginHomePanels } from "../features/home/PluginHomePanels";
import { useTodayAgenda } from "../features/home/useTodayAgenda";
import { useTodoStore } from "../features/todo/store/useTodoStore";
import { useEdgeFade } from "../hooks/useScrollState";
import { useRootScrollLock } from "../router/useRootScrollLock";
import { useRouterContext, switchTabScreen } from "../router";
import { useAppContext } from "./AppContext";
import { getBaseDateFromDiaryKey } from "../features/diary/dateKey";
import { getTodayDateKey } from "../features/diary/feedUtils";
import { useDiaryStore } from "../features/diary/store/useDiaryStore";
import type { DiaryEntry, DiarySegment } from "../types";

const RECENT_CARD_COUNT = 6;

function getGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 5) return "greeting.night";
  if (hour < 11) return "greeting.morning";
  if (hour < 13) return "greeting.noon";
  if (hour < 18) return "greeting.afternoon";
  return "greeting.evening";
}

function formatHeadDate(now: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
}

export function HomeScreen() {
  const { t, locale } = useMobileHomeI18n();
  const number = new Intl.NumberFormat(locale);
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
      diaryDate: { mode: entry.type, baseDate: baseDate },
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
          diaryDate: { mode: "daily", baseDate: today },
        });
      } catch (error) {
        app.presentError(error, t("error.diaryOpen"));
      }
    })();
  });
  const onError = useMemoizedFn((error: unknown, fallback: string) => {
    app.presentError(error, fallback);
  });

  const agenda = useTodayAgenda();
  const agendaHint =
    agenda.items.length === 0
      ? ""
      : agenda.pendingCount > 0
        ? t("header.pending", {
            count: agenda.pendingCount,
            value: number.format(agenda.pendingCount),
          })
        : t("header.done");

  const cards = app.cards.cards;
  const recentItems = cards?.items.slice(0, RECENT_CARD_COUNT) ?? [];

  return (
    <div className="bg-page relative flex h-full flex-col">
      <header className="mx-auto flex w-full max-w-[960px] items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <div>
          <h1 className="text-ink-1 text-2xl font-extrabold tracking-tight">
            {t(getGreeting(now))}
          </h1>
          <p className="text-ink-2 mt-1 text-[12.5px]">
            {formatHeadDate(now, locale)}
            {agendaHint}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label={t("header.search")}
          // 中等与宽档由左导航条底部的搜索承担
          className="medium:hidden bg-surface text-ink-2 shadow-card grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200 active:scale-88"
        >
          <Search size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>
      <div
        ref={scrollRef}
        className="edge-fade-scroll dock-pad scrollbar-hide flex-1 overflow-y-auto overscroll-y-contain"
      >
        {/* 宽屏仍是一列，顺序同手机；多出的宽度只给插件卡片按宽度多排 */}
        <div className="mx-auto w-full max-w-[960px]">
          <AskBar />
          <PluginHomePanels />
          <HomeDashboard
            cardsTotal={cards?.total ?? 0}
            recentCards={recentItems}
            isLoadingCards={app.cards.isLoadingCards}
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
    </div>
  );
}
