import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { FileText, BookOpen, FolderOpen, FileCode } from "lucide-react";
import { IArticle, ICard, IDocumentItem, ProjectItem } from "@/types";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

interface RecentActivityProps {
  recentActivity: {
    cards: ICard[];
    articles: IArticle[];
    projectItems: ProjectItem[];
    documentItems: IDocumentItem[];
  };
}

const RecentActivity: React.FC<RecentActivityProps> = ({ recentActivity }) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();

  const allItems = React.useMemo(() => {
    const items: Array<{
      id: number;
      title: string;
      type: "card" | "article" | "project" | "document";
      tags?: string[];
      updatedAt: number;
      icon: React.ReactNode;
    }> = [];

    recentActivity.cards.forEach((card) => {
      items.push({
        id: card.id,
        title: card.tags?.join(", ") || "无标题",
        type: "card",
        tags: card.tags,
        updatedAt: card.update_time || card.create_time,
        icon: <FileText className="w-5 h-5" />,
      });
    });

    recentActivity.articles.forEach((article) => {
      items.push({
        id: article.id,
        title: article.title || "无标题",
        type: "article",
        tags: article.tags,
        updatedAt: article.update_time || article.create_time,
        icon: <BookOpen className="w-5 h-5" />,
      });
    });

    recentActivity.projectItems.forEach((project) => {
      items.push({
        id: project.id,
        title: project.title || "无标题",
        type: "project",
        tags: [],
        updatedAt: project.updateTime || project.createTime,
        icon: <FolderOpen className="w-5 h-5" />,
      });
    });

    recentActivity.documentItems.forEach((doc) => {
      items.push({
        id: doc.id,
        title: doc.title || "无标题",
        type: "document",
        tags: doc.tags || [],
        updatedAt: doc.updateTime || doc.createTime,
        icon: <FileCode className="w-5 h-5" />,
      });
    });

    return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  }, [recentActivity]);

  const getRelativeTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const handleItemClick = (item: (typeof allItems)[0]) => {
    switch (item.type) {
      case "card":
        createTab(TabType.CardDetail, { id: item.id });
        break;
      case "article":
        createTab(TabType.ArticleDetail, { id: item.id });
        break;
      case "project":
        createTab(TabType.ProjectDetail, { id: item.id });
        break;
      case "document":
        createTab(TabType.DocumentDetail, { id: item.id });
        break;
    }
  };

  if (allItems.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        暂无最近活动
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {allItems.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          onClick={() => handleItemClick(item)}
          className={classNames(
            "group p-4 rounded-xl cursor-pointer transition-colors",
            "border",
            themeColors.cardBorderClass,
            themeColors.hoverClass,
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={classNames(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                "bg-gray-100 dark:bg-gray-800",
              )}
            >
              <div className={themeColors.secondaryTextClass}>{item.icon}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={classNames(
                  "text-sm font-medium truncate mb-1",
                  themeColors.textClass,
                )}
              >
                {item.title}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {item.tags && item.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {item.tags.slice(0, 2).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <span
                  className={classNames(
                    "text-xs",
                    themeColors.secondaryTextClass,
                  )}
                >
                  {getRelativeTime(item.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecentActivity;
