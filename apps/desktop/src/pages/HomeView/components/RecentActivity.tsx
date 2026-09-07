import React, { useMemo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { getRootDocumentsByDocumentItemId } from "@/commands";
import { FileText, BookOpen, FolderOpen, File } from "lucide-react";
import type { ICard, IArticle, IDocumentItem, ProjectItem } from "@/types";
import type { Descendant } from "slate";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

// 从 Slate content 中提取纯文本摘要（ICard 没有 title 字段）
function extractPlainText(nodes: Descendant[], maxLen = 40): string {
  let text = "";
  const walk = (node: unknown) => {
    if (text.length >= maxLen) return;
    if (typeof node === "object" && node !== null) {
      if ("text" in node && typeof (node as { text: string }).text === "string") {
        text += (node as { text: string }).text;
      }
      if ("children" in node && Array.isArray((node as { children: unknown[] }).children)) {
        for (const child of (node as { children: unknown[] }).children) {
          walk(child);
          if (text.length >= maxLen) break;
        }
      }
    }
  };
  for (const n of nodes) {
    walk(n);
    if (text.length >= maxLen) break;
  }
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

interface RecentActivityProps {
  recentActivity: {
    cards: ICard[];
    articles: IArticle[];
    projectItems: ProjectItem[];
    documentItems: IDocumentItem[];
  };
}

interface ActivityItem {
  id: string;
  title: string;
  type: "card" | "article" | "project" | "document";
  updateTime: number;
  onClick: () => void;
}

const TYPE_CONFIG = {
  card: {
    icon: FileText,
    label: "卡片",
    color: "text-[var(--th-accent)]",
    bg: "bg-[var(--th-accent)]/10",
  },
  article: {
    icon: BookOpen,
    label: "文章",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  project: {
    icon: FolderOpen,
    label: "项目文档",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  document: {
    icon: File,
    label: "知识库文档",
    color: "text-[var(--th-accent)]",
    bg: "bg-purple-500/10",
  },
};

const RecentActivity: React.FC<RecentActivityProps> = ({ recentActivity }) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();

  const allItems: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];
    const oneMonthAgo = dayjs().subtract(1, "month").valueOf();

    recentActivity.cards.forEach(card => {
      items.push({
        id: `card-${card.id}`,
        title: extractPlainText(card.content) || "无标题卡片",
        type: "card",
        updateTime: card.update_time,
        onClick: () => createTab(TabType.CardDetail, { id: card.id }),
      });
    });

    recentActivity.articles.forEach(article => {
      items.push({
        id: `article-${article.id}`,
        title: article.title || "无标题文章",
        type: "article",
        updateTime: article.update_time,
        onClick: () => createTab(TabType.ArticleDetail, { id: article.id }),
      });
    });

    recentActivity.projectItems.forEach(project => {
      const projectId = project.projects[0];
      items.push({
        id: `project-${project.id}`,
        title: project.title || "无标题项目",
        type: "project",
        updateTime: project.updateTime,
        onClick: () => {
          if (!projectId) return createTab(TabType.ProjectList);
          createTab(TabType.ProjectDetail, {
            id: projectId,
            itemId: project.id,
          });
        },
      });
    });

    recentActivity.documentItems.forEach(doc => {
      items.push({
        id: `doc-${doc.id}`,
        title: doc.title || "无标题文档",
        type: "document",
        updateTime: doc.updateTime,
        onClick: async () => {
          const documents = await getRootDocumentsByDocumentItemId(doc.id);
          const rootDocument = documents[0];
          if (!rootDocument) return createTab(TabType.DocumentList);
          createTab(TabType.DocumentDetail, {
            id: rootDocument.id,
            itemId: doc.id,
          });
        },
      });
    });

    return items
      .filter(item => item.updateTime >= oneMonthAgo)
      .sort((a, b) => b.updateTime - a.updateTime)
      .slice(0, 10);
  }, [recentActivity, createTab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={classNames("text-sm font-semibold", themeColors.textClass)}>最近动态</h3>
        <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
          {allItems.length}
        </span>
      </div>

      {allItems.length === 0 ? (
        <div className={classNames("py-6 text-center text-sm", themeColors.secondaryTextClass)}>
          暂无最近动态
        </div>
      ) : (
        <div className="grid gap-1.5">
          {allItems.map(item => {
            const config = TYPE_CONFIG[item.type];
            const Icon = config.icon;

            return (
              <button
                key={item.id}
                type="button"
                className={classNames(
                  "grid grid-cols-[108px_minmax(0,1fr)_86px] items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                  themeColors.hoverClass
                )}
                onClick={item.onClick}
              >
                <span
                  className={classNames(
                    "inline-flex items-center gap-1.5 whitespace-nowrap text-xs",
                    themeColors.secondaryTextClass
                  )}
                >
                  <span
                    className={classNames(
                      "flex h-6 w-6 items-center justify-center rounded-md",
                      config.bg
                    )}
                  >
                    <Icon className={classNames("h-3.5 w-3.5", config.color)} />
                  </span>
                  {config.label}
                </span>
                <span className={classNames("truncate text-sm", themeColors.textClass)}>
                  {item.title}
                </span>
                <span
                  className={classNames(
                    "text-right text-xs tabular-nums",
                    themeColors.secondaryTextClass
                  )}
                >
                  {dayjs(item.updateTime).fromNow()}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecentActivity;
