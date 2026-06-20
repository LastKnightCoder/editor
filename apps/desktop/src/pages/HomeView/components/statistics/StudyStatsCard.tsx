import React from "react";
import { Timer, Calendar as CalendarIcon, BookOpen } from "lucide-react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface StudyStatsCardProps {
  stats: {
    deckCount: number;
    cardCount: number;
    reviewsThisWeek: number;
    pomodoroTimeToday: number;
    pomodoroTimeWeek: number;
    eventsThisWeek: number;
  };
  activityHeatmap: Record<string, number>;
}

const StudyStatsCard: React.FC<StudyStatsCardProps> = ({ stats }) => {
  const themeColors = useThemeColors();

  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div
          className="text-center p-4 rounded-lg border"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center justify-center mb-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <BookOpen
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
          </div>
          <div
            className={classNames(
              "text-2xl font-bold mb-1",
              themeColors.textClass,
            )}
          >
            {stats.deckCount}
          </div>
          <div
            className={classNames("text-sm", themeColors.secondaryTextClass)}
          >
            卡组
          </div>
          <div
            className={classNames(
              "text-xs mt-1",
              themeColors.secondaryTextClass,
            )}
          >
            {stats.cardCount} 张闪卡
          </div>
        </div>
        <div
          className="text-center p-4 rounded-lg border"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center justify-center mb-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <BookOpen
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
          </div>
          <div
            className={classNames(
              "text-2xl font-bold mb-1",
              themeColors.textClass,
            )}
          >
            {stats.reviewsThisWeek}
          </div>
          <div
            className={classNames("text-sm", themeColors.secondaryTextClass)}
          >
            本周复习
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div
          className="flex items-center justify-between p-3 rounded-lg border transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Timer
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <span
              className={classNames(
                "text-sm font-medium",
                themeColors.textClass,
              )}
            >
              今日专注
            </span>
          </div>
          <span
            className={classNames("text-base font-bold", themeColors.textClass)}
          >
            {formatMinutes(stats.pomodoroTimeToday)}
          </span>
        </div>

        <div
          className="flex items-center justify-between p-3 rounded-lg border transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Timer
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <span
              className={classNames(
                "text-sm font-medium",
                themeColors.textClass,
              )}
            >
              本周专注
            </span>
          </div>
          <span
            className={classNames("text-base font-bold", themeColors.textClass)}
          >
            {formatMinutes(stats.pomodoroTimeWeek)}
          </span>
        </div>

        <div
          className="flex items-center justify-between p-3 rounded-lg border transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <CalendarIcon
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <span
              className={classNames(
                "text-sm font-medium",
                themeColors.textClass,
              )}
            >
              本周日程
            </span>
          </div>
          <span
            className={classNames("text-base font-bold", themeColors.textClass)}
          >
            {stats.eventsThisWeek} 个
          </span>
        </div>
      </div>
    </div>
  );
};

export default StudyStatsCard;
