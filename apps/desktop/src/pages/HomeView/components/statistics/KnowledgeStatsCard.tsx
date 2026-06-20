import React from "react";
import { FolderOpen, Layout, Tag } from "lucide-react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface KnowledgeStatsCardProps {
  stats: {
    projectCount: number;
    whiteboardCount: number;
    tagCount: number;
  };
}

const KnowledgeStatsCard: React.FC<KnowledgeStatsCardProps> = ({ stats }) => {
  const themeColors = useThemeColors();

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-between p-3 rounded-lg border transition-colors"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              "w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800",
            )}
          >
            <FolderOpen
              className={classNames("w-5 h-5", themeColors.secondaryTextClass)}
            />
          </div>
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            项目
          </span>
        </div>
        <span
          className={classNames("text-2xl font-bold", themeColors.textClass)}
        >
          {stats.projectCount}
        </span>
      </div>

      <div
        className="flex items-center justify-between p-3 rounded-lg border transition-colors"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              "w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800",
            )}
          >
            <Layout
              className={classNames("w-5 h-5", themeColors.secondaryTextClass)}
            />
          </div>
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            白板
          </span>
        </div>
        <span
          className={classNames("text-2xl font-bold", themeColors.textClass)}
        >
          {stats.whiteboardCount}
        </span>
      </div>

      <div
        className="flex items-center justify-between p-3 rounded-lg border transition-colors"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              "w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800",
            )}
          >
            <Tag
              className={classNames("w-5 h-5", themeColors.secondaryTextClass)}
            />
          </div>
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            标签
          </span>
        </div>
        <span
          className={classNames("text-2xl font-bold", themeColors.textClass)}
        >
          {stats.tagCount}
        </span>
      </div>
    </div>
  );
};

export default KnowledgeStatsCard;
