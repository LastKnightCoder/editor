import React from "react";
import classNames from "classnames";
import useHomeData from "./hooks/useHomeData";
import useThemeColors from "@/hooks/useThemeColors";
import { Loader2 } from "lucide-react";
import { startPomodoroSession } from "@/commands/pomodoro";
import TodoPanel from "./components/TodoPanel";
import FlashcardPanel from "./components/FlashcardPanel";
import QuestionPanel from "./components/QuestionPanel";
import PomodoroPanel from "./components/PomodoroPanel";
import RecentActivity from "./components/RecentActivity";
import ActivityDashboard from "./components/activity/ActivityDashboard";
import DiaryTimelineSection from "./components/DiaryTimelineSection";

const HomePage: React.FC = () => {
  const themeColors = useThemeColors();
  const { data, refresh, saveDiary, createTodayDiary } = useHomeData();

  const handleStartPomodoro = async (presetId: number, expectedMs?: number) => {
    await startPomodoroSession(presetId, expectedMs);
    refresh();
  };

  return (
    <div className="w-full h-full overflow-auto">
      <div className="max-w-[1200px] mx-auto px-8 py-10">
        {/* Loading State */}
        {data.loading && (
          <div className="flex items-center justify-center py-20">
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
          <div className="space-y-6">
            <ActivityDashboard
              activityHeatmap={data.activityHeatmap}
              contentTrend={data.contentTrend}
            />

            {/* Section: 最近动态 */}
            <section>
              <RecentActivity recentActivity={data.recentActivity} />
            </section>

            {/* Section: 日记时间轴 */}
            <DiaryTimelineSection
              recentDiaries={data.recentDiaries}
              todayDiaryExists={data.todayDiaryExists}
              onSaveDiary={saveDiary}
              onCreateToday={createTodayDiary}
            />

            {/* Section: 需要关注 */}
            <section>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TodoPanel
                  items={data.todoItems}
                  groups={data.todoGroups}
                  pendingTotal={data.summary.pendingTodos}
                  overdueTotal={data.summary.overdueTodos}
                  onRefresh={refresh}
                />
                <FlashcardPanel
                  decks={data.flashcardDecks}
                  totalDue={data.summary.flashcardsDue}
                />
                <QuestionPanel
                  items={data.questionItems}
                  groups={data.questionGroups}
                />
                <PomodoroPanel
                  todayStats={data.summary.pomodoroToday}
                  activeSession={data.activeSession}
                  presets={data.pomodoroPresets}
                  onStartSession={handleStartPomodoro}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
