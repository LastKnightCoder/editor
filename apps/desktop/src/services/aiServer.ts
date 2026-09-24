import WebSocketServer from "@/utils/WebSocketServer";
import WebSocketClient from "@/utils/WebSocketClient";
import { chatStreamCore } from "@/hooks/useChatLLM";
import useSettingStore from "@/stores/useSettingStore";
import type { ISetting } from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import { openContent } from "./open-content";
import { openPage } from "./page-navigation";
import { produce } from "immer";
import { ensureToolingReady } from "@/tools";
import { Role } from "@/constants";
import type {
  RequestMessage,
  ToolCallPayload,
  ToolCallExecutionState,
  ToolExecutionMetadata,
} from "@/types";
import type { RpcRequestMessage } from "@/types/rpc";
import {
  createSmartExtractProvider,
  createFullPageProvider,
  collectClipStream,
  remoteResourceToLocal,
} from "@/utils";
import {
  convertFileSrc,
  getHomeDir,
  getEditorDir,
  readBinaryFile,
  getFileExtension,
  showInFolder,
} from "@/commands/file";
import { uploadResource } from "@/hooks/useUploadResource";
import { createContent, getContentById, updateContent } from "@/commands/content";
import { buildCardFromContent, isContentIsCard } from "@/commands/card";
import { buildArticleFromContent, isContentIsArticle } from "@/commands/article";
import { getContentLength, defaultContentEventBus } from "@/utils";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import useMCPManagerModalStore from "@/stores/useMCPManagerModalStore";
import { showAndFocusWindow } from "@/commands/window";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import type { BlockData } from "@/types/block-preview";
import { streamCodexChat } from "@/services/codex/codexChatStream";
import type { CodexMcpToolDefinition } from "@/services/codex/codexChatStream";
import { resolveCodexAvailability } from "@/services/codex/codexAvailability";
import { buildCodexInputFromMessageContent } from "@/services/codex/codexInputAdapter";
import {
  buildCodexSystemPrompt,
  prependCodexSystemPromptToInput,
} from "@/services/codex/codexSystemPrompt";

const WS_PORT = 24678;
type ChatAgentType = "local" | "codex";

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface AiChatParams {
  requestId: string;
  messages: RequestMessage[];
  systemPrompt?: string;
  enableTools?: boolean;
  agentType?: ChatAgentType;
  agentSessionId?: string | null;
  workingDirectory?: string | null;
  conversationKey?: string;
  browserTools?: ToolDefinition[];
  pageContext?: {
    url: string;
    title: string;
    content?: string;
  };
  feature?: keyof ISetting["llmUsageSettings"];
}

interface ExtClipperExtractParams {
  html: string;
  url: string;
  title?: string;
  mode?: "smart" | "full";
}

interface AiStreamNotificationData {
  requestId: string;
  content?: string;
  reasoning?: string;
  executions?: ToolCallExecutionState[];
  agentSessionId?: string | null;
  error?: string;
}

interface ContentSubscriptionSetParams {
  subscriberId: string;
  contentIds: number[];
}

interface RemoteContentUpdatedNotificationData {
  contentId: number;
  updateTime: number;
  sourceUuid: string;
}

let aiServer: WebSocketServer | null = null;
let extToolClient: WebSocketClient | null = null;
let isInitialized = false;
let disposeContentRemoteUpdateForwarder: (() => void) | null = null;
const contentSubscriptionRegistry = new Map<string, Set<number>>();

const setSubscribedContentIds = ({ subscriberId, contentIds }: ContentSubscriptionSetParams) => {
  const normalizedIds = Array.from(
    new Set(
      contentIds.filter(
        (contentId): contentId is number => Number.isInteger(contentId) && contentId > 0
      )
    )
  );

  if (!normalizedIds.length) {
    contentSubscriptionRegistry.delete(subscriberId);
    return;
  }

  contentSubscriptionRegistry.set(subscriberId, new Set(normalizedIds));
};

const hasAnySubscriberForContentId = (contentId: number) => {
  for (const subscribedIds of contentSubscriptionRegistry.values()) {
    if (subscribedIds.has(contentId)) {
      return true;
    }
  }
  return false;
};

