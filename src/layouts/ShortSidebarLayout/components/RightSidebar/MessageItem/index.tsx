import React, { memo } from "react";
import classnames from "classnames";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { Message } from "@/types";
import { Role } from "@/constants";
import styles from "./index.module.less";

interface MessageItemProps {
  message: Message;
  isDark: boolean;
  markdownComponents: any;
}

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isDark,
  markdownComponents,
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
            <ReactMarkdown
              className={styles.markdown}
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={markdownComponents}
            >
              {message.reasoning_content}
            </ReactMarkdown>
          </div>
        )}
        {message.content && (
          <ReactMarkdown
            className={styles.markdown}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
};

export default memo(MessageItem);
