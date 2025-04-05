import React, { useState, useEffect } from "react";
import { List, Button, Input, App } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  SendOutlined,
  CloseOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import { formatDate } from "@/utils";
import { Comment as CommentType } from "@/components/Editor/types";
import classnames from "classnames";

import styles from "./index.module.less";

interface CommentFormProps {
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  initialValue?: string;
  placeholder?: string;
}

const CommentForm: React.FC<CommentFormProps> = ({
  onSubmit,
  onCancel,
  initialValue = "",
  placeholder = "添加评论...",
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  };

  return (
    <div className={styles.commentForm}>
      <Input.TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 6 }}
        className={styles.commentInput}
      />
      <div className={styles.formActions}>
        <Button
          type="text"
          onClick={handleSubmit}
          size="small"
          icon={<SendOutlined />}
          disabled={!value.trim()}
          className={styles.iconButton}
        />
        {onCancel && (
          <Button
            type="text"
            onClick={onCancel}
            size="small"
            icon={<CloseOutlined />}
            className={styles.iconButton}
          />
        )}
      </div>
    </div>
  );
};

// 自定义评论组件
const CommentItem: React.FC<{
  content: React.ReactNode;
  datetime: React.ReactNode;
  actions?: React.ReactNode[];
  children?: React.ReactNode;
  className?: string;
}> = ({ content, datetime, actions, children, className }) => {
  return (
    <div className={classnames(styles.commentItem, className)}>
      <div className={styles.commentHeader}>
        <div className={styles.commentMeta}>
          <div className={styles.commentDatetime}>{datetime}</div>
        </div>
      </div>
      <div className={styles.commentContent}>{content}</div>
      {actions && actions.length > 0 && (
        <div className={styles.commentActions}>
          {actions.map((action, index) => (
            <span key={index} className={styles.commentAction}>
              {action}
            </span>
          ))}
        </div>
      )}
      {children && <div className={styles.commentChildren}>{children}</div>}
    </div>
  );
};

interface CommentListProps {
  comments: CommentType[];
  elementPath: number[];
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string, content: string) => void;
  onReply: (parentId: string, content: string) => void;
  readOnly: boolean;
}

const CommentList: React.FC<CommentListProps> = ({
  comments,
  onDelete,
  onEdit,
  onReply,
  readOnly,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const { message } = App.useApp();

  const handleDelete = (comment: CommentType) => {
    onDelete(comment.id);
    message.success("评论已删除");
  };

  const renderComment = (comment: CommentType, isReply = false) => {
    const actions = readOnly
      ? []
      : [
          <span
            key="reply"
            onClick={() => setReplyingId(comment.id)}
            className={styles.actionLink}
          >
            <CommentOutlined /> 回复
          </span>,
          <span
            key="edit"
            onClick={() => setEditingId(comment.id)}
            className={styles.actionLink}
          >
            <EditOutlined /> 编辑
          </span>,
          <span
            key="delete"
            onClick={() => handleDelete(comment)}
            className={styles.actionLink}
          >
            <DeleteOutlined /> 删除
          </span>,
        ];

    return (
      <CommentItem
        key={comment.id}
        actions={actions}
        content={
          editingId === comment.id ? (
            <CommentForm
              initialValue={comment.content}
              onSubmit={(content) => {
                onEdit(comment.id, content);
                setEditingId(null);
                message.success("评论已更新");
              }}
              onCancel={() => setEditingId(null)}
              placeholder="编辑评论..."
            />
          ) : (
            <p>{comment.content}</p>
          )
        }
        datetime={formatDate(comment.updateTime, true)}
        className={isReply ? styles.replyItem : ""}
      >
        {comment.replies.map((reply) => renderComment(reply, true))}

        {replyingId === comment.id && (
          <div className={styles.replyForm}>
            <CommentForm
              onSubmit={(content) => {
                onReply(comment.id, content);
                setReplyingId(null);
                message.success("回复已添加");
              }}
              onCancel={() => setReplyingId(null)}
              placeholder="回复..."
            />
          </div>
        )}
      </CommentItem>
    );
  };

  return (
    <List
      className={styles.commentList}
      itemLayout="horizontal"
      dataSource={comments}
      renderItem={(comment) => renderComment(comment)}
    />
  );
};

export { CommentList, CommentForm };
export default CommentList;
