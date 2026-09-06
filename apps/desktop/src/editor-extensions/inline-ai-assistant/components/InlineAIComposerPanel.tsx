import "katex/dist/katex.min.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App } from "antd";
import classNames from "classnames";
import { useMemoizedFn } from "ahooks";
import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { LazySyntaxHighlighter } from "@tau/shared";
import { openExternal } from "@/commands";
import BlockCard from "@/components/BlockCard";
import ChatInputArea, { type ChatInputAreaHandle } from "@/components/ChatInputArea";
import MessageItem from "@/layouts/ContentLayout/components/ChatSidebar/MessageItem";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { DEFAULT_SYSTEM_PROMPT, Role } from "@/constants";
import { chatLLMStream } from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useTheme from "@/hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";
import useSkillStore from "@/stores/useSkillStore";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import type {
  AssistantBlock,
  ChatSessionMessage,
  ModelConfig,
  ProviderConfig,
  RequestMessage,
  ResponseMessage,
  ToolCallExecutionState,
} from "@/types";
import {
  buildInlineContextPrompt,
  buildInlineEditorContext,
  type SerializedSelection,
} from "@/services/content-editing";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantProviderMetadataSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  buildAssistantHistoryMessages,
  createAssistantMessage,
  finalizeAssistantTurn,
} from "@/services/assistantMessageBlocks";

interface InlineAIComposerPanelProps {
  editor: Editor;
  source: "hovering" | "hotkey";
  initialSelection?: SerializedSelection | null;
  onClose: () => void;
}

interface InlineConversationMessage {
  id: string;
  role: Role.User | Role.Assistant;
  content: string;
  reasoning?: string;
  toolExecutions?: ToolCallExecutionState[];
  assistantBlocks?: AssistantBlock[];
  createdAt: number;
}

interface InlineConversationSession {
  contentId: number;
  messages: InlineConversationMessage[];
  updatedAt: number;
}

const INLINE_CONTEXT_SESSIONS = new Map<number, InlineConversationSession>();
const MAX_HISTORY_MESSAGES = 20;

const INLINE_TOOL_POLICY = `
## Inline Editing Policy

1. 所有实际改动必须通过工具完成，禁止仅输出建议文本。
2. 默认优先使用 \`replace_content_by_text\` 做精准改写。
3. 需要整篇重写时使用 \`rewrite_content_full\`（必须提供 contentId）。
4. 若只有 cardId/articleId/projectItemId/documentItemId，先调用 \`resolve_entity_content_id\`。
5. 严禁将 articleId/cardId 等实体 ID 当作 contentId 直接写入。
6. 如果 contentId 缺失或不可靠，先明确报错并要求用户确认目标，不执行写入。
7. 调用编辑工具后，修改不会立即生效，而是生成待用户审阅的提案。只有用户确认应用后，修改才会真正写入。在用户明确确认之前，你不应假设之前的修改已经被应用，也不应为此调用 get_content_markdown 等工具去确认当前内容。
`;

const createMessageId = () => `inline_ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isCodeBlockCompleted = (codeContent: string, fullTextContent?: string): boolean => {
  if (!fullTextContent) return true;
  const codeIndex = fullTextContent.indexOf(codeContent);
  if (codeIndex === -1) return true;
  const afterCode = fullTextContent.slice(codeIndex + codeContent.length);
  return afterCode.includes("```");
};

const simpleHash = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const buildInlineConversationKey = (contentId: number) => `inline-content-edit:${contentId}`;
const toInlineHistoryMessages = (messages: InlineConversationMessage[]): RequestMessage[] => {
  return messages.slice(-MAX_HISTORY_MESSAGES).flatMap((item): RequestMessage[] => {
    if (item.role === Role.User) {
      return [
        {
          role: item.role,
          content: [{ type: "text", text: item.content }],
        },
      ];
    }

    const assistantMessage: ResponseMessage = {
      role: Role.Assistant,
      content: item.content,
      reasoning_content: item.reasoning || "",
      assistant_blocks: item.assistantBlocks || [],
    };
    return buildAssistantHistoryMessages(assistantMessage);
  });
};

