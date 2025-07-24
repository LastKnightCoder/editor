import React, { memo } from "react";
import classnames from "classnames";
import { ChatSessionMessage, RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import MarkdownRenderer from "../MarkdownRenderer";
import styles from "./index.module.less";

interface MessageItemProps {
  message: ChatSessionMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否可见/渲染
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

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isDark,
  markdownComponents,
  isVisible,
}) => {
  const isUser = message.role === Role.User;
  const isAssistant = message.role === Role.Assistant;

  let displayContent = "";
  let reasoningContent = "";
  let images: string[] = [];

  if (isUser) {
    // 用户消息是 RequestMessage
    const userMessage = message as RequestMessage;
    console.log(userMessage);
    displayContent = getTextContent(userMessage);
    images = getImageContent(userMessage);
  } else {
    // 助手消息是 ResponseMessage
    const assistantMessage = message as ResponseMessage;
    displayContent = assistantMessage.content;
    reasoningContent = assistantMessage.reasoning_content || "";
  }

  if (!displayContent && !reasoningContent && images.length === 0) {
    return null;
  }

  return (
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
  );
};

MessageItem.displayName = "MessageItem";

export default memo(MessageItem);
