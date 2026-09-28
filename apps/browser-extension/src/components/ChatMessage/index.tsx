import { memo, useCallback, useMemo } from "react";
import { App } from "antd";
import {
  ChatMessageView,
  type ChatMessageViewFile,
  type ChatMessageViewImage,
  type ChatMessageViewMarkdownRenderParams,
  ChatMarkdownRenderer,
  ChatToolCallDisplay,
  buildLegacyAssistantDisplayBlocks,
  type ChatMessageType,
  type CodeBlockPreviewPayload,
  type ContentBlock,
  type MessageContentItem,
  type ToolCallExecutionState,
} from "@tau/shared";
import type WebSocketClient from "../../utils/WebSocketClient";

export type { ChatMessageType };
export type { ToolCallExecutionState, ContentBlock } from "@tau/shared";

interface ChatMessageProps {
  message: ChatMessageType;
  messageIndex: number;
  isDark?: boolean;
  wsClient?: WebSocketClient | null;
  onDeleteMessage?: (messageIndex: number) => void;
  onRegenerateMessage?: (messageIndex: number) => void;
  onCreateBranch?: (messageIndex: number) => void;
  /** 切到这条用户消息的第 versionIndex 个版本（会话树，M4-d） */
  onSwitchVersion?: (messageIndex: number, versionIndex: number) => void;
  onCopySuccess?: () => void;
  onCopyError?: () => void;
  onDeleteConfirm?: () => Promise<boolean>;
}

type LocalChatMessage = ChatMessageType & {
  requestContent?: MessageContentItem[];
  tool_executions?: ToolCallExecutionState[];
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

const getUserText = (message: LocalChatMessage) => {
  if (!message.requestContent?.length) {
    return message.content || "";
  }
  return message.requestContent
    .filter((item): item is Extract<MessageContentItem, { type: "text" }> => item.type === "text")
    .map(item => item.text)
    .join("\n");
};

const getUserImages = (message: LocalChatMessage): ChatMessageViewImage[] => {
  if (!message.requestContent?.length) {
    return [];
  }
  return message.requestContent
    .filter((item): item is Extract<MessageContentItem, { type: "image" }> => item.type === "image")
    .map((item, index) => ({
      url: item.image,
      alt: `User uploaded image ${index + 1}`,
    }));
};

const getUserFiles = (message: LocalChatMessage): ChatMessageViewFile[] => {
  if (!message.requestContent?.length) {
    return [];
  }
  return message.requestContent
    .filter((item): item is Extract<MessageContentItem, { type: "file" }> => item.type === "file")
    .map(item => ({
      path: item.file,
      name: parseFileName(item.file, item.fileName),
    }));
};

export function ChatMessage({
  message,
  messageIndex,
  isDark = false,
  wsClient,
  onDeleteMessage,
  onRegenerateMessage,
  onCreateBranch,
  onSwitchVersion,
  onCopySuccess,
  onCopyError,
  onDeleteConfirm,
}: ChatMessageProps) {
  const { message: messageApi } = App.useApp();
  const localMessage = message as LocalChatMessage;
  const isUser = message.role === "user";
  const userText = getUserText(localMessage);
  const userImages = getUserImages(localMessage);
  const userFiles = getUserFiles(localMessage);

  const assistantDisplayBlocks: ContentBlock[] = useMemo(() => {
    if (isUser) {
      return [];
    }

    if (Array.isArray(message.contentBlocks) && message.contentBlocks.length > 0) {
      return message.contentBlocks;
    }

    return buildLegacyAssistantDisplayBlocks({
      content: localMessage.content,
      reasoning: localMessage.reasoning,
      toolExecutions: localMessage.tool_executions,
    });
  }, [isUser, localMessage, message.contentBlocks]);

  const handleReferenceClick = useCallback(
    async (id: number, type: string) => {
      if (!wsClient?.isConnected) {
        return;
      }
      try {
        await wsClient.sendRequest("tab.open", { type, id });
      } catch (error) {
        console.error("[ChatMessage] 打开文档引用失败:", error);
      }
    },
    [wsClient]
  );

  const handleLinkClick = useCallback((href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
  }, []);

  const handlePreviewCodeBlock = useCallback(
    async (payload: CodeBlockPreviewPayload) => {
      if (!wsClient?.isConnected) {
        messageApi.warning("桌面端未连接，无法打开预览");
        return;
      }

      try {
        await wsClient.sendRequest("block.preview.open", { block: payload });
      } catch (error) {
        console.error("[ChatMessage] 打开 block 预览失败:", error);
        messageApi.error("打开预览失败");
      }
    },
    [messageApi, wsClient]
  );

  const openFileInFolder = useCallback(
    async (file: ChatMessageViewFile) => {
      if (!wsClient?.isConnected) {
        messageApi.warning("桌面端未连接，无法打开文件位置");
        return;
      }
      try {
        await wsClient.sendRequest("file.showInFolder", {
          path: file.path,
          fileName: file.name,
        });
      } catch (error) {
        console.error("[ChatMessage] 打开文件位置失败:", error);
        messageApi.error("打开文件位置失败");
      }
    },
    [wsClient, messageApi]
  );

  const handleDelete = useCallback(
    async (index: number) => {
      if (onDeleteConfirm) {
        const confirmed = await onDeleteConfirm();
        if (!confirmed) return;
      }
      onDeleteMessage?.(index);
    },
    [onDeleteConfirm, onDeleteMessage]
  );

  const renderMarkdown = useCallback(
    ({ content }: ChatMessageViewMarkdownRenderParams) => (
      <ChatMarkdownRenderer
        content={content}
        isDark={isDark}
        enableDocumentReference={!!wsClient?.isConnected}
        onReferenceClick={handleReferenceClick}
        onLinkClick={handleLinkClick}
        onPreviewCodeBlock={handlePreviewCodeBlock}
        messageApi={messageApi}
      />
    ),
    [
      handleLinkClick,
      handlePreviewCodeBlock,
      handleReferenceClick,
      isDark,
      messageApi,
      wsClient?.isConnected,
    ]
  );

  return (
    <ChatMessageView
      role={isUser ? "user" : "assistant"}
      messageIndex={messageIndex}
      isDark={isDark}
      userText={userText}
      images={userImages}
      files={userFiles}
      assistantBlocks={assistantDisplayBlocks}
      onDelete={handleDelete}
      onRegenerate={onRegenerateMessage}
      onCreateBranch={onCreateBranch}
      {...(isUser && message.piVersions
        ? {
            versions: { index: message.piVersions.index, count: message.piVersions.ids.length },
          }
        : {})}
      onSwitchVersion={onSwitchVersion}
      onOpenFile={openFileInFolder}
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
      renderMarkdown={renderMarkdown}
      renderToolCall={(execution, index) => (
        <ChatToolCallDisplay
          key={execution.toolCallId || index}
          execution={execution}
          isDark={isDark}
        />
      )}
    />
  );
}

export default memo(ChatMessage);
