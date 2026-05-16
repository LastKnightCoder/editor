import {
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  InboxOutlined,
  UndoOutlined,
  BookOutlined,
} from "@ant-design/icons";
import DOMPurify from "dompurify";
import useThemeColors from "@/hooks/useThemeColors";
import type { UnifiedArticleItem } from "../../types";

interface HtmlReaderProps {
  article: UnifiedArticleItem;
  onToggleStar: () => void;
  isInReadLater?: boolean;
  onToggleReadLater?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
}

export default function HtmlReader({
  article,
  onToggleStar,
  isInReadLater,
  onToggleReadLater,
  onArchive,
  onUnarchive,
  onDelete,
}: HtmlReaderProps) {
  const themeColors = useThemeColors();
  const rawHtml =
    article.readabilityContent || article.content || "<p>暂无内容</p>";
  const html = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onfocus",
      "onblur",
    ],
  });

  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto w-full max-w-[720px] px-8 py-8">
        <header className={`mb-6 pb-4 border-b ${themeColors.borderClass}`}>
          <h1 className="m-0 text-xl font-bold leading-snug">
            {article.title}
          </h1>
          <div
            className={`mt-2 flex items-center gap-3 text-xs ${themeColors.secondaryTextClass}`}
          >
            {article.author && <span>{article.author}</span>}
            {article.publishedAt && (
              <span>{new Date(article.publishedAt).toLocaleString()}</span>
            )}
            {article.url && (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${themeColors.activeTextClass} no-underline hover:underline`}
              >
                原文
              </a>
            )}
          </div>
          <div className="mt-3 flex items-center gap-1">
            <IconBtn
              onClick={onToggleStar}
              title={article.isStarred ? "取消收藏" : "收藏"}
            >
              {article.isStarred ? (
                <StarFilled className="text-amber-500" />
              ) : (
                <StarOutlined />
              )}
            </IconBtn>
            {onToggleReadLater && (
              <IconBtn
                onClick={onToggleReadLater}
                title={isInReadLater ? "从稍后读移除" : "稍后读"}
              >
                <BookOutlined
                  className={isInReadLater ? "text-blue-500" : ""}
                />
              </IconBtn>
            )}
            {article.source === "readlater" && (
              <>
                {article.isArchived ? (
                  <IconBtn onClick={onUnarchive} title="取消归档">
                    <UndoOutlined />
                  </IconBtn>
                ) : (
                  <IconBtn onClick={onArchive} title="归档">
                    <InboxOutlined />
                  </IconBtn>
                )}
                <IconBtn onClick={onDelete} title="删除" danger>
                  <DeleteOutlined />
                </IconBtn>
              </>
            )}
          </div>
        </header>
        <div
          className="prose-reader text-[15px] leading-[1.8] break-words"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick?: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const themeColors = useThemeColors();
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md border-none cursor-pointer bg-transparent transition-colors duration-150 ${
        danger
          ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          : `${themeColors.secondaryTextClass} ${themeColors.hoverClass}`
      }`}
    >
      {children}
    </button>
  );
}