const getLLMConfig = (feature: keyof ISetting["llmUsageSettings"] = "chat") => {
  const { llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;
  const usageConfig = llmUsageSettings[feature];

  if (!usageConfig) {
    return { providerConfig: null, modelConfig: null };
  }

  const providerConfig = llmConfigs.find(config => config.id === usageConfig.providerId);

  if (!providerConfig) {
    return { providerConfig: null, modelConfig: null };
  }

  const modelConfig = providerConfig.models?.find(model => model.name === usageConfig.modelName);

  return {
    providerConfig,
    modelConfig: modelConfig || null,
  };
};

const executeBrowserTool = async (
  call: ToolCallPayload,
  requestId: string,
  conversationKey?: string
): Promise<{ content: string } | null> => {
  if (!extToolClient) {
    return { content: "浏览器工具服务未连接" };
  }

  try {
    const result = await extToolClient.sendRequest(
      "ext.tool.execute",
      {
        requestId,
        conversationKey,
        toolCall: {
          id: call.id,
          function: {
            name: call.function.name,
            arguments: call.function.arguments,
          },
        },
      },
      10 * 60 * 1000
    );
    return result as { content: string };
  } catch (error) {
    console.error("[aiServer] 浏览器工具执行失败:", error);
    return { content: `工具执行失败: ${(error as Error).message}` };
  }
};

const handleCodexGetAvailability = async () => resolveCodexAvailability();

const mapBrowserToolsToCodexMcpTools = (
  browserTools: ToolDefinition[] = []
): CodexMcpToolDefinition[] =>
  browserTools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));

const getLatestCodexMessage = (messages: RequestMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === Role.User || message.role === Role.Tool) {
      return message;
    }
  }
  return messages[messages.length - 1];
};

const handleAiCodexChat = async (
  params: AiChatParams,
  server: WebSocketServer,
  finalMessages: RequestMessage[],
  mergedSystemPrompt: string
) => {
  const {
    requestId,
    agentSessionId = null,
    workingDirectory = null,
    browserTools,
    conversationKey,
  } = params;
  const latestMessage = getLatestCodexMessage(finalMessages);
  if (!latestMessage) {
    throw new Error("缺少可发送给 Codex 的消息");
  }

  const rawCodexInput = await buildCodexInputFromMessageContent(latestMessage.content);
  const codexInput = agentSessionId
    ? rawCodexInput
    : prependCodexSystemPromptToInput(rawCodexInput, buildCodexSystemPrompt(mergedSystemPrompt));

  if (Array.isArray(codexInput) && codexInput.length === 0) {
    throw new Error("缺少可发送给 Codex 的内容");
  }

  const externalMcpTools = mapBrowserToolsToCodexMcpTools(browserTools);
  let fullContent = "";
  let fullReasoning = "";
  let currentAgentSessionId = agentSessionId ?? null;
  let codexStreamError: Error | null = null;

  try {
    await streamCodexChat({
      input: codexInput,
      agentSessionId,
      workingDirectory,
      externalMcpTools,
      executeExternalMcpTool: call => executeBrowserTool(call, requestId, conversationKey),
      onEvent: event => {
        if (event.type === "thread-started") {
          currentAgentSessionId = event.threadId;
          server.sendNotification<AiStreamNotificationData>("ai.stream.agentSession", {
            requestId,
            agentSessionId: event.threadId,
          });
          return;
        }

        if (event.type === "text-delta") {
          fullContent = event.responseText;
          server.sendNotification<AiStreamNotificationData>("ai.stream.text", {
            requestId,
            content: event.delta,
          });
          return;
        }

        if (event.type === "reasoning-delta") {
          fullReasoning = event.reasoningText;
          server.sendNotification<AiStreamNotificationData>("ai.stream.reasoning", {
            requestId,
            reasoning: event.delta,
          });
          return;
        }

        if (event.type === "tool-calls-update") {
          server.sendNotification<AiStreamNotificationData>("ai.stream.tool", {
            requestId,
            executions: event.executions,
          });
          return;
        }

        if (event.type === "error") {
          codexStreamError = event.error;
        }
      },
    });

    if (codexStreamError) {
      throw codexStreamError;
    }

    server.sendNotification<AiStreamNotificationData>("ai.stream.finish", {
      requestId,
      content: fullContent,
      reasoning: fullReasoning,
      agentSessionId: currentAgentSessionId,
    });
  } catch (error) {
    server.sendNotification<AiStreamNotificationData>("ai.stream.finish", {
      requestId,
      error: error instanceof Error ? error.message : "Codex 请求失败",
      agentSessionId: currentAgentSessionId,
    });
  }

  return {
    content: fullContent,
    reasoning: fullReasoning,
    agentSessionId: currentAgentSessionId,
  };
};

