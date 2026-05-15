import { StarFilled } from "@ant-design/icons";
import useThemeColors from "@/hooks/useThemeColors";
import type { UnifiedArticleItem } from "../../types";

interface ArticleListItemProps {
  item: UnifiedArticleItem;
  isActive: boolean;
  onClick: () => void;
}

export default function ArticleListItem({
  item,
  isActive,
  onClick,
}: ArticleListItemProps) {
  const themeColors = useThemeColors();

  return (
    <div
      className={`group flex items-start gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors duration-150 mb-0.5 ${
        isActive
          ? themeColors.activeClass
          : `${themeColors.hoverClass} ${item.isRead ? "opacity-60" : ""}`
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div
          className={`text-[13px] leading-snug line-clamp-2 ${!item.isRead && !isActive ? "font-medium" : ""}`}
        >
          {item.title}
        </div>
        {item.excerpt && (
          <div
            className={`mt-1 text-xs leading-relaxed line-clamp-2 ${themeColors.secondaryTextClass}`}
          >
            {item.excerpt.slice(0, 100)}
          </div>
        )}
        <div
          className={`mt-1.5 flex items-center gap-2 text-[11px] ${themeColors.secondaryTextClass}`}
        >
          <span
            className={`${themeColors.tagBgClass} ${themeColors.tagTextClass} rounded px-1.5 py-px`}
          >
            {item.badge}
          </span>
          {item.author && (
            <span className="truncate max-w-[80px]">{item.author}</span>
          )}
          {item.publishedAt && (
            <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
      {item.isStarred && (
        <StarFilled className="flex-shrink-0 text-xs text-amber-500 mt-1" />
      )}
    </div>
  );
}
