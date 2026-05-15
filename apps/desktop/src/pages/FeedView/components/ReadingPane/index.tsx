import useThemeColors from "@/hooks/useThemeColors";
import type { UnifiedArticleItem } from "../../types";
import type { FeedViewActions } from "../../hooks/useFeedViewState";
import WebviewReader from "./WebviewReader";
import HtmlReader from "./HtmlReader";

interface ReadingPaneProps {
  article: UnifiedArticleItem | null;
  actions: Pick<
    FeedViewActions,
    "toggleStar" | "archiveItem" | "unarchiveItem" | "deleteItem"
  >;
}

export default function ReadingPane({ article, actions }: ReadingPaneProps) {
  const themeColors = useThemeColors();

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className={`text-sm ${themeColors.secondaryTextClass}`}>
          选择一篇文章开始阅读
        </span>
      </div>
    );
  }

  if (article.url) {
    return <WebviewReader article={article} />;
  }

  return (
    <HtmlReader
      article={article}
      onToggleStar={() => actions.toggleStar(article)}
      onArchive={() => actions.archiveItem(article)}
      onUnarchive={() => actions.unarchiveItem(article)}
      onDelete={() => actions.deleteItem(article)}
    />
  );
}