const handleAiChat = async (request: RpcRequestMessage, server: WebSocketServer) => {
  const params = request.params as unknown as AiChatParams;
  const {
    requestId,
    messages,
    systemPrompt,
    enableTools = true,
    agentType = "local",
    agentSessionId,
    conversationKey,
    browserTools,
    pageContext,
    feature,
  } = params;

  console.log("[aiServer] 收到 AI 聊天请求:", {
    requestId,
    messageCount: messages.length,
    enableTools,
    agentType,
    agentSessionId: agentSessionId ?? null,
    browserToolCount: browserTools?.length || 0,
    hasPageContext: !!pageContext,
    feature: feature || "chat",
  });

  // 准备消息。部分 provider 在 stream + tools 场景下对多条 system message
  // 兼容性较差，这里统一合并为一条 system message。
  let finalMessages = [...messages];
  const systemSections: string[] = [];

  if (systemPrompt) {
    systemSections.push(systemPrompt);
  }

  if (pageContext) {
    systemSections.push(`当前网页信息：
- URL: ${pageContext.url}
- 标题: ${pageContext.title}
${pageContext.content ? `- 内容摘要: ${pageContext.content.slice(0, 2000)}...` : ""}`);
  }

  if (systemSections.length > 0) {
    finalMessages = [{ role: Role.System, content: systemSections.join("\n\n") }, ...finalMessages];
  }

  if (agentType === "codex") {
    return await handleAiCodexChat(params, server, finalMessages, systemSections.join("\n\n"));
  }

  // 获取 LLM 配置
  const { providerConfig, modelConfig } = getLLMConfig(feature || "chat");

  if (!providerConfig || !modelConfig) {
    throw new Error("未配置 LLM，请在设置中配置聊天模型");
  }

  // 记录浏览器工具名称，用于路由
  const browserToolNames = new Set((browserTools || []).map(t => t.function.name));

  // 创建自定义工具执行器
  const executeToolCall =
    browserToolNames.size > 0
      ? async (
          call: ToolCallPayload,
          context?: {
            conversationKey?: string;
            toolContext?: ToolExecutionMetadata;
          }
        ): Promise<{ content: string } | null> => {
          if (browserToolNames.has(call.function.name)) {
            return await executeBrowserTool(
              call,
              requestId,
              context?.conversationKey || conversationKey
            );
          }
          // 本地工具由 chatStreamCore 内部处理
          return null;
        }
      : undefined;

  // 累积文本用于最终返回
  let fullContent = "";
  let fullReasoning = "";

  // 使用 chatStreamCore 进行流式聊天
  // 禁用动画缓冲：WebSocket 转发场景下需要直接透传 SSE 数据，
  // 避免 requestAnimationFrame 在窗口后台时被节流导致数据堆积
  await chatStreamCore({
    providerConfig,
    modelConfig,
    messages: finalMessages,
    enableTools,
    conversationKey,
    skills: useSkillStore.getState().skills,
    additionalTools: browserTools,
    executeToolCall,
    disableAnimation: true,
    onUpdate: (text, fetchText) => {
      fullContent = text;
      server.sendNotification<AiStreamNotificationData>("ai.stream.text", {
        requestId,
        content: fetchText,
      });
    },
    onReasoning: (text, fetchText) => {
      fullReasoning = text;
      server.sendNotification<AiStreamNotificationData>("ai.stream.reasoning", {
        requestId,
        reasoning: fetchText,
      });
    },
    onToolCallsUpdate: executions => {
      server.sendNotification<AiStreamNotificationData>("ai.stream.tool", {
        requestId,
        executions,
      });
    },
    onFinish: (content, reasoning) => {
      fullContent = content;
      fullReasoning = reasoning;
      server.sendNotification<AiStreamNotificationData>("ai.stream.finish", {
        requestId,
        content,
        reasoning,
      });
    },
    onError: error => {
      server.sendNotification<AiStreamNotificationData>("ai.stream.finish", {
        requestId,
        error: error.message,
      });
    },
  });

  return {
    content: fullContent,
    reasoning: fullReasoning,
  };
};

