import { motion } from "motion/react";
import { ReadOutlined } from "@ant-design/icons";
import useThemeColors from "@/hooks/useThemeColors";
import type { UnifiedArticleItem } from "../../types";
import type { FeedViewActions } from "../../hooks/useFeedViewState";
import WebviewReader from "./WebviewReader";
import HtmlReader from "./HtmlReader";

interface ReadingPaneProps {
  article: UnifiedArticleItem | null;
  isInReadLater: boolean;
  actions: Pick<
    FeedViewActions,
    | "toggleStar"
    | "toggleReadLater"
    | "archiveItem"
    | "unarchiveItem"
    | "deleteItem"
  >;
}

export default function ReadingPane({
  article,
  isInReadLater,
  actions,
}: ReadingPaneProps) {
  const themeColors = useThemeColors();

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative"
        >
          <div
            className={`absolute inset-0 rounded-full ${themeColors.tagBgClass} blur-xl opacity-50 scale-125`}
          />
          <div
            className={`relative flex h-20 w-20 items-center justify-center rounded-2xl ${themeColors.iconBgClass} animate-float`}
          >
            <ReadOutlined className={`text-3xl ${themeColors.iconTextClass}`} />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
          className="text-center"
        >
          <div className={`text-base font-medium ${themeColors.textClass}`}>
            选择一篇文章开始阅读
          </div>
          <div
            className={`text-[13px] mt-1.5 ${themeColors.secondaryTextClass}`}
          >
            从左侧列表中选择感兴趣的内容
          </div>
        </motion.div>
      </div>
    );
  }

  const readLaterToggleProps =
    article.source === "rss"
      ? {
          isInReadLater,
          onToggleReadLater: () => actions.toggleReadLater(article),
        }
      : {};

  const readLaterManageProps =
    article.source === "readlater"
      ? {
          onArchive: () => actions.archiveItem(article),
          onUnarchive: () => actions.unarchiveItem(article),
          onDelete: () => actions.deleteItem(article),
        }
      : {};

  if (article.url) {
    return (
      <WebviewReader
        article={article}
        onToggleStar={() => actions.toggleStar(article)}
        {...readLaterToggleProps}
        {...readLaterManageProps}
      />
    );
  }

  return (
    <HtmlReader
      article={article}
      onToggleStar={() => actions.toggleStar(article)}
      {...readLaterToggleProps}
      {...readLaterManageProps}
    />
  );
}
