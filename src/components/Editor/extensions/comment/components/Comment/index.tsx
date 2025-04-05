import React, { useState, useMemo } from "react";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useReadOnly,
  useSlate,
} from "slate-react";
import { Popover } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import classnames from "classnames";
import { produce } from "immer";
import {
  CommentElement,
  Comment as CommentType,
} from "@/components/Editor/types";
import InlineChromiumBugfix from "@editor/components/InlineChromiumBugFix";
import { CommentList, CommentForm } from "../CommentList";
import { unwrapComment } from "@/components/Editor/utils";

import styles from "./index.module.less";

interface CommentProps {
  attributes: RenderElementProps["attributes"];
  element: CommentElement;
  children: React.ReactNode;
}

const Comment: React.FC<CommentProps> = (props) => {
  const { attributes, children, element } = props;
  const { comments, openEdit = false } = element;

  const editor = useSlate();
  const [open, setOpen] = useState(openEdit);
  const readOnly = useReadOnly();

  const commentPath = ReactEditor.findPath(editor, element);

  // 使用 DFS 算法计算评论总数（包括所有嵌套回复）
  const totalCommentsCount = useMemo(() => {
    const countCommentsRecursive = (items: CommentType[]): number => {
      let count = items.length;

      // 递归计算所有回复的数量
      for (const comment of items) {
        if (comment.replies && comment.replies.length > 0) {
          count += countCommentsRecursive(comment.replies);
        }
      }

      return count;
    };

    return countCommentsRecursive(comments);
  }, [comments]);

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

    Transforms.setNodes(
      editor,
      {
        comments: newComments,
        openEdit: false,
      },
      { at: commentPath },
    );
  };

  const handleDeleteComment = (commentId: string) => {
    // 使用 DFS 递归删除评论或回复
    const newComments = produce(comments, (draft) => {
      // 辅助函数：递归搜索并删除评论
      const deleteCommentRecursive = (items: CommentType[]): boolean => {
        // 在当前级别查找并删除评论
        const index = items.findIndex((item) => item.id === commentId);
        if (index !== -1) {
          items.splice(index, 1);
          return true;
        }

        // 递归搜索回复
        for (let i = 0; i < items.length; i++) {
          if (items[i].replies && items[i].replies.length > 0) {
            const found = deleteCommentRecursive(items[i].replies);
            if (found) return true;
          }
        }

        return false;
      };

      deleteCommentRecursive(draft);
    });

    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });

    // 如果删除后没有评论了，关闭弹窗
    if (newComments.length === 0) {
      setOpen(false);
    }
  };

  const handleEditComment = (commentId: string, content: string) => {
    // 使用 DFS 递归查找并编辑评论
    const newComments = produce(comments, (draft) => {
      // 辅助函数：递归搜索并编辑评论
      const editCommentRecursive = (items: CommentType[]): boolean => {
        // 在当前级别查找并编辑评论
        const comment = items.find((item) => item.id === commentId);
        if (comment) {
          comment.content = content;
          comment.updateTime = Date.now();
          return true;
        }

        // 递归搜索回复
        for (let i = 0; i < items.length; i++) {
          if (items[i].replies && items[i].replies.length > 0) {
            const found = editCommentRecursive(items[i].replies);
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
    // 使用 DFS 递归查找父评论并添加回复
    const newComments = produce(comments, (draft) => {
      // 辅助函数：递归搜索并添加回复
      const addReplyRecursive = (items: CommentType[]): boolean => {
        // 在当前级别查找评论并添加回复
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

        // 递归搜索回复
        for (let i = 0; i < items.length; i++) {
          if (items[i].replies && items[i].replies.length > 0) {
            const found = addReplyRecursive(items[i].replies);
            if (found) return true;
          }
        }

        return false;
      };

      addReplyRecursive(draft);
    });

    Transforms.setNodes(editor, { comments: newComments }, { at: commentPath });
  };

  const handlePopoverVisibilityChange = (visible: boolean) => {
    setOpen(visible);

    // 当关闭弹窗且没有评论时，删除整个评论节点
    if (!visible && comments.length === 0) {
      unwrapComment(editor);
    }
  };

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={handlePopoverVisibilityChange}
      content={
        <div className={styles.commentContainer}>
          <CommentList
            comments={comments}
            elementPath={commentPath}
            onDelete={handleDeleteComment}
            onEdit={handleEditComment}
            onReply={handleReplyComment}
            readOnly={readOnly}
          />
          {!readOnly && <CommentForm onSubmit={handleAddComment} />}
        </div>
      }
      placement="bottom"
      arrow={false}
      styles={{
        body: {
          padding: 20,
        },
      }}
    >
      <span {...attributes} className={classnames(styles.comment)}>
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
        {comments.length > 0 && (
          <span className={styles.commentIndicator}>
            <MessageOutlined />
            <span className={styles.commentCount}>{totalCommentsCount}</span>
          </span>
        )}
      </span>
    </Popover>
  );
};

export default Comment;
