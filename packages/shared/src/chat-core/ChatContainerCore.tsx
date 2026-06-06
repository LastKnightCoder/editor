import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Trash2, AlertTriangle, Unplug } from "lucide-react";
import classNames from "classnames";
import ChatInputArea, {
  type ChatInputAreaProps,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
  type IResourceSource,
  type MessageContentItem,
  type ReasoningEffort,
} from "../components/ChatInputArea";
import {
  ChatMessage,
  type ChatMessageType,
} from "../components/ChatComponents";
import {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveChatInputPlaceholder,
} from "../utils/chat-input-placeholder";

export interface ChatContainerCoreMessageRendererParams {
  message: ChatMessageType;
  messageIndex: number;
}

export interface ChatContainerCoreInputRendererParams {
  chatInputRef: RefObject<ChatInputAreaHandle | null>;
  inputProps: Omit<ChatInputAreaProps, "services"> & {
    services?: ChatInputAreaServices;
  };
}

export interface ChatContainerCoreEmptyStateRenderParams {
  currentPageUrl?: string | null;
  isDark: boolean;
}

export interface ChatContainerCoreProps {
  isDark?: boolean;
  isConnected: boolean;
  messages: ChatMessageType[];
  isLoading: boolean;
  error?: string | null;
  reasoningEffort?: ReasoningEffort;
  reasoningEffortDisabled?: boolean;
  currentModelName?: string;
  isSupportImage?: boolean;
  isSupportFile?: boolean;
  placeholder?: string;
  showConnectingDelayMs?: number;
  currentPageUrl?: string | null;
  hideInput?: boolean;
  className?: string;
  messagesContainerClassName?: string;
  inputWrapperClassName?: string;
  chatInputClassName?: string;
  chatHeader?: ReactNode;
  extraToolbarButtons?: ReactNode;
  modelSelectItems?: MenuProps["items"];
  createMessageLoading?: boolean;
  onCreateNewMessage?: () => void;
  resourceSource?: IResourceSource | null;
  onMcpManagerClick?: () => void;
  onReasoningEffortChange?: (value: ReasoningEffort) => void;
  onModelSelect?: (info: { key: string }) => void;
  onSendTextMessage?: (content: string) => void | Promise<void>;
  onSendMessageContent?: (
    content: MessageContentItem[],
  ) => void | Promise<void>;
  onUserSend?: () => void;
  onStopGeneration?: () => void;
  onClearMessages?: () => void;
  onDeleteMessage?: (messageIndex: number) => void;
  onRegenerateMessage?: (messageIndex: number) => void;
  onCreateBranch?: (messageIndex: number) => void;
  onCopySuccess?: () => void;
  onCopyError?: () => void;
  onDeleteConfirm?: () => Promise<boolean>;
  chatInputServices?: ChatInputAreaServices;
  inputRef?: RefObject<ChatInputAreaHandle | null>;
  messagesContainerRef?: Ref<HTMLDivElement>;
  renderMessage?: (params: ChatContainerCoreMessageRendererParams) => ReactNode;
  renderEmptyState?: (
    params: ChatContainerCoreEmptyStateRenderParams,
  ) => ReactNode;
  renderInputWrapper?: (inputNode: ReactNode) => ReactNode;
  renderChatInputArea?: (
    params: ChatContainerCoreInputRendererParams,
  ) => ReactNode;
}

const extractTextContent = (messageContent: MessageContentItem[]): string =>
  messageContent
    .filter((item) => item.type === "text")
    .map((item) => (item as { type: "text"; text: string }).text)
    .join("\n");

