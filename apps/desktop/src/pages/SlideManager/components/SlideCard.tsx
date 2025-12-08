import { memo } from "react";
import classNames from "classnames";
import { Presentation, MoreHorizontal } from "lucide-react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { SlideDeck } from "@/types/slide";
import SlidePreview from "@/components/Slide/SlidePreview";
import useSlideStore from "@/stores/useSlideStore";
import useThemeColors from "@/hooks/useThemeColors";
import useBackgroundMode from "@/hooks/useBackgroundMode";

interface SlideCardProps {
  deck: SlideDeck;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "今天";
  } else if (days === 1) {
    return "昨天";
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    });
  }
};

const SlideCard = memo(({ deck, onClick, onRename, onDelete }: SlideCardProps) => {
  const themeColors = useThemeColors();
  const { isGradient } = useBackgroundMode();
  const { pagesByDeck } = useSlideStore();

  // 获取第一页用于预览
  const firstPage = pagesByDeck[deck.id]?.[0];

  const menuItems: MenuProps["items"] = [
    {
      key: "rename",
      label: "重命名",
      onClick: (e) => {
        e.domEvent.stopPropagation();
        onRename?.();
      },
    },
    {
      key: "delete",
      label: "删除",
      danger: true,
      onClick: (e) => {
        e.domEvent.stopPropagation();
        onDelete?.();
      },
    },
  ];

  return (
    <div
      onClick={onClick}
      className={classNames(
        "rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer border relative group",
        isGradient
          ? "bg-white/50 dark:bg-black/30 backdrop-blur-xl backdrop-saturate-150 border-white/40 dark:border-white/10"
          : classNames(themeColors.cardBgClass, themeColors.cardBorderClass),
      )}
    >
      {/* 右上角更多操作按钮 */}
      <div
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <Dropdown
          menu={{ items: menuItems }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <button
            className={classNames(
              "w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer",
              isGradient
                ? "bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70"
                : "bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700",
              themeColors.textClass,
            )}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </Dropdown>
      </div>

      {/* 封面预览区域 */}
      <div
        className={classNames(
          "relative flex items-center justify-center overflow-hidden",
          isGradient
            ? "bg-black/5 dark:bg-white/5"
            : "bg-gray-100 dark:bg-gray-700",
        )}
        style={{ aspectRatio: `${deck.width} / ${deck.height}` }}
      >
        {firstPage ? (
          <SlidePreview deck={deck} page={firstPage} />
        ) : deck.thumbnail ? (
          <img
            src={deck.thumbnail}
            alt={deck.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <Presentation
              className={classNames(
                "w-12 h-12",
                themeColors.secondaryTextClass,
              )}
            />
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div className="p-3">
        <div
          className={classNames(
            "text-sm font-medium truncate mb-1",
            themeColors.activeTextClass,
          )}
        >
          {deck.title}
        </div>
        <div
          className={classNames(
            "flex items-center justify-between text-xs",
            themeColors.secondaryTextClass,
          )}
        >
          <span>{deck.pageIds.length} 页</span>
          <span>{formatDate(deck.updateTime)}</span>
        </div>
      </div>
    </div>
  );
});

SlideCard.displayName = "SlideCard";

export default SlideCard;
