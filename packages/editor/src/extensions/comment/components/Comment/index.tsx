import React, { useEffect, useMemo, useRef, useState } from "react";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useReadOnly,
  useSlateStatic,
} from "slate-react";
import { v4 as uuidv4 } from "uuid";
import { produce } from "immer";
import { MessageCircle } from "lucide-react";
import type {
  CommentElement,
  Comment as CommentType,
} from "../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";
import { unwrapComment } from "../../../../utils";
import CommentPopover from "../CommentPopover";
import { getTotalCommentCount } from "../../utils/comments";
import useThemeColors from "../../../../hooks/useThemeColors";

const increaseAlpha = (color: string, delta = 0.15) => {
  const alphaPattern = /,\s*([0-9]*\.?[0-9]+)\s*\)$/;
  if (!color) return color;
  if (!alphaPattern.test(color)) return color;
  return color.replace(alphaPattern, (_, value) => {
    const newAlpha = Math.min(1, parseFloat(value) + delta);
    return `, ${newAlpha})`;
  });
};

interface CommentProps {
  attributes: RenderElementProps["attributes"];
  element: CommentElement;
  children: React.ReactNode;
}

const Comment: React.FC<CommentProps> = ({ attributes, children, element }) => {
  const { comments, openEdit = false } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(openEdit);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const [anchorElement, setAnchorElement] = useState<HTMLSpanElement | null>(
    null,
  );

  const { accentColor, accentSoftBg } = useThemeColors();

  const commentPath = ReactEditor.findPath(editor, element);

  const totalCommentsCount = useMemo(
    () => getTotalCommentCount(comments),
    [comments],
  );

  const commentHighlightStyle = useMemo(() => {
    const baseBg = accentSoftBg ?? "rgba(239,35,60,0.14)";
    const borderColor = accentColor ?? "rgb(239,35,60)";
    return {
      "--comment-highlight-bg": baseBg,
      "--comment-highlight-hover-bg": increaseAlpha(baseBg),
      "--comment-highlight-border": borderColor,
      "--comment-icon-color": borderColor,
    } as React.CSSProperties;
  }, [accentColor, accentSoftBg]);

  useEffect(() => {
    setOpen(openEdit);
  }, [openEdit]);

  useEffect(() => {
    if (open) return;
    if (comments.length === 0) {
      unwrapComment(editor, commentPath);
    }
  }, [open, comments.length, editor, commentPath]);

  const handleAddComment = (content: string) => {
    const newComment = {
      id: uuidv4(),
      content,
      createTime: Date.now(),
      updateTime: Date.now(),
      replies: [],
    };

    const newComments = produce(comments, (draft) => {
      draft.push(newComment);
    });

    setOpen(true);
    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });
  };

  const handleDeleteComment = (commentId: string) => {
    const newComments = produce(comments, (draft) => {
      const deleteCommentRecursive = (items: CommentType[]): boolean => {
        const index = items.findIndex((item) => item.id === commentId);
        if (index !== -1) {
          items.splice(index, 1);
          return true;
        }

        for (const comment of items) {
          if (comment.replies && comment.replies.length > 0) {
            const found = deleteCommentRecursive(comment.replies);
            if (found) return true;
          }
        }

        return false;
      };

      deleteCommentRecursive(draft);
    });

    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });

    if (newComments.length === 0) {
      setOpen(false);
    }
  };

  const handleEditComment = (commentId: string, content: string) => {
    const newComments = produce(comments, (draft) => {
      const editCommentRecursive = (items: CommentType[]): boolean => {
        const comment = items.find((item) => item.id === commentId);
        if (comment) {
          comment.content = content;
          comment.updateTime = Date.now();
          return true;
        }

        for (const reply of items) {
          if (reply.replies && reply.replies.length > 0) {
            const found = editCommentRecursive(reply.replies);
            if (found) return true;
          }
        }

        return false;
      };

      editCommentRecursive(draft);
    });

    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });
  };

  const handleReplyComment = (parentId: string, content: string) => {
    const newComments = produce(comments, (draft) => {
      const addReplyRecursive = (items: CommentType[]): boolean => {
        const parent = items.find((item) => item.id === parentId);
        if (parent) {
          parent.replies.push({
            id: uuidv4(),
            content,
            createTime: Date.now(),
            updateTime: Date.now(),
            replies: [],
          });
          return true;
        }

        for (const comment of items) {
          if (comment.replies && comment.replies.length > 0) {
            const found = addReplyRecursive(comment.replies);
            if (found) return true;
          }
        }

        return false;
      };

      addReplyRecursive(draft);
    });

    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });
  };

  const handleClosePopover = () => {
    setOpen(false);
    Transforms.setNodes(editor, { openEdit: false }, { at: commentPath });
  };

  return (
    <>
      <span
        {...attributes}
        className="
          relative inline cursor-pointer
          border-b-2 transition-colors
          bg-[var(--comment-highlight-bg)]
          border-[var(--comment-highlight-border)]
          hover:bg-[var(--comment-highlight-hover-bg)]
        "
        style={commentHighlightStyle}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
        <span
          ref={(node) => {
            if (indicatorRef.current !== node) {
              indicatorRef.current = node;
              setAnchorElement(node);
            }
          }}
          className="
            ml-1 inline-flex items-center gap-1 text-[11px]
            text-[var(--comment-icon-color)]
          "
          contentEditable={false}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((prev) => !prev);
          }}
        >
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="font-medium">{totalCommentsCount}</span>
        </span>
      </span>

      <CommentPopover
        anchorElement={anchorElement}
        open={open}
        onClose={handleClosePopover}
        comments={comments}
        onAddComment={handleAddComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onReplyComment={handleReplyComment}
        readOnly={readOnly}
      />
    </>
  );
};

export default Comment;