export function ChatContainerCore({
  isDark = false,
  isConnected,
  messages,
  isLoading,
  error = null,
  reasoningEffort,
  reasoningEffortDisabled = false,
  currentModelName = "未选择模型",
  isSupportImage = false,
  isSupportFile = false,
  placeholder = DEFAULT_CHAT_INPUT_PLACEHOLDER,
  showConnectingDelayMs = 800,
  currentPageUrl,
  hideInput = false,
  className,
  messagesContainerClassName,
  inputWrapperClassName,
  chatInputClassName,
  chatHeader,
  extraToolbarButtons,
  modelSelectItems = [],
  createMessageLoading = false,
  onCreateNewMessage,
  resourceSource = null,
  onMcpManagerClick,
  onReasoningEffortChange,
  onModelSelect,
  onSendTextMessage,
  onSendMessageContent,
  onUserSend,
  onStopGeneration,
  onClearMessages,
  onDeleteMessage,
  onRegenerateMessage,
  onCreateBranch,
  onCopySuccess,
  onCopyError,
  onDeleteConfirm,
  chatInputServices,
  inputRef,
  messagesContainerRef,
  renderMessage,
  renderEmptyState,
  renderInputWrapper,
  renderChatInputArea,
}: ChatContainerCoreProps) {
  const [showConnectingUI, setShowConnectingUI] = useState(false);
  const internalMessagesContainerRef = useRef<HTMLDivElement>(null);
  const internalChatInputRef = useRef<ChatInputAreaHandle>(null);
  const resolvedMessagesContainerRef =
    messagesContainerRef || internalMessagesContainerRef;
  const resolvedChatInputRef = inputRef || internalChatInputRef;
  const resolvedPlaceholder = useMemo(
    () => resolveChatInputPlaceholder(placeholder),
    [placeholder],
  );

  useEffect(() => {
    if (!isConnected) {
      const timer = setTimeout(
        () => setShowConnectingUI(true),
        showConnectingDelayMs,
      );
      return () => clearTimeout(timer);
    }
    setShowConnectingUI(false);
  }, [isConnected, showConnectingDelayMs]);

  const hasNonTextContent = useCallback(
    (messageContent: MessageContentItem[]) =>
      messageContent.some(
        (item) => item.type === "image" || item.type === "file",
      ),
    [],
  );

  const handleSend = useCallback(() => {
    if (isLoading) return;
    const messageContent = resolvedChatInputRef.current?.getValue() || [];
    const textContent = extractTextContent(messageContent);
    const hasAttachment = hasNonTextContent(messageContent);

    if (!textContent.trim() && !hasAttachment) return;

    onUserSend?.();

    if (onSendMessageContent) {
      void Promise.resolve(onSendMessageContent(messageContent));
    } else if (onSendTextMessage && textContent.trim()) {
      void Promise.resolve(onSendTextMessage(textContent));
    } else {
      return;
    }

    resolvedChatInputRef.current?.clear();
  }, [
    hasNonTextContent,
    isLoading,
    onUserSend,
    onSendMessageContent,
    onSendTextMessage,
    resolvedChatInputRef,
  ]);

  const defaultToolbarButton = useMemo(() => {
    if (!onClearMessages || messages.length === 0 || isLoading) {
      return null;
    }
    return (
      <Tooltip title="清空对话">
        <button
          type="button"
          onClick={onClearMessages}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </Tooltip>
    );
  }, [isLoading, messages.length, onClearMessages]);

  const toolbarButtons =
    extraToolbarButtons ?? defaultToolbarButton ?? undefined;
  const inputProps: Omit<ChatInputAreaProps, "services"> & {
    services?: ChatInputAreaServices;
  } = {
    className: chatInputClassName,
    placeholder: resolvedPlaceholder,
    contentEditable: !isLoading,
    sendLoading: isLoading,
    createMessageLoading,
    onCreateNewMessage,
    onPressEnter: handleSend,
    onStop: onStopGeneration,
    modelSelectItems,
    onModelSelect,
    currentModelName,
    isSupportImage,
    isSupportFile,
    resourceSource,
    reasoningEffort,
    onReasoningEffortChange,
    reasoningEffortDisabled,
    onMcpManagerClick,
    extraToolbarButtons: toolbarButtons,
  };

  const chatInputNode = renderChatInputArea ? (
    renderChatInputArea({
      chatInputRef: resolvedChatInputRef,
      inputProps,
    })
  ) : chatInputServices ? (
    <ChatInputArea
      ref={resolvedChatInputRef}
      services={chatInputServices}
      {...inputProps}
    />
  ) : null;

  if (!isConnected) {
    if (!showConnectingUI) return null;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
          <Unplug className="h-6 w-6 text-yellow-500" />
        </div>
        <h3 className="mb-1 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
          正在连接 AI 服务...
        </h3>
        <p className="text-center text-xs text-gray-400 dark:text-[#484f58]">
          请确保桌面端已启动
        </p>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "flex flex-1 flex-col h-full overflow-hidden",
        className,
      )}
    >
      {chatHeader ? (
        <div
          className={classNames(
            "shrink-0 border-b p-3",
            isDark
              ? "border-gray-800 bg-zinc-900/50"
              : "border-gray-200 bg-white",
          )}
        >
          {chatHeader}
        </div>
      ) : null}

      <div
        ref={resolvedMessagesContainerRef}
        className={messagesContainerClassName || "flex-1 overflow-y-auto p-4"}
      >
        {messages.length === 0 ? (
          renderEmptyState ? (
            renderEmptyState({
              currentPageUrl,
              isDark,
            })
          ) : (
            <div className="flex flex-col items-center pt-12 px-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                <svg
                  className="h-6 w-6 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-[#e6edf3]">
                开始对话
              </h3>
              <p className="text-center text-xs text-gray-400 dark:text-[#484f58]">
                与 AI 探讨当前网页内容
              </p>
              {currentPageUrl ? (
                <p className="mt-4 text-xs text-gray-400 dark:text-[#484f58] truncate max-w-full px-4">
                  当前页面: {currentPageUrl}
                </p>
              ) : null}
            </div>
          )
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              if (renderMessage) {
                return renderMessage({
                  message,
                  messageIndex: index,
                });
              }
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  messageIndex={index}
                  isDark={isDark}
                  onDeleteMessage={onDeleteMessage}
                  onRegenerateMessage={onRegenerateMessage}
                  onCreateBranch={onCreateBranch}
                  onCopySuccess={onCopySuccess}
                  onCopyError={onCopyError}
                  onDeleteConfirm={onDeleteConfirm}
                />
              );
            })}
          </div>
        )}
      </div>

      {error ? (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center gap-2 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {!hideInput && chatInputNode ? (
        renderInputWrapper ? (
          renderInputWrapper(chatInputNode)
        ) : (
          <div
            className={classNames(
              "shrink-0 mx-3 mb-3 mt-2 px-3 py-3 rounded-3xl shadow-sm border box-border",
              isDark
                ? "bg-zinc-950 border-gray-800"
                : "bg-white border-gray-200",
              inputWrapperClassName,
            )}
          >
            {chatInputNode}
          </div>
        )
      ) : null}
    </div>
  );
}

export default ChatContainerCore;
