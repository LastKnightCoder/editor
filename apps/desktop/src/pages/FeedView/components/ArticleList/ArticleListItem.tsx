import { StarFilled } from "@ant-design/icons";
import useThemeColors from "@/hooks/useThemeColors";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
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
}
