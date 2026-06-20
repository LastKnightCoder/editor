import React from "react";
import { FileText, BookOpen, FileCode } from "lucide-react";
import MiniBarChart from "../shared/MiniBarChart";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface ContentStatsCardProps {
  stats: {
    cardCount: number;
    articleCount: number;
    documentCount: number;
    totalWordCount: number;
  };
}

const ContentStatsCard: React.FC<ContentStatsCardProps> = ({ stats }) => {
  const themeColors = useThemeColors();
  const trendData = [12, 19, 15, 25, 22, 30, 28];
  const totalItems = stats.cardCount + stats.articleCount + stats.documentCount;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div
          className="flex items-center justify-between p-3 rounded-lg border transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <FileText
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <div>
              <span
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                卡片
              </span>
            </div>
          </div>
          <span
            className={classNames("text-2xl font-bold", themeColors.textClass)}
          >
            {stats.cardCount}
          </span>
        </div>

        <div
          className="flex items-center justify-between p-3 rounded-lg border transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <BookOpen
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <div>
              <span
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                文章
              </span>
            </div>
          </div>
          <span
            className={classNames("text-2xl font-bold", themeColors.textClass)}
          >
            {stats.articleCount}
          </span>
        </div>

        <div
          className="flex items-center justify-between p-3 rounded-lg border transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <FileCode
                className={classNames(
                  "w-5 h-5",
                  themeColors.secondaryTextClass,
                )}
              />
            </div>
            <div>
              <span
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                文档
              </span>
            </div>
          </div>
          <span
            className={classNames("text-2xl font-bold", themeColors.textClass)}
          >
            {stats.documentCount}
          </span>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-baseline justify-between mb-1">
          <span
            className={classNames("text-sm", themeColors.secondaryTextClass)}
          >
            共 {totalItems} 篇内容
          </span>
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            {stats.totalWordCount.toLocaleString()} 字
          </span>
        </div>
        <MiniBarChart data={trendData} height={48} />
        <div
          className={classNames(
            "text-xs text-center mt-1",
            themeColors.secondaryTextClass,
          )}
        >
          最近 7 天创作趋势
        </div>
      </div>
    </div>
  );
};

export default ContentStatsCard;
