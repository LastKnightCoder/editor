import { useMemo, useCallback, memo } from "react";
import { App } from "antd";
import { ToolOutlined, LoadingOutlined } from "@ant-design/icons";
import { ThunderboltOutlined } from "@ant-design/icons";
import {
  ChatMessage as SharedChatMessage,
  MarkdownRenderer,
  type ChatMessageType,
} from "@tau/shared";
import type WebSocketClient from "../../utils/WebSocketClient";
import type { MessageInstance } from "antd/es/message/interface";

// 重新导出类型，保持 API 兼容
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
  onCopySuccess?: () => void;
  onCopyError?: () => void;
  onDeleteConfirm?: () => Promise<boolean>;
}

/** 工具图标 - 使用 Ant Design 图标 */
const ToolIcon = ({ className }: { className?: string }) => (
  <ToolOutlined className={className} />
);

/** 思考图标 - 使用 Ant Design 图标 */
const ThinkingIcon = ({ className }: { className?: string }) => (
  <ThunderboltOutlined className={className} />
);

/** 加载图标 - 使用 Ant Design 图标 */
const LoadingIcon = ({
  className,
  spin,
}: {
  className?: string;
  spin?: boolean;
}) => <LoadingOutlined className={className} spin={spin} />;

/**
 * 创建自定义 Markdown 组件，支持文档引用点击通过 RPC 打开桌面端 Tab
 */
const createMarkdownComponent = (
  wsClient: WebSocketClient | null | undefined,
  isDark: boolean,
  messageApi: MessageInstance,
) => {
  return memo(function CustomMarkdownComponent({
    content,
  }: {
    content: string;
    isDark?: boolean;
  }) {
    // 处理文档引用点击 - 通过 RPC 打开桌面端 Tab
    const handleReferenceClick = useCallback(
      async (id: number, type: string) => {
        if (!wsClient?.isConnected) {
          console.warn("[ChatMessage] WebSocket 未连接，无法打开文档引用");
          return;
        }

        try {
          await wsClient.sendRequest("tab.open", { type, id });
        } catch (error) {
          console.error("[ChatMessage] 打开文档引用失败:", error);
        }
      },
      [wsClient],
    );

    // 处理链接点击 - 在新标签页打开
    const handleLinkClick = useCallback((href: string) => {
      window.open(href, "_blank", "noopener,noreferrer");
    }, []);

    return (
      <MarkdownRenderer
        content={content}
        isDark={isDark}
        enableDocumentReference={!!wsClient?.isConnected}
        onReferenceClick={handleReferenceClick}
        onLinkClick={handleLinkClick}
        messageApi={messageApi}
      />
    );
  });
};

export function ChatMessage({
  message,
  messageIndex,
  isDark = false,
  wsClient,
  onDeleteMessage,
  onRegenerateMessage,
  onCreateBranch,
  onCopySuccess,
  onCopyError,
  onDeleteConfirm,
}: ChatMessageProps) {
  const { message: messageApi } = App.useApp();
  // 创建自定义 Markdown 组件
  const MarkdownComponent = useMemo(
    () => createMarkdownComponent(wsClient, isDark, messageApi),
    [wsClient, isDark],
  );

  return (
    <SharedChatMessage
      message={message}
      messageIndex={messageIndex}
      isDark={isDark}
      MarkdownComponent={MarkdownComponent}
      ToolIcon={ToolIcon}
      ThinkingIcon={ThinkingIcon}
      LoadingIcon={LoadingIcon}
      onDeleteMessage={onDeleteMessage}
      onRegenerateMessage={onRegenerateMessage}
      onCreateBranch={onCreateBranch}
      onCopySuccess={onCopySuccess}
      onCopyError={onCopyError}
      onDeleteConfirm={onDeleteConfirm}
    />
  );
}

export default ChatMessage;
