import { memo, useCallback, useMemo, useState } from "react";
import { App } from "antd";
import {
  ToolOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import {
  LazySyntaxHighlighter,
  MarkdownRenderer,
  ReasoningDisplay,
  ToolCallDisplay,
  type ChatMessageType,
  type MessageContentItem,
  type ToolCallExecutionState,
} from "@tau/shared";
import { BiCopy, BiTrash, BiRefresh, BiGitBranch } from "react-icons/bi";
import classNames from "classnames";
import type WebSocketClient from "../../utils/WebSocketClient";
import type { MessageInstance } from "antd/es/message/interface";
import styles from "./index.module.css";

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

interface BlockPreviewPayload {
  id: string;
  type: string;
  content: string;
  metadata: {
    type: string;
    language: string;
    title: string;
    description: string;
    timestamp: number;
    size: string;
  };
}

type LocalChatMessage = ChatMessageType & {
  requestContent?: MessageContentItem[];
  tool_executions?: ToolCallExecutionState[];
};

const PREVIEWABLE_LANGUAGE_ALIAS: Record<string, string> = {
  html: "html",
  mermaid: "mermaid",
  plantuml: "plantuml",
  "mind-map": "mind-map",
  mindmap: "mind-map",
  markmap: "mind-map",
  tikz: "tikz",
  "latex-tikz": "tikz",
  "tex-tikz": "tikz",
  typst: "typst",
  typ: "typst",
};

const PREVIEW_META: Record<string, { title: string; description: string }> = {
  html: {
    title: "HTML 预览",
    description: "点击在桌面端窗口中预览 HTML",
  },
  mermaid: {
    title: "Mermaid 图表预览",
    description: "点击在桌面端窗口中预览 Mermaid 图表",
  },
  plantuml: {
    title: "PlantUML 图表预览",
    description: "点击在桌面端窗口中预览 PlantUML 图表",
  },
  "mind-map": {
    title: "思维导图预览",
    description: "点击在桌面端窗口中预览思维导图",
  },
  tikz: {
    title: "TikZ 图表预览",
    description: "点击在桌面端窗口中预览 TikZ 图形",
  },
  typst: {
    title: "Typst 文档预览",
    description: "点击在桌面端窗口中预览 Typst 文档",
  },
};

const isCompleteHtmlDocument = (code: string) =>
  /^<!DOCTYPE\s+html>/i.test(code.trim());

const toSizeLabel = (content: string) => {
  const sizeKB = (content.length / 1024).toFixed(1);
  return parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} B`;
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

const extractBlockTitle = (type: string, content: string) => {
  if (type === "html") {
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch?.[1]?.trim()) {
      return titleMatch[1].trim();
    }
  }
  if (type === "mind-map") {
    const firstLine = content
      .split("\n")[0]
      ?.trim()
      .replace(/^[*-]\s*/, "");
    if (firstLine) {
      return firstLine;
    }
  }
  return PREVIEW_META[type]?.title ?? `${type} 预览`;
};

const buildBlockPreviewPayload = (
  language: string,
  code: string,
): BlockPreviewPayload | null => {
  const normalized = PREVIEWABLE_LANGUAGE_ALIAS[language.toLowerCase()];
  if (!normalized) {
    return null;
  }

  const now = Date.now();
  const title = extractBlockTitle(normalized, code);
  const description =
    PREVIEW_META[normalized]?.description ??
    `点击在桌面端窗口中预览 ${normalized}`;

  return {
    id: `ext-block-${normalized}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    type: normalized,
    content: code,
    metadata: {
      type: normalized,
      language: normalized,
      title,
      description,
      timestamp: now,
      size: toSizeLabel(code),
    },
  };
};

const PreviewBlockCard = ({
  type,
  code,
  wsClient,
  isDark,
  messageApi,
}: {
  type: string;
  code: string;
  wsClient: WebSocketClient | null | undefined;
  isDark?: boolean;
  messageApi: MessageInstance;
}) => {
  const payload = useMemo(
    () => buildBlockPreviewPayload(type, code),
    [type, code],
  );

  const handlePreview = useCallback(async () => {
    if (!payload) {
      return;
    }
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
  }, [payload, wsClient, messageApi]);

  if (!payload) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handlePreview}
      className={classNames(styles.previewCard, {
        [styles.darkCard]: isDark,
      })}
    >
      <div className={styles.previewTitle}>{payload.metadata.title}</div>
      <div className={styles.previewDesc}>{payload.metadata.description}</div>
      <div className={styles.previewTag}>点击预览</div>
    </button>
  );
};