const handleExtClipperExtract = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as ExtClipperExtractParams;
  const { html, url, title, mode = "smart" } = params;

  console.log("[aiServer] 收到 Clipper 提取请求:", {
    url,
    title,
    mode,
    htmlLength: html?.length || 0,
  });

  try {
    const provider = mode === "smart" ? createSmartExtractProvider() : createFullPageProvider();

    const markdown = await collectClipStream(
      provider.clip({
        html,
        url,
        title: title || "",
        options: { smartExtractClean: true },
      })
    );

    console.log("[aiServer] Clipper 提取成功:", {
      markdownLength: markdown.length,
    });

    return {
      success: true,
      markdown,
      length: markdown.length,
    };
  } catch (error) {
    console.error("[aiServer] Clipper 提取失败:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};

// ==================== 文件操作 RPC 处理器 ====================

const handleFileConvertFileSrc = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { path: string };
  const url = await convertFileSrc(params.path);
  return { url };
};

const handleFileGetHomeDir = async () => {
  const homeDir = await getHomeDir();
  return { homeDir };
};

const handleFileGetEditorDir = async () => {
  const editorDir = await getEditorDir();
  return { editorDir };
};

const handleFileReadBinaryFile = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { path: string };
  const data = await readBinaryFile(params.path);
  // 将 Uint8Array 转换为 base64
  const base64 = Buffer.from(data).toString("base64");
  return { base64 };
};

const handleFileGetFileExtension = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { path: string };
  const extension = await getFileExtension(params.path);
  return { extension };
};

const handleFileRemoteResourceToLocal = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    url: string;
    fileName?: string;
  };
  const localPath = await remoteResourceToLocal(params.url, params.fileName);
  return { localPath };
};

const handleFileShowInFolder = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    path: string;
    fileName?: string;
  };

  let targetPath = params.path;
  if (/^https?:/i.test(targetPath)) {
    targetPath = await remoteResourceToLocal(targetPath, params.fileName);
  } else if (targetPath.startsWith("~")) {
    const homeDir = await getHomeDir();
    targetPath = `${homeDir}${targetPath.slice(1)}`;
  }

  await showInFolder(targetPath);
  return { success: true };
};

const handleResourceUpload = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    data: string; // base64
    name: string;
    type: string;
  };
  // 将 base64 转换为 File
  const buffer = Buffer.from(params.data, "base64");
  const file = new File([buffer], params.name, { type: params.type });
  const url = await uploadResource(file);
  return { url };
};

// ==================== 设置相关 RPC 处理器 ====================

const handleSettingsGetLlmConfigs = async () => {
  const { llmConfigs } = useSettingStore.getState().setting;
  return { llmConfigs };
};

const handleSettingsGetChatModelConfig = async () => {
  const { providerConfig, modelConfig } = getLLMConfig("chat");
  return { providerConfig, modelConfig };
};

const handleSettingsSetLlmUsage = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    feature: keyof ISetting["llmUsageSettings"];
    providerId: string;
    modelName: string;
  };

  useSettingStore.setState(
    produce(draft => {
      if (!draft.setting.llmUsageSettings[params.feature]) {
        draft.setting.llmUsageSettings[params.feature] = {
          providerId: "",
          modelName: "",
        };
      }
      draft.setting.llmUsageSettings[params.feature].providerId = params.providerId;
      draft.setting.llmUsageSettings[params.feature].modelName = params.modelName;
    })
  );

  return { success: true };
};

const handleSettingsGetSkills = async () => {
  const state = useSkillStore.getState();
  await state.loadSkills();
  return { skills: useSkillStore.getState().skills };
};

const handleSettingsGetEmbeddingModelInfo = async () => {
  const setting = useSettingStore.getState().setting;
  const embeddingModelInfo = resolveEmbeddingModelInfoFromSetting(setting);

  if (!embeddingModelInfo) {
    return { embeddingModelInfo: null };
  }

  return {
    embeddingModelInfo,
  };
};

// ==================== 内容/卡片/文章 RPC 处理器 ====================

