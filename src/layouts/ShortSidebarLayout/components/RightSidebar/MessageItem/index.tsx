import React, { memo } from "react";
import classnames from "classnames";
import { Message } from "@/types";
import { Role } from "@/constants";
import MarkdownRenderer from "../MarkdownRenderer";
import styles from "./index.module.less";

interface MessageItemProps {
  message: Message;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否可见/渲染
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isDark,
  markdownComponents,
  isVisible,
}) => {
  const isUser = message.role === Role.User;
  const isAssistant = message.role === Role.Assistant;

  if (!message.content && !message.reasoning_content) {
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
        {message.reasoning_content && (
          <div className={styles.reasoningContent}>
            <MarkdownRenderer
              content={message.reasoning_content}
              className={styles.markdown}
              markdownComponents={markdownComponents}
              shouldRender={isVisible}
            />
          </div>
        )}
        {message.content && (
          <MarkdownRenderer
            content={message.content}
            className={styles.markdown}
            markdownComponents={markdownComponents}
            shouldRender={isVisible}
          />
        )}
      </div>
    </div>
  );
};

export default memo(MessageItem);
