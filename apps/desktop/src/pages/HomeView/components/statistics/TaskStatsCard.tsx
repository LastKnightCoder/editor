import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface TaskStatsCardProps {
  stats: {
    todoTotal: number;
    todoCompleted: number;
    questionTotal: number;
    questionAnswered: number;
  };
}

const TaskStatsCard: React.FC<TaskStatsCardProps> = ({ stats }) => {
  const themeColors = useThemeColors();

  const todoCompletionRate =
    stats.todoTotal > 0
      ? Math.round((stats.todoCompleted / stats.todoTotal) * 100)
      : 0;

  const questionResolutionRate =
    stats.questionTotal > 0
      ? Math.round((stats.questionAnswered / stats.questionTotal) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div
        className="p-4 rounded-lg border"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            待办任务
          </span>
          <span
            className={classNames(
              "text-base font-semibold",
              themeColors.textClass,
            )}
          >
            {stats.todoCompleted} / {stats.todoTotal}
          </span>
        </div>
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 bg-gray-800 dark:bg-gray-300"
            style={{
              width: `${todoCompletionRate}%`,
            }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <span
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            {todoCompletionRate}% 完成
          </span>
          {stats.todoTotal - stats.todoCompleted > 0 && (
            <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
              还剩 {stats.todoTotal - stats.todoCompleted} 个
            </span>
          )}
        </div>
      </div>

      <div
        className="p-4 rounded-lg border"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            问题解决
          </span>
          <span
            className={classNames(
              "text-base font-semibold",
              themeColors.textClass,
            )}
          >
            {stats.questionAnswered} / {stats.questionTotal}
          </span>
        </div>
        <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 bg-gray-800 dark:bg-gray-300"
            style={{
              width: `${questionResolutionRate}%`,
            }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <span
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            {questionResolutionRate}% 已解决
          </span>
          {stats.questionTotal - stats.questionAnswered > 0 && (
            <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
              还剩 {stats.questionTotal - stats.questionAnswered} 个
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskStatsCard;