const ToolIcon = ({ className }: { className?: string }) => (
  <ToolOutlined className={className} />
);

const ThinkingIcon = ({ className }: { className?: string }) => (
  <ThunderboltOutlined className={className} />
);

const LoadingIcon = ({
  className,
  spin,
}: {
  className?: string;
  spin?: boolean;
}) => <LoadingOutlined className={className} spin={spin} />;

const createMarkdownComponent = (
  wsClient: WebSocketClient | null | undefined,
  isDark: boolean,
  messageApi: MessageInstance,
) =>
  memo(function CustomMarkdownComponent({ content }: { content: string }) {
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
      [wsClient],
    );

    const handleLinkClick = useCallback((href: string) => {
      window.open(href, "_blank", "noopener,noreferrer");
    }, []);

    const codeLanguageRenderers = useMemo(
      () => ({
        html: ({ code }: { code: string }) => {
          if (!isCompleteHtmlDocument(code)) {
            return (
              <LazySyntaxHighlighter language="html" isDark={isDark}>
                {code}
              </LazySyntaxHighlighter>
            );
          }
          return (
            <PreviewBlockCard
              type="html"
              code={code}
              wsClient={wsClient}
              isDark={isDark}
              messageApi={messageApi}
            />
          );
        },
        mermaid: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="mermaid"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        plantuml: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="plantuml"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        "mind-map": ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="mind-map"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        mindmap: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="mind-map"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        markmap: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="mind-map"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        tikz: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="tikz"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        "latex-tikz": ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="tikz"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        "tex-tikz": ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="tikz"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        typst: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="typst"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
        typ: ({ code }: { code: string }) => (
          <PreviewBlockCard
            type="typst"
            code={code}
            wsClient={wsClient}
            isDark={isDark}
            messageApi={messageApi}
          />
        ),
      }),
      [isDark, messageApi, wsClient],
    );

    return (
      <MarkdownRenderer
        content={content}
        isDark={isDark}
        enableDocumentReference={!!wsClient?.isConnected}
        onReferenceClick={handleReferenceClick}
        onLinkClick={handleLinkClick}
        messageApi={messageApi}
        codeLanguageRenderers={codeLanguageRenderers}
      />
    );
  });

const getUserText = (message: LocalChatMessage) => {
  if (!message.requestContent?.length) {
    return message.content || "";
  }
  return message.requestContent
    .filter(
      (item): item is Extract<MessageContentItem, { type: "text" }> =>
        item.type === "text",
    )
    .map((item) => item.text)
    .join("\n");
};

const getUserImages = (message: LocalChatMessage) => {
  if (!message.requestContent?.length) {
    return [];
  }
  return message.requestContent
    .filter(
      (item): item is Extract<MessageContentItem, { type: "image" }> =>
        item.type === "image",
    )
    .map((item) => item.image);
};

