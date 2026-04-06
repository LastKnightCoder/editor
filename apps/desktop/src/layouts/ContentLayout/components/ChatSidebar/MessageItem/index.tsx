import React, { memo, useEffect, useRef, useState } from "react";
import classnames from "classnames";
import {
  AssistantBlock,
  ChatSessionMessage,
  RequestMessage,
  ResponseMessage,
  ToolCallExecutionState,
  ResponseContentBlock,
} from "@/types";
import { Role } from "@/constants";
import MarkdownRenderer from "../MarkdownRenderer";
import { MarkdownMessageMeta } from "../MarkdownContext";
import ToolCallDisplay from "./ToolCallDisplay";
import ReasoningDisplay from "./ReasoningDisplay";
import {
  BiCopy,
  BiTrash,
  BiRefresh,
  BiGitBranch,
  BiEdit,
} from "react-icons/bi";
import { App } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { showInFolder, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import { useThemeColors } from "@/hooks";
import {
  buildLegacyAssistantDisplayBlocks,
  getDisplayTextFromBlocks,
} from "@tau/shared";
import styles from "./index.module.less";

interface MessageItemProps {
  message: ChatSessionMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否可见/渲染
  onDeleteMessage?: (messageIndex: number) => void;
  onRegenerateMessage?: (messageIndex: number) => void;
  onEditMessage?: (messageIndex: number, content: string) => void;
  onCreateBranch?: (messageIndex: number) => void;
  messageIndex: number;
  messageMeta?: MarkdownMessageMeta;
}

const emitDebugLog = (event: string, payload: unknown) => {
  console.info(`[DEBUG] ${event} ${JSON.stringify(payload)}`);
};

const summarizeText = (text: string | undefined | null, limit = 160) => {
  const normalized = text || "";
  return {
    length: normalized.length,
    preview:
      normalized.length > limit
        ? `${normalized.slice(0, limit)}...`
        : normalized,
  };
};

const findRenderedSuspiciousPattern = (blocks: ResponseContentBlock[]) => {
  for (let i = 0; i <= blocks.length - 3; i += 1) {
    const first = blocks[i];
    const second = blocks[i + 1];
    const third = blocks[i + 2];

    if (
      first.type !== "text" ||
      second.type !== "tool_calls" ||
      third.type !== "text"
    ) {
      continue;
    }

    return {
      indices: [i, i + 1, i + 2],
      beforeText: first.content,
      afterText: third.content,
      beforeLength: first.content.length,
      afterLength: third.content.length,
      afterContainsBefore:
        Boolean(first.content) &&
        Boolean(third.content) &&
        third.content.includes(first.content),
    };
  }

  return null;
};

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

const getFileContent = (
  message: RequestMessage,
): Array<{ path: string; name: string }> => {
  if (typeof message.content === "string") {
    return [];
  }

  return message.content
    .filter(
      (
        item,
      ): item is Extract<
        ChatSessionMessage["content"][number],
        { type: "file" }
      > => item.type === "file" && typeof item.file === "string",
    )
    .map((item) => {
      const path = item.file;
      const name =
        item.fileName ||
        (() => {
          try {
            const url = new URL(path);
            return url.pathname.split("/").pop() || path;
          } catch {
            const normalized = path.replace(/\\/g, "/");
            const parts = normalized.split("/");
            return parts[parts.length - 1] || path;
          }
        })();
      return { path, name };
    });
};

const mapAssistantBlocksToContentBlocks = (
  assistantBlocks: AssistantBlock[],
): ResponseContentBlock[] =>
  assistantBlocks.flatMap((block): ResponseContentBlock[] => {
    if (block.type === "tool_call") {
      return [
        {
          type: "tool_calls",
          executions: [block.execution].filter(
            (execution): execution is ToolCallExecutionState =>
              Boolean(execution),
          ),
        },
      ];
    }

    if (block.type === "text") {
      return [{ type: "text", content: block.content }];
    }

    return [
      {
        type: "reasoning",
        content: block.content,
        startTime: block.startTime,
        endTime: block.endTime,
        duration: block.duration,
      },
    ];
  });

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
    const [showActions, setShowActions] = useState(false);
    const loggedRenderFingerprintRef = useRef<string | null>(null);
    const { chatMessageBg } = useThemeColors();

    const isUser = message.role === Role.User;
    const isAssistant = message.role === Role.Assistant;

    let displayContent = "";
    let assistantBlocks: AssistantBlock[] = [];
    let contentBlocks: ResponseContentBlock[] = [];
    let images: string[] = [];
    let files: Array<{ path: string; name: string }> = [];

    if (isUser) {
      const userMessage = message as RequestMessage;
      displayContent = getTextContent(userMessage);
      images = getImageContent(userMessage);
      files = getFileContent(userMessage);
    } else {
      const assistantMessage = message as ResponseMessage;
      assistantBlocks = assistantMessage.assistant_blocks || [];
      const baseContentBlocks =
        assistantBlocks.length > 0
          ? mapAssistantBlocksToContentBlocks(assistantBlocks)
          : assistantMessage.content_blocks?.length
            ? assistantMessage.content_blocks
            : (buildLegacyAssistantDisplayBlocks({
                content: assistantMessage.content,
                reasoning: assistantMessage.reasoning_content || "",
                toolExecutions: assistantMessage.tool_executions || [],
              }) as ResponseContentBlock[]);
      contentBlocks = baseContentBlocks;
    }

    const filteredContentBlocks = contentBlocks.filter((block) => {
      if (block.type === "text" || block.type === "reasoning") {
        return block.content.trim().length > 0;
      }
      if (block.type === "tool_calls") {
        return block.executions.length > 0;
      }
      return true;
    });

    useEffect(() => {
      if (!isAssistant || filteredContentBlocks.length === 0) {
        return;
      }

      const suspiciousPattern = findRenderedSuspiciousPattern(
        filteredContentBlocks,
      );
      if (!suspiciousPattern) {
        return;
      }

      const fingerprint = JSON.stringify({
        messageIndex,
        blocks: filteredContentBlocks.map((block) => {
          if (block.type === "tool_calls") {
            return `${block.type}:${block.executions.length}`;
          }
          return `${block.type}:${block.content.length}`;
        }),
      });

      if (loggedRenderFingerprintRef.current === fingerprint) {
        return;
      }

      loggedRenderFingerprintRef.current = fingerprint;
      emitDebugLog("MessageItem.render_suspicious_pattern", {
        messageIndex,
        rawContent: summarizeText((message as ResponseMessage).content),
        rawReasoning: summarizeText(
          (message as ResponseMessage).reasoning_content || "",
        ),
        blocks: filteredContentBlocks.map((block) => {
          if (block.type === "tool_calls") {
            return {
              type: block.type,
              executions: block.executions.map((execution) => ({
                toolCallId: execution.toolCallId,
                toolName: execution.toolName,
                status: execution.status,
              })),
            };
          }

          return {
            type: block.type,
            content: summarizeText(block.content),
          };
        }),
        pattern: suspiciousPattern,
      });
    }, [filteredContentBlocks, isAssistant, message, messageIndex]);

    if (
      !displayContent &&
      images.length === 0 &&
      files.length === 0 &&
      filteredContentBlocks.length === 0
    ) {
      return null;
    }

    const openFileInExplorer = async (path: string) => {
      try {
        let targetPath = path;
        if (/^https?:/i.test(path)) {
          targetPath = await remoteResourceToLocal(path);
        } else if (path.startsWith("~")) {
          const homeDir = await getHomeDir();
          targetPath = `${homeDir}${path.slice(1)}`;
        }
        await showInFolder(targetPath);
      } catch (error) {
        console.error("打开文件失败:", error);
        antdMessage.error("无法打开文件");
      }
    };

    const handleCopy = async () => {
      const contentToCopy = isUser
        ? displayContent
        : getDisplayTextFromBlocks(
            filteredContentBlocks as Parameters<
              typeof getDisplayTextFromBlocks
            >[0],
          );

      if (!contentToCopy) {
        antdMessage.warning("没有可复制的内容");
        return;
      }

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

    const handleEdit = () => {
      onEditMessage?.(messageIndex, displayContent);
    };

    const handleCreateBranch = () => {
      onCreateBranch?.(messageIndex);
    };

    const canEditMessage =
      isUser && !!onEditMessage && displayContent.length > 0;

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
        <div
          className={classnames(styles.message, chatMessageBg, {
            [styles.userMessage]: isUser,
            [styles.assistantMessage]: isAssistant,
            [styles.dark]: isDark,
          })}
        >
          <div className={styles.messageContent}>
            {isUser ? (
              <>
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
                {files.length > 0 && (
                  <div className={styles.filesContainer}>
                    {files.map((file, index) => (
                      <button
                        key={`${file.path}-${index}`}
                        className={styles.fileAttachment}
                        onClick={() => openFileInExplorer(file.path)}
                      >
                        <div className={styles.fileInfo}>
                          <FilePdfOutlined />
                          <span>{file.name}</span>
                        </div>
                        <span className={styles.fileAction}>
                          在文件夹中打开
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {displayContent && (
                  <MarkdownRenderer
                    content={displayContent}
                    className={styles.markdown}
                    markdownComponents={markdownComponents}
                    shouldRender={isVisible}
                    messageMeta={messageMeta}
                  />
                )}
              </>
            ) : filteredContentBlocks.length > 0 ? (
              <>
                {(() => {
                  let lastTextBlockIndex = -1;
                  for (let i = filteredContentBlocks.length - 1; i >= 0; i--) {
                    if (filteredContentBlocks[i].type === "text") {
                      lastTextBlockIndex = i;
                      break;
                    }
                  }

                  return filteredContentBlocks.map((block, index) => {
                    const isLastTextBlock =
                      block.type === "text" && index === lastTextBlockIndex;
                    const textContent =
                      block.type === "text" ? block.content : undefined;
                    const blockMeta = messageMeta
                      ? {
                          ...messageMeta,
                          blockIndex: index,
                          isLastTextBlock,
                          textContent,
                        }
                      : undefined;

                    if (block.type === "reasoning") {
                      return (
                        <ReasoningDisplay
                          key={`reasoning-${index}`}
                          content={block.content}
                          isDark={isDark}
                          markdownComponents={markdownComponents}
                          isVisible={isVisible}
                          startTime={block.startTime}
                          endTime={block.endTime}
                          duration={block.duration}
                          messageMeta={blockMeta}
                        />
                      );
                    } else if (block.type === "tool_calls") {
                      return (
                        <div
                          key={`tool-calls-${index}`}
                          className={styles.toolCallsContainer}
                        >
                          {block.executions.map((execution, execIndex) => (
                            <ToolCallDisplay
                              key={execution.toolCallId || execIndex}
                              execution={execution}
                              isDark={isDark}
                            />
                          ))}
                        </div>
                      );
                    } else if (block.type === "text") {
                      return (
                        <MarkdownRenderer
                          key={`text-${index}`}
                          content={block.content}
                          className={styles.markdown}
                          markdownComponents={markdownComponents}
                          shouldRender={isVisible}
                          messageMeta={blockMeta}
                        />
                      );
                    }
                    return null;
                  });
                })()}
              </>
            ) : null}
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
              {canEditMessage && (
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={handleEdit}
                  title="编辑"
                >
                  <BiEdit />
                </button>
              )}
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleRegenerate}
                title="重新生成"
              >
                <BiRefresh />
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleCopy}
                title="复制"
              >
                <BiCopy />
              </button>
              <button
                type="button"
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
                type="button"
                className={styles.actionButton}
                onClick={handleCreateBranch}
                title="创建分支"
              >
                <BiGitBranch />
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleCopy}
                title="复制"
              >
                <BiCopy />
              </button>
              <button
                type="button"
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
