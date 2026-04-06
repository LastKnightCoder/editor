import React, { useMemo, memo, useState, useCallback } from "react";
import classNames from "classnames";
import type { ChatMessage as ChatMessageType } from "./types";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ReasoningDisplay } from "./ReasoningDisplay";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { BiCopy, BiTrash, BiRefresh, BiGitBranch } from "react-icons/bi";
import {
  buildLegacyAssistantDisplayBlocks,
  getDisplayTextFromBlocks,
} from "./assistantDisplayBlocks";

export interface ChatMessageProps {
  /** 消息数据 */
  message: ChatMessageType;
  /** 消息索引 */
  messageIndex: number;
  /** 是否为暗色主题 */
  isDark?: boolean;
  /** 自定义 Markdown 渲染组件 */
  MarkdownComponent?: React.ComponentType<{
    content: string;
    isDark?: boolean;
  }>;
  /** 工具图标组件 */
  ToolIcon?: React.ComponentType<{ className?: string }>;
  /** 思考图标组件 */
  ThinkingIcon?: React.ComponentType<{ className?: string }>;
  /** 加载图标组件 */
  LoadingIcon?: React.ComponentType<{ className?: string; spin?: boolean }>;
  /** 删除消息回调 */
  onDeleteMessage?: (messageIndex: number) => void;
  /** 重新生成回调 */
  onRegenerateMessage?: (messageIndex: number) => void;
  /** 创建分支回调 */
  onCreateBranch?: (messageIndex: number) => void;
  /** 复制成功回调 */
  onCopySuccess?: () => void;
  /** 复制失败回调 */
  onCopyError?: () => void;
  /** 删除确认回调，返回 Promise<boolean> 表示是否确认删除 */
  onDeleteConfirm?: () => Promise<boolean>;
  className?: string;
}

const DefaultMarkdownComponent: React.FC<{
  content: string;
  isDark?: boolean;
}> = ({ content, isDark }) => (
  <MarkdownRenderer content={content} isDark={isDark} />
);

/** 操作按钮组件 */
const ActionButton: React.FC<{
  onClick: () => void;
  title: string;
  isDark: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, isDark, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 28,
      height: 28,
      border: isDark
        ? "1px solid rgba(255, 255, 255, 0.1)"
        : "1px solid rgba(0, 0, 0, 0.06)",
      background: isDark ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)",
      backdropFilter: "blur(8px)",
      borderRadius: 6,
      cursor: "pointer",
      color: isDark ? "#ccc" : "#666",
      transition: "all 0.2s ease",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = isDark
        ? "rgba(0, 0, 0, 0.9)"
        : "rgba(255, 255, 255, 0.95)";
      e.currentTarget.style.color = isDark ? "#fff" : "#333";
      e.currentTarget.style.borderColor = isDark
        ? "rgba(255, 255, 255, 0.2)"
        : "rgba(0, 0, 0, 0.12)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = isDark
        ? "rgba(0, 0, 0, 0.8)"
        : "rgba(255, 255, 255, 0.8)";
      e.currentTarget.style.color = isDark ? "#ccc" : "#666";
      e.currentTarget.style.borderColor = isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.06)";
    }}
  >
    {children}
  </button>
);