const getUserFiles = (message: LocalChatMessage) => {
  if (!message.requestContent?.length) {
    return [];
  }
  return message.requestContent
    .filter(
      (item): item is Extract<MessageContentItem, { type: "file" }> =>
        item.type === "file",
    )
    .map((item) => ({
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
  onCopySuccess,
  onCopyError,
  onDeleteConfirm,
}: ChatMessageProps) {
  const { message: messageApi } = App.useApp();
  const [showActions, setShowActions] = useState(false);
  const MarkdownComponent = useMemo(
    () => createMarkdownComponent(wsClient, isDark, messageApi),
    [wsClient, isDark, messageApi],
  );
  const localMessage = message as LocalChatMessage;
  const isUser = message.role === "user";
  const userText = getUserText(localMessage);
  const userImages = getUserImages(localMessage);
  const userFiles = getUserFiles(localMessage);
  const hasContentBlocks =
    message.role === "assistant" &&
    Array.isArray(message.contentBlocks) &&
    message.contentBlocks.length > 0;

  const openFileInFolder = useCallback(
    async (path: string, fileName?: string) => {
      if (!wsClient?.isConnected) {
        messageApi.warning("桌面端未连接，无法打开文件位置");
        return;
      }
      try {
        await wsClient.sendRequest("file.showInFolder", { path, fileName });
      } catch (error) {
        console.error("[ChatMessage] 打开文件位置失败:", error);
        messageApi.error("打开文件位置失败");
      }
    },
    [wsClient, messageApi],
  );

  const handleCopy = useCallback(async () => {
    let contentToCopy = "";
    if (isUser) {
      contentToCopy = userText || message.content || "";
    } else if (message.contentBlocks?.length) {
      contentToCopy = message.contentBlocks
        .filter((block) => block.type === "text" || block.type === "reasoning")
        .map((block) => block.content)
        .join("\n\n");
    } else {
      contentToCopy = message.content || message.reasoning || "";
    }

    if (!contentToCopy.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(contentToCopy);
      onCopySuccess?.();
    } catch (error) {
      console.error("复制失败:", error);
      onCopyError?.();
    }
  }, [isUser, message, onCopyError, onCopySuccess, userText]);

  const handleDelete = useCallback(async () => {
    if (onDeleteConfirm) {
      const confirmed = await onDeleteConfirm();
      if (!confirmed) return;
    }
    onDeleteMessage?.(messageIndex);
  }, [onDeleteConfirm, onDeleteMessage, messageIndex]);

  const handleRegenerate = useCallback(() => {
    onRegenerateMessage?.(messageIndex);
  }, [onRegenerateMessage, messageIndex]);

  const handleCreateBranch = useCallback(() => {
    onCreateBranch?.(messageIndex);
  }, [onCreateBranch, messageIndex]);

  const renderAssistantContent = () => {
    if (hasContentBlocks && message.contentBlocks) {
      const filteredBlocks = message.contentBlocks.filter((block) => {
        if (block.type === "text" || block.type === "reasoning") {
          return block.content.trim().length > 0;
        }
        if (block.type === "tool_calls") {
          return block.executions.length > 0;
        }
        return true;
      });

      return filteredBlocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <div key={`text-${index}`} className={styles.block}>
              <MarkdownComponent content={block.content} />
            </div>
          );
        }
        if (block.type === "reasoning") {
          return (
            <div key={`reasoning-${index}`} className={styles.block}>
              <ReasoningDisplay
                content={block.content}
                isDark={isDark}
                startTime={block.startTime}
                endTime={block.endTime}
                duration={block.duration}
                ThinkingIcon={ThinkingIcon}
                LoadingIcon={LoadingIcon}
                renderContent={(content) => (
                  <MarkdownComponent content={content} />
                )}
              />
            </div>
          );
        }
        if (block.type === "tool_calls") {
          return (
            <div key={`tool-${index}`} className={styles.toolCallsContainer}>
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
        }
        return null;
      });
    }

    return (
      <>
        {localMessage.reasoning ? (
          <div className={styles.block}>
            <ReasoningDisplay
              content={localMessage.reasoning}
              isDark={isDark}
              ThinkingIcon={ThinkingIcon}
              LoadingIcon={LoadingIcon}
              renderContent={(content) => (
                <MarkdownComponent content={content} />
              )}
            />
          </div>
        ) : null}
        {Array.isArray(localMessage.tool_executions) &&
        localMessage.tool_executions.length > 0 ? (
          <div className={styles.toolCallsContainer}>
            {localMessage.tool_executions.map((execution, index) => (
              <ToolCallDisplay
                key={execution.toolCallId || index}
                executions={[execution]}
                isDark={isDark}
                ToolIcon={ToolIcon}
              />
            ))}
          </div>
        ) : null}
        {localMessage.content ? (
          <MarkdownComponent content={localMessage.content} />
        ) : null}
      </>
    );
  };

  const hasVisibleContent = isUser
    ? userText.trim().length > 0 ||
      userImages.length > 0 ||
      userFiles.length > 0
    : hasContentBlocks ||
      Boolean(localMessage.content?.trim()) ||
      Boolean(localMessage.reasoning?.trim()) ||
      Boolean(localMessage.tool_executions?.length);

  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div
      className={classNames(styles.messageContainer, {
        [styles.userContainer]: isUser,
        [styles.assistantContainer]: !isUser,
        [styles.dark]: isDark,
      })}
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
              {userImages.length > 0 ? (
                <div className={styles.imagesContainer}>
                  {userImages.map((image, index) => (
                    <img
                      key={`${image}-${index}`}
                      src={image}
                      alt={`User uploaded image ${index + 1}`}
                      className={styles.messageImage}
                    />
                  ))}
                </div>
              ) : null}
              {userFiles.length > 0 ? (
                <div className={styles.filesContainer}>
                  {userFiles.map((file, index) => (
                    <button
                      type="button"
                      key={`${file.path}-${index}`}
                      className={styles.fileAttachment}
                      onClick={() => openFileInFolder(file.path, file.name)}
                    >
                      <div className={styles.fileInfo}>
                        <FilePdfOutlined />
                        <span>{file.name}</span>
                      </div>
                      <span className={styles.fileAction}>在文件夹中打开</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {userText ? <MarkdownComponent content={userText} /> : null}
            </>
          ) : (
            renderAssistantContent()
          )}
        </div>
      </div>

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
}

export default memo(ChatMessage);
