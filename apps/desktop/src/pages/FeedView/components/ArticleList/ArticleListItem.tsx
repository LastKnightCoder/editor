import {
  BookOutlined,
  CheckOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  StarFilled,
  StarOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import useThemeColors from "@/hooks/useThemeColors";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import type { UnifiedArticleItem } from "../../types";
import type { ArticleProjectTarget } from "../../utils/articleProjectTargets";
import { isBilibiliVideoArticle } from "../../utils/bilibiliVideoMeta";

interface ArticleListItemProps {
  item: UnifiedArticleItem;
  isActive: boolean;
  onClick: () => void;
  projectTarget?: ArticleProjectTarget | null;
  onToggleStar?: (item: UnifiedArticleItem) => void;
  onMarkRead?: (item: UnifiedArticleItem) => void;
  onToggleReadLater?: (item: UnifiedArticleItem) => void;
  onArchive?: (item: UnifiedArticleItem) => void;
  onUnarchive?: (item: UnifiedArticleItem) => void;
  onDelete?: (item: UnifiedArticleItem) => void;
  onAddToProject?: (item: UnifiedArticleItem) => void;
  onOpenProject?: (target: ArticleProjectTarget) => void;
}

export default function ArticleListItem({
  item,
  isActive,
  onClick,
  projectTarget,
  onToggleStar,
  onMarkRead,
  onToggleReadLater,
  onArchive,
  onUnarchive,
  onDelete,
  onAddToProject,
  onOpenProject,
}: ArticleListItemProps) {
  const themeColors = useThemeColors();
  const isBilibiliVideo = isBilibiliVideoArticle({
    url: item.url,
    content: item.content,
  });

  const menuItems: MenuProps["items"] = [];

  if (onToggleStar) {
    menuItems.push({
      key: "star",
      label: item.isStarred ? "取消收藏" : "收藏",
      icon: item.isStarred ? (
        <StarFilled className="text-amber-500" />
      ) : (
        <StarOutlined />
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onToggleStar(item);
      },
    });
  }

  if (item.source === "rss" && onToggleReadLater) {
    menuItems.push({
      key: "read-later",
      label: "稍后读",
      icon: <BookOutlined />,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onToggleReadLater(item);
      },
    });
  }

  if (item.source === "rss" && !item.isRead && onMarkRead) {
    menuItems.push({
      key: "mark-read",
      label: "标记为已读",
      icon: <CheckOutlined />,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onMarkRead(item);
      },
    });
  }

  if (projectTarget && onOpenProject) {
    menuItems.push({
      key: "open-project",
      label: "打开所在项目",
      icon: <FolderOpenOutlined />,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onOpenProject(projectTarget);
      },
    });
  } else if (item.url && onAddToProject) {
    menuItems.push({
      key: "add-to-project",
      label: isBilibiliVideo ? "添加到项目视频笔记" : "添加到项目文档",
      icon: <FolderOpenOutlined />,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onAddToProject(item);
      },
    });
  }

  if (item.source === "readlater" && (onArchive || onUnarchive)) {
    menuItems.push({
      key: "archive",
      label: item.isArchived ? "取消归档" : "归档",
      icon: item.isArchived ? <UndoOutlined /> : <InboxOutlined />,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        if (item.isArchived) {
          onUnarchive?.(item);
        } else {
          onArchive?.(item);
        }
      },
    });
  }

  if (item.source === "readlater" && onDelete) {
    menuItems.push({
      key: "delete",
      label: "删除",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        onDelete(item);
      },
    });
  }

  const content = (
    <div
      className={`group relative flex items-start gap-3 rounded-xl px-4 py-3.5 cursor-pointer transition-all duration-200 mb-1 ${
        isActive
          ? `${themeColors.activeClass} shadow-sm`
          : item.isRead
            ? `opacity-55 ${themeColors.hoverClass} hover:opacity-75`
            : `${themeColors.hoverClass} hover:shadow-sm hover:-translate-y-px`
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div
          className={`text-[14px] leading-snug line-clamp-2 flex items-start gap-1.5 ${themeColors.textClass} ${!item.isRead && !isActive ? "font-semibold" : "font-normal"}`}
        >
          {!item.isRead && !isActive && (
            <span
              className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${themeColors.badgeBgClass}`}
            />
          )}
          {item.title}
        </div>
        {item.excerpt && (
          <div
            className={`mt-1.5 text-[12px] leading-relaxed line-clamp-2 ${themeColors.secondaryTextClass}`}
          >
            {item.excerpt.slice(0, 100)}
          </div>
        )}
        <div
          className={`mt-2 flex items-center gap-2 text-[11px] ${themeColors.secondaryTextClass}`}
        >
          <span
            className={`${themeColors.tagBgClass} ${themeColors.tagTextClass} rounded-md px-2 py-0.5 font-medium`}
          >
            {item.badge}
          </span>
          {item.author && (
            <span className="truncate max-w-[100px]">{item.author}</span>
          )}
          {item.publishedAt && (
            <span>{formatRelativeTime(item.publishedAt)}</span>
          )}
        </div>
      </div>
      {item.isStarred ? (
        <StarFilled className="flex-shrink-0 text-xs text-amber-400 drop-shadow-sm mt-1 transition-all duration-200" />
      ) : (
        <StarFilled className="flex-shrink-0 text-xs text-amber-400 mt-1 opacity-0 group-hover:opacity-40 transition-all duration-200" />
      )}
    </div>
  );

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["contextMenu"]}>
      {content}
    </Dropdown>
  );
}
