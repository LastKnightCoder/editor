import React, { useEffect, useRef } from "react";
import classNames from "classnames";
import { Node } from "slate";
import type { CommentPosition } from "./types";

interface CommentCardProps {
  position: CommentPosition;
  onClick: () => void;
  onHeightChange: (height: number) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({ position, onClick, onHeightChange }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardRef.current || typeof ResizeObserver === "undefined") {
      onHeightChange(cardRef.current?.getBoundingClientRect().height ?? 0);
      return;
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      onHeightChange(entry.contentRect.height);
    });

    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [onHeightChange]);

  useEffect(() => {
    if (cardRef.current) {
      onHeightChange(cardRef.current.getBoundingClientRect().height);
    }
  }, [onHeightChange]);

  const comments = position.element.comments ?? [];

  return (
    <div
      ref={cardRef}
      className="absolute left-0 right-0 px-2 transition-all duration-300 ease-out"
      style={{ top: `${position.displayY}px` }}
    >
      {/* 去掉虚线连接条，让卡片独立展示 */}

      <div
        onClick={onClick}
        className={classNames("cursor-pointer rounded-xl border p-3", "border-line-1 bg-surface")}
      >
        <div
          className={classNames(
            "wrap-break-word mb-2 rounded-r-md border-l-4 px-3 py-2 text-xs leading-relaxed",
            "border-l-accent bg-hover text-ink-1"
          )}
        >
          {Node.string(position.element)}
        </div>

        {comments.length > 0 && (
          <div className="text-ink-2 text-xs">
            <div className="wrap-break-word leading-relaxed">{comments[0]?.content}</div>
            {comments.length > 1 && (
              <div className="mt-1 text-[11px] opacity-70">+{comments.length - 1} 条回复</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentCard;