const handleSettingsGetCurrentDatabase = async () => {
  const { database } = useSettingStore.getState().setting;
  return { dbName: database.active };
};

const handleContentCreate = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    content: import("slate").Descendant[];
    count?: number;
  };
  const count = params.count ?? getContentLength(params.content);
  const contentId = await createContent(params.content, count);
  return {
    contentId,
    content: contentId ? await getContentById(contentId) : null,
  };
};

const handleContentUpdate = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    contentId: number;
    content: import("slate").Descendant[];
  };
  const result = await updateContent(params.contentId, params.content);
  // 更新成功后发送广播，通知桌面端所有订阅者刷新内容
  if (result) {
    defaultContentEventBus.publish("content:updated", {
      content: result,
      sourceUuid: "browser-extension",
    });
  }
  return { success: !!result, content: result };
};

const handleContentGetById = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { contentId: number };
  const content = await getContentById(params.contentId);
  return { content };
};

const handleContentSubscriptionSet = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as ContentSubscriptionSetParams;
  setSubscribedContentIds(params);
  return { success: true };
};

const handleCardBuildFromContent = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { contentId: number };
  const card = await buildCardFromContent(params.contentId);
  // 通知桌面端卡片列表刷新
  defaultCardEventBus.publish("card:created", {
    card,
    sourceUuid: "browser-extension",
  });
  return { card };
};

const handleArticleBuildFromContent = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    contentId: number;
    title?: string;
  };
  const article = await buildArticleFromContent(params.contentId, params.title || "");
  // 通知桌面端文章列表刷新
  defaultArticleEventBus.publish("article:created", {
    article,
    sourceUuid: "browser-extension",
  });
  return { article };
};

const handleCardIsContentIsCard = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { contentId: number };
  const isCard = await isContentIsCard(params.contentId);
  return { isCard };
};

const handleArticleIsContentIsArticle = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { contentId: number };
  const isArticle = await isContentIsArticle(params.contentId);
  return { isArticle };
};

const handleNoteShowInsertModal = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    mode: "project";
    sourceContentId: number;
    title?: string;
    insertMode?: "copy" | "shared-content";
  };
  if (params.mode !== "project") {
    throw new Error("此版本仅支持插入项目，请升级浏览器插件");
  }
  // 确保桌面端窗口可见并聚焦
  await showAndFocusWindow();
  useExtNoteInsertStore.getState().openModal({
    mode: params.mode,
    sourceContentId: params.sourceContentId,
    title: params.title,
    insertMode: params.insertMode,
  });
  return { success: true };
};

const handleMcpManagerOpen = async () => {
  await showAndFocusWindow();
  useMCPManagerModalStore.getState().openModal();
  return { success: true };
};

