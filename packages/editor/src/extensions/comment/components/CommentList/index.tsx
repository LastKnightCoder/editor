import React, { useState } from "react";
import { Pencil, Reply, Trash2 } from "lucide-react";
import { cn } from "@tau/ui";
import type { Comment as CommentType } from "../../../types";
import CommentInput from "../CommentInput";
import { formatCommentTime, isCommentEdited } from "../../utils/comments";

interface CommentListProps {
  comments: CommentType[];
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (parentId: string, content: string) => void;
  readOnly?: boolean;
}

const actionClass =
  "flex size-6 cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[var(--ed-text-tertiary)] transition-colors hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]";

/**
 * 批注线程：无卡片无分隔线，元信息一行 + 正文一段；回复靠缩进 + 细竖线表达从属。
 * 操作悬停才显出，绝对定位在右上角，不挤布局。
 */
const CommentList: React.FC<CommentListProps> = ({
  comments,
  onEdit,
  onDelete,
  onReply,
  readOnly = false,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const renderComment = (comment: CommentType, level = 0) => {
    const replies = comment.replies ?? [];
    const isEditing = editingId === comment.id;
    const isReplying = replyingId === comment.id;

    return (
      <div key={comment.id} className="group/comment relative">
        <div className="flex h-[22px] items-center text-[11.5px] text-[var(--ed-text-tertiary)]">
          {formatCommentTime(comment.createTime)}
          {isCommentEdited(comment) && " · 已编辑"}
        </div>

        {isEditing ? (
          <CommentInput
            initialValue={comment.content}
            onSubmit={content => {
              onEdit(comment.id, content);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
            autoFocus
            className="mt-0.5"
          />
        ) : (
          <div
            className={cn(
              "whitespace-pre-wrap break-words leading-[1.65] text-[var(--ed-text)]",
              level === 0 ? "text-[13.5px]" : "text-[13px]"
            )}
          >
            {comment.content}
          </div>
        )}

        {!readOnly && !isEditing && (
          <div className="absolute -right-1 -top-0.5 flex rounded-[8px] bg-[var(--ed-bg-surface)] opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/comment:opacity-100">
            <button
              type="button"
              aria-label="回复"
              className={actionClass}
              onClick={() => setReplyingId(comment.id)}
            >
              <Reply size={14} />
            </button>
            <button
              type="button"
              aria-label="编辑"
              className={actionClass}
              onClick={() => setEditingId(comment.id)}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label="删除"
              className={cn(
                actionClass,
                "hover:bg-[var(--ed-danger-soft)] hover:text-[var(--ed-danger)]"
              )}
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {(replies.length > 0 || isReplying) && (
          <div className="ml-0.5 mt-2.5 flex flex-col gap-2.5 border-0 border-l-2 border-solid border-[var(--ed-border)] pl-3">
            {replies.map(reply => renderComment(reply, level + 1))}
            {isReplying && (
              <CommentInput
                placeholder="回复…"
                submitText="回复"
                onSubmit={content => {
                  onReply(comment.id, content);
                  setReplyingId(null);
                }}
                onCancel={() => setReplyingId(null)}
                autoFocus
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3.5">{comments.map(comment => renderComment(comment))}</div>
  );
};

export default CommentList;
