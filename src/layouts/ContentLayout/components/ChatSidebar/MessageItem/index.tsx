import React, { memo, useState } from "react";
import classnames from "classnames";
import { ChatSessionMessage, RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import MarkdownRenderer from "../MarkdownRenderer";
import { BiCopy, BiTrash, BiRefresh } from "react-icons/bi";
import { App } from "antd";
import styles from "./index.module.less";

interface MessageItemProps {
  message: ChatSessionMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否可见/渲染
  onDeleteMessage?: (messageIndex: number) => void;
  onRegenerateMessage?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, content: string) => void;
  messageIndex: number;
}

const getTextContent = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
};

const getImageContent = (message: RequestMessage): string[] => {
  if (typeof message.content === "string") {
    return [];
  }

  return message.content
    .filter((item) => item.type === "image")
    .map((item) => item.image);
};

const MessageItem: React.FC<MessageItemProps> = memo(
  ({
    message,
    isDark,
    markdownComponents,
    isVisible,
    onDeleteMessage,
    onRegenerateMessage,
    messageIndex,
  }) => {
    const { message: antdMessage, modal } = App.useApp();
    const [showActions, setShowActions] = useState(false);

    const isUser = message.role === Role.User;
    const isAssistant = message.role === Role.Assistant;

    let displayContent = "";
    let reasoningContent = "";
    let images: string[] = [];

    if (isUser) {
      const userMessage = message as RequestMessage;
      displayContent = getTextContent(userMessage);
      images = getImageContent(userMessage);
    } else {
      const assistantMessage = message as ResponseMessage;
      displayContent = assistantMessage.content;
      reasoningContent = assistantMessage.reasoning_content || "";
    }

    if (!displayContent && !reasoningContent && images.length === 0) {
      return null;
    }

    const handleCopy = async () => {
      const contentToCopy = displayContent || reasoningContent;
      if (!contentToCopy) return;

      try {
        await navigator.clipboard.writeText(contentToCopy);
        antdMessage.success("已复制到剪贴板");
      } catch (error) {
        console.error("复制失败:", error);
        antdMessage.error("复制失败");
      }
    };

    const handleDelete = () => {
      modal.confirm({
        title: "确定删除该消息吗？",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: () => {
          onDeleteMessage?.(messageIndex);
        },
      });
    };

    const handleRegenerate = () => {
      onRegenerateMessage?.(messageIndex);
    };

    return (
      <div
        className={classnames(styles.messageContainer, {
          [styles.userContainer]: isUser,
          [styles.assistantContainer]: isAssistant,
          [styles.dark]: isDark,
        })}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* 消息内容 */}
        <div
          className={classnames(styles.message, {
            [styles.userMessage]: isUser,
            [styles.assistantMessage]: isAssistant,
            [styles.dark]: isDark,
          })}
        >
          <div className={styles.messageContent}>
            {reasoningContent && (
              <div className={styles.reasoningContent}>
                <MarkdownRenderer
                  content={reasoningContent}
                  className={styles.markdown}
                  markdownComponents={markdownComponents}
                  shouldRender={isVisible}
                />
              </div>
            )}
            {images.length > 0 && (
              <div className={styles.imagesContainer}>
                {images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`User uploaded image ${index + 1}`}
                    className={styles.messageImage}
                  />
                ))}
              </div>
            )}
            {displayContent && (
              <MarkdownRenderer
                content={displayContent}
                className={styles.markdown}
                markdownComponents={markdownComponents}
                shouldRender={isVisible}
              />
            )}
          </div>
        </div>
        <div
          className={classnames(styles.messageActions, {
            [styles.show]: showActions,
            [styles.userActions]: isUser,
            [styles.assistantActions]: isAssistant,
            [styles.dark]: isDark,
          })}
        >
          {isUser ? (
            <>
              <button
                className={styles.actionButton}
                onClick={handleRegenerate}
                title="重新生成"
              >
                <BiRefresh />
              </button>
              <button
                className={styles.actionButton}
                onClick={handleCopy}
                title="复制"
              >
                <BiCopy />
              </button>
              <button
                className={styles.actionButton}
                onClick={handleDelete}
                title="删除"
              >
                <BiTrash />
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.actionButton}
                onClick={handleCopy}
                title="复制"
              >
                <BiCopy />
              </button>
              <button
                className={styles.actionButton}
                onClick={handleDelete}
                title="删除"
              >
                <BiTrash />
              </button>
            </>
          )}
        </div>
      </div>
    );
  },
);

MessageItem.displayName = "MessageItem";

export default MessageItem;
