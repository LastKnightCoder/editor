import React, { memo, useState } from "react";
import classnames from "classnames";
import {
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
import { BiCopy, BiTrash, BiRefresh, BiGitBranch } from "react-icons/bi";
import { App } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { showInFolder, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import { useThemeColors } from "@/hooks";
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

const MessageItem: React.FC<MessageItemProps> = memo(
  ({
    message,
    isDark,
    markdownComponents,
    isVisible,
    onDeleteMessage,
    onRegenerateMessage,
    onCreateBranch,
    messageIndex,
    messageMeta,
  }) => {
    const { message: antdMessage, modal } = App.useApp();
    const [showActions, setShowActions] = useState(false);
    const { chatMessageBg } = useThemeColors();

    const isUser = message.role === Role.User;
    const isAssistant = message.role === Role.Assistant;

    let displayContent = "";
    let reasoningContent = "";
    let toolExecutions: ToolCallExecutionState[] = [];
    let contentBlocks: ResponseContentBlock[] | undefined;
    let images: string[] = [];
    let files: Array<{ path: string; name: string }> = [];

    if (isUser) {
      const userMessage = message as RequestMessage;
      displayContent = getTextContent(userMessage);
      images = getImageContent(userMessage);
      files = getFileContent(userMessage);
    } else {
      const assistantMessage = message as ResponseMessage;
      // 优先使用 content_blocks（新的有序结构）
      contentBlocks = assistantMessage.content_blocks;

      // 向后兼容：如果没有 content_blocks，使用旧字段
      if (!contentBlocks || contentBlocks.length === 0) {
        displayContent = assistantMessage.content;
        reasoningContent = assistantMessage.reasoning_content || "";
        toolExecutions = assistantMessage.tool_executions || [];
      }
    }

    if (
      !displayContent &&
      !reasoningContent &&
      images.length === 0 &&
      files.length === 0 &&
      toolExecutions.length === 0 &&
      (!contentBlocks || contentBlocks.length === 0)
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
      let contentToCopy = displayContent || reasoningContent;

      // 如果使用 contentBlocks，从中提取文本内容
      if (!contentToCopy && contentBlocks && contentBlocks.length > 0) {
        contentToCopy = contentBlocks
          .filter(
            (block) => block.type === "text" || block.type === "reasoning",
          )
          .map((block) => block.content)
          .join("\n\n");
      }

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

    const handleCreateBranch = () => {
      onCreateBranch?.(messageIndex);
    };

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
            {/* 新逻辑：使用 content_blocks 按顺序渲染 */}
            {contentBlocks && contentBlocks.length > 0 ? (
              <>
                {/* 用户内容（图片和文件）在顶部 */}
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

                {/* 按顺序渲染所有内容块 */}
                {(() => {
                  const filteredBlocks = contentBlocks.filter((block) => {
                    // 过滤掉空的内容块
                    if (block.type === "text" || block.type === "reasoning") {
                      return block.content.trim().length > 0;
                    }
                    if (block.type === "tool_calls") {
                      return block.executions.length > 0;
                    }
                    return true;
                  });

                  // 找出最后一个 text block 的索引
                  let lastTextBlockIndex = -1;
                  for (let i = filteredBlocks.length - 1; i >= 0; i--) {
                    if (filteredBlocks[i].type === "text") {
                      lastTextBlockIndex = i;
                      break;
                    }
                  }

                  return filteredBlocks.map((block, index) => {
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
            ) : (
              <>
                {/* 旧逻辑：向后兼容 */}
                {reasoningContent && (
                  <ReasoningDisplay
                    content={reasoningContent}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                    isVisible={isVisible}
                    messageMeta={messageMeta}
                  />
                )}
                {toolExecutions.length > 0 && (
                  <div className={styles.toolCallsContainer}>
                    {toolExecutions.map((execution, index) => (
                      <ToolCallDisplay
                        key={execution.toolCallId || index}
                        execution={execution}
                        isDark={isDark}
                      />
                    ))}
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
            )}
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
              <button
                className={styles.actionButton}
                onClick={handleRegenerate}
                title="重新生成"
              >
                <BiRefresh />
              </button>
              <button
                className={styles.actionButton}
                onClick={handleCopy}
                title="复制"
              >
                <BiCopy />
              </button>
              <button
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
                className={styles.actionButton}
                onClick={handleCreateBranch}
                title="创建分支"
              >
                <BiGitBranch />
              </button>
              <button
                className={styles.actionButton}
                onClick={handleCopy}
                title="复制"
              >
                <BiCopy />
              </button>
              <button
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