const InlineAIComposerPanel = ({
  editor,
  initialSelection = null,
  onClose,
}: InlineAIComposerPanelProps) => {
  const { message } = App.useApp();
  const { isDark } = useTheme();
  const { cardBorderClass, modalPanelBg } = useThemeColors();
  const { providerConfig, modelConfig } = useLLMConfig("chat");
  const skills = useSkillStore(state => state.skills);
  const loadSkills = useSkillStore(state => state.loadSkills);

  const [messages, setMessages] = useState<InlineConversationMessage[]>([]);
  const [selectionQuote, setSelectionQuote] = useState("");
  const [sending, setSending] = useState(false);
  const [layout, setLayout] = useState({
    left: 16,
    width: 720,
    bottom: 16,
    maxHeight: 520,
  });

  const panelRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputAreaHandle | null>(null);
  const activeContentIdRef = useRef<number | null>(null);
  const initialSelectionRef = useRef<SerializedSelection | null>(initialSelection);

  const saveSession = useMemoizedFn(
    (contentId: number | null, nextMessages: InlineConversationMessage[]) => {
      if (!contentId) return;
      INLINE_CONTEXT_SESSIONS.set(contentId, {
        contentId,
        messages: nextMessages,
        updatedAt: Date.now(),
      });
    }
  );

  const updateLayout = useMemoizedFn(() => {
    const maxHeight = Math.min(560, Math.floor(window.innerHeight * 0.72));
    const maxBottom = Math.max(12, window.innerHeight - maxHeight - 12);
    try {
      const editorEl = ReactEditor.toDOMNode(editor, editor) as HTMLElement;
      const rect = editorEl.getBoundingClientRect();
      const width = Math.min(Math.max(540, rect.width - 24), window.innerWidth - 32);
      const left = clamp(rect.left + 12, 16, window.innerWidth - width - 16);
      const preferredBottom = Math.max(12, window.innerHeight - rect.bottom + 12);
      const bottom = clamp(preferredBottom, 12, maxBottom);
      setLayout({
        left,
        width,
        bottom,
        maxHeight,
      });
    } catch {
      setLayout({
        left: 16,
        width: Math.min(760, window.innerWidth - 32),
        bottom: clamp(16, 12, maxBottom),
        maxHeight,
      });
    }
  });

  const refreshContext = useMemoizedFn(async () => {
    try {
      const context = await buildInlineEditorContext(
        editor,
        undefined,
        initialSelectionRef.current
      );
      const selectedMarkdown = context.selectedMarkdown.trim();
      const currentBlockMarkdown = context.currentBlockMarkdown.trim();
      setSelectionQuote(selectedMarkdown || currentBlockMarkdown || "");
      activeContentIdRef.current = context.contentId;
      const cachedSession = context.contentId
        ? INLINE_CONTEXT_SESSIONS.get(context.contentId)
        : null;
      setMessages(cachedSession?.messages || []);
      return context;
    } catch (error) {
      activeContentIdRef.current = null;
      message.error((error as Error).message || "无法解析当前编辑上下文");
      return null;
    }
  });

  const closePanel = useMemoizedFn(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSending(false);
    onClose();
  });

  useEffect(() => {
    updateLayout();
    void refreshContext();
    void loadSkills();

    const timer = setTimeout(() => {
      chatInputRef.current?.focusEnd();
    }, 30);
    return () => {
      clearTimeout(timer);
    };
  }, [loadSkills, refreshContext, updateLayout]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
    };
    const handleLayout = () => {
      updateLayout();
    };
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      closePanel();
    };
    window.addEventListener("keydown", handleEsc);
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    window.addEventListener("mousedown", handleOutsideClick, true);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
      window.removeEventListener("mousedown", handleOutsideClick, true);
    };
  }, [closePanel, updateLayout]);

  const sendInstruction = useMemoizedFn(
    async (
      instruction: string,
      options?: {
        extraHistoryMessages?: RequestMessage[];
        toolContext?: {
          flags?: {
            forceReview?: boolean;
            feedbackProposalId?: string;
          };
        };
      }
    ) => {
      if (sending) return false;
      if (!instruction) return false;

      const activeContext = await refreshContext();
      if (!activeContext || !activeContext.contentId) {
        message.error("无法确定 contentId，已阻止自动写入。请切换到可编辑内容页后重试。");
        return false;
      }
      if (!providerConfig || !modelConfig) {
        message.error("未配置聊天模型，请先在设置中完成 chat 模型配置。");
        return false;
      }

      const currentMessages =
        INLINE_CONTEXT_SESSIONS.get(activeContext.contentId)?.messages || messages;
      const userMessage: InlineConversationMessage = {
        id: createMessageId(),
        role: Role.User,
        content: instruction,
        createdAt: Date.now(),
      };
      const assistantMessageId = createMessageId();
      const assistantPlaceholder: InlineConversationMessage = {
        id: assistantMessageId,
        role: Role.Assistant,
        content: "",
        reasoning: "",
        assistantBlocks: [],
        createdAt: Date.now(),
      };

      const nextMessages = [...currentMessages, userMessage, assistantPlaceholder];
      setMessages(nextMessages);
      saveSession(activeContext.contentId, nextMessages);
      chatInputRef.current?.clear();
      setSending(true);

      const historyMessages = [
        ...toInlineHistoryMessages(currentMessages),
        ...(options?.extraHistoryMessages || []),
      ];
      const userPrompt = buildInlineContextPrompt(activeContext, instruction);

      const requestMessages: RequestMessage[] = [
        {
          role: Role.System,
          content: [
            {
              type: "text",
              text: DEFAULT_SYSTEM_PROMPT,
            },
          ],
        },
        {
          role: Role.System,
          content: [
            {
              type: "text",
              text: INLINE_TOOL_POLICY,
            },
          ],
        },
        ...historyMessages,
        {
          role: Role.User,
          content: [{ type: "text", text: userPrompt }],
        },
      ];

      const patchAssistantMessage = (
        updater: (message: ResponseMessage) => void,
        persist = true
      ) => {
        setMessages(prev => {
          const updated = prev.map(item => {
            if (item.id !== assistantMessageId || item.role !== Role.Assistant) {
              return item;
            }

            const assistantMessage = createAssistantMessage({
              content: item.content,
              reasoning_content: item.reasoning || "",
              assistant_blocks: item.assistantBlocks || [],
            });
            updater(assistantMessage);
            return {
              ...item,
              content: assistantMessage.content,
              reasoning: assistantMessage.reasoning_content || "",
              assistantBlocks: assistantMessage.assistant_blocks || [],
            };
          });
          if (persist) {
            saveSession(activeContext.contentId, updated);
          }
          return updated;
        });
      };

      chatLLMStream(providerConfig as ProviderConfig, modelConfig as ModelConfig, requestMessages, {
        enableTools: true,
        conversationKey: buildInlineConversationKey(activeContext.contentId),
        toolContext: options?.toolContext,
        skills,
        deferAssistantTextUntilFinish: true,
        onUpdate: (full, _inc, _reasoningText, turnId) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantTextSnapshot(assistantMessage, turnId || "inline-fallback-text", full);
          });
        },
        onReasoning: (full, _inc, turnId) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantReasoningSnapshot(
              assistantMessage,
              turnId || "inline-fallback-reasoning",
              full
            );
          });
        },
        onToolCallsUpdate: (executions, turnId, toolCalls) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantToolCallsSnapshot(
              assistantMessage,
              turnId || "inline-fallback-tool",
              executions,
              toolCalls
            );
          });
        },
        onAssistantTurnEnd: ({ turnId, resultType, providerMetadata }) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantProviderMetadataSnapshot(assistantMessage, turnId, providerMetadata);
            finalizeAssistantTurn(assistantMessage, turnId);
          });
          if (resultType !== "response") {
            return;
          }
          setSending(false);
          abortControllerRef.current = null;
          setTimeout(() => {
            chatInputRef.current?.focusEnd();
          }, 0);
        },
        onFinish: () => {},
        onError: error => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantTextSnapshot(
              assistantMessage,
              "inline-error",
              `请求失败：${(error as Error).message || "未知错误"}`
            );
          });
          message.error((error as Error).message || "请求失败");
          setSending(false);
          abortControllerRef.current = null;
        },
        onController: controller => {
          abortControllerRef.current = controller;
        },
      });
      return true;
    }
  );

  const sendMessage = useMemoizedFn(async () => {
    const inputItems = chatInputRef.current?.getValue() || [];
    const instruction = inputItems
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("\n")
      .trim();
    await sendInstruction(instruction);
  });

  const stopSending = useMemoizedFn(() => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    setSending(false);
  });

  const renderMessages = useMemo<ChatSessionMessage[]>(() => {
    return messages.map(item => {
      if (item.role === Role.User) {
        const userMessage: RequestMessage = {
          role: Role.User,
          content: [{ type: "text", text: item.content }],
        };
        return userMessage;
      }
      const assistantMessage: ResponseMessage = {
        role: Role.Assistant,
        content: item.content,
        reasoning_content: item.reasoning || "",
        assistant_blocks: item.assistantBlocks || [],
      };
      return createAssistantMessage(assistantMessage);
    });
  }, [messages]);

  const handleOpenExternalLink = useMemoizedFn(
    (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
      if (!href) return;
      event.preventDefault();
      void openExternal(href);
    }
  );

  const CodeBlockRenderer = ({
    children,
    className,
    ...rest
  }: {
    children?: ReactNode;
    className?: string;
  }) => {
    const { messageMeta } = useMarkdownContext();
    const match = /language-([\w-]+)/.exec(className || "");
    const language = match ? match[1] : undefined;
    const code = String(children).replace(/\n$/, "");

    if (language && blockRegistry.isPreviewable(language)) {
      const sourceMessageIndex = messageMeta?.messageIndex ?? 0;
      const sourceChatId = messageMeta?.chatId ?? 0;
      const blockIndex = messageMeta?.blockIndex;
      const messageKey = `${sourceChatId}-${sourceMessageIndex}`;
      const isGenerating =
        !!messageMeta?.isStreaming &&
        !!messageMeta?.isLastTextBlock &&
        !isCodeBlockCompleted(code, messageMeta?.textContent);
      const stableContent = code.slice(0, 200);
      const idSuffix =
        blockIndex != null ? `idx-${blockIndex}` : `hash-${simpleHash(stableContent)}`;

      const blockData: BlockData = {
        id: `inline-block-${language}-${messageKey}-${idSuffix}`,
        type: language,
        content: code,
        metadata: {
          type: language,
          language,
          timestamp: Date.now(),
          sourceChatId,
          sourceMessageIndex,
          blockIndex,
          isGenerating,
        },
      };

      const renderer = blockRegistry.getRenderer(language);
      if (renderer?.extractMetadata) {
        Object.assign(blockData.metadata, renderer.extractMetadata(code));
      }
      if (renderer?.renderInline && renderer.inlineMode === "expanded") {
        return (
          <div className="my-3">
            {renderer.renderInline({
              block: blockData,
            })}
          </div>
        );
      }
      return <BlockCard block={blockData} />;
    }

    if (language) {
      return (
        <LazySyntaxHighlighter language={language} isDark={isDark} {...rest}>
          {code}
        </LazySyntaxHighlighter>
      );
    }

    return (
      <code {...rest} className={className}>
        {children}
      </code>
    );
  };

  const markdownComponents = useMemo(() => {
    return {
      code: CodeBlockRenderer,
      a: ({ children, href, ...props }: { children?: ReactNode; href?: string }) => {
        return (
          <a {...props} href={href} onClick={event => handleOpenExternalLink(event, href)}>
            {children}
          </a>
        );
      },
    };
  }, [handleOpenExternalLink]);

  return (
    <div
      ref={panelRef}
      data-inline-ai-composer="true"
      className="z-1200 fixed"
      style={{
        left: layout.left,
        width: layout.width,
        bottom: layout.bottom,
      }}
      onMouseDown={event => {
        event.stopPropagation();
      }}
    >
      <div
        className={classNames(
          "m-1 mt-3 flex flex-col rounded-3xl border px-3 py-3 shadow-xl",
          cardBorderClass,
          modalPanelBg
        )}
        style={{ maxHeight: layout.maxHeight }}
      >
        <MarkdownProvider isDark={isDark} isVisible={true}>
          {!!selectionQuote && (
            <div
              className={classNames(
                "mb-2 rounded-xl border px-3 py-2",
                cardBorderClass,
                modalPanelBg
              )}
            >
              <div className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">当前选中</div>
              <blockquote className="border-l-3 max-h-28 overflow-y-auto whitespace-pre-wrap break-words border-[var(--th-border-focus)] pl-3 text-sm text-gray-700 dark:text-gray-200">
                {selectionQuote}
              </blockquote>
            </div>
          )}
          {renderMessages.length > 0 && (
            <div className="mb-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {renderMessages.map((item, index) => (
                <div key={messages[index]?.id || index} className="py-1.5">
                  <MessageItem
                    message={item}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                    isVisible={true}
                    messageIndex={index}
                    messageMeta={{
                      chatId: 0,
                      messageIndex: index,
                      isStreaming: sending && index === renderMessages.length - 1,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </MarkdownProvider>

        <ChatInputArea
          ref={chatInputRef}
          className="min-w-0 flex-1"
          contentEditable={!sending}
          onPressEnter={() => {
            void sendMessage();
          }}
          onStop={stopSending}
          sendLoading={sending}
          isSupportImage={false}
          isSupportFile={false}
          showMcpManager={false}
        />
      </div>
    </div>
  );
};

export default InlineAIComposerPanel;
