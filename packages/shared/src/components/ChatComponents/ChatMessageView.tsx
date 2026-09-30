import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { cn as classNames } from "@tau/ui";
import { BiCopy, BiEdit, BiGitBranch, BiRefresh, BiTrash } from "react-icons/bi";
import { FileText, Lightbulb, Loader2 } from "lucide-react";
import type { ContentBlock, ToolCallExecutionState } from "./types";
import ChatMarkdownRenderer, { type ChatMarkdownRendererProps } from "./ChatMarkdownRenderer";
import ChatToolCallDisplay from "./ChatToolCallDisplay";
import { getDisplayTextFromBlocks } from "./assistantDisplayBlocks";
import { messageClasses as styles } from "./classes";
import "../animations.css";

export interface ChatMessageViewImage {
  url: string;
  alt?: string;
}

export interface ChatMessageViewFile {
  path: string;
  name: string;
}

export interface ChatMessageViewMarkdownRenderParams {
  content: string;
  isDark: boolean;
  blockIndex?: number;
  isLastTextBlock?: boolean;
  textContent?: string;
}

export interface ChatMessageViewProps {
  role: "user" | "assistant";
  messageIndex: number;
  isDark?: boolean;
  userText?: string;
  images?: ChatMessageViewImage[];
  files?: ChatMessageViewFile[];
  assistantBlocks?: ContentBlock[];
  onDelete?: (messageIndex: number) => void | Promise<void>;
  onRegenerate?: (messageIndex: number) => void;
  onCreateBranch?: (messageIndex: number) => void;
  onEditUserMessage?: (messageIndex: number, content: string) => void;
  /** 会话树上这条用户消息的版本（有多个时常显 ‹ i/n ›） */
  versions?: { index: number; count: number };
  onSwitchVersion?: (messageIndex: number, versionIndex: number) => void;
  onOpenFile?: (file: ChatMessageViewFile) => void | Promise<void>;
  onCopySuccess?: () => void;
  onCopyError?: () => void;
  renderMarkdown?: (params: ChatMessageViewMarkdownRenderParams) => React.ReactNode;
  renderImage?: (image: ChatMessageViewImage, index: number, className: string) => React.ReactNode;
  renderToolCall?: (execution: ToolCallExecutionState, index: number) => React.ReactNode;
  markdownProps?: Omit<ChatMarkdownRendererProps, "content" | "isDark">;
  className?: string;
}

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}小时${remainingMinutes}分${remainingSeconds}秒`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  }
  return `${seconds}秒`;
};

const ReasoningBlock = memo(function ReasoningBlock({
  block,
  isDark,
  renderMarkdown,
}: {
  block: Extract<ContentBlock, { type: "reasoning" }>;
  isDark: boolean;
  renderMarkdown: (params: ChatMessageViewMarkdownRenderParams) => React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentDuration, setCurrentDuration] = useState(0);
  const isThinking = block.startTime !== undefined && block.endTime === undefined;

  useEffect(() => {
    if (!isThinking || !block.startTime) return;

    const updateTimer = () => {
      setCurrentDuration(Date.now() - block.startTime!);
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 100);
    return () => window.clearInterval(timer);
  }, [block.startTime, isThinking]);

  const displayDuration = block.duration ?? currentDuration;

  return (
    <div
      className={classNames(styles.reasoningCard, {
        [styles.dark]: isDark,
      })}
    >
      <div className={styles.reasoningHeader} onClick={() => setIsExpanded(value => !value)}>
        <div className={styles.reasoningHeaderContent}>
          {isThinking ? (
            <Loader2 size={14} className={`animate-spin ${styles.reasoningIcon}`} />
          ) : (
            <Lightbulb size={14} className={styles.reasoningIcon} />
          )}
          <span className={styles.reasoningTitle}>{isThinking ? "思考中" : "已思考"}</span>
          {block.startTime && (
            <span className={styles.reasoningDuration}>{formatDuration(displayDuration)}</span>
          )}
        </div>
        <button type="button" className={styles.reasoningExpandButton}>
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>

      {isExpanded && (
        <div className={styles.reasoningBody}>
          {renderMarkdown({ content: block.content, isDark })}
        </div>
      )}
    </div>
  );
});

const ActionButton = ({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button type="button" className={styles.actionButton} onClick={onClick} title={title}>
    {children}
  </button>
);

export const ChatMessageView: React.FC<ChatMessageViewProps> = memo(function ChatMessageView({
  role,
  messageIndex,
  isDark = false,
  userText = "",
  images = [],
  files = [],
  assistantBlocks = [],
  onDelete,
  onRegenerate,
  onCreateBranch,
  onEditUserMessage,
  versions,
  onSwitchVersion,
  onOpenFile,
  onCopySuccess,
  onCopyError,
  renderMarkdown,
  renderImage,
  renderToolCall,
  markdownProps,
  className,
}) {
  const [showActions, setShowActions] = useState(false);
  const isUser = role === "user";

  const defaultRenderMarkdown = useCallback(
    ({ content, isDark: markdownIsDark }: ChatMessageViewMarkdownRenderParams) => (
      <ChatMarkdownRenderer {...markdownProps} content={content} isDark={markdownIsDark} />
    ),
    [markdownProps]
  );

  const renderMarkdownContent = renderMarkdown ?? defaultRenderMarkdown;

  const filteredBlocks = useMemo(
    () =>
      assistantBlocks.filter(block => {
        if (block.type === "text" || block.type === "reasoning") {
          return block.content.trim().length > 0;
        }
        if (block.type === "tool_calls") {
          return block.executions.length > 0;
        }
        return true;
      }),
    [assistantBlocks]
  );

  const hasVisibleContent = isUser
    ? userText.trim().length > 0 || images.length > 0 || files.length > 0
    : filteredBlocks.length > 0;

  const copyText = isUser ? userText : getDisplayTextFromBlocks(filteredBlocks);

  const handleCopy = useCallback(async () => {
    if (!copyText.trim()) return;

    try {
      await navigator.clipboard.writeText(copyText);
      onCopySuccess?.();
    } catch (error) {
      console.error("复制失败:", error);
      onCopyError?.();
    }
  }, [copyText, onCopyError, onCopySuccess]);

  const handleDelete = useCallback(() => {
    void onDelete?.(messageIndex);
  }, [messageIndex, onDelete]);

  const handleRegenerate = useCallback(() => {
    onRegenerate?.(messageIndex);
  }, [messageIndex, onRegenerate]);

  const handleCreateBranch = useCallback(() => {
    onCreateBranch?.(messageIndex);
  }, [messageIndex, onCreateBranch]);

  const handleEdit = useCallback(() => {
    onEditUserMessage?.(messageIndex, userText);
  }, [messageIndex, onEditUserMessage, userText]);

  const lastTextBlockIndex = useMemo(() => {
    for (let index = filteredBlocks.length - 1; index >= 0; index--) {
      if (filteredBlocks[index].type === "text") {
        return index;
      }
    }
    return -1;
  }, [filteredBlocks]);

  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div
      className={classNames(
        styles.messageContainer,
        {
          [styles.userContainer]: isUser,
          [styles.assistantContainer]: !isUser,
          [styles.dark]: isDark,
        },
        className
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        className={classNames(styles.message, {
          [styles.userMessage]: isUser,
          [styles.assistantMessage]: !isUser,
          [styles.dark]: isDark,
        })}
      >
        <div className={styles.messageContent}>
          {isUser ? (
            <>
              {images.length > 0 && (
                <div className={styles.imagesContainer}>
                  {images.map((image, index) =>
                    renderImage ? (
                      renderImage(image, index, styles.messageImage)
                    ) : (
                      <img
                        key={`${image.url}-${index}`}
                        src={image.url}
                        alt={image.alt || `User uploaded image ${index + 1}`}
                        className={styles.messageImage}
                      />
                    )
                  )}
                </div>
              )}
              {files.length > 0 && (
                <div className={styles.filesContainer}>
                  {files.map((file, index) => (
                    <button
                      type="button"
                      key={`${file.path}-${index}`}
                      className={styles.fileAttachment}
                      onClick={() => void onOpenFile?.(file)}
                    >
                      <div className={styles.fileInfo}>
                        <FileText size={14} />
                        <span>{file.name}</span>
                      </div>
                      <span className={styles.fileAction}>在文件夹中打开</span>
                    </button>
                  ))}
                </div>
              )}
              {userText &&
                renderMarkdownContent({
                  content: userText,
                  isDark,
                })}
            </>
          ) : (
            filteredBlocks.map((block, index) => {
              if (block.type === "text") {
                return (
                  <div key={`text-${index}`} className={styles.block}>
                    {renderMarkdownContent({
                      content: block.content,
                      isDark,
                      blockIndex: index,
                      isLastTextBlock: index === lastTextBlockIndex,
                      textContent: block.content,
                    })}
                  </div>
                );
              }

              if (block.type === "reasoning") {
                return (
                  <div key={`reasoning-${index}`} className={styles.block}>
                    <ReasoningBlock
                      block={block}
                      isDark={isDark}
                      renderMarkdown={renderMarkdownContent}
                    />
                  </div>
                );
              }

              if (block.type === "tool_calls") {
                return (
                  <div key={`tool-calls-${index}`} className={styles.toolCallsContainer}>
                    {block.executions.map((execution, execIndex) =>
                      renderToolCall ? (
                        renderToolCall(execution, execIndex)
                      ) : (
                        <ChatToolCallDisplay
                          key={execution.toolCallId || execIndex}
                          execution={execution}
                          isDark={isDark}
                        />
                      )
                    )}
                  </div>
                );
              }

              return null;
            })
          )}
        </div>
      </div>

      {isUser && versions && versions.count > 1 && (
        // 版本切换常显（悬停才出现的话用户不知道这里还有别的版本）
        <div
          role="group"
          aria-label={`版本 ${versions.index + 1} / ${versions.count}`}
          className={classNames(styles.versionSwitcher, { [styles.dark]: isDark })}
        >
          <button
            type="button"
            aria-label="上一个版本"
            disabled={!onSwitchVersion || versions.index === 0}
            onClick={() => onSwitchVersion?.(messageIndex, versions.index - 1)}
          >
            ‹
          </button>
          <span aria-live="polite">
            {versions.index + 1}/{versions.count}
          </span>
          <button
            type="button"
            aria-label="下一个版本"
            disabled={!onSwitchVersion || versions.index === versions.count - 1}
            onClick={() => onSwitchVersion?.(messageIndex, versions.index + 1)}
          >
            ›
          </button>
        </div>
      )}

      <div
        className={classNames(styles.messageActions, {
          [styles.show]: showActions,
          [styles.userActions]: isUser,
          [styles.assistantActions]: !isUser,
          [styles.dark]: isDark,
        })}
      >
        {isUser ? (
          <>
            {onEditUserMessage && userText.trim().length > 0 && (
              <ActionButton title="编辑" onClick={handleEdit}>
                <BiEdit />
              </ActionButton>
            )}
            <ActionButton title="重新生成" onClick={handleRegenerate}>
              <BiRefresh />
            </ActionButton>
            <ActionButton title="复制" onClick={handleCopy}>
              <BiCopy />
            </ActionButton>
            <ActionButton title="删除" onClick={handleDelete}>
              <BiTrash />
            </ActionButton>
          </>
        ) : (
          <>
            <ActionButton title="创建分支" onClick={handleCreateBranch}>
              <BiGitBranch />
            </ActionButton>
            <ActionButton title="复制" onClick={handleCopy}>
              <BiCopy />
            </ActionButton>
            <ActionButton title="删除" onClick={handleDelete}>
              <BiTrash />
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
});

export default ChatMessageView;
