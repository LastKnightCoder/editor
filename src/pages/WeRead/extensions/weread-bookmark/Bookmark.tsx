import { memo, useState, useRef } from "react";
import { App } from "antd";
import type { RenderElementProps } from "slate-react";
import type { Descendant, Node } from "slate";
import { ReactEditor, useSlate } from "slate-react";
import { Transforms } from "slate";
import { useMemoizedFn } from "ahooks";
import type {
  WeReadBookmarkElement,
  WeReadHighlightStyle,
  WeReadColorStyle,
} from "../../types/elements";
import { HighlightText } from "./HighlightText";
import { BookmarkPopover } from "./BookmarkPopover";
import { ReviewModal } from "./ReviewModal";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import weReadService from "@/services/weread";
import useTheme from "@/hooks/useTheme";
import { getWeReadColor } from "../../configs";

// 类型辅助：将自定义元素转换为 Slate Node 类型
type PartialNode<T> = Partial<T> & Partial<Node>;

export const Bookmark: React.FC<RenderElementProps> = memo((props) => {
  const { attributes, children, element } = props;
  const { message } = App.useApp();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const editor = useSlate();

  const bookmarkElement = element as unknown as WeReadBookmarkElement;
  const {
    bookmarkId,
    reviewId,
    bookId,
    chapterUid,
    range,
    markText,
    reviewContent,
    reviewDescendants,
    style,
    colorStyle,
    bookVersion,
  } = bookmarkElement;

  const hasReview = Boolean(reviewContent || reviewDescendants);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [showPopover, setShowPopover] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // 获取颜色配置
  const colors = getWeReadColor(colorStyle, isDark);

  // 复制高亮文本
  const handleCopy = useMemoizedFn(() => {
    navigator.clipboard.writeText(markText);
    message.success("已复制");
  });

  // 更新高亮样式和颜色（乐观更新）
  const handleStyleChange = useMemoizedFn(
    async (newStyle: WeReadHighlightStyle, newColor: WeReadColorStyle) => {
      try {
        // 立即更新 UI（乐观更新）
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          {
            style: newStyle,
            colorStyle: newColor,
          } as PartialNode<WeReadBookmarkElement>,
          { at: path },
        );

        // 异步更新服务器
        await weReadService.updateBookmark(bookmarkId, newStyle, newColor);
        message.success("样式已更新");
      } catch (error) {
        // 如果失败，回滚
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          {
            style,
            colorStyle,
          } as PartialNode<WeReadBookmarkElement>,
          { at: path },
        );
        const errorMsg =
          error instanceof Error ? error.message : "更新样式失败";
        message.error(errorMsg);
      }
    },
  );

  // 保存评论（乐观更新）
  const handleSaveReview = useMemoizedFn(async (content: Descendant[]) => {
    try {
      const markdown = getMarkdown(content);
      const path = ReactEditor.findPath(editor, element);

      // 立即更新 UI
      Transforms.setNodes(
        editor,
        {
          reviewContent: markdown,
          reviewDescendants: content,
        } as PartialNode<WeReadBookmarkElement>,
        { at: path },
      );

      // 异步更新服务器
      if (reviewId) {
        await weReadService.updateReview(reviewId, {
          type: 1,
          bookId,
          chapterUid,
          content: markdown,
          bookVersion: bookVersion || 0,
          isPrivate: 1,
          abstract: markText,
          range,
        });
        message.success("评论已更新");
      } else {
        const result = await weReadService.addReview({
          type: 1,
          bookId,
          chapterUid,
          content: markdown,
          bookVersion: bookVersion || 0,
          isPrivate: 1,
          abstract: markText,
          range,
        });

        // 更新 reviewId
        Transforms.setNodes(
          editor,
          {
            reviewId: result.reviewId,
          } as PartialNode<WeReadBookmarkElement>,
          { at: path },
        );

        message.success("评论已添加");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "保存评论失败";
      message.error(errorMsg);
    }
  });

  // 获取评论内容
  const reviewContentForEditor =
    reviewDescendants ||
    (reviewContent
      ? importFromMarkdown(reviewContent)
      : [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }]);

  return (
    <div
      {...attributes}
      ref={containerRef}
      contentEditable={false}
      className="relative mb-4"
    >
      {/* 高亮文本容器 */}
      <div
        ref={highlightRef}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowPopover(true);
        }}
        contentEditable={false}
        className="cursor-pointer rounded-lg px-4 py-3 transition-all"
        style={{
          backgroundColor: colors.backgroundColor,
          border: `2px solid ${colors.borderColor}`,
        }}
      >
        <HighlightText text={markText} style={style} colorStyle={colorStyle} />

        {/* 评论预览 */}
        {hasReview && reviewContent && (
          <div
            className="mt-2 pt-2 text-sm"
            style={{
              borderTop: `1px solid ${colors.borderColor}`,
              color: isDark ? "#a3a3a3" : "#737373",
            }}
          >
            <div className="line-clamp-2">
              💭 {reviewContent.substring(0, 100)}
            </div>
          </div>
        )}
      </div>

      {/* 悬浮菜单 */}
      <BookmarkPopover
        isOpen={showPopover}
        onClose={() => setShowPopover(false)}
        anchorRef={highlightRef}
        hasHighlight={true}
        hasReview={hasReview}
        currentStyle={style}
        currentColor={colorStyle}
        onCopy={handleCopy}
        onStyleChange={handleStyleChange}
        onOpenReview={() => setShowReviewModal(true)}
      />

      {/* 评论编辑模态框 */}
      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        initialContent={reviewContentForEditor}
        markText={markText}
        onSave={handleSaveReview}
        containerRef={containerRef}
      />

      {children}
    </div>
  );
});

Bookmark.displayName = "Bookmark";
