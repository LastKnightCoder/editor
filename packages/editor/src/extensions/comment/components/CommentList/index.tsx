import React, { useMemo, useState } from "react";
import dayjs from "dayjs";
import type { Comment as CommentType } from "../../../types";
import CommentInput from "../CommentInput";
import useThemeColors from "../../../../hooks/useThemeColors";
import { useEditorConfig } from "../../../../contexts/EditorConfig";

interface CommentListProps {
  comments: CommentType[];
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (parentId: string, content: string) => void;
  readOnly?: boolean;
}

const CommentList: React.FC<CommentListProps> = ({
  comments,
  onEdit,
  onDelete,
  onReply,
  readOnly = false,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const themeColors = useThemeColors();
  const accentColor = themeColors.accentColor || "rgb(239, 68, 68)";
  const config = useEditorConfig();
  const defaultFormatDate = (value: number | string, format = "YYYY-MM-DD HH:mm:ss") =>
    dayjs(value).format(format);
  const formatDate = config?.formatDate ?? defaultFormatDate;

  const normalizedComments = useMemo(() => comments ?? [], [comments]);

  const renderComment = (comment: CommentType, _level = 0) => {
    const replies = comment.replies ?? [];
    const isEditing = editingId === comment.id;
    const isReplying = replyingId === comment.id;

    return (
      <div
        key={comment.id}
        className="rounded-xl border border-gray-100 bg-white/80 p-3 dark:border-slate-800/70 dark:bg-zinc-900/40"
      >
        {isEditing ? (
          <CommentInput
            initialValue={comment.content}
            onSubmit={content => {
              onEdit(comment.id, content);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
            autoFocus
          />
        ) : (
          <>
            <div className="text-sm leading-relaxed text-gray-800 dark:text-slate-100">
              {comment.content}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] font-medium text-gray-500 dark:text-slate-400">
              <span>{formatDate(comment.updateTime, "YYYY-MM-DD HH:mm")}</span>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => setReplyingId(comment.id)}
                    className="transition-colors hover:text-indigo-500"
                  >
                    回复
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(comment.id)}
                    className="transition-colors hover:text-indigo-500"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(comment.id)}
                    className="transition-colors hover:text-rose-500"
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {isReplying && (
          <div className="mt-3">
            <CommentInput
              placeholder="回复..."
              onSubmit={content => {
                onReply(comment.id, content);
                setReplyingId(null);
              }}
              onCancel={() => setReplyingId(null)}
              autoFocus
            />
          </div>
        )}

        {replies.length > 0 && (
          <div
            className="mt-4 space-y-3 border-l-2 border-gray-100 pl-4 dark:border-slate-800/80"
            style={{ borderLeftColor: accentColor }}
          >
            {replies.map(reply => renderComment(reply, _level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!normalizedComments.length) {
    return (
      <div className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">暂无批注</div>
    );
  }

  return (
    <div className="space-y-3">{normalizedComments.map(comment => renderComment(comment))}</div>
  );
};

export default CommentList;
