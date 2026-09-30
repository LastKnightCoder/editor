import React, { useEffect, useMemo, useRef, useState } from "react";
import { Node, Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { v4 as uuidv4 } from "uuid";
import { produce } from "immer";
import { MessageCircle } from "lucide-react";
import type { CommentElement, Comment as CommentType } from "../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";
import { unwrapComment } from "../../../../utils";
import CommentPopover from "../CommentPopover";
import { getTotalCommentCount } from "../../utils/comments";

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
  const [anchorElement, setAnchorElement] = useState<HTMLSpanElement | null>(null);

  const commentPath = ReactEditor.findPath(editor, element);

  const totalCommentsCount = useMemo(() => getTotalCommentCount(comments), [comments]);

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

    const newComments = produce(comments, draft => {
      draft.push(newComment);
    });

    setOpen(true);
    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });
  };

  const handleDeleteComment = (commentId: string) => {
    const newComments = produce(comments, draft => {
      const deleteCommentRecursive = (items: CommentType[]): boolean => {
        const index = items.findIndex(item => item.id === commentId);
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
    const newComments = produce(comments, draft => {
      const editCommentRecursive = (items: CommentType[]): boolean => {
        const comment = items.find(item => item.id === commentId);
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
    const newComments = produce(comments, draft => {
      const addReplyRecursive = (items: CommentType[]): boolean => {
        const parent = items.find(item => item.id === parentId);
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

  const handleRemoveAll = () => {
    setOpen(false);
    unwrapComment(editor, commentPath);
  };

  const quote = Node.string(element);

  return (
    <>
      <span
        {...attributes}
        className="relative inline border-0 border-b-2 border-solid border-[var(--ed-comment-border)] bg-[var(--ed-comment-bg)] transition-colors hover:bg-[var(--ed-comment-hover-bg)]"
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
        <span
          ref={node => {
            if (indicatorRef.current !== node) {
              indicatorRef.current = node;
              setAnchorElement(node);
            }
          }}
          role="button"
          aria-label={totalCommentsCount > 0 ? `查看 ${totalCommentsCount} 条批注` : "添加批注"}
          className="ml-0.5 inline-flex h-[18px] cursor-pointer select-none items-center gap-0.5 rounded-[6px] px-1 align-text-bottom font-mono text-[11px] font-semibold leading-none text-[var(--ed-comment-icon)] transition-colors hover:bg-[var(--ed-bg-press)]"
          contentEditable={false}
          onClick={event => {
            event.stopPropagation();
            setOpen(prev => !prev);
          }}
        >
          <MessageCircle className="h-3 w-3" strokeWidth={2.2} />
          {totalCommentsCount > 0 && <span>{totalCommentsCount}</span>}
        </span>
      </span>

      <CommentPopover
        anchorElement={anchorElement}
        open={open}
        onClose={handleClosePopover}
        quote={quote}
        comments={comments}
        onAddComment={handleAddComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onReplyComment={handleReplyComment}
        onRemoveAll={handleRemoveAll}
        readOnly={readOnly}
      />
    </>
  );
};

export default Comment;
