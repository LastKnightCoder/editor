import WebSocketServer from "@/utils/WebSocketServer";
import WebSocketClient from "@/utils/WebSocketClient";
import { runPiAgent } from "@/services/piAgentRunner";
import { createAiRunEventTranslator } from "@/services/aiRunEvents";
import { installBrowserBridgeRenderer } from "@/services/browserBridgeRenderer";
import { piStreamChat, piTextOf, piThinkingOf } from "@/services/piLLM";
import {
  AI_RUN_METHODS,
  type AiRunEvent,
  type AiRunEventNotification,
  type AiRunStartParams,
} from "@tau/shared";
import useSettingStore from "@/stores/useSettingStore";
import type { ISetting } from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import { openContent } from "./open-content";
import { openPage } from "./page-navigation";
import { produce } from "immer";
import { ensureToolingReady } from "@/tools";
import { Role } from "@/constants";
import type { RequestMessage, ToolCallPayload } from "@/types";
import {
  piBrowserSessionDelete,
  piBrowserSessionList,
  piBrowserSessionRename,
  piSessionEdit,
  piSessionTranscript,
} from "@/commands/piSession";
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
import { syncExcerptWebPage } from "@/commands/excerpt";
import { buildCardFromContent, isContentIsCard } from "@/commands/card";
import { buildArticleFromContent, isContentIsArticle } from "@/commands/article";
import { getContentLength, defaultContentEventBus } from "@/utils";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";
import { showAndFocusWindow } from "@/commands/window";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import type { BlockData } from "@/types/block-preview";

const WS_PORT = 24678;

interface ExtClipperExtractParams {
  html: string;
  url: string;
  title?: string;
  mode?: "smart" | "full";
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
  const { llmProviders: llmConfigs, llmUsageSettings } = useSettingStore.getState().setting;
  const usageConfig = llmUsageSettings[feature];

  if (!usageConfig) {
    return { provider: null, model: null };
  }

  const provider = llmConfigs.find(config => config.id === usageConfig.providerId);

  if (!provider) {
    return { provider: null, model: null };
  }

  const model = provider.models?.find(m => m.id === usageConfig.modelId);

  return {
    provider,
    model: model || null,
  };
};

