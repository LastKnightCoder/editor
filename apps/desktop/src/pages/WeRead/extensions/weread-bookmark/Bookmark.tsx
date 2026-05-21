import { memo, useState, useRef } from "react";
import { App } from "antd";
import type { RenderElementProps } from "slate-react";
import { useMemoizedFn } from "ahooks";
import type { WeReadBookmarkElement } from "../../types/elements";
import { HighlightText } from "./HighlightText";
import { BookmarkPopover } from "./BookmarkPopover";
import { ReviewModal } from "./ReviewModal";
import { importFromMarkdown } from "@/utils/markdown";
import useTheme from "@/hooks/useTheme";
import { getWeReadColor } from "../../configs";

export const Bookmark: React.FC<RenderElementProps> = memo((props) => {
  const { attributes, children, element } = props;
  const { message } = App.useApp();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bookmarkElement = element as unknown as WeReadBookmarkElement;
  const { markText, reviewContent, reviewDescendants, style, colorStyle } =
    bookmarkElement;

  const hasReview = Boolean(reviewContent || reviewDescendants);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [showPopover, setShowPopover] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const openPopover = useMemoizedFn(() => {
    setShowPopover(true);
  });

  // 关闭 Popover
  const closePopover = useMemoizedFn(() => {
    setShowPopover(false);
  });

  // 获取颜色配置
  const colors = getWeReadColor(colorStyle, isDark);

  // 复制高亮文本
  const handleCopy = useMemoizedFn(() => {
    navigator.clipboard.writeText(markText);
    message.success("已复制");
  });

  // 获取评论内容
  const reviewContentForEditor =
    reviewDescendants ||
    (reviewContent
      ? importFromMarkdown(reviewContent)
      : [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }]);

  return (
    <div
      ref={containerRef}
      contentEditable={false}
      className="relative mb-4"
      style={{ userSelect: "none" }}
    >
      {/* Slate 追踪的元素 */}
      <div {...attributes}>
        {/* 高亮文本容器 */}
        <div
          ref={highlightRef}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopover();
          }}
          contentEditable={false}
          className="cursor-pointer rounded-lg px-4 py-3 transition-all"
          style={{
            backgroundColor: colors.backgroundColor,
            border: `2px solid ${colors.borderColor}`,
          }}
        >
          <HighlightText
            text={markText}
            style={style}
            colorStyle={colorStyle}
          />

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
        {children}
      </div>

      {/* 悬浮菜单 - 在 attributes div 外面，避免 Slate 追踪 */}
      <BookmarkPopover
        isOpen={showPopover}
        onClose={closePopover}
        anchorRef={highlightRef}
        hasReview={hasReview}
        onCopy={handleCopy}
        onOpenReview={() => setShowReviewModal(true)}
      />

      {/* 评论编辑模态框 - 在 attributes div 外面 */}
      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        initialContent={reviewContentForEditor}
        markText={markText}
        containerRef={containerRef}
      />
    </div>
  );
});

Bookmark.displayName = "Bookmark";
