import WebSocketServer from "@/utils/WebSocketServer";
import WebSocketClient from "@/utils/WebSocketClient";
import { chatStreamCore } from "@/hooks/useChatLLM";
import useSettingStore from "@/stores/useSettingStore";
import type { ISetting } from "@/stores/useSettingStore";
import usePromptStore from "@/stores/usePromptStore";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { produce } from "immer";
import {
  getProjectItemById,
  getRootDocumentsByDocumentItemId,
} from "@/commands";
import { ensureToolingReady } from "@/tools";
import { Role } from "@/constants";
import type {
  RequestMessage,
  ToolCallPayload,
  ToolCallExecutionState,
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
} from "@/commands/file";
import {
  incrementResourceRefCount,
  decrementResourceRefCount,
} from "@/commands/resource";
import { uploadResource } from "@/hooks/useUploadResource";

const WS_PORT = 24678;

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
  error?: string;
}

let aiServer: WebSocketServer | null = null;
let extToolClient: WebSocketClient | null = null;
let isInitialized = false;

const getLLMConfig = (feature: keyof ISetting["llmUsageSettings"] = "chat") => {
  const { llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;
  const usageConfig = llmUsageSettings[feature];

  if (!usageConfig) {
    return { providerConfig: null, modelConfig: null };
  }

  const providerConfig = llmConfigs.find(
    (config) => config.id === usageConfig.providerId,
  );

  if (!providerConfig) {
    return { providerConfig: null, modelConfig: null };
  }

  const modelConfig = providerConfig.models?.find(
    (model) => model.name === usageConfig.modelName,
  );

  return {
    providerConfig,
    modelConfig: modelConfig || null,
  };
};

const executeBrowserTool = async (
  call: ToolCallPayload,
  requestId: string,
): Promise<{ content: string } | null> => {
  if (!extToolClient) {
    return { content: "浏览器工具服务未连接" };
  }

  try {
    const result = await extToolClient.sendRequest("ext.tool.execute", {
      requestId,
      toolCall: {
        id: call.id,
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      },
    });
    return result as { content: string };
  } catch (error) {
    console.error("[aiServer] 浏览器工具执行失败:", error);
    return { content: `工具执行失败: ${(error as Error).message}` };
  }
};

const handleAiChat = async (
  request: RpcRequestMessage,
  server: WebSocketServer,
) => {
  const params = request.params as unknown as AiChatParams;
  const {
    requestId,
    messages,
    systemPrompt,
    enableTools = true,
    browserTools,
    pageContext,
    feature,
  } = params;

  console.log("[aiServer] 收到 AI 聊天请求:", {
    requestId,
    messageCount: messages.length,
    enableTools,
    browserToolCount: browserTools?.length || 0,
    hasPageContext: !!pageContext,
    feature: feature || "chat",
  });

  // 获取 LLM 配置
  const { providerConfig, modelConfig } = getLLMConfig(feature || "chat");

  if (!providerConfig || !modelConfig) {
    throw new Error("未配置 LLM，请在设置中配置聊天模型");
  }

  // 准备消息
  let finalMessages = [...messages];

  // 如果有系统提示，添加到消息列表开头
  if (systemPrompt) {
    finalMessages = [
      { role: Role.System, content: systemPrompt },
      ...finalMessages,
    ];
  }

  // 如果有页面上下文，添加到系统提示中
  if (pageContext) {
    const contextMessage = {
      role: Role.System,
      content: `当前网页信息：
- URL: ${pageContext.url}
- 标题: ${pageContext.title}
${pageContext.content ? `- 内容摘要: ${pageContext.content.slice(0, 2000)}...` : ""}`,
    };
    finalMessages = [contextMessage, ...finalMessages];
  }

  // 记录浏览器工具名称，用于路由
  const browserToolNames = new Set(
    (browserTools || []).map((t) => t.function.name),
  );

  // 创建自定义工具执行器
  const executeToolCall =
    browserToolNames.size > 0
      ? async (call: ToolCallPayload): Promise<{ content: string } | null> => {
          if (browserToolNames.has(call.function.name)) {
            return await executeBrowserTool(call, requestId);
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
    onToolCallsUpdate: (executions) => {
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
    onError: (error) => {
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
    const provider =
      mode === "smart"
        ? createSmartExtractProvider()
        : createFullPageProvider();

    const markdown = await collectClipStream(
      provider.clip({
        html,
        url,
        title: title || "",
        options: { smartExtractClean: true },
      }),
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

const handleResourceIncrementRef = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    path: string;
    source?: { type: string; id: number };
  };
  await incrementResourceRefCount(params.path, params.source);
  return { success: true };
};

const handleResourceDecrementRef = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { path: string };
  await decrementResourceRefCount(params.path);
  return { success: true };
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
    produce((draft) => {
      if (!draft.setting.llmUsageSettings[params.feature]) {
        draft.setting.llmUsageSettings[params.feature] = {
          providerId: "",
          modelName: "",
        };
      }
      draft.setting.llmUsageSettings[params.feature].providerId =
        params.providerId;
      draft.setting.llmUsageSettings[params.feature].modelName =
        params.modelName;
    }),
  );

  return { success: true };
};

const handleSettingsGetPrompts = async () => {
  const { prompts } = usePromptStore.getState();
  return { prompts };
};

const handleSettingsGetEmbeddingModelInfo = async () => {
  const { embeddingProvider } = useSettingStore.getState().setting;
  const { currentConfigId } = embeddingProvider;
  const currentConfig = embeddingProvider.configs.find(
    (config) => config.id === currentConfigId,
  );
  const currentModel = currentConfig?.models.find(
    (model) => model.name === currentConfig.currentModel,
  );

  if (!currentConfig || !currentModel) {
    return { embeddingModelInfo: null };
  }

  return {
    embeddingModelInfo: {
      baseUrl: currentConfig.baseUrl,
      key: currentConfig.apiKey,
      model: currentModel.name,
      distance: currentModel.distance,
      dimensions: currentModel.contextLength,
    },
  };
};

// ==================== Tab 操作 RPC 处理器 ====================

const handleTabOpen = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    type: string;
    id: number;
    itemId?: number;
  };

  const { type, id } = params;
  const { openInNewTab } = useTabStore.getState();

  try {
    switch (type) {
      case "card":
        openInNewTab(TabType.CardDetail, { id });
        break;
      case "article":
        openInNewTab(TabType.ArticleDetail, { id });
        break;
      case "project-item": {
        // 获取项目项所属的项目
        const projectItem = await getProjectItemById(id);
        if (projectItem && projectItem.projects.length > 0) {
          const projectId = projectItem.projects[0];
          openInNewTab(TabType.ProjectDetail, { id: projectId, itemId: id });
        } else {
          openInNewTab(TabType.ProjectList);
        }
        break;
      }
      case "document-item": {
        // 获取知识库项所属的知识库
        const documents = await getRootDocumentsByDocumentItemId(id);
        if (documents && documents.length > 0) {
          const documentId = documents[0].id;
          openInNewTab(TabType.DocumentDetail, { id: documentId, itemId: id });
        } else {
          openInNewTab(TabType.DocumentList);
        }
        break;
      }
      default:
        console.warn(`[aiServer] 未知的 Tab 类型: ${type}`);
        return { success: false, error: `未知的 Tab 类型: ${type}` };
    }
    return { success: true };
  } catch (error) {
    console.error("[aiServer] 打开 Tab 失败:", error);
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
  aiServer.addRequestHandler("ai.chat", async (request) => {
    return await handleAiChat(request, aiServer!);
  });

  // 注册 ext.clipper.extract 处理器
  aiServer.addRequestHandler("ext.clipper.extract", async (request) => {
    return await handleExtClipperExtract(request);
  });

  // 注册文件操作 RPC 处理器
  aiServer.addRequestHandler("file.convertFileSrc", handleFileConvertFileSrc);
  aiServer.addRequestHandler("file.getHomeDir", handleFileGetHomeDir);
  aiServer.addRequestHandler("file.getEditorDir", handleFileGetEditorDir);
  aiServer.addRequestHandler("file.readBinaryFile", handleFileReadBinaryFile);
  aiServer.addRequestHandler(
    "file.getFileExtension",
    handleFileGetFileExtension,
  );
  aiServer.addRequestHandler(
    "file.remoteResourceToLocal",
    handleFileRemoteResourceToLocal,
  );
  aiServer.addRequestHandler("resource.upload", handleResourceUpload);
  aiServer.addRequestHandler(
    "resource.incrementRef",
    handleResourceIncrementRef,
  );
  aiServer.addRequestHandler(
    "resource.decrementRef",
    handleResourceDecrementRef,
  );

  // 注册设置相关 RPC 处理器
  aiServer.addRequestHandler(
    "settings.getLlmConfigs",
    handleSettingsGetLlmConfigs,
  );
  aiServer.addRequestHandler(
    "settings.getChatModelConfig",
    handleSettingsGetChatModelConfig,
  );
  aiServer.addRequestHandler("settings.setLlmUsage", handleSettingsSetLlmUsage);
  aiServer.addRequestHandler("settings.getPrompts", handleSettingsGetPrompts);
  aiServer.addRequestHandler(
    "settings.getEmbeddingModelInfo",
    handleSettingsGetEmbeddingModelInfo,
  );

  // 注册 Tab 操作 RPC 处理器
  aiServer.addRequestHandler("tab.open", handleTabOpen);

  // 连接浏览器工具服务（作为客户端）
  // 延迟连接，等待浏览器扩展连接
  setTimeout(() => {
    try {
      extToolClient = new WebSocketClient(
        `ws://localhost:${WS_PORT}/extToolServer`,
      );
      console.log("[aiServer] 已连接到浏览器工具服务");
    } catch (error) {
      console.warn("[aiServer] 连接浏览器工具服务失败:", error);
    }
  }, 1000);

  isInitialized = true;
  console.log("[aiServer] AI 服务端初始化完成");
};

/**
 * 关闭 AI 服务端
 */
export const closeAiServer = () => {
  if (aiServer) {
    aiServer.close();
    aiServer = null;
  }
  extToolClient = null;
  isInitialized = false;
  console.log("[aiServer] AI 服务端已关闭");
};

export default {
  init: initAiServer,
  close: closeAiServer,
};