const executeBrowserTool = async (
  call: ToolCallPayload,
  requestId: string,
  pageUrl?: string
): Promise<{ content: string } | null> => {
  if (!extToolClient) {
    return { content: "浏览器工具服务未连接" };
  }

  try {
    const result = await extToolClient.sendRequest(
      "ext.tool.execute",
      {
        requestId,
        // 扩展据此找发起页面的标签页（多窗口多侧栏时不取错页面）
        ...(pageUrl ? { pageUrl } : {}),
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

/**
 * 扩展的一次性运行（协议 v2，M5）：概览页、行内问答。不存对话、带全量历史，依赖渲染端的设置与
 * ToolRegistry，所以留在这里；扩展侧栏的持久对话由主进程 browser-bridge 驱动（渲染层重载不中断）。
 * `ai.run.start` 立即返回，过程经 `ai.run.event` 推送，最后一条一定是 settled。
 */
interface OneShotRun {
  abort: (() => void) | null;
  abortRequested: boolean;
}
const oneShotRuns = new Map<string, OneShotRun>();

const handleRunStart = async (request: RpcRequestMessage, server: WebSocketServer) => {
  const params = request.params as unknown as AiRunStartParams;
  if (params.session) {
    throw new Error("扩展侧栏对话请连接 /aiServerMain（桌面主进程）");
  }
  if (oneShotRuns.has(params.runId)) throw new Error("运行已存在");
  const entry: OneShotRun = { abort: null, abortRequested: false };
  oneShotRuns.set(params.runId, entry);
  let seq = 0;
  const emit = (event: AiRunEvent) =>
    server.sendNotification<AiRunEventNotification>(AI_RUN_METHODS.event, {
      runId: params.runId,
      seq: seq++,
      event,
    });
  void runOneShot(params, entry, emit)
    .catch(error =>
      emit({
        type: "settled",
        ok: false,
        aborted: entry.abortRequested,
        error: error instanceof Error ? error.message : String(error),
        lastText: "",
      })
    )
    .finally(() => oneShotRuns.delete(params.runId));
  return { runId: params.runId };
};

const handleRunAbort = async (request: RpcRequestMessage) => {
  const { runId } = request.params as unknown as { runId: string };
  const entry = oneShotRuns.get(runId);
  if (entry) {
    entry.abortRequested = true;
    entry.abort?.();
  }
  return { ok: true };
};

const runOneShot = async (
  params: AiRunStartParams,
  entry: OneShotRun,
  emit: (event: AiRunEvent) => void
): Promise<void> => {
  const {
    runId,
    messages,
    systemPrompt,
    enableTools = true,
    browserTools,
    pageContext,
    feature,
  } = params;

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

  // 获取 LLM 配置
  const { provider, model } = getLLMConfig(
    (feature as keyof ISetting["llmUsageSettings"] | undefined) || "chat"
  );

  if (!provider || !model) {
    throw new Error("未配置 LLM，请在设置中配置聊天模型");
  }

  const browserToolNames = new Set((browserTools || []).map(t => t.function.name));
  // 外部（浏览器扩展 / CLI）经 aiServer 发起的一次性运行，按请求的功能槽归属
  const usageSource = { feature: `aiServer:${feature || "chat"}` };

  // 单发路径（无工具，行内问答）：pi 原生事件直消费，turnId 固定
  if (!enableTools) {
    const turnId = `${runId}:single`;
    const single = piStreamChat(
      { provider, model, messages: finalMessages as RequestMessage[], source: usageSource },
      event => {
        if (event.type === "text_delta" || event.type === "text_end") {
          emit({ type: "text", turnId, fullText: piTextOf(event.partial) });
        } else if (event.type === "thinking_delta" || event.type === "thinking_end") {
          emit({ type: "reasoning", turnId, fullText: piThinkingOf(event.partial) });
        }
      }
    );
    entry.abort = single.cancel;
    if (entry.abortRequested) single.cancel();
    const singleResult = await single.result;
    const aborted = singleResult.aborted || entry.abortRequested;
    const error = aborted || singleResult.ok ? undefined : (singleResult.error ?? "模型请求失败");
    emit({
      type: "settled",
      ok: !aborted && !error,
      aborted,
      ...(error ? { error } : {}),
      lastText: singleResult.text ?? "",
    });
    return;
  }

  // 带工具的一次性运行：浏览器工具经 executeAdditionalTool 路由到扩展，桌面工具走渲染端 ToolRegistry
  const translator = createAiRunEventTranslator(emit);
  const executeAdditionalTool = async ({ toolName, args }: { toolName: string; args: unknown }) => {
    if (!browserToolNames.has(toolName)) return null;
    const outcome = await executeBrowserTool(
      {
        id: "",
        function: {
          name: toolName,
          arguments: args === undefined ? "" : JSON.stringify(args),
        },
      },
      runId,
      pageContext?.url
    );
    return { content: outcome?.content ?? "" };
  };

  const run = runPiAgent(
    {
      provider,
      model,
      messages: finalMessages as RequestMessage[],
      source: usageSource,
      ...(browserTools && browserTools.length > 0
        ? { additionalTools: browserTools, executeAdditionalTool }
        : {}),
    },
    event => translator.handle(event)
  );
  entry.abort = run.abort;
  if (entry.abortRequested) run.abort();

  const result = await run.result;
  const aborted = result.aborted || entry.abortRequested;
  const error = aborted
    ? undefined
    : result.ok
      ? translator.lastError()
      : (result.error ?? "模型请求失败");
  emit({
    type: "settled",
    ok: !aborted && !error,
    aborted,
    ...(error ? { error } : {}),
    lastText: result.lastAssistantText || translator.lastText(),
  });
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
  const { llmProviders: llmConfigs } = useSettingStore.getState().setting;
  return { llmConfigs };
};

const handleSettingsGetChatModelConfig = async () => {
  const { provider, model } = getLLMConfig("chat");
  return { provider, model };
};

const handleSettingsSetLlmUsage = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as {
    feature: keyof ISetting["llmUsageSettings"];
    providerId: string;
    modelId: string;
  };

  useSettingStore.setState(
    produce(draft => {
      if (!draft.setting.llmUsageSettings[params.feature]) {
        draft.setting.llmUsageSettings[params.feature] = {
          providerId: "",
          modelId: "",
        };
      }
      draft.setting.llmUsageSettings[params.feature].providerId = params.providerId;
      draft.setting.llmUsageSettings[params.feature].modelId = params.modelId;
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

/** 插件按页同步划线快照（KL-035）；参数由主进程校验，这里只转发 */
const handleExcerptSyncPage = async (request: RpcRequestMessage) => {
  return await syncExcerptWebPage(request.params);
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
  try {
    openPage("mcp");
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
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

const handleContentOpen = async (request: RpcRequestMessage) => {
  const params = request.params as unknown as { type: string; id: number };
  await showAndFocusWindow();
  try {
    await openContent(params.type, params.id);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

// —— 扩展对话 RPC（M4.5）：扩展对话是桌面主进程里按页面存放的 pi 会话文件
// （`browser-sessions/<页面键>/`，与库无关、不参与同步），全部以页面为单位、id 为 pi 会话 id。
// 没有索引表：列表/标题/分支关系取自会话文件本身。

interface BrowserChatParams {
  pageUrl: string;
  id: string;
}

const expectOk = <T extends { ok: boolean; error?: string }>(outcome: T): T => {
  if (!outcome.ok) throw new Error(outcome.error ?? "操作失败");
  return outcome;
};

const handleChatList = async (request: RpcRequestMessage) => {
  const { pageUrl } = request.params as unknown as { pageUrl: string };
  return { chats: expectOk(await piBrowserSessionList(pageUrl)).sessions ?? [] };
};

const handleChatGet = async (request: RpcRequestMessage) => {
  const { pageUrl, id } = request.params as unknown as BrowserChatParams;
  return {
    messages: expectOk(await piSessionTranscript({ pageUrl, sessionId: id })).messages ?? [],
  };
};

const handleChatRename = async (request: RpcRequestMessage) => {
  const { pageUrl, id, title } = request.params as unknown as BrowserChatParams & {
    title: string;
  };
  expectOk(await piBrowserSessionRename(pageUrl, id, title));
  return { success: true };
};

const handleChatDelete = async (request: RpcRequestMessage) => {
  const { pageUrl, id } = request.params as unknown as BrowserChatParams;
  expectOk(await piBrowserSessionDelete(pageUrl, id));
  return { success: true };
};

/** 会话树上的导航（M4-d）：rewind / fork / switch 都按一个 entry id，返回改后的投影 */
const treeNavigation =
  (kind: "rewind" | "fork" | "switch") => async (request: RpcRequestMessage) => {
    const { pageUrl, id, entryId } = request.params as unknown as BrowserChatParams & {
      entryId: string;
    };
    const outcome = expectOk(await piSessionEdit({ pageUrl, sessionId: id }, { kind, entryId }));
    return { messages: outcome.messages ?? [] };
  };

/** 编辑重发/重新生成的前半步：回退到这条用户消息之前（扩展随后以新内容发 ai.chat） */
const handleChatRewind = treeNavigation("rewind");
/** 从这里建分支：回到这条回答之后，下一条消息成为新版本 */
const handleChatFork = treeNavigation("fork");
/** 切到一条用户消息所在的版本 */
const handleChatSwitch = treeNavigation("switch");

/** 删除消息：省略这些 entry（一条回答传它全部 entry id） */
const handleChatOmit = async (request: RpcRequestMessage) => {
  const { pageUrl, id, entryIds } = request.params as unknown as BrowserChatParams & {
    entryIds: string[];
  };
  const outcome = expectOk(
    await piSessionEdit({ pageUrl, sessionId: id }, { kind: "omit", entryIds })
  );
  return { messages: outcome.messages ?? [] };
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

  // 一次性运行（协议 v2，M5）：概览页、行内问答；侧栏持久对话在主进程 /aiServerMain
  aiServer.addRequestHandler(AI_RUN_METHODS.start, async request => {
    return await handleRunStart(request, aiServer!);
  });
  aiServer.addRequestHandler(AI_RUN_METHODS.abort, handleRunAbort);
  // 主进程扩展桥要桌面工具清单时由这里回答
  installBrowserBridgeRenderer();

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
  aiServer.addRequestHandler("excerpt.syncPage", handleExcerptSyncPage);
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

  // 内容引用打开使用当前内容入口，不保留旧 Tab 协议。
  aiServer.addRequestHandler("content.open", handleContentOpen);

  // 注册扩展对话 RPC 处理器（浏览器插件 → 桌面按页面存放的 pi 会话文件）
  aiServer.addRequestHandler("chat.list", handleChatList);
  aiServer.addRequestHandler("chat.get", handleChatGet);
  aiServer.addRequestHandler("chat.rename", handleChatRename);
  aiServer.addRequestHandler("chat.delete", handleChatDelete);
  aiServer.addRequestHandler("chat.fork", handleChatFork);
  aiServer.addRequestHandler("chat.switch", handleChatSwitch);
  aiServer.addRequestHandler("chat.rewind", handleChatRewind);
  aiServer.addRequestHandler("chat.omit", handleChatOmit);

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
  handleRunStart,
  handleRunAbort,
};

export default {
  init: initAiServer,
  close: closeAiServer,
};