const handleBlockPreviewOpen = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { block?: BlockData };
  if (!params.block) {
    return { success: false, error: "缺少 block 数据" };
  }

  await showAndFocusWindow();
  try {
    openPage("block-preview", { id: params.block.id, block: JSON.stringify(params.block) });
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

const handleTabOpen = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { type: string; id: number; block?: BlockData };
  await showAndFocusWindow();
  try {
    if (params.type === "block-preview") {
      const block = params.block;
      if (!block || !block.id || typeof block.content !== "string" || !block.metadata) {
        return { success: false, error: "预览内容无效" };
      }
      openPage("block-preview", { id: block.id, block: JSON.stringify(block) });
    } else {
      await openContent(params.type, params.id);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

/**
 * 初始化 AI 服务端
 */
export const initAiServer = () => {
  if (isInitialized) {
    console.log("[aiServer] 已初始化，跳过");
    return;
  }

  console.log("[aiServer] 初始化 AI 服务端...");

  // 确保工具系统已初始化
  ensureToolingReady();

  // 创建 AI 服务端
  aiServer = new WebSocketServer("aiServer");

  // 注册 ai.chat 处理器
  aiServer.addRequestHandler("ai.chat", async request => {
    return await handleAiChat(request, aiServer!);
  });
  aiServer.addRequestHandler("codex.getAvailability", handleCodexGetAvailability);

  // 注册 ext.clipper.extract 处理器
  aiServer.addRequestHandler("ext.clipper.extract", async request => {
    return await handleExtClipperExtract(request);
  });

  // 注册文件操作 RPC 处理器
  aiServer.addRequestHandler("file.convertFileSrc", handleFileConvertFileSrc);
  aiServer.addRequestHandler("file.getHomeDir", handleFileGetHomeDir);
  aiServer.addRequestHandler("file.getEditorDir", handleFileGetEditorDir);
  aiServer.addRequestHandler("file.readBinaryFile", handleFileReadBinaryFile);
  aiServer.addRequestHandler("file.getFileExtension", handleFileGetFileExtension);
  aiServer.addRequestHandler("file.remoteResourceToLocal", handleFileRemoteResourceToLocal);
  aiServer.addRequestHandler("file.showInFolder", handleFileShowInFolder);
  aiServer.addRequestHandler("resource.upload", handleResourceUpload);

  // 注册设置相关 RPC 处理器
  aiServer.addRequestHandler("settings.getLlmConfigs", handleSettingsGetLlmConfigs);
  aiServer.addRequestHandler("settings.getChatModelConfig", handleSettingsGetChatModelConfig);
  aiServer.addRequestHandler("settings.setLlmUsage", handleSettingsSetLlmUsage);
  aiServer.addRequestHandler("settings.getSkills", handleSettingsGetSkills);
  aiServer.addRequestHandler("settings.getEmbeddingModelInfo", handleSettingsGetEmbeddingModelInfo);

  // 注册内容/卡片/文章 RPC 处理器
  aiServer.addRequestHandler("settings.getCurrentDatabase", handleSettingsGetCurrentDatabase);
  aiServer.addRequestHandler("content.create", handleContentCreate);
  aiServer.addRequestHandler("content.getById", handleContentGetById);
  aiServer.addRequestHandler("content.subscription.set", handleContentSubscriptionSet);
  aiServer.addRequestHandler("content.update", handleContentUpdate);
  aiServer.addRequestHandler("card.buildFromContent", handleCardBuildFromContent);
  aiServer.addRequestHandler("article.buildFromContent", handleArticleBuildFromContent);
  aiServer.addRequestHandler("card.isContentIsCard", handleCardIsContentIsCard);
  aiServer.addRequestHandler("article.isContentIsArticle", handleArticleIsContentIsArticle);
  aiServer.addRequestHandler("note.showInsertModal", handleNoteShowInsertModal);
  aiServer.addRequestHandler("mcp.manager.open", handleMcpManagerOpen);
  aiServer.addRequestHandler("block.preview.open", handleBlockPreviewOpen);

  // 注册 Tab 操作 RPC 处理器
  aiServer.addRequestHandler("tab.open", handleTabOpen);

  // 连接浏览器工具服务（作为客户端）
  // 延迟连接，等待浏览器扩展连接
  setTimeout(() => {
    try {
      extToolClient = new WebSocketClient(`ws://localhost:${WS_PORT}/extToolServer`);
      console.log("[aiServer] 已连接到浏览器工具服务");
    } catch (error) {
      console.warn("[aiServer] 连接浏览器工具服务失败:", error);
    }
  }, 1000);

  disposeContentRemoteUpdateForwarder = defaultContentEventBus.subscribe(
    "content:updated",
    data => {
      if (!aiServer) return;
      if (data.sourceUuid === "browser-extension") return;
      if (!hasAnySubscriberForContentId(data.content.id)) return;

      aiServer.sendNotification<RemoteContentUpdatedNotificationData>("content.remoteUpdated", {
        contentId: data.content.id,
        updateTime: data.content.updateTime,
        sourceUuid: data.sourceUuid,
      });
    }
  );

  isInitialized = true;
  console.log("[aiServer] AI 服务端初始化完成");
};

/**
 * 关闭 AI 服务端
 */
export const closeAiServer = () => {
  disposeContentRemoteUpdateForwarder?.();
  disposeContentRemoteUpdateForwarder = null;
  contentSubscriptionRegistry.clear();
  if (aiServer) {
    aiServer.close();
    aiServer = null;
  }
  extToolClient = null;
  isInitialized = false;
  console.log("[aiServer] AI 服务端已关闭");
};

export const __aiServerTestUtils = {
  handleAiChat,
  resolveCodexAvailability,
};

export default {
  init: initAiServer,
  close: closeAiServer,
};
