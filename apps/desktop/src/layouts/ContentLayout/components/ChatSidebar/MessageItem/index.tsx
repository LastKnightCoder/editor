import React, { memo, useCallback, useMemo } from "react";
import { App } from "antd";
import {
  ChatMessageView,
  type ChatMessageViewFile,
  type ChatMessageViewImage,
  type ChatMessageViewMarkdownRenderParams,
  type ContentBlock,
} from "@tau/shared";
import { ChatSessionMessage, RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import MarkdownRenderer from "../MarkdownRenderer";
import { MarkdownMessageMeta } from "../MarkdownContext";
import ToolCallDisplay from "./ToolCallDisplay";
import { showInFolder, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import LocalImage from "@/components/LocalImage";
import { getAssistantContentBlocks } from "@/services/assistantMessageBlocks";
import styles from "./index.module.less";

interface MessageItemProps {
  message: ChatSessionMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean;
  onDeleteMessage?: (messageIndex: number) => void;
  onRegenerateMessage?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, content: string) => void;
  onCreateBranch?: (messageIndex: number) => void;
  messageIndex: number;
  messageMeta?: MarkdownMessageMeta;
}

const getTextContent = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter(item => item.type === "text")
    .map(item => item.text)
    .join("\n");
};

const getImageContent = (message: RequestMessage): ChatMessageViewImage[] => {
  if (typeof message.content === "string") {
    return [];
  }

  return message.content
    .filter(item => item.type === "image")
    .map((item, index) => ({
      url: item.image,
      alt: `User uploaded image ${index + 1}`,
    }));
};

const parseFileName = (path: string, fileName?: string) => {
  if (fileName?.trim()) {
    return fileName;
  }
  try {
    const url = new URL(path);
    return url.pathname.split("/").pop() || path;
  } catch {
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || path;
  }
};

const getFileContent = (message: RequestMessage): ChatMessageViewFile[] => {
  if (typeof message.content === "string") {
    return [];
  }

  return message.content
    .filter(
      (item): item is Extract<ChatSessionMessage["content"][number], { type: "file" }> =>
        item.type === "file" && typeof item.file === "string"
    )
    .map(item => ({
      path: item.file,
      name: parseFileName(item.file, item.fileName),
    }));
};

const MessageItem: React.FC<MessageItemProps> = memo(
  ({
    message,
    isDark,
    markdownComponents,
    isVisible,
    onDeleteMessage,
    onRegenerateMessage,
    onEditMessage,
    onCreateBranch,
    messageIndex,
    messageMeta,
  }) => {
    const { message: antdMessage, modal } = App.useApp();
    const isUser = message.role === Role.User;

    const userMessage = isUser ? (message as RequestMessage) : undefined;
    const userText = userMessage ? getTextContent(userMessage) : "";
    const images = userMessage ? getImageContent(userMessage) : [];
    const files = userMessage ? getFileContent(userMessage) : [];
    const assistantBlocks = useMemo(
      () =>
        isUser ? [] : (getAssistantContentBlocks(message as ResponseMessage) as ContentBlock[]),
      [isUser, message]
    );

    const openFileInExplorer = useCallback(
      async (file: ChatMessageViewFile) => {
        try {
          let targetPath = file.path;
          if (/^https?:/i.test(file.path)) {
            targetPath = await remoteResourceToLocal(file.path);
          } else if (file.path.startsWith("~")) {
            const homeDir = await getHomeDir();
            targetPath = `${homeDir}${file.path.slice(1)}`;
          }
          await showInFolder(targetPath);
        } catch (error) {
          console.error("打开文件失败:", error);
          antdMessage.error("无法打开文件");
        }
      },
      [antdMessage]
    );

    const handleDelete = useCallback(
      (index: number) => {
        modal.confirm({
          title: "确定删除该消息吗？",
          okText: "确定",
          cancelText: "取消",
          okButtonProps: {
            danger: true,
          },
          onOk: () => {
            onDeleteMessage?.(index);
          },
        });
      },
      [modal, onDeleteMessage]
    );

    const renderMarkdown = useCallback(
      ({
        content,
        blockIndex,
        isLastTextBlock,
        textContent,
      }: ChatMessageViewMarkdownRenderParams) => {
        const blockMeta =
          messageMeta && blockIndex !== undefined
            ? {
                ...messageMeta,
                blockIndex,
                isLastTextBlock,
                textContent,
              }
            : messageMeta;

        return (
          <MarkdownRenderer
            content={content}
            className={styles.markdown}
            markdownComponents={markdownComponents}
            shouldRender={isVisible}
            messageMeta={blockMeta}
          />
        );
      },
      [isVisible, markdownComponents, messageMeta]
    );

    return (
      <ChatMessageView
        role={isUser ? "user" : "assistant"}
        messageIndex={messageIndex}
        isDark={isDark}
        userText={userText}
        images={images}
        files={files}
        assistantBlocks={assistantBlocks}
        onDelete={handleDelete}
        onRegenerate={onRegenerateMessage}
        onEditUserMessage={onEditMessage}
        onCreateBranch={onCreateBranch}
        onOpenFile={openFileInExplorer}
        onCopySuccess={() => antdMessage.success("已复制到剪贴板")}
        onCopyError={() => antdMessage.error("复制失败")}
        renderMarkdown={renderMarkdown}
        renderImage={(image, index, className) => (
          <LocalImage
            key={`${image.url}-${index}`}
            url={image.url}
            alt={image.alt}
            className={className}
          />
        )}
        renderToolCall={(execution, index) => (
          <ToolCallDisplay
            key={execution.toolCallId || index}
            execution={execution}
            isDark={isDark}
            markdownComponents={markdownComponents}
          />
        )}
      />
    );
  }
);

MessageItem.displayName = "MessageItem";

export default MessageItem;
