import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button, Tooltip, App, Switch } from "antd";
import type { MenuProps } from "antd";
import {
  ClearOutlined,
  WarningOutlined,
  DisconnectOutlined,
  ToolOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import classNames from "classnames";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import { useAiChat } from "../../../../hooks/useAiChat";
import { useChatSessions } from "../../../../hooks/useChatSessions";
import { useLlmConfigs } from "../../../../hooks/useLlmConfigs";
import { usePrompts } from "../../../../hooks/usePrompts";
import { useEmbeddingConfig } from "../../../../hooks/useEmbeddingConfig";
import { useAiServerWebSocket } from "../../../../hooks/useAiServerWebSocket";
import ChatMessage from "../../../../components/ChatMessage";
import ChatDropdownSelector from "../../../../components/ChatDropdownSelector";
import { useTheme } from "../../../../hooks/useTheme";
import { useThemeStore } from "../../../../stores/useThemeStore";
import {
  ChatInputArea,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
  type ReasoningEffort,
} from "@tau/shared";

interface ChatTabProps {
  wsClient: WebSocketClient | null;
  url: string | null;
}

export default function ChatTab({ wsClient, url }: ChatTabProps) {
  const [enableTools, setEnableTools] = useState(true);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("none");
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputAreaHandle>(null);
  const isAutoScrollEnabledRef = useRef(true);
  const { message: antdMessage, modal } = App.useApp();

  // 获取主题
  const { themeMode } = useThemeStore();
  const resolvedTheme = useTheme(themeMode);
  const isDark = resolvedTheme === "dark";

  // 连接 aiServer，用于获取设置信息（LLM 配置、Prompt、Embedding 等）
  const { client: aiWsClient } = useAiServerWebSocket();

  // 使用 LLM 配置 hook（通过 aiServer 获取）
  const {
    llmConfigs,
    currentModelName,
    isSupportImage,
    isSupportFile,
    setLlmUsage,
    currentProviderConfig,
    currentModelConfig,
  } = useLlmConfigs(aiWsClient);

  // 使用 Prompts hook（通过 aiServer 获取）
  const { prompts, getPromptById } = usePrompts(aiWsClient);

  // 使用 Embedding 配置 hook（通过 aiServer 获取）
  const { canEnableRag } = useEmbeddingConfig(aiWsClient);

  // 使用聊天会话管理 Hook
  const {
    sessions,
    currentSession,
    messages,
    isLoading: isSessionsLoading,
    createSession,
    deleteSession,
    updateSessionTitle,
    selectSession,
    saveMessages,
    getChildBranchesCount,
    deleteMessage,
    regenerateMessage,
    createBranch,
  } = useChatSessions(url);

  // 获取当前选中的 Prompt 内容
  const selectedPrompt = selectedPromptId
    ? getPromptById(selectedPromptId)
    : null;

  // 使用 AI 聊天 Hook
  const {
    isLoading,
    error,
    isConnected,
    sendMessage,
    clearMessages,
    stopGeneration,
  } = useAiChat({
    enableTools,
    systemPrompt:
      selectedPrompt?.content ||
      `你是一个智能助手，可以帮助用户理解和分析当前网页内容。
当前用户正在浏览网页，你可以使用工具获取页面内容来帮助回答问题。
请用简洁清晰的中文回答问题。`,
    initialMessages: messages,
    onMessagesChange: saveMessages,
  });

  // 构建模型选择菜单项
  const modelSelectItems: MenuProps["items"] = useMemo(() => {
    return llmConfigs.flatMap((provider) => [
      {
        key: `provider-${provider.id}`,
        label: provider.name,
        type: "group" as const,
      },
      ...(provider.models || []).map((model) => ({
        key: `${provider.id}:${model.name}`,
        label: model.name,
      })),
    ]);
  }, [llmConfigs]);

  // 处理模型选择
  const handleModelSelect = useCallback(
    async ({ key }: { key: string }) => {
      const [providerId, modelName] = key.split(":");
      if (providerId && modelName) {
        try {
          await setLlmUsage(providerId, modelName);
        } catch (error) {
          console.error("设置模型失败:", error);
          antdMessage.error("设置模型失败");
        }
      }
    },
    [setLlmUsage, antdMessage],
  );

  // 构建 Prompt 选择菜单项
  const promptSelectItems: MenuProps["items"] = useMemo(() => {
    return [
      {
        key: "default",
        label: "默认 Prompt",
      },
      ...prompts.map((prompt) => ({
        key: String(prompt.id),
        label: prompt.name,
      })),
    ];
  }, [prompts]);

  // 处理 Prompt 选择
  const handlePromptSelect = useCallback(({ key }: { key: string }) => {
    if (key === "default") {
      setSelectedPromptId(null);
    } else {
      setSelectedPromptId(Number(key));
    }
  }, []);

  // 当前 Prompt 名称
  const currentPromptName = selectedPrompt?.name || "默认 Prompt";

  // 消息操作回调
  const handleDeleteMessage = useCallback(
    (messageIndex: number) => {
      deleteMessage(messageIndex);
    },
    [deleteMessage],
  );

  const handleRegenerateMessage = useCallback(
    (messageIndex: number) => {
      regenerateMessage(messageIndex, (content, baseMessages) => {
        sendMessage(content, baseMessages);
      });
    },
    [regenerateMessage, sendMessage],
  );

  const handleCreateBranch = useCallback(
    (messageIndex: number) => {
      createBranch(messageIndex);
    },
    [createBranch],
  );

  // 删除确认对话框
  const handleDeleteConfirm = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      modal.confirm({
        title: "确定删除该消息吗？",
        content: "删除后无法恢复",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [modal]);

  // 复制成功/失败提示
  const handleCopySuccess = useCallback(() => {
    antdMessage.success("已复制到剪贴板");
  }, [antdMessage]);

  const handleCopyError = useCallback(() => {
    antdMessage.error("复制失败");
  }, [antdMessage]);

  // 创建 RPC 服务实现
  const chatInputServices: ChatInputAreaServices = useMemo(
    () => ({
      uploadFile: async (file: File) => {
        if (!wsClient?.isConnected) {
          throw new Error("WebSocket 未连接");
        }
        // 将文件转换为 base64
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );
        const result = (await wsClient.sendRequest("resource.upload", {
          data: base64,
          name: file.name,
          type: file.type,
        })) as { url: string | null };
        return result.url;
      },
      convertFileSrc: async (path: string) => {
        if (!wsClient?.isConnected) {
          return path;
        }
        const result = (await wsClient.sendRequest("file.convertFileSrc", {
          path,
        })) as { url: string };
        return result.url;
      },
      getHomeDir: async () => {
        if (!wsClient?.isConnected) {
          return "";
        }
        const result = (await wsClient.sendRequest("file.getHomeDir", {})) as {
          homeDir: string;
        };
        return result.homeDir;
      },
      createOrUpdateResource: async (params) => {
        // 浏览器扩展中简化实现，直接返回一个模拟的资源对象
        return {
          id: Date.now(),
          name: params.name,
          path: params.path,
          type: params.type,
        };
      },
      incrementResourceRef: async (path, source) => {
        if (!wsClient?.isConnected) return;
        await wsClient.sendRequest("resource.incrementRef", { path, source });
      },
      decrementResourceRef: async (path) => {
        if (!wsClient?.isConnected) return;
        await wsClient.sendRequest("resource.decrementRef", { path });
      },
    }),
    [wsClient],
  );

  // 仅在自动滚动启用时才滚动到底部
  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) {
      console.log("[AutoScroll] scrollToBottom: container ref 为空");
      return;
    }
    if (!isAutoScrollEnabledRef.current) {
      console.log("[AutoScroll] scrollToBottom: 自动滚动已禁用，跳过");
      return;
    }
    console.log("[AutoScroll] scrollToBottom: 执行滚动到底部");
    messagesContainerRef.current.scrollTop =
      messagesContainerRef.current.scrollHeight;
  }, []);

  // 监听滚动事件：用户向上滚动时禁用自动滚动，滚回底部时重新启用
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
    const prev = isAutoScrollEnabledRef.current;
    isAutoScrollEnabledRef.current = isAtBottom;
    if (prev !== isAtBottom) {
      console.log(
        `[AutoScroll] handleScroll: ${prev} -> ${isAtBottom}`,
        `(scrollTop=${Math.round(scrollTop)}, clientHeight=${clientHeight}, scrollHeight=${scrollHeight})`,
      );
    }
  }, []);

  // 注册/注销滚动事件监听器
  useEffect(() => {
    const container = messagesContainerRef.current;
    console.log("[AutoScroll] 注册滚动监听, container:", !!container);
    if (!container) return;
    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  // 消息变化时智能滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      console.log(
        "[AutoScroll] messages 变化, length:",
        messages.length,
        "isAutoScrollEnabled:",
        isAutoScrollEnabledRef.current,
      );
      setTimeout(() => {
        scrollToBottom();
      }, 0);
    }
  }, [messages, scrollToBottom]);

  // 发送消息
  const handleSend = useCallback(() => {
    if (isLoading) return;

    const messageContent = chatInputRef.current?.getValue();
    if (!messageContent || messageContent.length === 0) return;

    // 提取文本内容
    const textContent = messageContent
      .filter((item) => item.type === "text")
      .map((item) => (item as { type: "text"; text: string }).text)
      .join("\n");

    if (!textContent.trim()) return;

    // 发送消息时重置自动滚动，确保用户能看到最新回复
    isAutoScrollEnabledRef.current = true;
    sendMessage(textContent);
    chatInputRef.current?.clear();
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }, 0);
  }, [isLoading, sendMessage]);

  // 如果未连接，显示连接状态
  if (!isConnected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
          <DisconnectOutlined className="text-2xl text-yellow-500" />
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
    <div className="flex flex-1 flex-col h-full overflow-hidden">
      {!isSessionsLoading && (
        <div
          className={classNames(
            "flex-shrink-0 border-b p-3",
            isDark
              ? "border-gray-800 bg-gray-900/50"
              : "border-gray-200 bg-white",
          )}
        >
          <ChatDropdownSelector
            chats={sessions}
            currentChat={currentSession}
            onChatSelect={selectSession}
            onTitleChange={(title) =>
              updateSessionTitle(currentSession.id, title)
            }
            onCreateNewChat={createSession}
            onChatDelete={deleteSession}
            getChildBranchesCount={getChildBranchesCount}
          />
        </div>
      )}

      {/* 消息列表 */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
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

            {url && (
              <p className="mt-4 text-xs text-gray-400 dark:text-[#484f58] truncate max-w-full px-4">
                当前页面: {url}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                messageIndex={index}
                isDark={isDark}
                wsClient={wsClient}
                onDeleteMessage={handleDeleteMessage}
                onRegenerateMessage={handleRegenerateMessage}
                onCreateBranch={handleCreateBranch}
                onCopySuccess={handleCopySuccess}
                onCopyError={handleCopyError}
                onDeleteConfirm={handleDeleteConfirm}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center gap-2 text-xs text-red-500">
            <WarningOutlined />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 知识库开关 */}
      {canEnableRag && (
        <div
          className={classNames(
            "flex-shrink-0 px-4 py-2 flex items-center justify-between border-t",
            isDark
              ? "border-gray-800 bg-gray-900/30"
              : "border-gray-200 bg-gray-50",
          )}
        >
          <div className="flex items-center gap-2">
            <DatabaseOutlined
              className={classNames(
                "text-sm",
                ragEnabled ? "text-blue-500" : "text-gray-400",
              )}
            />
            <span
              className={classNames(
                "text-xs",
                isDark ? "text-gray-300" : "text-gray-600",
              )}
            >
              知识库增强
            </span>
          </div>
          <Switch size="small" checked={ragEnabled} onChange={setRagEnabled} />
        </div>
      )}

      {/* 输入区域 */}
      <div
        className={classNames(
          "flex-shrink-0 mx-3 mb-3 mt-2 px-3 py-3 rounded-3xl shadow-sm border box-border",
          isDark ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200",
        )}
      >
        <ChatInputArea
          ref={chatInputRef}
          services={chatInputServices}
          placeholder="输入消息，Shift+Enter 换行"
          contentEditable={!isLoading}
          sendLoading={isLoading}
          onPressEnter={handleSend}
          onStop={stopGeneration}
          // 模型选择
          modelSelectItems={modelSelectItems}
          onModelSelect={handleModelSelect}
          currentModelName={currentModelName}
          isSupportImage={isSupportImage}
          isSupportFile={isSupportFile}
          // Prompt 选择
          promptSelectItems={promptSelectItems}
          onPromptSelect={handlePromptSelect}
          currentPromptName={currentPromptName}
          // 推理强度
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={setReasoningEffort}
          reasoningEffortDisabled={!currentModelConfig?.features.thinking}
          extraToolbarButtons={
            <>
              {/* 工具开关 */}
              <Tooltip title={enableTools ? "工具已启用" : "工具已禁用"}>
                <Button
                  type="text"
                  size="small"
                  icon={<ToolOutlined />}
                  onClick={() => setEnableTools(!enableTools)}
                  className={classNames(
                    "p-1! bg-none! border-none! hover:!bg-gray-100!",
                    enableTools ? "text-blue-500" : "text-gray-400",
                  )}
                />
              </Tooltip>

              {/* 清空按钮 */}
              {messages.length > 0 && !isLoading && (
                <Tooltip title="清空对话">
                  <Button
                    type="text"
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={clearMessages}
                    className="p-1! bg-none! border-none! hover:!bg-gray-100! text-gray-400 hover:text-gray-600"
                  />
                </Tooltip>
              )}
            </>
          }
        />
      </div>
    </div>
  );
}
