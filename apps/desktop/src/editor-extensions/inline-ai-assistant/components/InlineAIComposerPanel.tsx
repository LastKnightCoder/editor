import "katex/dist/katex.min.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import ChatInputArea, { type ChatInputAreaHandle } from "@/components/ChatInputArea";
import MessageItem from "@/layouts/ContentLayout/components/ChatSidebar/MessageItem";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import { DEFAULT_SYSTEM_PROMPT, Role } from "@/constants";
import { runPiAgent, type PiAgentRunHandle } from "@/services/piAgentRunner";
import { buildPiChatSystemPrompt } from "@/services/piChatSession";
import { PiChatEventReducer } from "@/services/piChatEvents";
import useLLMConfig from "@/hooks/useLLMConfig";
import useTheme from "@/hooks/useTheme";
import useSkillStore from "@/stores/useSkillStore";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type {
  AssistantBlock,
  ChatSessionMessage,
  RequestMessage,
  ResponseMessage,
  ToolCallExecutionState,
} from "@/types/llm";
import {
  buildInlineContextPrompt,
  buildInlineEditorContext,
  type SerializedSelection,
} from "@/services/content-editing";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  buildAssistantHistoryMessages,
  createAssistantMessage,
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
4. 若只有 cardId/articleId/projectItemId，先调用 \`resolve_entity_content_id\`。
5. 严禁将 articleId/cardId 等实体 ID 当作 contentId 直接写入。
6. 如果 contentId 缺失或不可靠，先明确报错并要求用户确认目标，不执行写入。
7. 调用编辑工具后，修改不会立即生效，而是生成待用户审阅的提案。只有用户确认应用后，修改才会真正写入。在用户明确确认之前，你不应假设之前的修改已经被应用，也不应为此调用 get_content_markdown 等工具去确认当前内容。
`;

const createMessageId = () => `inline_ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
  const { isDark } = useTheme();
  const { provider, model } = useLLMConfig("chat");
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
  const chatHandleRef = useRef<PiAgentRunHandle | null>(null);
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
      toast.error((error as Error).message || "无法解析当前编辑上下文");
      return null;
    }
  });

  const closePanel = useMemoizedFn(() => {
    if (chatHandleRef.current) {
      chatHandleRef.current.abort();
      chatHandleRef.current = null;
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
        toast.error("无法确定 contentId，已阻止自动写入。请切换到可编辑内容页后重试。");
        return false;
      }
      if (!provider || !model) {
        toast.error("未配置聊天模型，请先在设置中完成 chat 模型配置。");
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
              text: buildPiChatSystemPrompt(
                `${DEFAULT_SYSTEM_PROMPT}\n\n${INLINE_TOOL_POLICY}`,
                skills,
                []
              ),
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

      const reducer = new PiChatEventReducer({
        applyText: (turnId, text) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantTextSnapshot(assistantMessage, turnId, text);
          });
        },
        applyReasoning: (turnId, text) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantReasoningSnapshot(assistantMessage, turnId, text);
          });
        },
        applyToolCalls: (turnId, executions, toolCalls) => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantToolCallsSnapshot(assistantMessage, turnId, executions, toolCalls);
          });
        },
        finalizeTurn: () => {},
        applyUsage: () => {},
        onAssistantTurnEnd: ({ resultType }) => {
          if (resultType !== "response") {
            return;
          }
          setSending(false);
          chatHandleRef.current = null;
          setTimeout(() => {
            chatInputRef.current?.focusEnd();
          }, 0);
        },
        onRetryStatus: () => {},
        onStreamError: errorMessage => {
          patchAssistantMessage(assistantMessage => {
            applyAssistantTextSnapshot(
              assistantMessage,
              "inline-error",
              `请求失败：${errorMessage}`
            );
          });
          toast.error(errorMessage || "请求失败");
          setSending(false);
          chatHandleRef.current = null;
        },
        onSettled: () => {},
      });
      const handle = runPiAgent(
        {
          provider: provider as LLMProviderSetting,
          model: model as LLMModelSetting,
          messages: requestMessages,
          conversationKey: buildInlineConversationKey(activeContext.contentId),
          ...(options?.toolContext
            ? { toolContext: options.toolContext as Record<string, unknown> }
            : {}),
        },
        event => reducer.handle(event)
      );
      chatHandleRef.current = handle;
      void handle.result.then(result => {
        if (result.ok && !result.aborted) {
          setSending(false);
          chatHandleRef.current = null;
          return;
        }
        if (!result.aborted) {
          const errorMessage = result.error ?? "请求失败";
          patchAssistantMessage(assistantMessage => {
            applyAssistantTextSnapshot(
              assistantMessage,
              "inline-error",
              `请求失败：${errorMessage}`
            );
          });
          toast.error(errorMessage);
        }
        setSending(false);
        chatHandleRef.current = null;
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
    if (!chatHandleRef.current) return;
    chatHandleRef.current.abort();
    chatHandleRef.current = null;
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

  // 代码 / 链接渲染与对话页共用（D-048）
  const markdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "inline-block" });

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
        className="rounded-tau-lg border-line-1 bg-surface shadow-float m-1 mt-3 flex flex-col border p-3"
        style={{ maxHeight: layout.maxHeight }}
      >
        <MarkdownProvider isDark={isDark} isVisible={true}>
          {!!selectionQuote && (
            <div className="rounded-tau-md bg-page mb-2 px-3 py-2">
              <div className="text-tau-tiny text-ink-3 mb-1">当前选中</div>
              <blockquote className="border-line-2 text-tau-body text-ink-2 m-0 max-h-28 overflow-y-auto whitespace-pre-wrap break-words border-l-2 pl-3">
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