export const ChatMessage: React.FC<ChatMessageProps> = memo(
  function ChatMessage({
    message,
    messageIndex,
    isDark = false,
    MarkdownComponent = DefaultMarkdownComponent,
    ToolIcon,
    ThinkingIcon,
    LoadingIcon,
    onDeleteMessage,
    onRegenerateMessage,
    onCreateBranch,
    onCopySuccess,
    onCopyError,
    onDeleteConfirm,
    className,
  }) {
    const [showActions, setShowActions] = useState(false);
    const isUser = message.role === "user";
    const displayBlocks = useMemo(() => {
      if (isUser) {
        return [];
      }
      if (message.contentBlocks && message.contentBlocks.length > 0) {
        return message.contentBlocks;
      }
      return buildLegacyAssistantDisplayBlocks({
        content: message.content,
        reasoning: message.reasoning,
      });
    }, [isUser, message]);

    // 获取文本内容用于复制
    const getTextContentForCopy = useCallback(() => {
      if (!isUser) {
        return getDisplayTextFromBlocks(displayBlocks);
      }
      return message.content || "";
    }, [displayBlocks, isUser, message.content]);

    // 复制消息
    const handleCopy = useCallback(async () => {
      const content = getTextContentForCopy();
      if (!content) return;

      try {
        await navigator.clipboard.writeText(content);
        onCopySuccess?.();
      } catch (error) {
        console.error("复制失败:", error);
        onCopyError?.();
      }
    }, [getTextContentForCopy, onCopySuccess, onCopyError]);

    // 删除消息
    const handleDelete = useCallback(async () => {
      if (onDeleteConfirm) {
        const confirmed = await onDeleteConfirm();
        if (!confirmed) return;
      }
      onDeleteMessage?.(messageIndex);
    }, [onDeleteConfirm, onDeleteMessage, messageIndex]);

    // 重新生成
    const handleRegenerate = useCallback(() => {
      onRegenerateMessage?.(messageIndex);
    }, [onRegenerateMessage, messageIndex]);

    // 创建分支
    const handleCreateBranch = useCallback(() => {
      onCreateBranch?.(messageIndex);
    }, [onCreateBranch, messageIndex]);

    // 渲染内容块
    const renderedContent = useMemo(() => {
      if (!isUser) {
        const filteredBlocks = displayBlocks.filter((block) => {
          if (block.type === "text" || block.type === "reasoning") {
            return block.content.trim().length > 0;
          }
          if (block.type === "tool_calls") {
            return block.executions.length > 0;
          }
          return true;
        });

        return filteredBlocks.map((block, index) => {
          switch (block.type) {
            case "text":
              return (
                <MarkdownComponent
                  key={index}
                  content={block.content}
                  isDark={isDark}
                />
              );
            case "reasoning":
              return (
                <ReasoningDisplay
                  key={index}
                  content={block.content}
                  startTime={block.startTime}
                  endTime={block.endTime}
                  duration={block.duration}
                  isDark={isDark}
                  ThinkingIcon={ThinkingIcon}
                  LoadingIcon={LoadingIcon}
                />
              );
            case "tool_calls":
              return (
                <div key={index} style={{ marginBottom: 16 }}>
                  {block.executions.map((execution, execIndex) => (
                    <ToolCallDisplay
                      key={execution.toolCallId || execIndex}
                      executions={[execution]}
                      isDark={isDark}
                      ToolIcon={ToolIcon}
                    />
                  ))}
                </div>
              );
            default:
              return null;
          }
        });
      }

      return <MarkdownComponent content={message.content} isDark={isDark} />;
    }, [
      MarkdownComponent,
      ToolIcon,
      ThinkingIcon,
      LoadingIcon,
      displayBlocks,
      isDark,
      isUser,
      message.content,
    ]);

    // 检查是否有内容
    const hasContent = useMemo(() => {
      if (!isUser) {
        return displayBlocks.some((block) => {
          if (block.type === "text" || block.type === "reasoning") {
            return block.content.trim().length > 0;
          }
          if (block.type === "tool_calls") {
            return block.executions.length > 0;
          }
          return false;
        });
      }
      return !!message.content;
    }, [displayBlocks, isUser, message.content]);

    if (!hasContent) {
      return null;
    }

    // 容器样式
    const containerStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      alignItems: isUser ? "flex-end" : "flex-start",
    };

    // 消息气泡样式
    const bubbleStyle: React.CSSProperties = {
      padding: 24,
      borderRadius: 12,
      boxSizing: "border-box",
      overflow: "visible",
      position: "relative",
      width: isUser ? "fit-content" : "85%",
      maxWidth: isUser ? "85%" : undefined,
      backgroundColor: isDark
        ? isUser
          ? "rgba(147, 112, 219, 0.15)"
          : "rgba(255, 255, 255, 0.05)"
        : isUser
          ? "rgba(147, 112, 219, 0.1)"
          : "rgba(0, 0, 0, 0.03)",
    };

    // 操作按钮容器样式
    const actionsStyle: React.CSSProperties = {
      display: "flex",
      gap: 6,
      marginTop: 6,
      opacity: showActions ? 1 : 0,
      visibility: showActions ? "visible" : "hidden",
      transition: "all 0.2s ease",
      padding: "0 4px",
      justifyContent: isUser ? "flex-end" : "flex-start",
      alignSelf: isUser ? "flex-end" : "flex-start",
    };

    return (
      <div
        className={classNames(className)}
        style={containerStyle}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div style={bubbleStyle}>
          <div style={{ width: "100%", userSelect: "text", cursor: "text" }}>
            {isUser ? (
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {message.content}
              </p>
            ) : (
              renderedContent
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={actionsStyle}>
          {isUser ? (
            <>
              <ActionButton
                onClick={handleRegenerate}
                title="重新生成"
                isDark={isDark}
              >
                <BiRefresh style={{ width: 16, height: 16 }} />
              </ActionButton>
              <ActionButton onClick={handleCopy} title="复制" isDark={isDark}>
                <BiCopy style={{ width: 16, height: 16 }} />
              </ActionButton>
              <ActionButton onClick={handleDelete} title="删除" isDark={isDark}>
                <BiTrash style={{ width: 16, height: 16 }} />
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                onClick={handleCreateBranch}
                title="创建分支"
                isDark={isDark}
              >
                <BiGitBranch style={{ width: 16, height: 16 }} />
              </ActionButton>
              <ActionButton onClick={handleCopy} title="复制" isDark={isDark}>
                <BiCopy style={{ width: 16, height: 16 }} />
              </ActionButton>
              <ActionButton onClick={handleDelete} title="删除" isDark={isDark}>
                <BiTrash style={{ width: 16, height: 16 }} />
              </ActionButton>
            </>
          )}
        </div>
      </div>
    );
  },
);

export default ChatMessage;
