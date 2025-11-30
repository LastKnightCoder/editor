import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Comment as CommentType } from "@/components/Editor/types";
import CommentList from "../CommentList";
import CommentInput from "../CommentInput";
import { getTotalCommentCount } from "../../utils/comments";

interface CommentPopoverProps {
  anchorElement: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  comments: CommentType[];
  onAddComment: (content: string) => void;
  onEditComment: (commentId: string, content: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReplyComment: (parentId: string, content: string) => void;
  readOnly?: boolean;
}

const ANIMATION_STYLE_ID = "comment-popover-animation";
const POPOVER_WIDTH = 380;
const POPOVER_MAX_HEIGHT = 500;
const GAP = 8;

const ensureAnimationStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(ANIMATION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = ANIMATION_STYLE_ID;
  style.innerHTML = `
    @keyframes comment-scale-in {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-8px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
};

const CommentPopover: React.FC<CommentPopoverProps> = ({
  anchorElement,
  open,
  onClose,
  comments,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onReplyComment,
  readOnly = false,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const totalComments = useMemo(
    () => getTotalCommentCount(comments),
    [comments],
  );

  const updatePosition = useCallback(() => {
    if (!anchorElement) return;

    const anchorRect = anchorElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverHeight =
      popoverRef.current?.getBoundingClientRect().height ?? POPOVER_MAX_HEIGHT;

    let top = anchorRect.bottom + GAP;
    let left = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2;

    if (left < GAP) {
      left = GAP;
    } else if (left + POPOVER_WIDTH > viewportWidth - GAP) {
      left = viewportWidth - POPOVER_WIDTH - GAP;
    }

    if (top + popoverHeight > viewportHeight - GAP) {
      top = Math.max(anchorRect.top - popoverHeight - GAP, GAP);
    }

    setPosition({ top, left });
  }, [anchorElement]);

  useEffect(() => {
    ensureAnimationStyles();
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleScroll = () => {
      requestAnimationFrame(updatePosition);
    };
    const handleResize = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition, comments.length]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !anchorElement) {
    return null;
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/0 dark:bg-black/30"
        onClick={onClose}
      />
      <div
        ref={popoverRef}
        className="
          fixed z-[9999]
          w-[380px] max-h-[500px]
          rounded-2xl
          bg-white dark:bg-slate-900/95
          border border-gray-200 dark:border-slate-800
          overflow-hidden
          animate-[comment-scale-in_0.2s_ease-out]
        "
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-800">
          <span className="text-sm font-semibold text-gray-800 dark:text-white">
            {totalComments} 条批注
          </span>
        </div>

        <div className="max-h-[340px] space-y-3 overflow-y-auto px-4 py-3">
          <CommentList
            comments={comments}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
            onReply={onReplyComment}
            readOnly={readOnly}
          />
        </div>

        {!readOnly && (
          <div className="border-t border-gray-200 px-4 py-3 dark:border-slate-800">
            <CommentInput placeholder="添加批注..." onSubmit={onAddComment} />
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};

export default CommentPopover;
