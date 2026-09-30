import React, { useMemo } from "react";
import { Trash2, X } from "lucide-react";
import { Popover, useEdgeFade, FADE_SCROLL_CLASS, cn } from "@tau/ui";
import type { Comment as CommentType } from "../../../types";
import CommentList from "../CommentList";
import CommentInput from "../CommentInput";
import { getTotalCommentCount } from "../../utils/comments";

interface CommentPopoverProps {
  anchorElement: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  /** 被批注的原文，浮层顶部引用，交代「在评哪一句」 */
  quote: string;
  comments: CommentType[];
  onAddComment: (content: string) => void;
  onEditComment: (commentId: string, content: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReplyComment: (parentId: string, content: string) => void;
  /** 移除整条批注（连同标记） */
  onRemoveAll: () => void;
  readOnly?: boolean;
}

const headerButtonClass =
  "flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--ed-text-tertiary)] outline-none transition-colors hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)] focus-visible:shadow-[var(--ed-focus-ring)]";

/**
 * 批注浮层：承载交给 @tau/ui Popover（外点关闭、Esc LIFO、初始焦点）。
 * 新建时没有「0 条 / 暂无」空态，只有引用 + 输入框，焦点直接落进输入框。
 */
const CommentPopover: React.FC<CommentPopoverProps> = ({
  anchorElement,
  open,
  onClose,
  quote,
  comments,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onReplyComment,
  onRemoveAll,
  readOnly = false,
}) => {
  const total = useMemo(() => getTotalCommentCount(comments), [comments]);
  const isEmpty = total === 0;
  const [threadEl, setThreadEl] = React.useState<HTMLDivElement | null>(null);
  useEdgeFade(threadEl);

  return (
    <Popover
      anchor={anchorElement}
      open={open && !!anchorElement}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      placement="bottom-start"
      arrow={false}
      className="w-[360px] max-w-[calc(100vw-24px)] overflow-hidden"
    >
      <div className="flex items-center gap-1 pl-4 pr-3 pt-3">
        <h4 className="m-0 flex flex-1 items-baseline gap-1.5 text-[13.5px] font-semibold text-[var(--ed-text)]">
          {isEmpty ? "添加批注" : "批注"}
          {!isEmpty && (
            <span className="font-mono text-[12px] font-medium text-[var(--ed-text-tertiary)]">
              {total}
            </span>
          )}
        </h4>
        {!readOnly && !isEmpty && (
          <button
            type="button"
            aria-label="移除整条批注"
            className={cn(
              headerButtonClass,
              "hover:bg-[var(--ed-danger-soft)] hover:text-[var(--ed-danger)]"
            )}
            onClick={onRemoveAll}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button type="button" aria-label="关闭" className={headerButtonClass} onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      {quote && (
        <div className="mx-4 mt-2 line-clamp-2 border-0 border-l-2 border-solid border-[var(--ed-comment-border)] pl-2.5 text-[12.5px] leading-[1.6] text-[var(--ed-text-secondary)]">
          {quote}
        </div>
      )}

      {!isEmpty && (
        <div
          ref={setThreadEl}
          className={cn("max-h-[320px] overflow-y-auto px-4 pb-1 pt-3.5", FADE_SCROLL_CLASS)}
        >
          <CommentList
            comments={comments}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
            onReply={onReplyComment}
            readOnly={readOnly}
          />
        </div>
      )}

      {!readOnly && (
        <CommentInput
          className="m-3"
          placeholder={isEmpty ? "写下你的想法…" : "继续批注…"}
          onSubmit={onAddComment}
          popoverAutoFocus={isEmpty}
          autoFocus={open && isEmpty}
        />
      )}
      {readOnly && isEmpty && <div className="h-3" />}
    </Popover>
  );
};

export default CommentPopover;
