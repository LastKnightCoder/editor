import React, { memo, useCallback, useMemo, useState } from "react";
import type { ContentBlock } from "@tau/shared";
import { ConfirmDialog, toast } from "@tau/ui";
import { ChatSessionMessage, RequestMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import MarkdownRenderer from "../MarkdownRenderer";
import { MarkdownMessageMeta } from "../MarkdownContext";
import { showInFolder, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import LocalImage from "@/components/LocalImage";
import {
  MessageView,
  ToolCallBlock,
  type MessageMarkdownParams,
  type MessageViewFile,
  type MessageViewImage,
} from "@/components/ChatUI";
import { getAssistantContentBlocks } from "@/services/assistantMessageBlocks";

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

const getImageContent = (message: RequestMessage): MessageViewImage[] => {
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

const getFileContent = (message: RequestMessage): MessageViewFile[] => {
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

/**
 * 消息适配层：把会话消息拆成 MessageView 需要的文本 / 附件 / 内容块，并接上
 * markdown、本地图片、工具调用渲染与删除确认（D-048 起全部走 @tau/ui，不再依赖 antd）。
 */
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
    const isUser = message.role === Role.User;
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);

    const userMessage = isUser ? (message as RequestMessage) : undefined;
    const userText = userMessage ? getTextContent(userMessage) : "";
    const images = userMessage ? getImageContent(userMessage) : [];
    const files = userMessage ? getFileContent(userMessage) : [];
    const assistantBlocks = useMemo(
      () =>
        isUser ? [] : (getAssistantContentBlocks(message as ResponseMessage) as ContentBlock[]),
      [isUser, message]
    );

    const openFileInExplorer = useCallback(async (file: MessageViewFile) => {
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
        toast.error("无法打开文件");
      }
    }, []);

    const renderMarkdown = useCallback(
      ({ content, blockIndex, isLastTextBlock, textContent }: MessageMarkdownParams) => {
        const blockMeta =
          messageMeta && blockIndex !== undefined
            ? { ...messageMeta, blockIndex, isLastTextBlock, textContent }
            : messageMeta;

        return (
          <MarkdownRenderer
            content={content}
            markdownComponents={markdownComponents}
            shouldRender={isVisible}
            messageMeta={blockMeta}
          />
        );
      },
      [isVisible, markdownComponents, messageMeta]
    );

    const rendererContext = useMemo(() => ({ markdownComponents }), [markdownComponents]);

    return (
      <>
        <MessageView
          role={isUser ? "user" : "assistant"}
          messageIndex={messageIndex}
          userText={userText}
          images={images}
          files={files}
          assistantBlocks={assistantBlocks}
          onDelete={onDeleteMessage ? setPendingDelete : undefined}
          onRegenerate={onRegenerateMessage}
          onEditUserMessage={onEditMessage}
          onCreateBranch={onCreateBranch}
          onOpenFile={file => void openFileInExplorer(file)}
          renderMarkdown={renderMarkdown}
          renderImage={(image, index, className) => (
            <LocalImage
              key={`${image.url}-${index}`}
              url={image.url}
              alt={image.alt}
              className={className}
            />
          )}
          renderToolCall={execution => (
            <ToolCallBlock
              execution={execution}
              isDark={isDark}
              rendererContext={rendererContext}
            />
          )}
        />
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={open => !open && setPendingDelete(null)}
          title="删除这条消息？"
          description="删除后无法恢复。"
          confirmText="删除"
          danger
          size="sm"
          onConfirm={() => {
            if (pendingDelete !== null) onDeleteMessage?.(pendingDelete);
            setPendingDelete(null);
          }}
        />
      </>
    );
  }
);

MessageItem.displayName = "MessageItem";

export default MessageItem;
