import React from "react";
import classNames from "classnames";
import dayjs from "dayjs";
import { App as AntApp } from "antd";
import CalendarHeatmap from "@/components/CalendarHeatmap";
import useHomeData from "./hooks/useHomeData";
import useThemeColors from "@/hooks/useThemeColors";
import { Loader2 } from "lucide-react";
import {
  startPomodoroSession,
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
} from "@/commands/pomodoro";
import TodoPanel from "./components/TodoPanel";
import FlashcardPanel from "./components/FlashcardPanel";
import QuestionPanel from "./components/QuestionPanel";
import PomodoroPanel from "./components/PomodoroPanel";
import RssPanel from "./components/RssPanel";
import RecentActivity from "./components/RecentActivity";
import ActivityDashboard from "./components/activity/ActivityDashboard";
import DiaryTimelineSection from "./components/DiaryTimelineSection";
import { useTabContext } from "@/contexts/TabContext";
import useTabStore from "@/stores/useTabStore";
import type { PomodoroSession } from "@/types/pomodoro";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const computeElapsedMs = (session: PomodoroSession): number => {
  const now = Date.now();
  let pauseTotalMs = session.pauseTotalMs;
  if (session.status === "paused") {
    const lastPause = session.pauses[session.pauses.length - 1];
    if (lastPause && lastPause.end === undefined) {
      pauseTotalMs += now - lastPause.start;
    }
  }
  return Math.max(0, now - session.startTime - pauseTotalMs);
};

const HomePage: React.FC = () => {
  const themeColors = useThemeColors();
  const { modal } = AntApp.useApp();
  const { tab: homeTab, paneId: homePaneId } = useTabContext();
  const isActiveTab = useTabStore(
    (s) => s.panes.find((p) => p.id === homePaneId)?.activeTabId === homeTab.id,
  );
  const isFirstActivation = React.useRef(true);
  const {
    data,
    refresh,
    refreshFlashcards,
    refreshRss,
    refreshPomodoro,
    setActiveSession,
    createSegmentNow,
    updateSegment,
    deleteSegment,
    updateDiaryTags,
    upsertTagSetting,
    deleteTagSetting,
  } = useHomeData();

  const handleStartPomodoro = async (presetId: number, expectedMs?: number) => {
    const session = await startPomodoroSession(presetId, expectedMs);
    setActiveSession(session);
    void refreshPomodoro();
  };

  const handlePausePomodoro = async () => {
    const session = await pausePomodoroSession();
    if (session) setActiveSession(session);
  };

  const handleResumePomodoro = async () => {
    const session = await resumePomodoroSession();
    if (session) setActiveSession(session);
  };

  const handleStopPomodoro = () => {
    const session = data.activeSession;
    if (!session) return;

    const doStop = async () => {
      await stopPomodoroSession(true);
      setActiveSession(null);
      void refreshPomodoro();
    };

    if (computeElapsedMs(session) < FIVE_MINUTES_MS) {
      modal.confirm({
        title: "专注时长不足 5 分钟",
        content: "当前专注时长不足 5 分钟，是否放弃本次记录？",
        okText: "放弃",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: doStop,
      });
    } else {
      void doStop();
    }
  };

  // 切回首页 Tab 时刷新 RSS 未读列表，反映在 Feed Tab 中标记的已读状态
  React.useEffect(() => {
    if (!isActiveTab) return;
    if (isFirstActivation.current) {
      isFirstActivation.current = false;
      return;
    }
    void refreshRss();
  }, [isActiveTab, refreshRss]);

  return (
    <div className="w-full h-full overflow-auto">
      <div className="min-h-full max-w-[1200px] mx-auto px-8 py-10">
        {/* Loading State */}
        {data.loading && (
          <div className="flex min-h-[calc(100vh-80px)] items-center justify-center">
            <Loader2
              className={classNames(
                "w-8 h-8 animate-spin",
                themeColors.secondaryTextClass,
              )}
            />
          </div>
        )}

        {/* Main Content */}
        {!data.loading && (
          <div className="space-y-10">
            {/* 热力图：全宽独占 */}
            <CalendarHeatmap
              className="px-1"
              data={data.activityHeatmap}
              year={dayjs().format("YYYY")}
              renderTooltip={(date, value) =>
                `${date}: ${value?.count ?? 0} 次操作`
              }
            />

            {/* 左右分栏：主栏（动态流）+ 侧栏（工作台） */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
              {/* 主栏：浏览型内容（去边框，细分割线 + 大留白分隔） */}
              <main className="min-w-0 space-y-10">
                <ActivityDashboard contentTrend={data.contentTrend} />

                <section className="border-t border-[var(--th-divide)] pt-10">
                  <RecentActivity recentActivity={data.recentActivity} />
                </section>

                <section className="border-t border-[var(--th-divide)] pt-10">
                  <DiaryTimelineSection
                    recentSegments={data.recentSegments}
                    tagSettings={data.tagSettings}
                    tagUsageCounts={data.tagUsageCounts}
                    onCreateSegmentNow={createSegmentNow}
                    onSegmentChange={updateSegment}
                    onSegmentDelete={deleteSegment}
                    onTagsChange={updateDiaryTags}
                    onTagSettingChange={upsertTagSetting}
                    onTagSettingDelete={deleteTagSetting}
                  />
                </section>
              </main>

              {/* 侧栏：操作型工作台（常驻堆叠，窄屏降级为 2 列网格） */}
              <aside className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-col">
                <QuestionPanel
                  items={data.questionItems}
                  groups={data.questionGroups}
                />
                <RssPanel
                  items={data.rssItems}
                  feeds={data.rssFeeds}
                  unreadTotal={data.summary.rssUnread}
                  loading={data.rssLoading}
                  onRefresh={refreshRss}
                />
                <TodoPanel
                  items={data.todoItems}
                  groups={data.todoGroups}
                  pendingTotal={data.summary.pendingTodos}
                  overdueTotal={data.summary.overdueTodos}
                  onRefresh={refresh}
                />
                <FlashcardPanel
                  reviewQueue={data.flashcardItems}
                  decks={data.flashcardDecks}
                  totalDue={data.summary.flashcardsDue}
                  loading={data.flashcardsLoading}
                  onRefresh={refreshFlashcards}
                />
                <PomodoroPanel
                  todayStats={data.summary.pomodoroToday}
                  activeSession={data.activeSession}
                  presets={data.pomodoroPresets}
                  recentSessions={data.pomodoroRecentSessions}
                  onStartSession={handleStartPomodoro}
                  onPauseSession={handlePausePomodoro}
                  onResumeSession={handleResumePomodoro}
                  onStopSession={handleStopPomodoro}
                />
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
